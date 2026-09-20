import { NextResponse } from 'next/server';

import { verifyOrderOtp, type CustodyServiceError } from '@/lib/services/custody-service';

/**
 * POST /api/orders/[orderId]/otp/verify — rider submits a custody OTP (M6).
 *
 * Security-sensitive: the assigned rider only, correct order only, one-time
 * consumption with replay rejection, 5-attempt lock, atomic canonical
 * transition (pickup → picked_up / delivery → delivered) with the required
 * photo evidence. Failures never reveal whether a guess was close.
 */

const STATUS: Record<CustodyServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_order_state: 409,
  otp_not_issued: 409,
  otp_invalid: 400,
  otp_expired: 410,
  otp_locked: 423,
  otp_already_used: 409,
  otp_issue_limit: 429,
  evidence_missing: 409,
  photo_exists: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  storage_error: 500,
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
  const input = (body ?? {}) as { kind?: string; code?: string };

  const result = await verifyOrderOtp({
    orderId,
    kind: input?.kind,
    code: input?.code,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, order: result.order });
}
