/**
 * Vitest setup: provides a deterministic test environment.
 *
 * Values are ASSIGNED (not defaulted) so tests never depend on — or leak —
 * a developer's real `.env.local` configuration. Test values mirror the
 * shape of production configuration without resembling real credentials.
 */
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.local.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret';
process.env.FLUTTERWAVE_SECRET_KEY = 'test-flutterwave-secret';
process.env.FLUTTERWAVE_WEBHOOK_HASH = 'test-webhook-hash';
process.env.STADIA_MAPS_API_KEY = 'test-stadia-key';
delete process.env.SENTRY_DSN;
process.env.LOG_LEVEL = 'info';
