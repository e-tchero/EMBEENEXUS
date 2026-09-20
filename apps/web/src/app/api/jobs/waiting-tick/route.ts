import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/env/server';
import { logger } from '@/lib/logging/logger';
import { waitingTick } from '@/lib/services/custody-service';

/**
 * POST /api/jobs/waiting-tick — background-job trigger for the waiting flow
 * (M6, founder D05): initiates the return-to-pickup-customer for every order
 * that reached the 30-minute waiting maximum without a delivery confirmation,
 * recording the capped waiting charge (10 min free → ₦700/additional minute
 * → ₦14,000 maximum). Embee bears the return cost; collection/settlement is
 * an M8 ledger concern and is NOT performed here.
 *
 * Authorization: shared secret header (`x-jobs-token`, constant-time) OR a
 * valid operator session — identical gate to the M5 dispatch tick.
 *
 * Idempotent: eligibility is DB-level (state + clock under row locks with
 * SKIP LOCKED); re-running is a no-op for already-processed orders.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const jobsToken = getServerEnv().JOBS_TRIGGER_TOKEN;
  const presented = request.headers.get('x-jobs-token');

  let authorized = false;
  if (jobsToken && presented) {
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(jobsToken, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      authorized = true;
    }
  }
  if (!authorized) {
    const { getSession } = await import('@/lib/auth/session');
    const { assertRole, AuthorizationError } = await import('@/lib/auth/rbac');
    try {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      await assertRole(session, ['operator']);
      authorized = true;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
      }
      throw error;
    }
  }

  const result = await waitingTick();
  if ('error' in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  logger.info('custody.waiting.tick.run', { ...result });
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
