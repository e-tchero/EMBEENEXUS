import { NextResponse } from 'next/server';

import { paymentPollSchema } from '@embee/shared';

import { getPaymentStatusByReference, type PaymentServiceError } from '@/lib/services/payment-service';

/**
 * POST /api/payments/status/poll — callback-page polling endpoint (M4).
 *
 * The client supplies only the opaque server-generated transaction reference
 * it was redirected with. The server resolves the payment by that reference,
 * re-verifies with the provider while the attempt is active, and returns a
 * minimal safe status payload. Amounts and authoritative state never come
 * from the client or the redirect parameters.
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

  const parsed = paymentPollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await getPaymentStatusByReference(parsed.data.transactionReference);
  if (!result.ok) {
    const code = result.error ?? 'unknown_error';
    return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] });
  }

  const payment = result.payment;
  if (!payment) {
    return NextResponse.json({ ok: false, error: 'unknown_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, payment }, { status: 200 });
}
