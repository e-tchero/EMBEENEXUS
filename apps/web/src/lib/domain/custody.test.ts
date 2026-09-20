import { describe, expect, it } from 'vitest';

import {
  OTP_CODE_DIGITS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_ISSUES_PER_KIND,
  PHOTO_MAX_BYTES,
  buildEvidencePath,
  canIssueOtp,
  canUploadPhoto,
  canVerifyOtp,
  extForMimeType,
  isValidEvidencePath,
  isValidOtpCode,
  missingEvidenceFor,
} from './custody';

describe('OTP gates (mirrors verify_order_otp / issue_order_otp, migration 0014)', () => {
  it('verifies the pickup OTP only by the assigned rider at arrived_pickup', () => {
    expect(canVerifyOtp({ kind: 'pickup', orderStatus: 'arrived_pickup', returnInitiated: false })).toEqual({ allowed: true });
    for (const status of ['en_route_pickup', 'picked_up', 'in_transit', 'delivered', 'completed']) {
      expect(canVerifyOtp({ kind: 'pickup', orderStatus: status, returnInitiated: false })).toEqual({
        allowed: false,
        reason: 'wrong_status',
      });
    }
  });

  it('verifies the delivery OTP only at arrived_destination', () => {
    expect(canVerifyOtp({ kind: 'delivery', orderStatus: 'arrived_destination', returnInitiated: false })).toEqual({ allowed: true });
    for (const status of ['arrived_pickup', 'picked_up', 'in_transit', 'delivered']) {
      expect(canVerifyOtp({ kind: 'delivery', orderStatus: status, returnInitiated: false })).toEqual({
        allowed: false,
        reason: 'wrong_status',
      });
    }
  });

  it('never verifies delivery once a return was initiated (waiting maximum)', () => {
    expect(canVerifyOtp({ kind: 'delivery', orderStatus: 'arrived_destination', returnInitiated: true })).toEqual({
      allowed: false,
      reason: 'return_initiated',
    });
  });

  it('issues the pickup code from payment confirmation until pickup', () => {
    for (const status of ['payment_verified', 'searching_rider', 'rider_assigned', 'en_route_pickup', 'arrived_pickup']) {
      expect(canIssueOtp({ kind: 'pickup', orderStatus: status, returnInitiated: false })).toEqual({ allowed: true });
    }
    for (const status of ['draft', 'awaiting_payment', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled', 'failed']) {
      expect(canIssueOtp({ kind: 'pickup', orderStatus: status, returnInitiated: false })).toEqual({
        allowed: false,
        reason: 'wrong_status',
      });
    }
  });

  it('issues the delivery code until delivery, but never after a return', () => {
    expect(canIssueOtp({ kind: 'delivery', orderStatus: 'in_transit', returnInitiated: false })).toEqual({ allowed: true });
    expect(canIssueOtp({ kind: 'delivery', orderStatus: 'arrived_destination', returnInitiated: true })).toEqual({
      allowed: false,
      reason: 'return_initiated',
    });
    expect(canIssueOtp({ kind: 'delivery', orderStatus: 'delivered', returnInitiated: false })).toEqual({
      allowed: false,
      reason: 'wrong_status',
    });
  });

  it('accepts only well-formed 6-digit codes', () => {
    expect(isValidOtpCode('000000')).toBe(true);
    expect(isValidOtpCode('123456')).toBe(true);
    expect(isValidOtpCode('12345')).toBe(false);
    expect(isValidOtpCode('1234567')).toBe(false);
    expect(isValidOtpCode('12345a')).toBe(false);
    expect(isValidOtpCode('')).toBe(false);
    expect(OTP_CODE_DIGITS).toBe(6);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(OTP_MAX_ISSUES_PER_KIND).toBe(10);
  });
});

describe('photo evidence gates (mirrors register_order_photo, migration 0014)', () => {
  const customer = { actorIsCustomerOwner: true, actorIsAssignedRider: false };
  const rider = { actorIsCustomerOwner: false, actorIsAssignedRider: true };

  it('allows the owner to upload the parcel photo from creation until pickup', () => {
    for (const orderStatus of ['draft', 'awaiting_payment', 'payment_verified', 'searching_rider', 'rider_assigned', 'en_route_pickup', 'arrived_pickup']) {
      expect(canUploadPhoto({ kind: 'customer_parcel', orderStatus, returnInitiated: false, ...customer })).toEqual({ allowed: true });
    }
    for (const orderStatus of ['picked_up', 'in_transit', 'delivered', 'completed', 'cancelled', 'failed']) {
      expect(canUploadPhoto({ kind: 'customer_parcel', orderStatus, returnInitiated: false, ...customer })).toEqual({
        allowed: false,
        reason: 'wrong_status',
      });
    }
  });

  it('restricts rider photos to the assigned rider at the matching state', () => {
    expect(canUploadPhoto({ kind: 'rider_pickup', orderStatus: 'arrived_pickup', returnInitiated: false, ...rider })).toEqual({ allowed: true });
    expect(canUploadPhoto({ kind: 'rider_pickup', orderStatus: 'in_transit', returnInitiated: false, ...rider })).toEqual({
      allowed: false,
      reason: 'wrong_status',
    });
    expect(canUploadPhoto({ kind: 'rider_delivery', orderStatus: 'arrived_destination', returnInitiated: false, ...rider })).toEqual({ allowed: true });
    expect(canUploadPhoto({ kind: 'rider_delivery', orderStatus: 'in_transit', returnInitiated: false, ...rider })).toEqual({
      allowed: false,
      reason: 'wrong_status',
    });
    expect(canUploadPhoto({ kind: 'rider_delivery', orderStatus: 'arrived_destination', returnInitiated: false, ...customer })).toEqual({
      allowed: false,
      reason: 'wrong_actor',
    });
    expect(canUploadPhoto({ kind: 'customer_parcel', orderStatus: 'arrived_pickup', returnInitiated: false, ...rider })).toEqual({
      allowed: false,
      reason: 'wrong_actor',
    });
  });

  it('blocks rider evidence uploads after a return was initiated', () => {
    expect(canUploadPhoto({ kind: 'rider_delivery', orderStatus: 'arrived_destination', returnInitiated: true, ...rider })).toEqual({
      allowed: false,
      reason: 'return_initiated',
    });
  });

  it('requires the full three-photo chain across the two custody transitions', () => {
    expect(missingEvidenceFor('pickup', [])).toEqual(['customer_parcel', 'rider_pickup']);
    expect(missingEvidenceFor('pickup', ['customer_parcel'])).toEqual(['rider_pickup']);
    expect(missingEvidenceFor('pickup', ['customer_parcel', 'rider_pickup'])).toEqual([]);
    expect(missingEvidenceFor('delivery', ['customer_parcel', 'rider_pickup'])).toEqual(['rider_delivery']);
    expect(missingEvidenceFor('delivery', ['customer_parcel', 'rider_pickup', 'rider_delivery'])).toEqual([]);
    expect(PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('evidence path rules (mirrors the RPC path guard)', () => {
  it('builds and validates order/kind-scoped paths', () => {
    const path = buildEvidencePath('11111111-1111-1111-1111-111111111111', 'rider_pickup', 'abc-123', 'jpg');
    expect(path).toBe('11111111-1111-1111-1111-111111111111/rider_pickup/abc-123.jpg');
    expect(isValidEvidencePath('11111111-1111-1111-1111-111111111111', 'rider_pickup', path)).toBe(true);
  });

  it('rejects cross-order and cross-kind paths', () => {
    const orderId = '11111111-1111-1111-1111-111111111111';
    expect(isValidEvidencePath(orderId, 'rider_pickup', `${orderId}/rider_delivery/x.jpg`)).toBe(false);
    expect(isValidEvidencePath(orderId, 'rider_pickup', '22222222-2222-2222-2222-222222222222/rider_pickup/x.jpg')).toBe(false);
    expect(isValidEvidencePath(orderId, 'rider_pickup', '../../etc/passwd')).toBe(false);
    expect(isValidEvidencePath(orderId, 'rider_pickup', `${orderId}/rider_pickup/${'a'.repeat(500)}.jpg`)).toBe(false);
  });

  it('maps MIME types to storage extensions', () => {
    expect(extForMimeType('image/jpeg')).toEqual({ ok: true, value: 'jpg' });
    expect(extForMimeType('image/png')).toEqual({ ok: true, value: 'png' });
    expect(extForMimeType('image/webp')).toEqual({ ok: true, value: 'webp' });
    expect(extForMimeType('application/pdf')).toEqual({ ok: false, error: 'unsupported_type' });
  });
});
