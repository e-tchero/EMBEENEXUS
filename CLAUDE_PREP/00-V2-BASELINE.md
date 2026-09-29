# EMBEE NEXUS — V2 BASELINE

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Verified directly from the repository on 2026-09-29. This replaces the V1
baseline (`archive/v1/00-BASELINE.md`), which described `master@640af0d` — a
commit that does not exist in the current repository's history.

## Repository

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `40132eb2d0b2506689627cfef522340f2168f078` (`feat(ui): establish nexus v2 design system`) |
| Package manager | pnpm (monorepo) |

## Product

Closed Abuja pilot, web application. Motorcycle-only, one pickup → one
destination, 35 km max, Zone A coverage, fixed-band pricing in kobo,
pay-before-dispatch, Flutterwave (provider-abstracted), Stadia Maps
(server-side geocode/search), OTP custody chain with three-photo private
evidence, waiting charge (10 min free → ₦700/minute → 30-min cap → return),
dispatch queue (longest-available, 20-second offer TTL), operator console.

Explicitly excluded by founder decision (do not add): realtime tracking, GPS
location, rider earnings/payouts, notifications, ratings, seller features.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| Design system | `apps/web/DESIGN.md` v0.1 → v0.2 re-base pending |
| Database | Supabase PostgreSQL + PostGIS, forced RLS, SECURITY DEFINER RPCs |
| Auth | Supabase Auth (cookie sessions), roles: customer / rider / operator |
| Payments | Flutterwave behind provider abstraction |
| Maps | Stadia Maps behind provider abstraction (server-side only) |
| Storage | Supabase Storage private buckets (evidence) |

## Pages (14)

`/` · `(auth)/login` · `(auth)/signup` · `/dashboard` (role fork) ·
`/orders/new` (4-step wizard) · `/orders/[orderId]` (tracking) ·
`/payments/callback` · `/rider/home` · `/rider/verification` · `/operator` ·
`/operator/orders` · `/operator/orders/[orderId]` · `/operator/riders` ·
`/operator/riders/review` · `/operator/jobs`

## API routes (31)

```
/health
/quotes, /quotes/[quoteId]
/payments, /payments/status, /payments/status/poll
/orders, /orders/[orderId]
/orders/[orderId]/transition, /dispatch, /confirm-receipt, /complete-return
/orders/[orderId]/photos, /otp/issue, /otp/verify, /evidence/[kind]
/dispatch/offers/current, /dispatch/offers/[offerId]/accept, /dispatch/offers/[offerId]/decline
/rider/state, /rider/availability
/operator/overview, /operator/orders, /operator/orders/[orderId], /operator/riders, /operator/jobs
/geo/search, /geo/geocode
/jobs/dispatch-tick, /jobs/waiting-tick, /jobs/reconcile-payments
/webhooks/flutterwave
```

## Migrations

19 applied (`20260918000001` → `20260918000019`), hosted project synchronized.

## Verification state

Typecheck, unit tests, production build all green at HEAD. Customer journey,
rider operational journey (incl. expiry + forced-return scenarios), and
minimum operator console verified end-to-end against hosted services.
