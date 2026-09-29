import { NextResponse } from 'next/server';

import { getOrderPhotoUrl, type CustodyServiceError } from '@/lib/services/custody-service';

/**
 * GET /api/orders/[orderId]/evidence/[kind] — short-lived signed URL for one
 * evidence photo (customer_parcel | rider_pickup | rider_delivery).
 *
 * Authorization: participants (order owner, assigned rider) and operators —
 * enforced inside the custody service (RLS-bound metadata read) before the
 * service-role client mints the URL. The bucket stays private; no public or
 * permanent URL is ever produced. TTL is short (custody-service constant).
 */

const STATUS: Record<CustodyServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_order_state: 409,
  otp_not_issued: 409,
  otp_invalid: 400,
  otp_expired: 410,
  otp_locked: 423,
  otp_already_used: 409,
  otp_issue_limit: 429,
  evidence_missing: 409,
  photo_exists: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  storage_error: 500,
  unknown_error: 500,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; kind: string }> },
): Promise<NextResponse> {
  const { orderId, kind } = await params;

  const result = await getOrderPhotoUrl(orderId, kind);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, photo: result.photo });
}
