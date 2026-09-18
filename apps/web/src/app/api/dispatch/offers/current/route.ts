import { NextResponse } from 'next/server';

import { getCurrentOffer, type DispatchServiceError } from '@/lib/services/dispatch-service';

/**
 * GET /api/dispatch/offers/current — the calling rider's active offer with
 * limited pre-acceptance delivery information (founder rule). Full delivery
 * details unlock only after acceptance (later milestones).
 */

const STATUS: Record<DispatchServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 204,
  invalid_input: 400,
  invalid_order_state: 409,
  offer_not_active: 409,
  offer_expired: 409,
  rider_ineligible: 409,
  rider_not_approved: 403,
  rider_busy: 409,
  unknown_error: 500,
};

export async function GET(): Promise<NextResponse> {
  const result = await getCurrentOffer();
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    if (code === 'not_found') {
      // No active offer is a normal state, not an error.
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }
  return NextResponse.json({ ok: true, offer: result.offer }, { status: 200 });
}
