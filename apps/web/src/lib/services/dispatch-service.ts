import 'server-only';

import { z } from 'zod';

import { assertRole, AuthorizationError } from '@/lib/auth/rbac';
import { getSession, type Session } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/client-admin';
import { createClient } from '@/lib/db/client-server';
import { canOfferBeAccepted } from '@/lib/domain/dispatch';
import { logger } from '@/lib/logging/logger';

/**
 * Dispatch service (M5).
 *
 * The single server-authoritative boundary for rider dispatch. API routes,
 * background-job triggers, and any future realtime consumer all call these
 * functions — dispatch logic is never duplicated in handlers.
 *
 * Two clients, mirroring the audited M4 pattern:
 *   - cookie client (RLS-bound) for rider-owned actions (accept/decline/
 *     availability); the RPCs re-derive the caller from auth.uid() anyway.
 *   - service-role client ONLY where authority is established first:
 *     dispatch continuation/expiry run behind the jobs gate (token or
 *     operator session), and start-dispatch runs in the payment-verified
 *     continuation path.
 */

export type DispatchServiceError =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_order_state'
  | 'offer_not_active'
  | 'offer_expired'
  | 'rider_ineligible'
  | 'rider_not_approved'
  | 'rider_busy'
  | 'unknown_error';

export interface DispatchRefResult {
  readonly ok: boolean;
  readonly outcome?: 'dispatch_started' | 'offered' | 'offer_active' | 'no_eligible_rider' | 'not_dispatchable';
  readonly offerId?: string;
  readonly riderId?: string;
  readonly error?: DispatchServiceError;
}

export interface RiderOfferResult {
  readonly ok: boolean;
  readonly offer?: {
    readonly offerId: string;
    readonly orderId: string;
    readonly status: string;
    readonly offeredAt: string;
    readonly expiresAt: string;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly roadDistanceM: number;
    /** kobo as a string to preserve exactness across JSON. */
    readonly riderShareKobo: string;
  };
  readonly error?: DispatchServiceError;
}

const uuidSchema = z.string().uuid();
const availabilitySchema = z.object({ isAvailable: z.boolean() });

function mapRpcError(code: string): DispatchServiceError {
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
    case 'OFFER_NOT_ACTIVE':
      return 'offer_not_active';
    case 'OFFER_EXPIRED':
      return 'offer_expired';
    case 'RIDER_INELIGIBLE':
      return 'rider_ineligible';
    case 'RIDER_NOT_APPROVED':
      return 'rider_not_approved';
    case 'RIDER_BUSY':
      return 'rider_busy';
    default:
      return 'unknown_error';
  }
}

/** Rider-session guard resolving to the typed session or a safe error. */
async function requireRiderSession(): Promise<Session | DispatchServiceError> {
  try {
    const s = await getSession();
    if (!s) return 'unauthenticated';
    await assertRole(s, ['rider']);
    return s;
  } catch (error) {
    if (error instanceof AuthorizationError) return 'forbidden';
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 1. Start dispatch (payment-verified continuation; service-role context)
// ---------------------------------------------------------------------------

/**
 * Begins dispatch for a paid order: payment_verified → searching_rider via
 * the canonical transition path, then creates the first offer. Authority
 * must be established by the caller (payment completion flow, or the
 * operator/jobs gate for manual continuation).
 */
export async function startDispatch(orderId: string): Promise<DispatchRefResult> {
  if (!uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: 'invalid_input' };
  }

  const admin = createAdminClient();
  const { error: startError } = await admin.rpc('dispatch_start', {
    p_order_id: orderId,
  });
  if (startError) {
    const code = (startError as { code?: string }).code ?? '';
    logger.warn('dispatch.start.rpc_failed', { code, orderId });
    return { ok: false, error: mapRpcError(code) };
  }

  return offerNext(orderId);
}

// ---------------------------------------------------------------------------
// 2. Offer continuation (system; also the background tick's inner step)
// ---------------------------------------------------------------------------

/**
 * Selects the longest-available eligible rider and creates the single active
 * offer for a searching_rider order. Idempotent: a live offer short-circuits.
 */
export async function offerNext(orderId: string): Promise<DispatchRefResult> {
  if (!uuidSchema.safeParse(orderId).success) {
    return { ok: false, error: 'invalid_input' };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('dispatch_offer_next', {
    p_order_id: orderId,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('dispatch.offer_next.rpc_failed', { code, orderId });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { offer_id: string | null; rider_id: string | null; outcome: string }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  return {
    ok: true,
    outcome: row.outcome as DispatchRefResult['outcome'],
    offerId: row.offer_id ?? undefined,
    riderId: row.rider_id ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// 3. Background tick: expire due offers + continue dispatch
// ---------------------------------------------------------------------------

export interface DispatchTickResult {
  readonly expired: number;
  readonly continued: number;
}

/**
 * Expires every due offer and continues dispatch for the affected orders.
 * Called from the jobs-gated route (token or operator session). Safe to run
 * repeatedly and concurrently with acceptances (row locks decide winners).
 */
export async function dispatchTick(maxOrders = 50): Promise<DispatchTickResult | { error: DispatchServiceError }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('dispatch_expire_due', {
    p_max_orders: maxOrders,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.error('dispatch.tick.rpc_failed', { code });
    return { error: mapRpcError(code) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { expired: number; continued: number } | null;
  return { expired: row?.expired ?? 0, continued: row?.continued ?? 0 };
}

// ---------------------------------------------------------------------------
// 4. Rider surface: current offer, accept, decline, availability
// ---------------------------------------------------------------------------

/** The calling rider's current active offer (RLS-bound read + live checks). */
export async function getCurrentOffer(): Promise<RiderOfferResult> {
  const auth = await requireRiderSession();
  if (typeof auth === 'string') return { ok: false, error: auth };

  const supabase = await createClient();
  const { data } = await supabase
    .from('dispatch_offers')
    .select(
      'id, order_id, status, offered_at, expires_at, orders!inner(pickup_address, dropoff_address, road_distance_m, rider_share_kobo)',
    )
    .eq('status', 'offered')
    .order('offered_at', { ascending: false })
    .limit(1);

  type OfferJoin = {
    id: string;
    order_id: string;
    status: string;
    offered_at: string;
    expires_at: string;
    orders: {
      pickup_address: string;
      dropoff_address: string;
      road_distance_m: number;
      rider_share_kobo: string | number;
    };
  };

  const row = (data as unknown as OfferJoin[] | null)?.[0];
  if (!row) return { ok: false, error: 'not_found' };

  return {
    ok: true,
    offer: {
      offerId: row.id,
      orderId: row.order_id,
      status: row.status,
      offeredAt: row.offered_at,
      expiresAt: row.expires_at,
      pickupAddress: row.orders.pickup_address,
      dropoffAddress: row.orders.dropoff_address,
      roadDistanceM: row.orders.road_distance_m,
      riderShareKobo: String(row.orders.rider_share_kobo),
    },
  };
}

/** Accept the calling rider's own active offer (atomic; DB-authoritative). */
export async function acceptOffer(offerId: string): Promise<RiderOfferResult> {
  const auth = await requireRiderSession();
  if (typeof auth === 'string') return { ok: false, error: auth };

  if (!uuidSchema.safeParse(offerId).success) {
    return { ok: false, error: 'invalid_input' };
  }

  // Typed domain pre-gate (the RPC re-checks authoritatively under lock).
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('dispatch_offers')
    .select('status, expires_at')
    .eq('id', offerId)
    .single();
  const row = current as { status: string; expires_at: string } | null;
  if (!row) return { ok: false, error: 'not_found' };
  const gate = canOfferBeAccepted({ status: row.status, expiresAt: new Date(row.expires_at) }, new Date());
  if (!gate.ok) {
    return { ok: false, error: gate.reason === 'expired' ? 'offer_expired' : 'offer_not_active' };
  }

  const { data, error } = await supabase.rpc('dispatch_accept', {
    p_offer_id: offerId,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('dispatch.accept.rpc_failed', { code, offerId });
    return { ok: false, error: mapRpcError(code) };
  }

  const accepted = (Array.isArray(data) ? data[0] : data) as { order_id: string; status: string } | null;
  logger.info('dispatch.offer.accepted', { offerId, orderId: accepted?.order_id });
  return {
    ok: true,
    offer: {
      offerId,
      orderId: accepted?.order_id ?? '',
      status: 'accepted',
      offeredAt: '',
      expiresAt: '',
      pickupAddress: '',
      dropoffAddress: '',
      roadDistanceM: 0,
      riderShareKobo: '0',
    },
  };
}

/** Decline the calling rider's own active offer (atomic). */
export async function declineOffer(
  offerId: string,
): Promise<{ ok: boolean; error?: DispatchServiceError }> {
  const auth = await requireRiderSession();
  if (typeof auth === 'string') return { ok: false, error: auth };

  if (!uuidSchema.safeParse(offerId).success) {
    return { ok: false, error: 'invalid_input' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('dispatch_decline', {
    p_offer_id: offerId,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('dispatch.decline.rpc_failed', { code, offerId });
    return { ok: false, error: mapRpcError(code) };
  }
  return { ok: true };
}

/** Declare availability (rider). The DB owns the queue clock. */
export async function setAvailability(
  input: unknown,
): Promise<{ ok: boolean; state?: 'available' | 'unavailable'; error?: DispatchServiceError }> {
  const auth = await requireRiderSession();
  if (typeof auth === 'string') return { ok: false, error: auth };

  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rider_set_availability', {
    p_is_available: parsed.data.isAvailable,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('dispatch.availability.rpc_failed', { code });
    return { ok: false, error: mapRpcError(code) };
  }
  return { ok: true, state: data === 'available' ? 'available' : 'unavailable' };
}
