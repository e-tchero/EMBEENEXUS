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
  (`lib/auth/guards.ts`, `lib/auth/rbac.ts`). Middleware is never a
  security boundary.
- Server actions follow the flow: `requireRole(...)` → zod re-validation →
  pure domain pre-check → SECURITY DEFINER RPC / RLS-scoped write. RPC
  error codes map to safe, non-leaking messages (`rpcErrorToActionFailure`).

### M1 — Rider verification & vehicles

- `rider_profiles` (verification lifecycle) and `vehicles` (motorcycle-only
  MVP, rider-owned). Clients hold **no write grants** on `rider_profiles`;
  all verification changes flow through operator/rider SECURITY DEFINER RPCs
  (`rider_request_verification`, `rider_review_decision`,
  `rider_withdraw_verification`, `operator_create_rider_profile`) which
  resolve the caller via `auth.uid()` and log to
  `rider_verification_events` (append-only).
- Lifecycle (mirrored in `lib/domain/rider-verification.ts`):
  `pending → under_review → approved | rejected`,
  `rejected/withdrawn → pending (resubmit)`,
  `pending/under_review → withdrawn`. `approved` is terminal in M1.
- Verification is separate from availability: operational eligibility
  requires approved verification AND an explicit rider-controlled
  availability record (an active motorcycle is the M1-era stand-in;
  the availability record arrives with dispatch in M5). An account existing
  is never sufficient.

## 4. State Machines

The order lifecycle is defined once in
`apps/web/src/lib/domain/order-state.ts` — pure, typed, unit-tested.
Payment state is a separate axis with its own machine (Flutterwave
verification); the two must not be conflated. Database transition RPCs
(migration 0005) mirror the domain table exactly and are the only write path.

## 5a. Quotes & Orders (M3)

- **quotes** — immutable server-generated snapshots (endpoints, road distance,
  pricing config version, kobo amounts, coverage result). Consumed at most once
  (`status = 'consumed'` set inside the same transaction as order creation);
  expiry is enforced inside `create_order_from_quote`, never trusted from a
  client. Validity default 45 min is founder-pending (D09/D10).
- **orders** — owner, endpoints, denormalized immutable financial snapshot
  (kobo bigint amounts + pricing version), lifecycle state, `rider_id`.
- **order_events** — append-only transition history (from/to state, actor,
  actor role, trigger, metadata); no mutation paths exist for any role.
- RPCs `create_quote`, `create_order_from_quote`, `order_transition` are
  SECURITY DEFINER, `search_path=''`, execute revoked from public/anon;
  transitions serialize on `FOR UPDATE` row locks. Guards whose fact sources
  do not exist yet (payment verification M4, OTP/recipient M6) are unreachable
  in M3 by design.

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

M0 — skeleton, identity/RLS baseline, observability, CI, tests.
M1 — RBAC hardening, rider verification lifecycle, motorcycle records (done).
M2 — coverage zones, fixed-band pricing, maps provider abstraction (done).
M3 — quotes, order persistence, server-authoritative lifecycle (done).
M4 Flutterwave payments · M5 dispatch · M6 chain of custody · M7 tracking ·
M8 ledger/payouts · M9 seller platform · M10 admin/hardening.
Refund/waiting/seller-edit flows gated on P0 decisions (D05–D08, D17, D20, D21).
