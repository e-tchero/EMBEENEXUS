import { z } from 'zod';

/**
 * Public environment configuration.
 *
 * Values here are embedded into the browser bundle by Next.js. Only values
 * that are safe to expose publicly may appear in this module — never secrets.
 * Server-only configuration lives in `env/server.ts` and must never be
 * imported from client components.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // The anon key is a publishable key; data access remains protected by RLS.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | null = null;

function loadPublicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      'Invalid public environment configuration. ' +
        'Check NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Details are omitted to avoid leaking configuration values.',
    );
  }

  cached = parsed.data;
  return parsed.data;
}

/**
 * Lazy public-env accessor.
 *
 * Environment is validated on first access, NOT at module import. This keeps
 * `next build` working when public variables exist only at runtime (build-time
 * page data collection imports route module graphs; a module-import throw
 * would fail the build even when the deployment supplies the values at
 * runtime). Misconfiguration still fails fast — at the first call that needs
 * a value. Mirrors the documented lazy pattern in `env/server.ts`.
 */
export const publicEnv = {
  get NEXT_PUBLIC_APP_URL(): string {
    return loadPublicEnv().NEXT_PUBLIC_APP_URL;
  },
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return loadPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return loadPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },
} as const;
