import { NextResponse } from 'next/server';

import { declineOffer, type DispatchServiceError } from '@/lib/services/dispatch-service';

/**
 * POST /api/dispatch/offers/[offerId]/decline — only the offered rider can
 * decline their own active offer. Declining finalizes the offer atomically
 * and returns the rider to the queue; dispatch continuation happens on the
 * next system tick (or the decline path's own continuation).
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
  const result = await declineOffer(offerId);
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }
  return NextResponse.json({ ok: true, status: 'declined' }, { status: 200 });
}
