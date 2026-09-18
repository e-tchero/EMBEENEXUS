'use server';

import { addVehicleSchema } from '@embee/shared';

import { requireRole } from '@/lib/auth/guards';
import { rpcErrorToActionFailure } from '@/lib/auth/rbac';
import { createClient } from '@/lib/db/client-server';
import {
  canTransition,
  checkOperationalEligibility,
  type RiderVerificationStatus,
} from '@/lib/domain/rider-verification';
import { actionFailure, actionSuccess } from '@/lib/env/action-result';
import { logger } from '@/lib/logging/logger';

import type { Session } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/env/action-result';

/**
 * Rider self-service server actions (M1).
 *
 * Flow: requireRole('rider') → zod re-validation → pure domain pre-check →
 * SECURITY DEFINER RPC / RLS-protected insert (final authority). RPC error
 * codes map to safe, non-leaking messages; unexpected failures are logged
 * server-side only, never serialized to the client.
 */

async function requireRiderSession(): Promise<Session | null> {
  try {
    return await requireRole(['rider']);
  } catch {
    // requireRole redirects when unauthenticated; wrong-role users are
    // redirected too. Reaching here means the caller is not a rider.
    return null;
  }
}

export async function submitVerificationAction(
  _prev: ActionResult<{ status: string }> | null,
): Promise<ActionResult<{ status: string }>> {
  const session = await requireRiderSession();
  if (!session) {
    return actionFailure('You do not have permission to perform this action.');
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('rider_profiles')
    .select('verification_status')
    .eq('id', session.userId)
    .maybeSingle();

  const current = (profile?.verification_status ?? 'pending') as RiderVerificationStatus;

  // Pure domain pre-check (submit or resubmit path); the RPC re-validates.
  const isSubmit = canTransition(current, 'submit').allowed;
  const isResubmit = canTransition(current, 'resubmit').allowed;
  if (!isSubmit && !isResubmit) {
    return actionFailure('This action is not valid for the current state.');
  }

  const { error } = await supabase.rpc('rider_request_verification');
  if (error) {
    return actionFailure(rpcErrorToActionFailure(error, 'Unable to update verification right now.'));
  }

  logger.info('rider.verification.submitted', {});
  return actionSuccess({ status: isSubmit ? 'under_review' : 'pending' });
}

export async function withdrawVerificationAction(
  _prev: ActionResult<{ status: string }> | null,
): Promise<ActionResult<{ status: string }>> {
  const session = await requireRiderSession();
  if (!session) {
    return actionFailure('You do not have permission to perform this action.');
  }

  const { error } = await supabaseRpcWithdraw();
  if (error) {
    return actionFailure(rpcErrorToActionFailure(error, 'Unable to update verification right now.'));
  }

  logger.info('rider.verification.withdrawn', {});
  return actionSuccess({ status: 'withdrawn' });
}

function supabaseRpcWithdraw(): Promise<{ error: { code?: string; message: string } | null }> {
  return createClient().then((supabase) => supabase.rpc('rider_withdraw_verification'));
}

export async function addVehicleAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRiderSession();
  if (!session) {
    return actionFailure('You do not have permission to perform this action.');
  }

  const parsed = addVehicleSchema.safeParse({
    make: formData.get('make'),
    model: formData.get('model'),
    year: formData.get('year') || undefined,
    plateNumber: formData.get('plateNumber'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return actionFailure(first?.message ?? 'Invalid vehicle details');
  }

  const supabase = await createClient();

  // Riders manage their own vehicles under RLS. Recording a motorcycle does
  // not require verification; operational eligibility does (checked in
  // eligibilityAction and, later, enforced at dispatch in M5).
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      rider_id: session.userId,
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year ?? null,
      plate_number: parsed.data.plateNumber,
    })
    .select('id')
    .single();

  if (error) {
    return actionFailure(rpcErrorToActionFailure(error, 'Unable to save the motorcycle right now.'));
  }

  logger.info('rider.vehicle.added', {});
  return actionSuccess({ id: data.id });
}

export type EligibilityResult = ActionResult<{
  eligible: boolean;
  reason?: 'verification_not_approved' | 'no_availability_record';
}>;

export async function eligibilityAction(): Promise<EligibilityResult> {
  const session = await requireRiderSession();
  if (!session) {
    return actionFailure('You do not have permission to perform this action.');
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('rider_profiles')
    .select('verification_status')
    .eq('id', session.userId)
    .maybeSingle();

  const status = (profile?.verification_status ?? 'pending') as RiderVerificationStatus;

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id')
    .eq('rider_id', session.userId)
    .eq('is_active', true);

  // M1 rule: verification approved AND explicit operational readiness.
  // A rider-controlled availability record is the M5 construct; an active
  // motorcycle is the M1-era stand-in, documented in ARCHITECTURE-V2 §5.
  const result = checkOperationalEligibility({
    verificationStatus: status,
    hasAvailabilityRecord: (vehicles?.length ?? 0) > 0,
  });

  return actionSuccess(result);
}
