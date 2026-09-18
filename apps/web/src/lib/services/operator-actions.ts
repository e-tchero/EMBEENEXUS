'use server';

import { promoteToRiderSchema, reviewDecisionSchema } from '@embee/shared';

import { assertRole, rpcErrorToActionFailure } from '@/lib/auth/rbac';
import { createClient } from '@/lib/db/client-server';
import { actionFailure, actionSuccess } from '@/lib/env/action-result';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/auth/session';

import type { ActionResult } from '@/lib/env/action-result';

/**
 * Operator server actions (M1) — the minimum authorization primitives.
 *
 * Every action re-derives the operator role server-side (assertRole on the
 * session) before touching data, and the SECURITY DEFINER RPC re-checks
 * authority in the database. Two independent enforcement layers; the client
 * is trusted for nothing. Full admin dashboards are a later milestone.
 */

export async function reviewVerificationAction(
  _prev: ActionResult<{ status: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  const session = await getSession();
  if (!session) {
    return actionFailure('You must be signed in.');
  }
  try {
    await assertRole(session, ['operator']);
  } catch {
    return actionFailure('You do not have permission to perform this action.');
  }

  const parsed = reviewDecisionSchema.safeParse({
    riderId: formData.get('riderId'),
    decision: formData.get('decision'),
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return actionFailure(first?.message ?? 'Invalid review decision');
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('rider_review_decision', {
    p_rider_id: parsed.data.riderId,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    return actionFailure(rpcErrorToActionFailure(error, 'Unable to record the review decision.'));
  }

  logger.info('operator.verification.reviewed', { decision: parsed.data.decision });
  return actionSuccess({ status: String(data) });
}

export async function createRiderProfileAction(
  _prev: ActionResult<{ userId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ userId: string }>> {
  const session = await getSession();
  if (!session) {
    return actionFailure('You must be signed in.');
  }
  try {
    await assertRole(session, ['operator']);
  } catch {
    return actionFailure('You do not have permission to perform this action.');
  }

  const parsed = promoteToRiderSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) {
    return actionFailure('A valid account identifier is required.');
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc('operator_create_rider_profile', {
    p_user_id: parsed.data.userId,
  });

  if (error) {
    return actionFailure(rpcErrorToActionFailure(error, 'Unable to create the rider profile.'));
  }

  logger.info('operator.rider_profile.created', {});
  return actionSuccess({ userId: parsed.data.userId });
}
