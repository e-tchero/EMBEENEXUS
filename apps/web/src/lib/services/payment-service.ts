import 'server-only';

import { initiatePaymentSchema } from '@embee/shared';

import { assertRole, AuthorizationError } from '@/lib/auth/rbac';
import { getSession, type Session } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/client-admin';
import { createClient } from '@/lib/db/client-server';
import { logger } from '@/lib/logging/logger';
import {
  ACTIVE_PAYMENT_STATUSES,
  PAYMENT_CURRENCY,
  decideVerification,
  generateTransactionReference,
  type VerifiedTransaction,
} from '@/lib/domain/payment';
import {
  PaymentProviderErrorError,
  type PaymentProvider,
} from '@/lib/providers/payment-provider';
import { createFlutterwaveProvider } from '@/lib/providers/flutterwave';
import { getServerEnv } from '@/lib/env/server';

/**
 * Payment service (M4).
 *
 * The single server-authoritative path for payment initiation and
 * verification. Money values always come from the order's immutable
 * snapshot inside the database RPC — never from the client, never from
 * the provider response alone.
 *
 * Two Supabase clients, used exactly as audited in M0:
 *   - cookie client (RLS-bound) for customer-owned actions (initiate),
 *   - service-role client ONLY for webhook/verification/reconciliation
 *     contexts whose authority is established by this module (signature
 *     verification or the background-job gate) before any call.
 */

export type PaymentServiceError =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_order_state'
  | 'provider_error'
  | 'verification_failed'
  | 'unknown_error';

export interface CheckoutResult {
  readonly ok: boolean;
  readonly checkout?: {
    readonly paymentId: string;
    readonly orderId: string;
    readonly transactionReference: string;
    readonly amountKobo: bigint;
    readonly currency: 'NGN';
    readonly checkoutUrl: string;
    readonly reused: boolean;
  };
  readonly error?: PaymentServiceError;
}

export interface PaymentRecordRow {
  readonly id: string;
  readonly order_id: string;
  readonly customer_id: string;
  readonly transaction_reference: string;
  readonly expected_amount_kobo: string | number;
  readonly currency: string;
  readonly status: string;
  readonly checkout_url: string | null;
}

// ---------------------------------------------------------------------------
// Provider construction (lazy; server-only)
// ---------------------------------------------------------------------------

let provider: PaymentProvider | null = null;

export function setPaymentProviderForTesting(p: PaymentProvider | null): void {
  provider = p;
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (provider) return provider;
  // The adapter module reads no env at import time (credentials arrive via
  // the factory), so a static import is build-safe; env is validated lazily
  // here on first payment use.
  provider = createFlutterwaveProvider({ secretKey: getServerEnv().FLUTTERWAVE_SECRET_KEY });
  return provider;
}

/** Public app URL for the provider redirect (callback landing page). */
function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// RPC error mapping
// ---------------------------------------------------------------------------

function mapRpcError(code: string): PaymentServiceError {
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return 'unauthenticated';
    case 'FORBIDDEN':
      return 'forbidden';
    case 'NOT_FOUND':
      return 'not_found';
    case 'INVALID_INPUT':
    case 'REFERENCE_COLLISION':
      return 'invalid_input';
    case 'INVALID_ORDER_STATE':
    case 'INVALID_PAYMENT_STATE':
      return 'invalid_order_state';
    default:
      return 'unknown_error';
  }
}

// ---------------------------------------------------------------------------
// 1. Payment initiation (customer; idempotent; cookie/RLS client)
// ---------------------------------------------------------------------------

/** Customer-session guard resolving to the typed session or a safe error. */
async function requireCustomerSession(): Promise<Session | PaymentServiceError> {
  try {
    const s = await getSession();
    if (!s) return 'unauthenticated';
    await assertRole(s, ['customer']);
    return s;
  } catch (error) {
    if (error instanceof AuthorizationError) return 'forbidden';
    throw error;
  }
}

/**
 * Creates (or reuses) the checkout session for an order in awaiting_payment.
 * Safe against double taps and client retries: the database RPC reuses the
 * active attempt; the provider is called only when a fresh session is needed.
 */
export async function initiateOrderPayment(input: unknown): Promise<CheckoutResult> {
  // 1. Authorization — customers initiate payments on their own orders only.
  let session: Session;
  try {
    const s = await getSession();
    if (!s) return { ok: false, error: 'unauthenticated' };
    await assertRole(s, ['customer']);
    session = s;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: 'forbidden' };
    throw error;
  }

  // 2. Re-validate input (orderId only — never amounts/status).
  const parsed = initiatePaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // 3. Reserve/reuse the payment session server-side. The reference is
  //    generated here and stored BEFORE the provider call so a timeout can
  //    be reconciled by reference later (never blindly re-created).
  const supabase = await createClient();
  const txRef = generateTransactionReference();
  const { data, error } = await supabase.rpc('initiate_payment', {
    p_order_id: parsed.data.orderId,
    p_transaction_reference: txRef,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('payments.initiate.rpc_failed', { code, customerId: session.userId });
    return { ok: false, error: mapRpcError(code) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        payment_id: string;
        transaction_reference: string;
        expected_amount_kobo: string;
        currency: string;
        reused: boolean;
      }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  const expectedAmountKobo = BigInt(row.expected_amount_kobo);

  // 4. Reused attempt: an active session already exists. Refresh its hosted
  //    link only if we still have one stored; otherwise create a new one
  //    under the SAME reference (Flutterwave keys the link to tx_ref).
  if (row.reused) {
    const { data: existing } = await supabase
      .from('payments')
      .select('checkout_url, status')
      .eq('id', row.payment_id)
      .single();

    const checkoutUrl = (existing as { checkout_url: string | null } | null)?.checkout_url;
    if (checkoutUrl) {
      return {
        ok: true,
        checkout: {
          paymentId: row.payment_id,
          orderId: parsed.data.orderId,
          transactionReference: row.transaction_reference,
          amountKobo: expectedAmountKobo,
          currency: PAYMENT_CURRENCY,
          checkoutUrl,
          reused: true,
        },
      };
    }
    // Fall through: create a fresh checkout under the same stored reference.
  }

  // 5. Customer email for the hosted checkout (account email — profile data).
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', session.userId)
    .single();
  const email = (profile as { email: string | null } | null)?.email;
  if (!email) return { ok: false, error: 'unknown_error' };

  // 6. Provider call (hosted checkout). NOT retried by the adapter.
  let checkoutUrl: string;
  try {
    const sessionResult = await (await getPaymentProvider()).createCheckout({
      transactionReference: row.transaction_reference,
      amountKobo: expectedAmountKobo,
      currency: PAYMENT_CURRENCY,
      customerEmail: email,
      redirectUrl: `${appBaseUrl()}/payments/callback`,
      title: 'Embee Nexus delivery',
    });
    checkoutUrl = sessionResult.checkoutUrl;
  } catch (err) {
    if (err instanceof PaymentProviderErrorError) {
      logger.warn('payments.initiate.provider_failed', {
        code: err.code,
        paymentId: row.payment_id,
      });
      if (err.code === 'timeout' || err.code === 'network') {
        // Unknown provider state: the reference is already stored; the
        // reconciliation path can resolve it. Do NOT create another attempt.
        return { ok: false, error: 'provider_error' };
      }
      return { ok: false, error: 'provider_error' };
    }
    throw err;
  }

  // 7. Persist the checkout URL (service-role: writing our own reserved row).
  const admin = createAdminClient();
  const { error: attachError } = await admin.rpc('payment_attach_checkout', {
    p_payment_id: row.payment_id,
    p_checkout_url: checkoutUrl,
  });
  if (attachError) {
    logger.error('payments.initiate.attach_failed', {
      code: (attachError as { code?: string }).code,
      paymentId: row.payment_id,
    });
    return { ok: false, error: 'unknown_error' };
  }

  logger.info('payments.initiate.ok', {
    paymentId: row.payment_id,
    orderId: parsed.data.orderId,
    reused: row.reused,
  });

  return {
    ok: true,
    checkout: {
      paymentId: row.payment_id,
      orderId: parsed.data.orderId,
      transactionReference: row.transaction_reference,
      amountKobo: expectedAmountKobo,
      currency: PAYMENT_CURRENCY,
      checkoutUrl,
      reused: row.reused,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Verification (service-role context; webhook or reconciliation callers)
// ---------------------------------------------------------------------------

/**
 * Verifies a payment attempt against the provider and, on success, grants
 * value exactly once (payment row + canonical order transition).
 *
 * The caller must have established authority (webhook signature verified, or
 * the operator-only reconciliation gate). Every provider fact is re-checked
 * by the domain decision and AGAIN inside the database RPC.
 */
export async function verifyAndGrantPayment(
  payment: PaymentRecordRow,
): Promise<{ ok: boolean; error?: PaymentServiceError; outcome?: string }> {
  let verified: VerifiedTransaction;
  try {
    verified = await (await getPaymentProvider()).verifyByReference({
      transactionReference: payment.transaction_reference,
    });
  } catch (err) {
    if (err instanceof PaymentProviderErrorError) {
      logger.warn('payments.verify.provider_failed', {
        code: err.code,
        paymentId: payment.id,
      });
      if (err.code === 'not_found') {
        // Provider has no such transaction: record nothing as success.
        return { ok: false, error: 'not_found' };
      }
      return { ok: false, error: 'provider_error' };
    }
    throw err;
  }

  // 3. Domain decision: every expected fact must match exactly.
  const decision = decideVerification(verified, {
    transactionReference: payment.transaction_reference,
    expectedAmountKobo: BigInt(payment.expected_amount_kobo),
    currency: payment.currency,
  });

  if (decision.outcome === 'no_value') {
    logger.warn('payments.verify.no_value', {
      paymentId: payment.id,
      reason: decision.reason,
      providerStatus: verified.status,
    });

    // Non-success provider statuses are recorded as outcomes (no value).
    if (verified.status === 'failed') {
      await markOutcome(payment.id, 'failed', verified.providerTransactionId, decision.reason);
    } else if (verified.status === 'pending') {
      await markOutcome(payment.id, 'pending', verified.providerTransactionId, undefined);
    }
    return { ok: false, error: 'verification_failed' };
  }

  // 4. Grant value exactly once via the database RPC (re-checks amount).
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('payment_complete_verified', {
    p_payment_id: payment.id,
    p_provider_transaction_id: verified.providerTransactionId,
    p_verified_amount_kobo: verified.amountKobo.toString(),
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.error('payments.verify.grant_failed', { code, paymentId: payment.id });
    if (code === 'AMOUNT_MISMATCH') {
      // Defense-in-depth catch: provider said one thing, DB snapshot another.
      return { ok: false, error: 'verification_failed' };
    }
    if (code === 'INVALID_ORDER_STATE' || code === 'INVALID_PAYMENT_STATE') {
      // Already settled elsewhere (e.g. reconciled concurrently) — not fatal.
      return { ok: true, outcome: 'already_settled' };
    }
    return { ok: false, error: 'unknown_error' };
  }

  const grant = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; order_status: string; payment_status: string }
    | null;

  logger.info('payments.value_granted', {
    paymentId: payment.id,
    orderId: grant?.order_id,
    orderStatus: grant?.order_status,
  });
  return { ok: true, outcome: 'granted' };
}

async function markOutcome(
  paymentId: string,
  status: 'pending' | 'failed' | 'cancelled',
  providerTransactionId: string | undefined,
  reason: string | undefined,
): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc('payment_mark_outcome', {
    p_payment_id: paymentId,
    p_status: status,
    p_provider_transaction_id: providerTransactionId ?? null,
    p_reason: reason ?? null,
  });
}

// ---------------------------------------------------------------------------
// 3. Payment status (customer polling; cookie/RLS client)
// ---------------------------------------------------------------------------

export interface PaymentStatusResult {
  readonly ok: boolean;
  readonly payment?: {
    readonly paymentId: string;
    readonly orderId: string;
    readonly status: string;
    readonly checkoutUrl: string | null;
  };
  readonly error?: PaymentServiceError;
}

export async function getPaymentStatus(
  input: unknown,
): Promise<PaymentStatusResult> {
  const parsed = initiatePaymentSchema.shape.orderId;
  if (typeof input !== 'string' || !parsed.safeParse(input).success) {
    return { ok: false, error: 'invalid_input' };
  }

  let session: Session;
  try {
    const s = await getSession();
    if (!s) return { ok: false, error: 'unauthenticated' };
    await assertRole(s, ['customer']);
    session = s;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: 'forbidden' };
    throw error;
  }

  // RLS-bound read: customers can only select their own payment rows.
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('id, order_id, status, checkout_url')
    .eq('order_id', input)
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (data as Array<{
    id: string;
    order_id: string;
    status: string;
    checkout_url: string | null;
  }> | null)?.[0];
  if (!row) return { ok: false, error: 'not_found' };

  // Live re-check: while a session is active, poll the provider once so the
  // customer sees fresh truth without waiting for the webhook.
  if (ACTIVE_PAYMENT_STATUSES.includes(row.status as never)) {
    const { data: full } = await supabase
      .from('payments')
      .select('transaction_reference, expected_amount_kobo, currency')
      .eq('id', row.id)
      .single();
    const fullRow = full as
      | { transaction_reference: string; expected_amount_kobo: string; currency: string }
      | null;
    if (fullRow) {
      const result = await verifyAndGrantPayment({
        id: row.id,
        order_id: row.order_id,
        customer_id: session.userId,
        transaction_reference: fullRow.transaction_reference,
        expected_amount_kobo: fullRow.expected_amount_kobo,
        currency: fullRow.currency,
        status: row.status,
        checkout_url: row.checkout_url,
      });
      if (result.ok) {
        return {
          ok: true,
          payment: {
            paymentId: row.id,
            orderId: row.order_id,
            status: 'successful',
            checkoutUrl: row.checkout_url,
          },
        };
      }
      // Verification failed/not found — fall through to stored state.
    }
  }

  return {
    ok: true,
    payment: {
      paymentId: row.id,
      orderId: row.order_id,
      status: row.status,
      checkoutUrl: row.checkout_url,
    },
  };
}

/**
 * Callback-page polling: resolve the latest payment by its server-generated
 * transaction reference. Authorization is identity-based, not reference-based:
 * the caller must be a customer, and only payments on their own orders are
 * returned (RLS-bound read). A valid reference alone grants nothing.
 */
export async function getPaymentStatusByReference(
  transactionReference: string,
): Promise<PaymentStatusResult> {
  const auth = await requireCustomerSession();
  if (typeof auth === 'string') return { ok: false, error: auth };
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('id, order_id, status, checkout_url')
    .eq('transaction_reference', transactionReference)
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (data as Array<{
    id: string;
    order_id: string;
    status: string;
    checkout_url: string | null;
  }> | null)?.[0];
  if (!row) return { ok: false, error: 'not_found' };

  return {
    ok: true,
    payment: {
      paymentId: row.id,
      orderId: row.order_id,
      status: row.status,
      checkoutUrl: row.checkout_url,
    },
  };
}
