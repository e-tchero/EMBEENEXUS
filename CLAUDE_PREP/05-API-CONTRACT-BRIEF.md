# EMBEE NEXUS — API CONTRACT BRIEF (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE (derived from actual route handlers) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Every route below exists in the repository at reconciliation date. Do not
assume endpoints from the V1 brief (`archive/v1/05-API-CONTRACT-BRIEF.md`);
that API surface does not exist in V2.

## Conventions

- Cookie-session auth (Supabase); 401 unauthenticated, 403 wrong role.
- Business rejections are Postgres RPC codes surfaced as 4xx JSON with
  canonical business codes (mapped by `lib/db/rpc-errors.ts`).
- Money is integer kobo server-side; Naira presentation is UI-only.
- Background-job endpoints require the jobs token header; the Flutterwave
  webhook verifies signatures server-side.

## Public

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Real integration checks (Supabase, service-role, payments, maps as booleans) |
| `/api/webhooks/flutterwave` | POST | Payment events (signature-verified, idempotent) |

## Auth & account

| Endpoint | Method | Purpose |
|---|---|---|
| Supabase Auth | — | Email/password via Supabase; sessions are cookie-based; role from `profiles` |

## Customer

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/quotes` | POST | Create quote (server-priced; validity window) |
| `/api/quotes/[quoteId]` | GET | Quote snapshot |
| `/api/orders` | GET / POST | List own orders / create order from a confirmed quote |
| `/api/orders/[orderId]` | GET | Order detail (participant or operator) |
| `/api/orders/[orderId]/transition` | POST | Canonical lifecycle transition (RPC re-validates actor + state) |
| `/api/orders/[orderId]/confirm-receipt` | POST | Recipient confirmation → `completed` |
| `/api/orders/[orderId]/otp/issue` | POST | Customer-only; plaintext OTP once |
| `/api/payments` | POST | Initiate Flutterwave payment (reserves row, returns hosted link) |
| `/api/payments/status` | GET | Payment state (server truth) |
| `/api/payments/status/poll` | GET | Callback-surface polling |
| `/api/geo/search` | GET | Address autocomplete (server-side Stadia) |
| `/api/geo/geocode` | GET | Forward geocode |

## Rider

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/rider/state` | GET | Snapshot: verification, availability, current offer (20 s TTL), active order |
| `/api/rider/availability` | POST | Declare available/unavailable |
| `/api/dispatch/offers/current` | GET | Current offered order (RPC-gated) |
| `/api/dispatch/offers/[offerId]/accept` | POST | Accept offer → `rider_assigned` |
| `/api/dispatch/offers/[offerId]/decline` | POST | Decline; availability restored, queue clock reset |
| `/api/orders/[orderId]/transition` | POST | Rider status progression (`rider_departed`, arrivals) |
| `/api/orders/[orderId]/photos` | POST | Multipart evidence upload (private bucket) |
| `/api/orders/[orderId]/otp/verify` | POST | Pickup/delivery OTP verification (server-checked) |
| `/api/orders/[orderId]/complete-return` | POST | Complete return after waiting cap → `delivery_failed` |

## Operator

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/operator/overview` | GET | Overview + attention queue (real-state derived) |
| `/api/operator/orders` | GET | Monitor list with canonical-status filters |
| `/api/operator/orders/[orderId]` | GET | Detail: timeline, dispatch, payment, evidence metadata |
| `/api/operator/riders` | GET | Rider visibility (verification, availability, offers) |
| `/api/orders/[orderId]/dispatch` | POST | Operator-only dispatch trigger/recovery |
| `/api/orders/[orderId]/transition` | POST | Operator cancel / hold-for-review / release |
| `/api/orders/[orderId]/evidence/[kind]` | GET | Short-lived signed URL (300 s) for private evidence |

## Background jobs (token-gated)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/jobs/dispatch-tick` | POST | Expire stale offers + continue dispatch |
| `/api/jobs/waiting-tick` | POST | Waiting fee accrual; 30-min cap initiates return |
| `/api/jobs/reconcile-payments` | POST | Payment reconciliation pass |

## Not present in V2 (historical only)

Addresses CRUD, ratings, refunds, notifications, rider earnings, GPS/location
ingestion, admin section — none of these endpoints exist. Do not design or
call them.
