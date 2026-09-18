# Embee Nexus V2 — Architecture

**Status:** Authoritative for V2 · **Created:** 2026-09-18 (M0) · **Baseline:** `caeaeb2` → M0

This document defines the V2 technical architecture. It supersedes the V1
blueprint (`ARCHITECTURE.md` at repo root and `docs/architecture/ARCHITECTURE.md`)
as the current engineering authority. V1 material remains available as
historical input; where it conflicts with founder business decisions or this
document, this document wins.

---

## 1. System Overview

Mobile-first motorcycle delivery platform for Abuja. Modular monolith:

```
Client (mobile-first web)
  ↓ HTTPS
Next.js route/server layer (thin handlers)
  ↓
Domain services (apps/web/src/lib/domain, lib/services)
  ↓
Supabase: PostgreSQL + PostGIS · Auth · Realtime · Storage
  ↓
External providers (Flutterwave, Stadia Maps, SMS — all behind abstractions)
```

**Rules**
- Route handlers orchestrate only; business logic lives in domain modules.
- Clients are never authoritative for pricing, payment status, rider
  assignment, earnings, order transitions, or permissions.
- Complex transactional invariants (dispatch claims, ledger mutations,
  state transitions) are implemented as PostgreSQL RPCs in later milestones,
  mirroring the pure domain modules in `lib/domain`.
- Payments use Flutterwave behind a provider abstraction (ADR-0002).
- Pricing is a fixed 5-band road-distance table, server-computed, versioned,
  snapshot per order (ADR-0003). No VAT/hidden fees in the customer price.
- Rider earnings 70% / platform 30%, settled from an immutable ledger.
- Dispatch: longest-available eligible rider, one offer at a time, 20-second
  expiry, server-authoritative claim with DB-enforced exclusivity (ADR-0004).
- Financial record-keeping uses an append-only ledger in integer minor units
  (kobo) — never floats (ADR-0005).
- Maps provider is abstracted behind `MapsProvider` (ADR-0006).

## 2. Workspace Layout

```
apps/web                  Next.js 15 application (customer, rider, seller, operator surfaces)
  src/app/                routes (thin)
  src/lib/domain/         pure domain logic + state machines (unit-tested)
  src/lib/services/       service modules (later milestones)
  src/lib/auth/           session resolution, guards, auth server actions
  src/lib/db/             Supabase clients (server RLS-bound, admin service-role, browser)
  src/lib/providers/      provider-neutral interfaces (maps; payments later)
  src/lib/logging/        structured logger with correlation IDs and redaction
  src/lib/env/            zod-validated public/server environment
  src/middleware.ts       correlation IDs + cheap cookie-presence redirects (not a security boundary)
packages/shared           client-safe contracts: roles, auth schemas, Result type
packages/eslint-config    shared flat ESLint config
supabase/migrations       authoritative schema + RLS + functions
```

## 3. Identity, Roles, Authorization

- Supabase Auth (`auth.users`) is the sole authentication identity.
- `public.profiles` (1:1) holds the database-owned role:
  `customer | rider | seller | operator`.
- Signup forces role `customer` via trigger — client metadata can never
  self-assign roles; the `role` column is not granted to client roles.
- All tables have forced RLS. Policies use non-recursive SECURITY DEFINER
  helpers (`get_user_role`, `has_role`) with locked `search_path`.
- Authorization boundary = RLS + server-side role checks
  (`lib/auth/guards.ts`). Middleware is never a security boundary.

## 4. State Machines

The order lifecycle is defined once in
`apps/web/src/lib/domain/order-state.ts` — pure, typed, unit-tested.
Payment state is a separate axis with its own machine (Flutterwave
verification); the two must not be conflated. Database transition RPCs
(later milestone) must mirror the domain table exactly.

## 5. Platform Infrastructure

- **audit_logs** — append-only; operator read-only; no client mutations.
- **background_jobs** — durable queue; `FOR UPDATE SKIP LOCKED` claim via
  server worker; dedupe index for idempotent enqueue.
- **webhook_events** — provider events recorded exactly once
  (`UNIQUE (provider, provider_event_id)`); signature verification happens
  in the same server-only transaction; rows are never client-readable.

## 6. Environments & Secrets

- Public env (browser-safe) validated in `lib/env/public.ts`; server env
  validated in `lib/env/server.ts`, guarded by `server-only`.
- Secrets never enter Git; `.env.local` is ignored. See `.env.example`.

## 7. Milestones

M0 (this) — skeleton, identity/RLS baseline, observability, CI, tests.
M1 RBAC/verification · M2 zones/pricing/maps · M3 quotes/orders ·
M4 Flutterwave payments · M5 dispatch · M6 chain of custody · M7 tracking ·
M8 ledger/payouts · M9 seller platform · M10 admin/hardening.
Refund/waiting/seller-edit flows gated on P0 decisions (D05–D08, D17, D20, D21).
