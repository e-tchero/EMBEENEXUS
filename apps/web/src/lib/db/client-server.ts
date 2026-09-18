import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { publicEnv } from '@/lib/env/public';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cookie-bound Supabase client for React Server Components, Server Actions
 * and Route Handlers. Sessions ride httpOnly cookies; the anon key is used,
 * so every query remains subject to Row Level Security.
 *
 * SECURITY: Never swap this for the service-role client in request paths.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render pass — cookies cannot be
            // mutated during render. Session refresh is handled by middleware.
          }
        },
      },
    },
  );
}
