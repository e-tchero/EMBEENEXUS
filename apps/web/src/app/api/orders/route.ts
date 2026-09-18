import { NextResponse } from 'next/server';

import { createOrderFromQuote, type OrderServiceError } from '@/lib/services/order-service';

import type { CreateOrderInput } from '@embee/shared';

/**
 * POST /api/orders — create an order from a valid, active quote (customer).
 * Idempotency: one order per quote, enforced by a unique constraint in the
 * database; retries fail cleanly with the quote's state (not duplicated).
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

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await createOrderFromQuote(body as CreateOrderInput);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json(
    { ok: true, order: result.order },
    { status: 201 },
  );
}
