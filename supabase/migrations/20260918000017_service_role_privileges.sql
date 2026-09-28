-- =============================================================================
-- Embee Nexus V2 — Migration 0017: service_role server-path privileges
-- =============================================================================
-- DEFECT (found during the hosted re-verification gate on the fresh project
-- iqayrbhzeuiyfuwzxtwt, reproducible at HEAD a33111e):
--   Migrations 0001–0016 grant client roles (anon/authenticated) explicitly
--   but never establish service_role privileges or default privileges. On the
--   previous hosted project these existed outside migration history, so the
--   gap was invisible until this fresh project was verified. Result: every
--   server-authoritative path that uses the service-role client fails with
--   SQLSTATE 42501 (permission denied) on tables, sequences AND functions:
--     * payment webhook processing   (payment_get_by_reference, ...)
--     * payment reconciliation       (verifyAndGrantPayment scans payments)
--     * waiting tick                 (waiting-charge reads/writes on orders)
--     * dispatch continuation        (dispatch_tick offer scans)
--
-- FIX (strictly additive; modifies NO table, function, policy or RPC body):
--   * Explicit grants on all CURRENT public-schema tables, sequences and
--     functions to service_role ONLY — the standard Supabase posture for the
--     server-side role. The application's admin client needs exactly
--     select/insert/update/delete on tables, usage/select on sequences and
--     execute on functions.
--   * ALTER DEFAULT PRIVILEGES so FUTURE application objects receive the same
--     server-side access automatically.
--   * No privilege granted to anon or authenticated is added or changed.
--   * RLS is untouched: client-role policies remain exactly as they are, and
--     service_role bypasses RLS by platform design (it is the trusted server
--     role; every service-role call site establishes its own authority first —
--     webhook signature, jobs token, or payment-continuation context).
-- IDEMPOTENCE: GRANT statements are naturally re-runnable; the DO block guards
--   default-privilege statements so re-application never errors.
-- =============================================================================

-- 1. Existing tables — the app's server-authoritative CRUD surface.
grant select, insert, update, delete on all tables in schema public to service_role;

-- 2. Existing sequences — bigint/identity keys written by inserts.
grant usage, select on all sequences in schema public to service_role;

-- 3. Existing functions — all SECURITY DEFINER RPCs used by server paths.
grant execute on all functions in schema public to service_role;

-- 4. Future objects — same posture automatically (role-guarded for safety).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO service_role;
  END IF;
END
$$;
