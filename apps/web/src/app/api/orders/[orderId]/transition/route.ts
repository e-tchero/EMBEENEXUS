import { NextResponse } from 'next/server';

import { applyOrderTransition, type OrderServiceError } from '@/lib/services/order-service';

import type { OrderTransitionInput } from '@embee/shared';

/**
 * POST /api/orders/[orderId]/transition — server-authoritative lifecycle
 * transition. The RPC validates the actor, ownership/assignment, the
 * (state, trigger) pair and preconditions under a row lock, and writes the
 * immutable event atomically. Clients never mutate order state directly.
 */

const STATUS: Record<OrderServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  quote_expired: 422,
  quote_not_active: 409,
  invalid_transition: 409,
  prerequisite_missing: 409,
  unknown_error: 500,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const { orderId } = await params;
  const input = body as Omit<OrderTransitionInput, 'orderId'>;

  const result = await applyOrderTransition({
    orderId,
    trigger: input?.trigger,
    notes: input?.notes,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, order: result.order });
}
