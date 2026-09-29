# EMBEE NEXUS — FRONTEND ARCHITECTURE (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE (derived from actual codebase) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Framework & Build

| Property | Value |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens in `globals.css`) |
| Component library | **None.** Components are route-local and co-located under `apps/web/src/app/**` |
| Design tokens | `apps/web/DESIGN.md` contract + `globals.css` `@theme inline` |
| Dark mode | `prefers-color-scheme` auto-flip; no manual toggle, no class strategy |
| State management | React Server Components + client islands; no global state library |

## Application structure (actual)

```
apps/web/src/app/
├── layout.tsx                 # Root layout (metadata, viewport; no webfont yet)
├── globals.css                # Tailwind v4 + @theme inline tokens (light/dark)
├── page.tsx                   # Landing
├── (auth)/login | signup      # Authentication
├── dashboard/                 # Role fork: customer home / rider → /rider/home / operator → /operator
├── orders/new/                # Booking wizard: wizard.tsx + locations-form, parcels-form, quote-form, payment-step
├── orders/[orderId]/          # Customer tracking: order-status-client, status-copy
├── payments/callback/         # Flutterwave return surface
├── rider/                     # home-client, offer-card, order-card, error-copy; verification/
├── operator/                  # layout (server gate), home, orders/, orders/[orderId]/, riders/, jobs/
└── api/                       # 31 route handlers (see 05-API-CONTRACT-BRIEF.md)
```

Shared code lives in `apps/web/src/lib/`: `services/` (backend service modules),
`domain/` (pure state machines and view models), `db/` (clients, RPC error
mapping), `auth/` (session + role guards). There is no `components/` tree, no
shadcn/ui, no `hooks/` directory — the V1 architecture in `archive/v1/02` does
not describe this codebase.

## Routing & authorization model

- **Server-side role gates.** Pages render through `requireRole([...])` /
  session checks on the server; hiding UI is never the authorization mechanism.
- **Role fork.** `/dashboard` redirects by role: customer stays, rider →
  `/rider/home`, operator → `/operator`.
- **API authorization.** Every route handler re-establishes the session and
  role server-side; RLS enforces data access; business writes go through
  SECURITY DEFINER RPCs that re-validate actor and state.
- Public surfaces: `/`, `(auth)/*`, `/api/health`, Flutterwave webhook
  (signature-verified).

## Supabase integration

- Cookie-based sessions (no tokens in localStorage); server clients per route.
- Forced RLS on all tables; anon key never bypasses policies.
- Operator console reads (offers/availability) use RLS policies added by
  migration 0019; evidence viewing uses short-lived signed URLs (300 s) via the
  custody service.

## Background jobs

Three real job endpoints, token-gated, invoked by an external scheduler:
`/api/jobs/dispatch-tick` (offer expiry + continuation), `/api/jobs/waiting-tick`
(waiting fee accrual + 30-min cap + return initiation), `/api/jobs/reconcile-payments`.
No other scheduler exists in the app.

## Maps

`lib/` maps provider abstraction (Stadia adapter) — **server-side only**:
address search and geocoding for the booking wizard. No map rendering, no
tracking map, no rider GPS anywhere in V2 (founder-excluded).

## Historical note

The V1 frontend (shadcn/ui, `(dashboard)` route group, `admin/*` section,
Supabase Realtime subscriptions, GPS endpoints) is preserved in
`archive/v1/02-FRONTEND-ARCHITECTURE.md` and does not describe V2.
