import { randomBytes } from 'node:crypto';

/**
 * Payment domain (M4) — pure, deterministic rules for the payment axis.
 *
 * This module owns:
 *   - the normalized internal payment status set (deliberately separate from
 *     the order state machine; a failed payment is never an order state),
 *   - transaction-reference generation (server-side only),
 *   - amount representation helpers (integer kobo; naira → kobo for the one
 *     place money leaves/enters the provider wire format),
 *   - the verification decision: whether a provider-verified transaction may
 *     grant value, given the payment's expected facts.
 *
 * No I/O, no clocks, no provider shapes. Provider parsing lives in the
 * adapter; persistence lives in the service layer.
 */

// ---------------------------------------------------------------------------
// Statuses (normalized, provider-independent)
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'initiated'
  | 'redirected'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'verification_failed';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'initiated',
  'redirected',
  'pending',
  'successful',
  'failed',
  'cancelled',
  'verification_failed',
];

/** Statuses in which a payment session is still live (reusable, resumable). */
export const ACTIVE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'initiated',
  'redirected',
  'pending',
];

/** Statuses that permanently settle an attempt (a new attempt may start). */
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'successful',
  'failed',
  'cancelled',
  'verification_failed',
];

export function isActivePaymentStatus(status: PaymentStatus): boolean {
  return ACTIVE_PAYMENT_STATUSES.includes(status);
}

export function isSettledPaymentStatus(status: PaymentStatus): boolean {
  return SETTLED_PAYMENT_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Transaction reference — server-generated, collision-resistant, opaque
// ---------------------------------------------------------------------------

/**
 * Reference format: `ENX-<BASE32LRANDOM>` — fixed prefix for support
 * triage + 20 characters of cryptographic randomness (~100 bits) from a
 * Crockford-flavoured base32 alphabet. No customer PII, no secrets, no
 * timestamps; uniqueness is enforced again at the database level.
 * Total length: 24 characters — within the 16..100 DB constraint.
 */
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 31 chars, no I/L/O/U
const REF_RANDOM_LENGTH = 20;

export function generateTransactionReference(
  randomBytesFn: (size: number) => Buffer = randomBytes,
): string {
  const bytes = randomBytesFn(REF_RANDOM_LENGTH);
  let ref = 'ENX-';
  for (const byte of bytes) {
    ref += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return ref;
}

/** Structural check mirroring the database CHECK constraint. */
export function isValidTransactionReference(ref: string): boolean {
  return (
    ref.length >= 16 &&
    ref.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(ref)
  );
}

// ---------------------------------------------------------------------------
// Amount representation — integer kobo only; naira→kobo is exact by design
// ---------------------------------------------------------------------------

/**
 * Converts a naira amount to integer kobo. Naira amounts are always whole
 * numbers in the Embee pricing model (all bands are whole naira), so this
 * is an exact ×100 — never a float multiply.
 */
export function nairaToKobo(naira: number): bigint {
  if (!Number.isInteger(naira) || naira <= 0) {
    throw new RangeError('Naira amounts must be positive integers.');
  }
  return BigInt(naira) * 100n;
}

/** The only currency M4 supports (founder model: NGN, no multi-currency yet). */
export const PAYMENT_CURRENCY = 'NGN' as const;

// ---------------------------------------------------------------------------
// Verification decision
// ---------------------------------------------------------------------------

/** Normalized provider-verified transaction facts (adapter output). */
export interface VerifiedTransaction {
  readonly status: 'successful' | 'failed' | 'pending';
  readonly amountKobo: bigint;
  readonly currency: string;
  readonly transactionReference: string;
  readonly providerTransactionId: string;
}

export type VerificationDecision =
  | { readonly outcome: 'grant_value' }
  | {
      readonly outcome: 'no_value';
      readonly reason:
        | 'amount_mismatch'
        | 'currency_mismatch'
        | 'reference_mismatch'
        | 'status_not_successful'
        | 'missing_provider_transaction_id';
    };

/**
 * The single decision point for granting value.
 *
 * Every field of the provider-verified transaction is checked against the
 * payment's expected facts. Any mismatch → no value, with a reason that is
 * safe to log. This function is the last gate before payment_complete_verified;
 * the database RPC re-checks the amount again (defense in depth).
 */
export function decideVerification(
  verified: VerifiedTransaction,
  expected: {
    readonly transactionReference: string;
    readonly expectedAmountKobo: bigint;
    readonly currency: string;
  },
): VerificationDecision {
  if (verified.transactionReference !== expected.transactionReference) {
    return { outcome: 'no_value', reason: 'reference_mismatch' };
  }
  if (verified.currency !== expected.currency) {
    return { outcome: 'no_value', reason: 'currency_mismatch' };
  }
  if (verified.amountKobo !== expected.expectedAmountKobo) {
    return { outcome: 'no_value', reason: 'amount_mismatch' };
  }
  if (!verified.providerTransactionId) {
    return { outcome: 'no_value', reason: 'missing_provider_transaction_id' };
  }
  if (verified.status !== 'successful') {
    return { outcome: 'no_value', reason: 'status_not_successful' };
  }
  return { outcome: 'grant_value' };
}

// ---------------------------------------------------------------------------
// Webhook event classification (provider-independent naming)
// ---------------------------------------------------------------------------

/**
 * Maps a Flutterwave event name to a normalized webhook classification.
 * Only charge.* events can grant value; everything else is recorded for
 * audit and never triggers verification on its own.
 */
export type WebhookEventKind =
  | 'charge_completed'
  | 'charge_failed'
  | 'transfer'
  | 'refund'
  | 'other';

export function classifyWebhookEvent(eventName: string): WebhookEventKind {
  switch (eventName) {
    case 'charge.completed':
      return 'charge_completed';
    case 'charge.failed':
      return 'charge_failed';
    case 'transfer.completed':
    case 'transfer.failed':
    case 'transfer.reversed':
      return 'transfer';
    case 'refund.completed':
    case 'refund.processed':
    case 'refund.processing':
    case 'refund.failed':
      return 'refund';
    default:
      return 'other';
  }
}
