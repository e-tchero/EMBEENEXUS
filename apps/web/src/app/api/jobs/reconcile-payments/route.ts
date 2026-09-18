import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/env/server';
import { logger } from '@/lib/logging/logger';
import { reconcilePendingPayments } from '@/lib/services/payment-webhook';

/**
 * POST /api/jobs/reconcile-payments — background-job trigger for pending
 * payment reconciliation ("succeeded at provider, webhook lost").
 *
 * Authorization: shared secret header (`x-jobs-token`, constant-time
 * compared) OR a valid operator session. This mirrors the M0 background-jobs
 * runbook: the scheduler presents the token; operators may also run it
 * manually from the operational surface.
 *
 * Safe to re-run: verification grants value exactly once via the completion
 * RPC, so repeated runs are no-ops for already-settled payments.
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
    // Fall back to operator session auth (server-side role check).
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

  const started = Date.now();
  const result = await reconcilePendingPayments();
  logger.info('payments.reconcile.triggered', {
    ...result,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
