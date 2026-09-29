import { NextResponse } from 'next/server';

import { getOperatorOverview } from '@/lib/services/operator-service';

/**
 * GET /api/operator/overview — operator home snapshot (counts, payments,
 * riders, attention queue). Operator session required; customers and riders
 * are rejected before any data is touched.
 */
export async function GET(): Promise<NextResponse> {
  const result = await getOperatorOverview();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, {
      status: result.error === 'unauthenticated' ? 401 : result.error === 'forbidden' ? 403 : 500,
    });
  }
  return NextResponse.json({ ok: true, overview: result.overview });
}
