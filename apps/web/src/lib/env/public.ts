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

function loadPublicEnv(): PublicEnv {
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

  return parsed.data;
}

export const publicEnv = loadPublicEnv();
