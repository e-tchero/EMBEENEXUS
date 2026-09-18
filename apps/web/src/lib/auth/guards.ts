import 'server-only';

import { redirect } from 'next/navigation';

import { isUserRole } from '@embee/shared';

import { getSession } from '@/lib/auth/session';

import type { Session } from '@/lib/auth/session';
import type { UserRole } from '@embee/shared';

/**
 * Server-side route guards.
 *
 * Middleware performs a cheap cookie-presence check for UX (fast redirects);
 * these guards re-verify the actual session and role inside the React
 * Server Component tree. Middleware is never the security boundary.
 */

/** Require any authenticated user; redirect to login otherwise. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Require an authenticated user holding one of the given roles. */
export async function requireRole(roles: readonly UserRole[]): Promise<Session> {
  const session = await requireUser();
  if (!session.role || !isUserRole(session.role) || !roles.includes(session.role)) {
    redirect('/');
  }
  return session;
}
