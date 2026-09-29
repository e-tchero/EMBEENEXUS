import { NextResponse } from 'next/server';

import { getOperatorOrderDetail } from '@/lib/services/operator-service';

/**
 * GET /api/operator/orders/[orderId] — operational order detail: timeline,
 * payment state, dispatch offers, evidence metadata, attention reasons.
 * Operator session required; an invisible order is indistinguishable from a
 * missing one (RLS preserves this for non-operators via the guard first).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await params;
  const result = await getOperatorOrderDetail(orderId);
  if (!result.ok) {
    const status =
      result.error === 'unauthenticated'
        ? 401
        : result.error === 'forbidden'
          ? 403
          : result.error === 'not_found'
            ? 404
            : result.error === 'invalid_input'
              ? 400
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, detail: result.detail });
}
