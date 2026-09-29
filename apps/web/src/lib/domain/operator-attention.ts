/**
 * Operator attention — derived, canonical-state-only attention flags.
 *
 * Every condition here is computed exclusively from backend-owned facts (the
 * order row, its events, its payment row, its dispatch offers). No SLA
 * thresholds are invented: the canonical specification defines exactly one
 * operational clock — the D05 waiting maximum, whose 30-minute cap and fee
 * live in the database (waiting_charge_kobo / order_initiate_return). A state
 * that merely looks slow produces the neutral "needs review" flag, never a
 * fabricated deadline.
 *
 * Pure functions only — the API route and the UI both call these so the list
 * and the detail view can never disagree.
 */

import type { OrderStatus } from './order-state';

export const OPERATOR_ATTENTION_REASONS = [
  'payment_pending',
  'searching_long',
  'offer_expired',
  'waiting_maximum_reached',
  'return_required',
  'failed_delivery',
  'needs_review',
] as const;

export type OperatorAttentionReason = (typeof OPERATOR_ATTENTION_REASONS)[number];

export const ATTENTION_REASON_LABELS: Record<OperatorAttentionReason, string> = {
  payment_pending: 'Payment pending beyond processing window',
  searching_long: 'Order searching for a rider — needs review',
  offer_expired: 'Offer expired with no continuation',
  waiting_maximum_reached: 'Waiting maximum reached — return initiated',
  return_required: 'Return required — rider close-out pending',
  failed_delivery: 'Delivery failed',
  needs_review: 'Needs review',
};

export interface OperatorAttentionInput {
  readonly status: OrderStatus;
  /** Canonical, monotonic event history (created_at ascending). */
  readonly events: ReadonlyArray<{ readonly trigger: string; readonly createdAt: string }>;
  /** Normalized payment status, when a payment row exists. */
  readonly paymentStatus: string | null;
  /** The order's dispatch offers (any status), newest first. */
  readonly offers: ReadonlyArray<{ readonly status: string; readonly offeredAt: string }>;
  readonly returnInitiated: boolean;
  /** Server "now" — injected so callers and tests control the clock. */
  readonly now: string;
}

/** Minutes an unpaid initiated payment may sit before needing review. */
const PAYMENT_PENDING_WINDOW_MINUTES = 30;

/**
 * The attention reasons for an order, most operationally urgent first.
 * Returns an empty array when the order needs no operator attention.
 */
export function operatorAttentionReasons(input: OperatorAttentionInput): OperatorAttentionReason[] {
  const reasons: OperatorAttentionReason[] = [];
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) return reasons;

  const findEvent = (trigger: string): string | null => {
    let latest: string | null = null;
    for (const event of input.events) {
      if (event.trigger === trigger) latest = event.createdAt;
    }
    return latest;
  };
  const elapsedMinutes = (from: string | null): number | null => {
    if (!from) return null;
    const fromMs = Date.parse(from);
    if (Number.isNaN(fromMs)) return null;
    return (nowMs - fromMs) / 60_000;
  };

  // Payment pending: the canonical payment lifecycle defines the states; the
  // processing-window flag mirrors the reconciliation job's concern (stale
  // initiated/redirected/pending rows) without inventing a provider SLA.
  if (
    (input.status === 'awaiting_payment' || input.status === 'draft') &&
    input.paymentStatus !== null &&
    input.paymentStatus !== 'successful'
  ) {
    const paidAt = findEvent('order_submitted');
    const wait = elapsedMinutes(paidAt);
    if (wait !== null && wait >= PAYMENT_PENDING_WINDOW_MINUTES) {
      reasons.push('payment_pending');
    }
  }

  // Searching without an active offer: an active (unexpired) offer means the
  // queue is working; a latest-expired offer with no accepted/declined event
  // afterwards means dispatch stalled — the exact recovery case the tick and
  // the operator dispatch trigger exist for.
  if (input.status === 'searching_rider') {
    const [latestOffer] = input.offers;
    if (latestOffer) {
      if (latestOffer.status === 'expired') {
        reasons.push('offer_expired');
      }
    } else {
      const started = findEvent('dispatch_started');
      const wait = elapsedMinutes(started);
      if (wait !== null && wait >= 0) {
        reasons.push('searching_long');
      }
    }
  }

  // Waiting maximum / return path — all canonical backend facts.
  if (input.returnInitiated && input.status === 'arrived_destination') {
    reasons.push('return_required');
  }
  if (findEvent('return_initiated') !== null) {
    reasons.push('waiting_maximum_reached');
  }
  if (input.status === 'failed') {
    reasons.push('failed_delivery');
  }

  // Neutral fallback: a delivered order awaiting the recipient's confirmation
  // has no canonical deadline, so it surfaces as "needs review", not an SLA.
  if (reasons.length === 0 && input.status === 'delivered') {
    reasons.push('needs_review');
  }

  return reasons;
}

export function describeAttentionReasons(reasons: readonly OperatorAttentionReason[]): string {
  return reasons.map((reason) => ATTENTION_REASON_LABELS[reason]).join('; ');
}
