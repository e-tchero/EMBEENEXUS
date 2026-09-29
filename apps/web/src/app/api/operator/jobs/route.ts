import { NextResponse } from 'next/server';

import { getOperatorJobs } from '@/lib/services/operator-service';

/**
 * GET /api/operator/jobs — background-job visibility (routes, purposes, real
 * application health). No fabricated health indicators: values come from the
 * existing health endpoint or are absent.
 */
export async function GET(): Promise<NextResponse> {
  const result = await getOperatorJobs();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, {
      status: result.error === 'unauthenticated' ? 401 : result.error === 'forbidden' ? 403 : 500,
    });
  }
  return NextResponse.json({ ok: true, jobs: result.jobs });
}
