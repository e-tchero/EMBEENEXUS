import { NextResponse } from 'next/server';

import { setAvailability, type DispatchServiceError } from '@/lib/services/dispatch-service';

/**
 * POST /api/rider/availability — rider declares dispatch availability.
 * The server owns the queue clock (`available_since`); the client supplies
 * only the boolean declaration. Going available requires approved
 * verification and no committed active delivery (DB-enforced).
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

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await setAvailability(body);
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }
  return NextResponse.json({ ok: true, state: result.state }, { status: 200 });
}
