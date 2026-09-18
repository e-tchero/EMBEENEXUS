import { NextResponse } from 'next/server';

import { acceptOffer, type DispatchServiceError } from '@/lib/services/dispatch-service';

/**
 * POST /api/dispatch/offers/[offerId]/accept — the offered rider accepts.
 * The server owns every fact: ownership, activity, TTL, order state, and
 * rider eligibility are re-validated under lock inside dispatch_accept.
 * Duplicate accepts are safe (idempotent at the RPC), as is racing expiry
 * (one lock-order winner).
 */

const STATUS: Record<DispatchServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_order_state: 409,
  offer_not_active: 409,
  offer_expired: 409,
  rider_ineligible: 409,
  rider_not_approved: 403,
  rider_busy: 409,
  unknown_error: 500,
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ offerId: string }> },
): Promise<NextResponse> {
  const { offerId } = await params;
  const result = await acceptOffer(offerId);
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }
  return NextResponse.json(
    { ok: true, order: { orderId: result.offer?.orderId, status: 'rider_assigned' } },
    { status: 200 },
  );
}
