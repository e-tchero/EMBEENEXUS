import { describe, expect, it } from 'vitest';

import {
  DispatchOffer,
  DispatchOfferStatus,
  OFFER_WINDOW_MS,
  OFFER_WINDOW_SECONDS,
  OfferExpiredError,
  OfferStateError,
} from './dispatch-offer.js';

const OFFERED_AT = new Date('2026-10-13T12:00:00.000Z');

function at(offsetMs: number): Date {
  return new Date(OFFERED_AT.getTime() + offsetMs);
}

function newOffer(): DispatchOffer {
  return DispatchOffer.create({ orderId: 'order-1', riderId: 'rider-1', offeredAt: OFFERED_AT });
}

describe('DispatchOffer — the 20-second window', () => {
  it('uses a 20 second window', () => {
    expect(OFFER_WINDOW_SECONDS).toBe(20);
    expect(OFFER_WINDOW_MS).toBe(20_000);
  });

  it('stamps expiresAt at offeredAt + 20s', () => {
    const offer = newOffer();
    expect(offer.expiresAt.getTime()).toBe(OFFERED_AT.getTime() + 20_000);
    expect(offer.windowMillis).toBe(20_000);
  });

  it('starts in status OFFERED', () => {
    expect(newOffer().status).toBe(DispatchOfferStatus.OFFERED);
  });

  it('generates an offer id and keeps order and rider', () => {
    const offer = newOffer();
    expect(offer.offerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(offer.orderId).toBe('order-1');
    expect(offer.riderId).toBe('rider-1');
  });

  it('stays open strictly before expiresAt', () => {
    const offer = newOffer();
    expect(offer.isOpenAt(at(0))).toBe(true);
    expect(offer.isOpenAt(at(19_999))).toBe(true);
    expect(offer.isRiderOfferActive(at(19_999))).toBe(true);
  });

  it('is expired at exactly expiresAt (half-open window)', () => {
    const offer = newOffer();
    expect(offer.isExpiredAt(at(19_999))).toBe(false);
    expect(offer.isExpiredAt(at(20_000))).toBe(true);
    expect(offer.isOpenAt(at(20_000))).toBe(false);
    expect(offer.isRiderOfferActive(at(20_000))).toBe(false);
  });
});

describe('DispatchOffer — accept', () => {
  it('accepts just inside the window', () => {
    expect(newOffer().accept(at(19_999)).status).toBe(DispatchOfferStatus.ACCEPTED);
  });

  it('refuses to accept once the window has closed', () => {
    expect(() => newOffer().accept(at(20_000))).toThrow(OfferExpiredError);
    expect(() => newOffer().accept(at(60_000))).toThrow(OfferExpiredError);
  });

  it('refuses a second accept', () => {
    const accepted = newOffer().accept(at(1_000));
    expect(() => accepted.accept(at(2_000))).toThrow(OfferStateError);
  });

  it('leaves the original offer untouched (immutable)', () => {
    const offer = newOffer();
    offer.accept(at(1_000));
    expect(offer.status).toBe(DispatchOfferStatus.OFFERED);
  });
});

describe('DispatchOffer — reject', () => {
  it('rejects inside the window', () => {
    expect(newOffer().reject(at(5_000)).status).toBe(DispatchOfferStatus.REJECTED);
  });

  it('refuses to reject after the window has closed', () => {
    expect(() => newOffer().reject(at(20_000))).toThrow(OfferExpiredError);
  });

  it('refuses to reject an already rejected offer', () => {
    expect(() => newOffer().reject(at(1_000)).reject(at(2_000))).toThrow(OfferStateError);
  });
});

describe('DispatchOffer — expire / refresh', () => {
  it('refuses to expire before the window closes', () => {
    expect(() => newOffer().expire(at(19_999))).toThrow(OfferStateError);
  });

  it('expires at the close of the window', () => {
    expect(newOffer().expire(at(20_000)).status).toBe(DispatchOfferStatus.EXPIRED);
  });

  it('refuses to expire an offer that is no longer OFFERED', () => {
    expect(() => newOffer().accept(at(1_000)).expire(at(30_000))).toThrow(OfferStateError);
  });

  it('refreshes to EXPIRED only once the window has closed', () => {
    const offer = newOffer();
    expect(offer.refresh(at(10_000)).status).toBe(DispatchOfferStatus.OFFERED);
    expect(offer.refresh(at(20_000)).status).toBe(DispatchOfferStatus.EXPIRED);
  });

  it('leaves a non-offered offer unchanged when refreshed', () => {
    const accepted = newOffer().accept(at(1_000));
    expect(accepted.refresh(at(30_000)).status).toBe(DispatchOfferStatus.ACCEPTED);
  });
});

describe('DispatchOffer — rehydrate and guards', () => {
  it('rehydrates persisted state without re-deriving the window', () => {
    const offer = newOffer().accept(at(1_000));
    const restored = DispatchOffer.rehydrate({
      offerId: offer.offerId,
      orderId: offer.orderId,
      riderId: offer.riderId,
      offeredAt: offer.offeredAt,
      expiresAt: offer.expiresAt,
      status: offer.status,
    });
    expect(restored.status).toBe(DispatchOfferStatus.ACCEPTED);
    expect(restored.equals(offer)).toBe(true);
  });

  it('rejects an invalid offeredAt', () => {
    expect(() =>
      DispatchOffer.create({ orderId: 'o', riderId: 'r', offeredAt: new Date(Number.NaN) }),
    ).toThrow(TypeError);
  });
});
