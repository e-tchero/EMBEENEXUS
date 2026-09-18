import { NextResponse } from 'next/server';

import { initiateOrderPayment, type PaymentServiceError } from '@/lib/services/payment-service';

/**
 * POST /api/payments — initiate (or reuse) the checkout session for an order
 * in awaiting_payment (customer-owned). The client supplies ONLY the order
 * id: amounts, currency, and references are server-derived.
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

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await initiateOrderPayment(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      checkout: {
        paymentId: result.checkout!.paymentId,
        orderId: result.checkout!.orderId,
        transactionReference: result.checkout!.transactionReference,
        amountKobo: result.checkout!.amountKobo.toString(),
        currency: result.checkout!.currency,
        checkoutUrl: result.checkout!.checkoutUrl,
        reused: result.checkout!.reused,
      },
    },
    { status: 201 },
  );
}
