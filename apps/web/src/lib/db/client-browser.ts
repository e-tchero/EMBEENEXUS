import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env/public';

/**
 * Browser-side Supabase client (anon key, subject to RLS).
 * Used for interactive client components; server components and actions use
 * the cookie-bound server client.
 */
export function createBrowserClientInstance() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
