import { describe, expect, it } from 'vitest';

import {
  OFFER_TTL_SECONDS,
  canOfferBeAccepted,
  compareQueueOrder,
  isOfferDueForExpiry,
  isValidOfferTtl,
} from './dispatch';

describe('offer TTL (canonical founder rule)', () => {
  it('is exactly 20 seconds', () => {
    expect(OFFER_TTL_SECONDS).toBe(20);
  });

  it('validates the structural TTL constraint', () => {
    const offeredAt = new Date('2026-09-18T12:00:00Z');
    expect(isValidOfferTtl(offeredAt, new Date(offeredAt.getTime() + 20_000))).toBe(true);
    expect(isValidOfferTtl(offeredAt, new Date(offeredAt.getTime() + 19_000))).toBe(false);
    expect(isValidOfferTtl(offeredAt, new Date(offeredAt.getTime() + 21_000))).toBe(false);
  });
});

describe('canOfferBeAccepted', () => {
  const offeredAt = new Date('2026-09-18T12:00:00Z');
  const expiresAt = new Date(offeredAt.getTime() + 20_000);

  it('accepts an active offer before expiry', () => {
    const now = new Date(offeredAt.getTime() + 19_999);
    expect(canOfferBeAccepted({ status: 'offered', expiresAt }, now)).toEqual({ ok: true });
  });

  it('rejects acceptance exactly at expiry (boundary is deterministic)', () => {
    const now = new Date(expiresAt.getTime());
    expect(canOfferBeAccepted({ status: 'offered', expiresAt }, now)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects acceptance after expiry', () => {
    const now = new Date(expiresAt.getTime() + 1);
    expect(canOfferBeAccepted({ status: 'offered', expiresAt }, now)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects non-active offers (already accepted/declined/expired)', () => {
    const now = new Date(offeredAt.getTime() + 1_000);
    for (const status of ['accepted', 'declined', 'expired']) {
      expect(canOfferBeAccepted({ status, expiresAt }, now)).toEqual({
        ok: false,
        reason: 'not_active',
      });
    }
  });
});

describe('isOfferDueForExpiry', () => {
  const offeredAt = new Date('2026-09-18T12:00:00Z');
  const expiresAt = new Date(offeredAt.getTime() + 20_000);

  it('is due exactly at the TTL boundary and after', () => {
    expect(isOfferDueForExpiry({ status: 'offered', expiresAt }, new Date(expiresAt.getTime()))).toBe(true);
    expect(isOfferDueForExpiry({ status: 'offered', expiresAt }, new Date(expiresAt.getTime() - 1))).toBe(false);
  });

  it('never reports terminal offers as due', () => {
    const now = new Date(expiresAt.getTime() + 60_000);
    for (const status of ['accepted', 'declined', 'expired']) {
      expect(isOfferDueForExpiry({ status, expiresAt }, now)).toBe(false);
    }
  });
});

describe('compareQueueOrder (longest-available first)', () => {
  it('orders strictly by available_since ascending', () => {
    const early = { availableSince: new Date('2026-09-18T10:00:00Z') };
    const late = { availableSince: new Date('2026-09-18T11:00:00Z') };
    expect(compareQueueOrder(early, late)).toBeLessThan(0);
    expect(compareQueueOrder(late, early)).toBeGreaterThan(0);
    expect(compareQueueOrder(early, early)).toBe(0);
  });
});
