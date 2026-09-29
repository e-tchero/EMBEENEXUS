import { NextResponse } from 'next/server';

import { completeOrderReturn, type CustodyServiceError } from '@/lib/services/custody-service';

/**
 * POST /api/orders/[orderId]/complete-return — rider records that the parcel
 * is physically back with the pickup customer after a waiting-maximum
 * return. The RPC (migration 0014) validates assignment/role and closes the
 * order through the canonical delivery_failed transition. Operators are the
 * backstop via the same endpoint.
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
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { orderId } = await params;
  const input = (body ?? {}) as { notes?: string };

  const result = await completeOrderReturn({ orderId, notes: input?.notes });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, order: result.order }, { status: 200 });
}
