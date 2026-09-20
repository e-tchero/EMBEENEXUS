/**
 * Waiting domain rules (M6) — founder decision D05.
 *
 * Pure and deterministic. `computeWaitingChargeKobo` mirrors the single
 * authoritative SQL definition (public.waiting_charge_kobo, migration 0014)
 * exactly; the database remains the authority for what is recorded on an
 * order, and this module exists so services and tests share one definition.
 *
 * FOUNDER RULE (D05, clarified):
 *   * first 10 minutes: FREE
 *   * after the first 10 minutes: ₦700 PER ADDITIONAL MINUTE (started)
 *   * maximum waiting period: 30 minutes
 *   * after the maximum: the parcel is returned to the original pickup
 *     customer; Embee bears the return cost
 *
 * BILLING CONVENTION (deterministic, documented):
 *   billable minutes = ceil((elapsed_seconds − 600) / 60), clamped to [0, 20].
 *   Each additional minute STARTED after the free window is billed — 10 min
 *   + 1 second ⇒ 1 billable minute. At ≥ 1800 s the 30-minute maximum has
 *   been reached and the charge is capped at 20 × ₦700 = ₦14,000. All math is
 *   integer/ceiling — no floating-point money.
 *
 * WAITING CLOCK (server-authoritative):
 *   starts at the rider_arrived_destination transition (DB clock, migration
 *   0014), never resets (operator hold/release does not pause it), and ends
 *   at the delivered transition or at return initiation.
 */

/** First 10 minutes of waiting are free (founder D05). */
export const WAITING_FREE_MINUTES = 10;

/** Maximum waiting period in minutes (founder D05; return initiates after this). */
export const WAITING_MAX_MINUTES = 30;

/** ₦700 per additional minute, in kobo (integer minor units). */
export const WAITING_RATE_KOBO = 70_000n;

/** Maximum billable minutes: (30 − 10) = 20 ⇒ ₦14,000 maximum waiting charge. */
export const MAX_BILLABLE_MINUTES = WAITING_MAX_MINUTES - WAITING_FREE_MINUTES;

/** Maximum possible waiting charge in kobo (20 × ₦700). */
export const MAX_WAITING_CHARGE_KOBO = WAITING_RATE_KOBO * BigInt(MAX_BILLABLE_MINUTES);

const FREE_SECONDS = WAITING_FREE_MINUTES * 60;

export type WaitingSeconds = { secondsElapsed: number };

/**
 * Billable waiting minutes under the D05 convention: the ceiling of each
 * additional minute started after the free window, clamped to [0, 20].
 * Mirrors public.waiting_charge_kobo (migration 0014) exactly.
 */
export function billableWaitingMinutes(secondsElapsed: number): number {
  if (!Number.isFinite(secondsElapsed) || secondsElapsed <= FREE_SECONDS) {
    return 0;
  }
  const minutes = Math.ceil((secondsElapsed - FREE_SECONDS) / 60);
  return Math.min(minutes, MAX_BILLABLE_MINUTES);
}

/**
 * Waiting charge in kobo for a waiting interval. Mirrors the SQL definition:
 *   * null/invalid or ended <= started        ⇒ 0
 *   * elapsed ≤ 600 s                         ⇒ 0 (free window)
 *   * otherwise                               ⇒ ceil per-minute, capped at 20
 */
export function computeWaitingChargeKobo(
  startedAt: Date | null | undefined,
  endedAt: Date | null | undefined,
): bigint {
  if (!startedAt || !endedAt) return 0n;
  const secondsElapsed = (endedAt.getTime() - startedAt.getTime()) / 1000;
  if (secondsElapsed <= 0) return 0n;
  return WAITING_RATE_KOBO * BigInt(billableWaitingMinutes(secondsElapsed));
}

/**
 * Has the 30-minute waiting maximum been reached at `now`? Used by the
 * waiting-tick eligibility check (mirrored by the SQL predicate
 * `waiting_started_at <= now() - interval '30 minutes'`).
 */
export function isWaitingMaxReached(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() >= WAITING_MAX_MINUTES * 60 * 1000;
}

/** Human-readable waiting charge (₦), for receipts/UI copy. Reuses the shared money formatter. */
export { formatNairaFromKobo as formatWaitingChargeNaira } from '@embee/shared';
