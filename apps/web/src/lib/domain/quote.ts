/**
 * Quote domain rules (M3).
 *
 * Pure and deterministic. The server (create_quote RPC, migration 0005) is
 * the authority for pricing/coverage; this module defines the quote's own
 * lifecycle rules so both the service layer and tests share one definition.
 *
 * FOUNDER-PENDING DEFAULT: quote validity is 45 minutes. No founder decision
 * exists for quote validity (adjacent to D09/D10 — quote validity window and
 * whether a re-quote at new pricing is required when pricing changes). This
 * is a documented implementation default, single-site, flagged for
 * ratification — not an invented business rule.
 */

import { err, ok, type Result } from '@embee/shared';

/** Quote validity in minutes (founder-pending; see module docblock). */
export const QUOTE_VALIDITY_MINUTES = 45;

export type QuoteStatus = 'active' | 'consumed' | 'expired';

export interface QuoteSnapshot {
  readonly id: string;
  readonly customerId: string;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly roadDistanceMetres: number;
  readonly pricingVersion: number;
  readonly customerPriceKobo: bigint;
  readonly riderShareKobo: bigint;
  readonly platformShareKobo: bigint;
  readonly status: QuoteStatus;
  readonly expiresAt: Date;
}

/** Server-side clock injection keeps expiry logic deterministic in tests. */
export type Clock = () => Date;

export type QuoteOrderability =
  | { orderable: true }
  | { orderable: false; reason: 'not_active' | 'expired' | 'not_owner' };

/**
 * Can this quote be used to create an order, evaluated at `now`?
 * Matches create_order_from_quote (migration 0005) exactly.
 */
export function isQuoteOrderable(
  quote: Pick<QuoteSnapshot, 'status' | 'expiresAt'>,
  now: Clock = () => new Date(),
): QuoteOrderability {
  if (quote.status !== 'active') {
    return { orderable: false, reason: 'not_active' };
  }
  if (quote.expiresAt.getTime() <= now().getTime()) {
    return { orderable: false, reason: 'expired' };
  }
  return { orderable: true };
}

export type QuoteExpiryCheck = { dueForExpiry: false } | { dueForExpiry: true };

/**
 * Should a sweep mark this quote expired? Only 'active' quotes can expire;
 * 'consumed' and 'expired' are terminal. Used by the lazy expiry path in
 * create_order_from_quote and by any future scheduled sweep (background_jobs).
 */
export function isQuoteDueForExpiry(
  quote: Pick<QuoteSnapshot, 'status' | 'expiresAt'>,
  now: Clock = () => new Date(),
): QuoteExpiryCheck {
  if (quote.status !== 'active') return { dueForExpiry: false };
  if (quote.expiresAt.getTime() <= now().getTime()) return { dueForExpiry: true };
  return { dueForExpiry: false };
}

/** Result type wrapper for callers that prefer explicit errors. */
export function checkQuoteUsable(
  quote: Pick<QuoteSnapshot, 'status' | 'expiresAt'>,
  now: Clock = () => new Date(),
): Result<{ usable: true }, 'not_active' | 'expired'> {
  const verdict = isQuoteOrderable(quote, now);
  if (verdict.orderable) return ok({ usable: true });
  return err(verdict.reason === 'not_owner' ? 'not_active' : verdict.reason);
}
