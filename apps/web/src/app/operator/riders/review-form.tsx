'use client';

import { useActionState } from 'react';

import { reviewVerificationAction } from '@/lib/services/operator-actions';

export function ReviewForm({ riderId }: { riderId: string }) {
  const [state, formAction, pending] = useActionState(reviewVerificationAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="riderId" value={riderId} />
      <input
        name="notes"
        placeholder="Decision notes (optional)"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
      {state && !state.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state && state.ok ? (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Decision recorded. New status: {state.data.status}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </form>
  );
}
