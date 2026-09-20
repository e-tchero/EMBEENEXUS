/**
 * Chain-of-custody domain rules (M6).
 *
 * Pure and deterministic. These functions mirror the SECURITY DEFINER RPC
 * logic in migration 0014 (verify_order_otp, issue_order_otp,
 * register_order_photo) so services, UI and tests share one definition; the
 * database remains the final authority under row locks.
 *
 * FOUNDER RULES ENCODED
 *   * Pickup: pickup OTP verified by the ASSIGNED rider only, at
 *     arrived_pickup, one-time use; requires the customer_parcel and
 *     rider_pickup photos before custody can pass to the rider.
 *   * Delivery: delivery OTP verified by the ASSIGNED rider only, at
 *     arrived_destination; requires the rider_delivery photo; never possible
 *     once a return was initiated (waiting maximum reached).
 *   * Recipient inspection/confirmation before completion (owner-confirmed;
 *     no new identity-verification workflow). The customer may relay the
 *     delivery OTP where the recipient cannot access it.
 *   * The approved three-photo chain: customer_parcel, rider_pickup,
 *     rider_delivery — private Storage, server-mediated access.
 *
 * SECURITY INVARIANTS (enforced in the DB; mirrored here for UX gating):
 *   * OTP codes: 6 digits, hashed at rest, one-time use, replay-rejected,
 *     5-attempt lock, reissue invalidates the previous code, bounded at 10
 *     issues per (order, kind).
 *   * No client ever reads OTP material; only the order owner receives a
 *     fresh plaintext code at issue time.
 *   * Photo objects live in the private order-evidence bucket under
 *     {order_id}/{kind}/{uuid}.{ext}; clients get short-lived signed URLs
 *     only after server-side authorization.
 */

import { err, ok, type Result } from '@embee/shared';

// ---------------------------------------------------------------------------
// OTP constants (mirrored by migration 0014)
// ---------------------------------------------------------------------------

/** OTP code length in digits. */
export const OTP_CODE_DIGITS = 6;
/** Failed attempts allowed before a code locks. */
export const OTP_MAX_ATTEMPTS = 5;
/** Maximum issues (reissues) per (order, kind) — abuse bound. */
export const OTP_MAX_ISSUES_PER_KIND = 10;
/** Safety-net TTL in days; the operative controls are state gates + one-time use. */
export const OTP_TTL_DAYS = 7;

export type OtpKind = 'pickup' | 'delivery';

export const OTP_KINDS: readonly OtpKind[] = ['pickup', 'delivery'] as const;

/** The order statuses at which each OTP kind may be ISSUED (displayed) by the owner. */
const OTP_ISSUE_STATES: Record<OtpKind, readonly string[]> = {
  pickup: [
    'payment_verified',
    'searching_rider',
    'rider_assigned',
    'en_route_pickup',
    'arrived_pickup',
  ],
  delivery: [
    'payment_verified',
    'searching_rider',
    'rider_assigned',
    'en_route_pickup',
    'arrived_pickup',
    'picked_up',
    'in_transit',
    'arrived_destination',
  ],
};

export type CustodyCheck =
  | { allowed: true }
  | { allowed: false; reason: 'wrong_status' | 'return_initiated' };

/**
 * May the order owner display/reissue this OTP kind, given the server-side
 * order state? Mirrors issue_order_otp (migration 0014).
 */
export function canIssueOtp(input: {
  kind: OtpKind;
  orderStatus: string;
  returnInitiated: boolean;
}): CustodyCheck {
  if (input.returnInitiated) {
    return { allowed: false, reason: 'return_initiated' };
  }
  if (!OTP_ISSUE_STATES[input.kind].includes(input.orderStatus)) {
    return { allowed: false, reason: 'wrong_status' };
  }
  return { allowed: true };
}

/**
 * May the ASSIGNED rider verify this OTP kind now? Mirrors verify_order_otp:
 * pickup only at arrived_pickup; delivery only at arrived_destination and
 * never after a return was initiated.
 */
export function canVerifyOtp(input: {
  kind: OtpKind;
  orderStatus: string;
  returnInitiated: boolean;
}): CustodyCheck {
  if (input.kind === 'delivery' && input.returnInitiated) {
    return { allowed: false, reason: 'return_initiated' };
  }
  const expected = input.kind === 'pickup' ? 'arrived_pickup' : 'arrived_destination';
  if (input.orderStatus !== expected) {
    return { allowed: false, reason: 'wrong_status' };
  }
  return { allowed: true };
}

/** Is this a well-formed OTP code (exactly 6 digits)? */
export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^[0-9]{${OTP_CODE_DIGITS}}$`).test(code);
}

// ---------------------------------------------------------------------------
// Photo evidence constants (mirrored by migration 0014)
// ---------------------------------------------------------------------------

export type PhotoKind = 'customer_parcel' | 'rider_pickup' | 'rider_delivery';

export const PHOTO_KINDS: readonly PhotoKind[] = [
  'customer_parcel',
  'rider_pickup',
  'rider_delivery',
] as const;

export const PHOTO_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** 10 MB — mirrored by the bucket limit and the RPC check. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Evidence kinds that must exist before the pickup transition can succeed. */
export const PICKUP_REQUIRED_PHOTO_KINDS: readonly PhotoKind[] = [
  'customer_parcel',
  'rider_pickup',
] as const;

/** Evidence kinds that must exist before the delivery transition can succeed. */
export const DELIVERY_REQUIRED_PHOTO_KINDS: readonly PhotoKind[] = ['rider_delivery'] as const;

export type PhotoCheck =
  | { allowed: true }
  | { allowed: false; reason: 'wrong_status' | 'wrong_actor' | 'return_initiated' };

/**
 * May this actor upload this photo kind now? Mirrors register_order_photo:
 *   * customer_parcel — order owner (customer), from creation until pickup;
 *   * rider_pickup    — assigned rider at arrived_pickup;
 *   * rider_delivery  — assigned rider at arrived_destination.
 */
export function canUploadPhoto(input: {
  kind: PhotoKind;
  orderStatus: string;
  actorIsCustomerOwner: boolean;
  actorIsAssignedRider: boolean;
  returnInitiated: boolean;
}): PhotoCheck {
  if (input.kind === 'customer_parcel') {
    if (!input.actorIsCustomerOwner) return { allowed: false, reason: 'wrong_actor' };
    if (
      ![
        'draft',
        'awaiting_payment',
        'payment_verified',
        'searching_rider',
        'rider_assigned',
        'en_route_pickup',
        'arrived_pickup',
      ].includes(input.orderStatus)
    ) {
      return { allowed: false, reason: 'wrong_status' };
    }
    return { allowed: true };
  }

  if (!input.actorIsAssignedRider) return { allowed: false, reason: 'wrong_actor' };
  if (input.returnInitiated) return { allowed: false, reason: 'return_initiated' };
  const expected = input.kind === 'rider_pickup' ? 'arrived_pickup' : 'arrived_destination';
  if (input.orderStatus !== expected) return { allowed: false, reason: 'wrong_status' };
  return { allowed: true };
}

/** Which evidence kinds are missing for the next custody transition? */
export function missingEvidenceFor(
  transition: 'pickup' | 'delivery',
  presentKinds: readonly string[],
): PhotoKind[] {
  const required =
    transition === 'pickup' ? PICKUP_REQUIRED_PHOTO_KINDS : DELIVERY_REQUIRED_PHOTO_KINDS;
  return required.filter((kind) => !presentKinds.includes(kind));
}

/** Storage path convention: {order_id}/{kind}/{uuid}.{ext}. */
export function buildEvidencePath(orderId: string, kind: PhotoKind, fileId: string, ext: string): string {
  return `${orderId}/${kind}/${fileId}.${ext}`;
}

/** Path validation mirroring the RPC guard (order/kind-scoped, bounded length). */
export function isValidEvidencePath(
  orderId: string,
  kind: PhotoKind,
  path: string,
): boolean {
  return path.length <= 400 && path.startsWith(`${orderId}/${kind}/`);
}

/** File extension for a MIME type (upload route helper). */
export function extForMimeType(mimeType: string): Result<'jpg' | 'png' | 'webp', 'unsupported_type'> {
  switch (mimeType) {
    case 'image/jpeg':
      return ok('jpg');
    case 'image/png':
      return ok('png');
    case 'image/webp':
      return ok('webp');
    default:
      return err('unsupported_type');
  }
}
