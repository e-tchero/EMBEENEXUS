'use client';

import { useActionState } from 'react';

import { signUpAction } from '@/lib/auth/actions';

import type { ActionResult } from '@/lib/env/action-result';

const initialState: ActionResult<null> | null = null;

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult<null> | null, formData: FormData) => signUpAction(prev, formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="fullName" className="block text-sm font-medium">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-(--ring)"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-(--ring)"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-(--ring)"
        />
      </div>
      {state && !state.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-(--action-ink) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--action-ink-hover) disabled:opacity-50"
      >
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
