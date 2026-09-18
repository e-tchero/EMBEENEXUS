import 'server-only';

import { z } from 'zod';

/**
 * Server-only environment configuration.
 *
 * This module is guarded by `server-only`: importing it from a Client
 * Component fails the build. All secrets (payment gateway keys, service-role
 * key, webhook secrets, private provider credentials) live here and are
 * validated at process start so misconfiguration fails fast and loudly.
 *
 * SECURITY: Nothing in this module may ever be serialized to the client —
 * do not pass values from this object into props, fetch responses, or logs.
 */

const serverEnvSchema = z.object({
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  // Flutterwave (payment provider — abstraction behind lib/providers in M4)
  FLUTTERWAVE_SECRET_KEY: z.string().min(1),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().min(1),
  // Webhook secret hash is a SEPARATE credential from the API keys. Optional
  // until configured in the Flutterwave dashboard: while absent, the webhook
  // route FAILS CLOSED (rejects every delivery) rather than accepting
  // unauthenticated events.
  FLUTTERWAVE_WEBHOOK_HASH: z.string().min(1).optional(),
  // Background-job trigger token (operator scheduler). Optional: when absent,
  // job routes accept only authenticated operator sessions.
  JOBS_TRIGGER_TOKEN: z.string().min(1).optional(),

  // Stadia Maps (map provider — abstraction behind lib/providers)
  STADIA_MAPS_API_KEY: z.string().min(1),

  // Optional observability
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

function loadServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
    FLUTTERWAVE_ENCRYPTION_KEY: process.env.FLUTTERWAVE_ENCRYPTION_KEY,
    FLUTTERWAVE_WEBHOOK_HASH: process.env.FLUTTERWAVE_WEBHOOK_HASH,
    JOBS_TRIGGER_TOKEN: process.env.JOBS_TRIGGER_TOKEN,
    STADIA_MAPS_API_KEY: process.env.STADIA_MAPS_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    // Fail closed: list only the offending key names, never the values.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid server environment configuration: ${keys}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * Lazy server-env accessor.
 *
 * Environment is validated on first access, NOT at module import. This keeps
 * `next build` working when secrets exist only at runtime (build-time page
 * data collection imports route module graphs; secrets are a runtime concern).
 * Misconfiguration still fails fast — at the first server call that needs it.
 */
export function getServerEnv(): ServerEnv {
  return loadServerEnv();
}

/**
 * @deprecated M0-era eager export. Retained for one milestone so existing
 * call sites keep working; use {@link getServerEnv} instead. Property access
 * now invokes the lazy loader, so it no longer throws at import time.
 */
export const serverEnv = {
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return loadServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  },
  get SUPABASE_JWT_SECRET(): string {
    return loadServerEnv().SUPABASE_JWT_SECRET;
  },
  get FLUTTERWAVE_SECRET_KEY(): string {
    return loadServerEnv().FLUTTERWAVE_SECRET_KEY;
  },
  get FLUTTERWAVE_ENCRYPTION_KEY(): string {
    return loadServerEnv().FLUTTERWAVE_ENCRYPTION_KEY;
  },
  get FLUTTERWAVE_WEBHOOK_HASH(): string | undefined {
    return loadServerEnv().FLUTTERWAVE_WEBHOOK_HASH;
  },
  get JOBS_TRIGGER_TOKEN(): string | undefined {
    return loadServerEnv().JOBS_TRIGGER_TOKEN;
  },
  get STADIA_MAPS_API_KEY(): string {
    return loadServerEnv().STADIA_MAPS_API_KEY;
  },
  get SENTRY_DSN(): string | undefined {
    return loadServerEnv().SENTRY_DSN;
  },
} as const;

