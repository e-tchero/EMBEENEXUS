import { NextResponse } from 'next/server';

import { listOperatorRiders } from '@/lib/services/operator-service';

/**
 * GET /api/operator/riders — rider visibility for dispatch operations
 * (verification, availability, active order, current offer). Operator session
 * required. No rider location data exists or is exposed.
 */
export async function GET(): Promise<NextResponse> {
  const result = await listOperatorRiders();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, {
      status: result.error === 'unauthenticated' ? 401 : result.error === 'forbidden' ? 403 : 500,
    });
  }
  return NextResponse.json({ ok: true, riders: result.riders });
}
