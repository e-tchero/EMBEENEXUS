import { NextResponse } from 'next/server';

import { getPaymentStatus, type PaymentServiceError } from '@/lib/services/payment-service';

/**
 * GET /api/payments?orderId=<uuid> — latest payment status for an order
 * (customer-owned; RLS-scoped). While a session is active the provider is
 * polled once so the customer sees fresh truth without waiting for a webhook.
 */

const STATUS: Record<PaymentServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_order_state: 409,
  provider_error: 502,
  verification_failed: 422,
  unknown_error: 500,
};

export async function GET(request: Request): Promise<NextResponse> {
  const orderId = new URL(request.url).searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await getPaymentStatus(orderId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  const payment = result.payment;
  if (!payment) {
    return NextResponse.json({ ok: false, error: 'unknown_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, payment }, { status: 200 });
}
