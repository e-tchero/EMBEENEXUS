'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { signInSchema, signUpSchema } from '@embee/shared';

import { actionFailure } from '@/lib/env/action-result';
import { createClient } from '@/lib/db/client-server';
import { logger } from '@/lib/logging/logger';

import type { ActionResult } from '@/lib/env/action-result';

/**
 * Authentication server actions.
 *
 * Errors returned to the client are deliberately generic; detailed reasons
 * stay in server logs only. Logs never contain email addresses or secrets.
 * No AI attribution in this codebase (repository policy).
 */

/** Only allow relative redirect targets to prevent open redirects. */
function safeNextPath(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export async function signUpAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return actionFailure(first?.message ?? 'Invalid signup details');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    logger.warn('auth.signup.failed', { status: error.status });
    const message =
      error.status === 422 || error.message.toLowerCase().includes('already registered')
        ? 'An account with this email already exists.'
        : 'Unable to create an account right now. Please try again.';
    return actionFailure(message);
  }

  logger.info('auth.signup.succeeded', {});

  // Email confirmation is disabled in the Supabase config, so a session
  // exists immediately after signup. If confirmations are ever enabled,
  // redirect to a confirmation-pending page instead.
  redirect('/dashboard');
}

export async function signInAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return actionFailure(first?.message ?? 'Invalid login details');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn('auth.signin.failed', { status: error.status });
    // Deliberately vague: never reveal whether the account exists.
    return actionFailure('Invalid email or password');
  }

  logger.info('auth.signin.succeeded', {});

  const headerList = await headers();
  const next = safeNextPath((await formData.get('next')) ?? headerList.get('x-next-path'));
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
