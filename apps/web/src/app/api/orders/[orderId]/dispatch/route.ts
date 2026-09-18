import { NextResponse } from 'next/server';

import { startDispatch, type DispatchServiceError } from '@/lib/services/dispatch-service';
import { getSession } from '@/lib/auth/session';
import { assertRole, AuthorizationError } from '@/lib/auth/rbac';

/**
 * POST /api/orders/[orderId]/dispatch — begin dispatch for a paid order
 * (operator-triggered entry point). The normal flow starts dispatch
 * automatically from the payment-verified continuation; this route exists
 * for operational recovery/continuation.
 *
 * Authorization: operator session only. Customers and riders can never
 * start, steer, or influence dispatch.
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
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    }
    await assertRole(session, ['operator']);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const { orderId } = await params;
  const result = await startDispatch(orderId);
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }
  return NextResponse.json(
    {
      ok: true,
      outcome: result.outcome,
      offerId: result.offerId,
      riderId: result.riderId,
    },
    { status: 200 },
  );
}
