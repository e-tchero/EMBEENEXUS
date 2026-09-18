import 'server-only';

import { createClient } from '@/lib/db/client-server';

import type { UserRole } from '@embee/shared';

export interface Session {
  userId: string;
  email: string | null;
  /** Role resolved from the database — never from client input. */
  role: UserRole | null;
}

/**
 * Resolve the current session from the request cookies.
 *
 * The user identity comes from the Supabase Auth JWT; the role is read from
 * the `profiles` table via RLS. Client-supplied role values are never
 * consulted. Returns null when unauthenticated.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  return {
    userId: user.id,
    email: user.email ?? null,
    role: role ?? null,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}
