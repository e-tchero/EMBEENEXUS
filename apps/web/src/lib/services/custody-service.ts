import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  confirmReceiptSchema,
  issueOtpSchema,
  photoKindSchema,
  verifyOtpSchema,
} from '@embee/shared';

import { assertRole, AuthorizationError } from '@/lib/auth/rbac';
import { getSession, type Session } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/client-admin';
import { createClient } from '@/lib/db/client-server';
import { rpcBusinessCode } from '@/lib/db/rpc-errors';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  buildEvidencePath,
  canUploadPhoto,
  extForMimeType,
  type PhotoKind,
} from '@/lib/domain/custody';
import { logger } from '@/lib/logging/logger';

/**
 * Custody service (M6).
 *
 * The single server-authoritative boundary for the delivery verification
 * chain: pickup/delivery OTPs, the three-photo evidence chain, recipient
 * confirmation, and the waiting/return tick. All mutations flow through
 * SECURITY DEFINER RPCs (migration 0014); photo BYTES flow through the
 * private order-evidence Storage bucket, server-mediated only.
 *
 * Clients:
 *   - cookie client (RLS-bound) for caller-attributed RPCs — the RPCs
 *     re-derive the caller from auth.uid() anyway;
 *   - service-role client ONLY where authority is established first (storage
 *     object I/O behind session + ownership checks; the waiting tick behind
 *     the jobs gate).
 */

export type CustodyServiceError =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_order_state'
  | 'otp_not_issued'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_locked'
  | 'otp_already_used'
  | 'otp_issue_limit'
  | 'evidence_missing'
  | 'photo_exists'
  | 'file_too_large'
  | 'unsupported_file_type'
  | 'storage_error'
  | 'unknown_error';

export interface CustodyRefResult {
  readonly ok: boolean;
  readonly order?: { readonly id: string; readonly status: string };
  readonly error?: CustodyServiceError;
}

export interface OtpIssueResult {
  readonly ok: boolean;
  readonly otp?: {
    /** The plaintext code — returned ONCE, to the order owner only. */
    readonly code: string;
    readonly expiresAt: string;
  };
  readonly error?: CustodyServiceError;
}

export interface PhotoResult {
  readonly ok: boolean;
  readonly photo?: {
    readonly orderId: string;
    readonly kind: PhotoKind;
    readonly storagePath: string;
  };
  readonly error?: CustodyServiceError;
}

export interface PhotoUrlResult {
  readonly ok: boolean;
  readonly photo?: { readonly signedUrl: string; readonly expiresIn: number };
  readonly error?: CustodyServiceError;
}

const EVIDENCE_BUCKET = 'order-evidence';
/** Signed-URL lifetime (seconds) — short by design. */
const SIGNED_URL_TTL_SECONDS = 300;

function mapRpcError(code: string): CustodyServiceError {
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return 'unauthenticated';
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'not_found';
    case 'INVALID_INPUT':
      return 'invalid_input';
    case 'INVALID_ORDER_STATE':
      return 'invalid_order_state';
    case 'OTP_NOT_ISSUED':
      return 'otp_not_issued';
    case 'OTP_INVALID':
      return 'otp_invalid';
    case 'OTP_EXPIRED':
      return 'otp_expired';
    case 'OTP_LOCKED':
      return 'otp_locked';
    case 'OTP_ALREADY_USED':
      return 'otp_already_used';
    case 'OTP_ISSUE_LIMIT':
      return 'otp_issue_limit';
    case 'EVIDENCE_MISSING':
      return 'evidence_missing';
    case 'PHOTO_EXISTS':
      return 'photo_exists';
    default:
      return 'unknown_error';
  }
}

/** Session guard resolving to the typed session or a safe error. */
async function requireSession(
  roles: Array<'customer' | 'rider' | 'operator'>,
): Promise<Session | CustodyServiceError> {
  try {
    const s = await getSession();
    if (!s) return 'unauthenticated';
    await assertRole(s, roles);
    return s;
  } catch (error) {
    if (error instanceof AuthorizationError) return 'forbidden';
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 1. OTP issue (customer owner; returns the plaintext code exactly once)
// ---------------------------------------------------------------------------

export async function issueOrderOtp(input: unknown): Promise<OtpIssueResult> {
  const auth = await requireSession(['customer']);
  if (typeof auth === 'string') return { ok: false, error: auth };

  const parsed = issueOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('issue_order_otp', {
    p_order_id: parsed.data.orderId,
    p_kind: parsed.data.kind,
  });

  if (error) {
    const code = rpcBusinessCode(error as { code?: string; message?: string });
    logger.warn('custody.otp.issue_failed', { code, orderId: parsed.data.orderId });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { code: string; expires_at: string } | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('custody.otp.issued', { orderId: parsed.data.orderId, kind: parsed.data.kind });
  return { ok: true, otp: { code: row.code, expiresAt: row.expires_at } };
}

// ---------------------------------------------------------------------------
// 2. OTP verify (assigned rider; one-time consumption + canonical transition)
// ---------------------------------------------------------------------------

export async function verifyOrderOtp(input: unknown): Promise<CustodyRefResult> {
  const auth = await requireSession(['rider']);
  if (typeof auth === 'string') return { ok: false, error: auth };

  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_order_otp', {
    p_order_id: parsed.data.orderId,
    p_kind: parsed.data.kind,
    p_code: parsed.data.code,
  });

  if (error) {
    const code = rpcBusinessCode(error as { code?: string; message?: string });
    // Log the failure CLASS only — never the code attempt or its value.
    logger.warn('custody.otp.verify_failed', {
      code,
      orderId: parsed.data.orderId,
      kind: parsed.data.kind,
    });
    return { ok: false, error: mapRpcError(code) };
  }

  // Migration 0015 contract: OTP-verification OUTCOMES are returned as data
  // (so the attempt counter persists server-side); only 'verified' grants the
  // transitioned order ref.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; status: string; otp_status: string; attempts: number | null }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  if (row.otp_status !== 'verified') {
    logger.warn('custody.otp.verify_rejected', {
      orderId: row.order_id,
      kind: parsed.data.kind,
      outcome: row.otp_status,
    });
    switch (row.otp_status) {
      case 'invalid':
        return { ok: false, error: 'otp_invalid' };
      case 'expired':
        return { ok: false, error: 'otp_expired' };
      case 'locked':
        return { ok: false, error: 'otp_locked' };
      case 'already_used':
        return { ok: false, error: 'otp_already_used' };
      case 'not_issued':
        return { ok: false, error: 'otp_not_issued' };
      default:
        return { ok: false, error: 'unknown_error' };
    }
  }

  logger.info('custody.otp.verified', {
    orderId: row.order_id,
    kind: parsed.data.kind,
    status: row.status,
  });
  return { ok: true, order: { id: row.order_id, status: row.status } };
}

// ---------------------------------------------------------------------------
// 3. Recipient confirmation (customer owner; delivered → completed)
// ---------------------------------------------------------------------------

export async function confirmOrderReceipt(
  input: unknown,
): Promise<CustodyRefResult> {
  const auth = await requireSession(['customer']);
  if (typeof auth === 'string') return { ok: false, error: auth };

  const parsed = confirmReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirm_order_receipt', {
    p_order_id: parsed.data.orderId,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    const code = rpcBusinessCode(error as { code?: string; message?: string });
    logger.warn('custody.receipt.confirm_failed', { code, orderId: parsed.data.orderId });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; status: string } | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('custody.receipt.confirmed', { orderId: row.order_id, status: row.status });
  return { ok: true, order: { id: row.order_id, status: row.status } };
}

// ---------------------------------------------------------------------------
// 4. Photo evidence upload (owner/rider per kind; private bucket, server-
//    mediated) — validates actor/state/MIME/size, uploads with the service
//    role under an order/kind-scoped path, then registers metadata under the
//    caller's authority (the RPC re-validates everything).
// ---------------------------------------------------------------------------

export interface PhotoUploadFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly size: number;
}

export async function uploadOrderPhoto(
  orderId: string,
  kindRaw: string,
  file: PhotoUploadFile,
): Promise<PhotoResult> {
  const kindParsed = photoKindSchema.safeParse(kindRaw);
  if (!kindParsed.success) return { ok: false, error: 'invalid_input' };
  const kind = kindParsed.data as PhotoKind;

  const auth = await requireSession(['customer', 'rider']);
  if (typeof auth === 'string') return { ok: false, error: auth };
  const session = auth;

  // MIME + size validation (also enforced by the bucket and the RPC).
  if (!PHOTO_MIME_TYPES.includes(file.contentType)) {
    return { ok: false, error: 'unsupported_file_type' };
  }
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES || file.bytes.byteLength !== file.size) {
    return { ok: false, error: 'file_too_large' };
  }

  const supabase = await createClient();

  // RLS-bound read: non-participants see nothing (indistinguishable from a
  // nonexistent order) and are refused before any storage I/O.
  const { data: orderRow } = await supabase
    .from('orders')
    .select('id, customer_id, rider_id, status, return_initiated_at')
    .eq('id', orderId)
    .maybeSingle();

  type OrderRow = {
    id: string;
    customer_id: string;
    rider_id: string | null;
    status: string;
    return_initiated_at: string | null;
  };
  const order = orderRow as OrderRow | null;
  if (!order) return { ok: false, error: 'not_found' };

  const gate = canUploadPhoto({
    kind,
    orderStatus: order.status,
    actorIsCustomerOwner: order.customer_id === session.userId,
    actorIsAssignedRider: order.rider_id === session.userId,
    returnInitiated: order.return_initiated_at !== null,
  });
  if (!gate.allowed) {
    return {
      ok: false,
      error:
        gate.reason === 'wrong_actor'
          ? 'forbidden'
          : gate.reason === 'return_initiated'
            ? 'invalid_order_state'
            : 'invalid_order_state',
    };
  }

  // Storage I/O with the service role: the private bucket has no client
  // policies, so this is the only write path — scoped to order/kind.
  const extResult = extForMimeType(file.contentType);
  if (!extResult.ok) return { ok: false, error: 'unsupported_file_type' };
  const path = buildEvidencePath(orderId, kind, randomUUID(), extResult.value);

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType });
  if (uploadError) {
    logger.error('custody.photo.upload_failed', { orderId, kind, message: uploadError.message });
    return { ok: false, error: 'storage_error' };
  }

  // Register metadata under the CALLER's authority (RPC re-checks actor,
  // state, path scoping, MIME, size; rejects duplicates).
  const { data, error: registerError } = await supabase.rpc('register_order_photo', {
    p_order_id: orderId,
    p_kind: kind,
    p_storage_path: path,
    p_content_type: file.contentType,
    p_size_bytes: file.size,
  });

  if (registerError) {
    const code = (registerError as { code?: string }).code ?? '';
    logger.warn('custody.photo.register_failed', { code, orderId, kind });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { photo_id: string; kind: PhotoKind; storage_path: string }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('custody.photo.registered', { orderId, kind });
  return { ok: true, photo: { orderId, kind: row.kind, storagePath: row.storage_path } };
}

// ---------------------------------------------------------------------------
// 5. Photo evidence access (participants/operators; short-lived signed URL)
// ---------------------------------------------------------------------------

export async function getOrderPhotoUrl(
  orderId: string,
  kindRaw: string,
): Promise<PhotoUrlResult> {
  const kindParsed = photoKindSchema.safeParse(kindRaw);
  if (!kindParsed.success) return { ok: false, error: 'invalid_input' };
  const kind = kindParsed.data as PhotoKind;

  const auth = await requireSession(['customer', 'rider', 'operator']);
  if (typeof auth === 'string') return { ok: false, error: auth };

  // RLS-bound metadata read: only participants (owner, assigned rider) and
  // operators can select the row; nobody can enumerate other orders' evidence.
  const supabase = await createClient();
  const { data: photoRow } = await supabase
    .from('order_photos')
    .select('storage_path')
    .eq('order_id', orderId)
    .eq('kind', kind)
    .maybeSingle();

  const path = (photoRow as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, error: 'not_found' };

  // Signed URL minted by the service role AFTER authorization; the bucket
  // itself grants clients nothing.
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) {
    logger.error('custody.photo.signed_url_failed', { orderId, kind });
    return { ok: false, error: 'storage_error' };
  }

  return {
    ok: true,
    photo: { signedUrl: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS },
  };
}

// ---------------------------------------------------------------------------
// 6. Return completion (assigned rider; operator backstop) — D05 return path
// ---------------------------------------------------------------------------

export interface ReturnCompletionResult {
  readonly ok: boolean;
  readonly order?: { readonly id: string; readonly status: string };
  readonly error?: CustodyServiceError;
}

/**
 * Records the completed return journey (parcel physically back with the
 * pickup customer). The RPC (migration 0014) validates assignment/role,
 * requires return_initiated_at (only the waiting tick initiates returns),
 * and closes the order through the canonical delivery_failed transition.
 * Idempotent-guarded against double taps by its own state checks.
 */
export async function completeOrderReturn(
  input: unknown,
): Promise<ReturnCompletionResult> {
  const auth = await requireSession(['rider', 'operator']);
  if (typeof auth === 'string') return { ok: false, error: auth };

  // Same shape as receipt confirmation: orderId + optional notes.
  const parsed = confirmReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_complete_return', {
    p_order_id: parsed.data.orderId,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    const code = rpcBusinessCode(error as { code?: string; message?: string });
    logger.warn('custody.return.complete_failed', { code, orderId: parsed.data.orderId });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; status: string } | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('custody.return.completed', { orderId: row.order_id, status: row.status });
  return { ok: true, order: { id: row.order_id, status: row.status } };
}

// ---------------------------------------------------------------------------
// 7. Waiting tick (jobs gate; service role) — waiting-maximum returns
// ---------------------------------------------------------------------------

export interface WaitingTickResult {
  readonly processed: number;
}

export async function waitingTick(maxOrders = 50): Promise<WaitingTickResult | { error: CustodyServiceError }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('process_waiting_expiry', {
    p_max_orders: maxOrders,
  });
  if (error) {
    const code = rpcBusinessCode(error as { code?: string; message?: string });
    logger.error('custody.waiting.tick_failed', { code });
    return { error: mapRpcError(code) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { processed: number } | null;
  return { processed: row?.processed ?? 0 };
}
