import { describe, expect, it } from 'vitest';

import {
  MAX_BILLABLE_MINUTES,
  MAX_WAITING_CHARGE_KOBO,
  WAITING_FREE_MINUTES,
  WAITING_MAX_MINUTES,
  WAITING_RATE_KOBO,
  billableWaitingMinutes,
  computeWaitingChargeKobo,
  formatWaitingChargeNaira,
  isWaitingMaxReached,
} from './waiting';

const START = new Date('2026-09-20T10:00:00Z');
const afterSeconds = (s: number) => new Date(START.getTime() + s * 1000);

/**
 * Boundary matrix from the M6 authorization §8. The billing convention is
 * "each additional minute STARTED after the first 10 free minutes", i.e.
 * billable = ceil((elapsed_s − 600) / 60) clamped to [0, 20].
 */
const CHARGE_BOUNDARIES: ReadonlyArray<[seconds: number, expectedKobo: bigint]> = [
  [0, 0n], // 0 minutes
  [1, 0n], // 1 minute
  [540, 0n], // 9 minutes
  [599, 0n], // 1 s inside the free window
  [600, 0n], // 10 minutes — exactly free
  [601, 70_000n], // 10 min + 1 s — first billable minute
  [660, 70_000n], // 11 minutes — same started minute
  [661, 140_000n], // second minute started
  [1_200, 700_000n], // 20 minutes → 10 billable
  [1_799, 1_400_000n], // 1 s before the cap → 20 started
  [1_800, 1_400_000n], // 30 minutes — cap reached
  [3_600, 1_400_000n], // beyond the cap — charge cannot exceed ₦14,000
];

describe('waiting rules (founder D05, M6 authorization §7–§8)', () => {
  it('encodes the founder rule constants', () => {
    expect(WAITING_FREE_MINUTES).toBe(10);
    expect(WAITING_MAX_MINUTES).toBe(30);
    expect(WAITING_RATE_KOBO).toBe(70_000n); // ₦700 in kobo
    expect(MAX_BILLABLE_MINUTES).toBe(20);
    expect(MAX_WAITING_CHARGE_KOBO).toBe(1_400_000n); // ₦14,000
  });

  it.each(CHARGE_BOUNDARIES)('charges %s s of waiting as %s kobo', (seconds, kobo) => {
    expect(computeWaitingChargeKobo(START, afterSeconds(seconds))).toBe(kobo);
  });

  it('is ₦700 per additional minute, never per 10-minute block', () => {
    // 10 min + 1 s must be ONE billable minute (₦700), not a full block.
    expect(computeWaitingChargeKobo(START, afterSeconds(601))).toBe(70_000n);
    // 20 minutes = 10 additional minutes = ₦7,000 (a block model would say ₦700).
    expect(computeWaitingChargeKobo(START, afterSeconds(1_200))).toBe(700_000n);
  });

  it('uses only integer kobo math', () => {
    for (const [seconds, kobo] of CHARGE_BOUNDARIES) {
      expect(kobo % WAITING_RATE_KOBO).toBe(0n);
      expect(computeWaitingChargeKobo(START, afterSeconds(seconds))).toBe(kobo);
    }
  });

  it('returns 0 for missing or inverted intervals', () => {
    expect(computeWaitingChargeKobo(null, afterSeconds(1_800))).toBe(0n);
    expect(computeWaitingChargeKobo(START, null)).toBe(0n);
    expect(computeWaitingChargeKobo(afterSeconds(100), START)).toBe(0n);
    expect(computeWaitingChargeKobo(START, START)).toBe(0n);
  });

  it('flags the waiting maximum exactly at 30 minutes', () => {
    expect(isWaitingMaxReached(START, afterSeconds(1_799))).toBe(false);
    expect(isWaitingMaxReached(START, afterSeconds(1_800))).toBe(true);
    expect(isWaitingMaxReached(START, afterSeconds(5_000))).toBe(true);
  });

  it('counts each additional minute STARTED, clamped to the 20-minute cap', () => {
    expect(billableWaitingMinutes(0)).toBe(0);
    expect(billableWaitingMinutes(600)).toBe(0);
    expect(billableWaitingMinutes(601)).toBe(1);
    expect(billableWaitingMinutes(660)).toBe(1);
    expect(billableWaitingMinutes(661)).toBe(2);
    expect(billableWaitingMinutes(1_200)).toBe(10);
    expect(billableWaitingMinutes(1_799)).toBe(20);
    expect(billableWaitingMinutes(1_800)).toBe(20);
    expect(billableWaitingMinutes(99_999)).toBe(20);
  });

  it('formats naira for receipts/UI copy', () => {
    expect(formatWaitingChargeNaira(1_400_000n)).toBe('₦14,000');
    expect(formatWaitingChargeNaira(70_000n)).toBe('₦700');
    expect(formatWaitingChargeNaira(0n)).toBe('₦0');
  });
});
