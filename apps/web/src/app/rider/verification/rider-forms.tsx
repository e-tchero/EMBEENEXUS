'use client';

import { useActionState } from 'react';

import { addVehicleAction, submitVerificationAction, withdrawVerificationAction } from '@/lib/services/rider-actions';

import type { ActionResult } from '@/lib/env/action-result';

function Feedback<T>({ state }: { state: ActionResult<T> | null }) {
  if (state && !state.ok) {
    return (
      <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state && state.ok) {
    const detail =
      state.data && typeof state.data === 'object' && 'status' in state.data
        ? `Current status: ${String((state.data as { status: unknown }).status)}`
        : 'Saved.';
    return (
      <p role="status" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
        Done. {detail}
      </p>
    );
  }
  return null;
}

const buttonClass =
  'rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

export function VerificationActions({ status }: { status: string }) {
  const [submitState, submitAction, submitPending] = useActionState(submitVerificationAction, null);
  const [withdrawState, withdrawAction, withdrawPending] = useActionState(
    withdrawVerificationAction,
    null,
  );

  const canSubmit = status === 'pending' || status === 'rejected' || status === 'withdrawn';
  const canWithdraw = status === 'pending' || status === 'under_review';

  return (
    <div className="space-y-3">
      {canSubmit ? (
        <form action={submitAction}>
          <button type="submit" disabled={submitPending} className={buttonClass}>
            {submitPending
              ? 'Submitting…'
              : status === 'pending'
                ? 'Submit for review'
                : 'Resubmit for review'}
          </button>
          <Feedback state={submitState} />
        </form>
      ) : null}

      {canWithdraw ? (
        <form action={withdrawAction}>
          <button
            type="submit"
            disabled={withdrawPending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
          >
            {withdrawPending ? 'Withdrawing…' : 'Withdraw'}
          </button>
          <Feedback state={withdrawState} />
        </form>
      ) : null}

      {status === 'approved' ? (
        <p className="text-sm text-green-700">Verification approved.</p>
      ) : null}
      {status === 'under_review' ? (
        <p className="text-sm text-neutral-500">Your submission is under review.</p>
      ) : null}
    </div>
  );
}

export function AddVehicleForm() {
  const [state, formAction, pending] = useActionState(addVehicleAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="make"
          placeholder="Make (e.g. Honda)"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="model"
          placeholder="Model (e.g. CG 125)"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="year"
          type="number"
          min={1980}
          max={2100}
          placeholder="Year (optional)"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="plateNumber"
          placeholder="Plate number"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Saving…' : 'Add motorcycle'}
      </button>
    </form>
  );
}
