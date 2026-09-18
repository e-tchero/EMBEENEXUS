import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/env/server';
import { logger } from '@/lib/logging/logger';
import { dispatchTick } from '@/lib/services/dispatch-service';

/**
 * POST /api/jobs/dispatch-tick — background-job trigger for offer expiry and
 * dispatch continuation (M5).
 *
 * Authorization: shared secret header (`x-jobs-token`, constant-time) OR a
 * valid operator session — identical gate to the M4 reconciliation route.
 *
 * Idempotent: expiry is DB-level (status flip under lock); re-running is a
 * no-op for already-processed offers.
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

  const result = await dispatchTick();
  if ('error' in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  logger.info('dispatch.tick.run', { ...result });
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
