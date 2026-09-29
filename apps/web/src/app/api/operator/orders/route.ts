import { NextResponse } from 'next/server';

import { listOperatorOrders } from '@/lib/services/operator-service';

/**
 * GET /api/operator/orders?filter=<status|all|active> — order monitor list
 * with canonical status filters. Operator session required.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const filter = new URL(request.url).searchParams.get('filter');
  const result = await listOperatorOrders(filter);
  if (!result.ok) {
    const status =
      result.error === 'unauthenticated'
        ? 401
        : result.error === 'forbidden'
          ? 403
          : result.error === 'invalid_input'
            ? 400
            : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, orders: result.orders });
}
