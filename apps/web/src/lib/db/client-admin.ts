import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env/public';
import { serverEnv } from '@/lib/env/server';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — BYPASSES ROW LEVEL SECURITY.
 *
 * Permitted uses (M0): none at runtime. Reserved for trusted server contexts
 * in later milestones: webhook processing, background jobs, privileged
 * administrative operations. Every use site must:
 *   1. validate its own authorization before performing work, and
 *   2. write an audit log entry for privileged mutations.
 *
 * SECURITY: Never import this module from client code, route handlers that
 * proxy client input without authorization checks, or anything serializable
 * to the browser.
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // The service role is not a user session; disable session persistence.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
