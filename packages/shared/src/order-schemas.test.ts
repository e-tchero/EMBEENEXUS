import { describe, expect, it } from 'vitest';

import {
  createOrderSchema,
  createQuoteSchema,
  orderTransitionSchema,
} from './order-schemas';

describe('createQuoteSchema', () => {
  const valid = {
    pickupLat: 9.0765,
    pickupLng: 7.4788,
    pickupAddress: 'Plot 5, Garki, Abuja',
    dropoffLat: 9.0123,
    dropoffLng: 7.4321,
    dropoffAddress: '12 Aminu Kano Cres, Wuse II, Abuja',
  };

  it('accepts a valid quote request', () => {
    expect(createQuoteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    for (const bad of [
      { ...valid, pickupLat: 91 },
      { ...valid, pickupLat: -91 },
      { ...valid, pickupLng: 181 },
      { ...valid, dropoffLng: -181 },
    ]) {
      expect(createQuoteSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects empty or over-long addresses', () => {
    expect(createQuoteSchema.safeParse({ ...valid, pickupAddress: '' }).success).toBe(false);
    expect(createQuoteSchema.safeParse({ ...valid, dropoffAddress: 'a'.repeat(301) }).success).toBe(false);
  });

  it('rejects missing fields', () => {
    const { pickupAddress: _omitted, ...partial } = valid;
    expect(createQuoteSchema.safeParse(partial).success).toBe(false);
  });
});

describe('createOrderSchema', () => {
  it('accepts a valid quote reference', () => {
    expect(
      createOrderSchema.safeParse({ quoteId: '5f0b1e3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b' }).success,
    ).toBe(true);
  });

  it('rejects a non-uuid quote reference', () => {
    expect(createOrderSchema.safeParse({ quoteId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('orderTransitionSchema', () => {
  const orderId = '5f0b1e3c-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  it('accepts each client-sendable trigger', () => {
    for (const trigger of [
      'order_submitted',
      'rider_departed',
      'rider_arrived_pickup',
      'rider_arrived_destination',
      'delivery_failed',
      'cancel',
      'hold_for_review',
      'release_from_review',
    ]) {
      expect(orderTransitionSchema.safeParse({ orderId, trigger }).success).toBe(true);
    }
  });

  it('rejects system-only triggers (payment/dispatch/assignment are M4/M5)', () => {
    for (const trigger of ['payment_verified', 'dispatch_started', 'rider_accepted_offer']) {
      expect(orderTransitionSchema.safeParse({ orderId, trigger }).success).toBe(false);
    }
  });

  it('rejects OTP/recipient confirmation triggers (M6 fact sources)', () => {
    for (const trigger of ['pickup_otp_verified', 'delivery_otp_verified', 'recipient_confirmed']) {
      expect(orderTransitionSchema.safeParse({ orderId, trigger }).success).toBe(false);
    }
  });

  it('rejects unknown triggers', () => {
    expect(orderTransitionSchema.safeParse({ orderId, trigger: 'explode' }).success).toBe(false);
  });

  it('bounds notes at 500 characters', () => {
    expect(orderTransitionSchema.safeParse({ orderId, trigger: 'cancel', notes: 'x'.repeat(500) }).success).toBe(true);
    expect(orderTransitionSchema.safeParse({ orderId, trigger: 'cancel', notes: 'x'.repeat(501) }).success).toBe(false);
  });
});
