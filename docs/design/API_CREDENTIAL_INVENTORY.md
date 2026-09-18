# Embee Nexus — API & Credential Inventory

**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4); reconciled post-M3
 against external founder docs — see `CANONICAL_SOURCE_OF_TRUTH.md` §6.
**Sources:** full codebase audit (`lib/env/*`, `.env.example`, providers, services),
docs, ADRs, founder specs (Payment System.docx, Nexus Seller spec, Stadia decision,
Developer Brand Kit workspace). No secret values were read, requested, or committed —
variable names and classification only.

## 1. Integration matrix

| Service | Purpose | Environment variables | Secret / client-safe | Phase required | Status |
|---|---|---|---|---|---|
| Supabase (project) | Postgres + PostGIS, Auth, Realtime (future), Storage (future) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-safe (RLS-protected) | M0 — **ACTIVE** | `REQUIRED` |
| Supabase (admin) | Service-role server client (bypasses RLS; no M0–M3 runtime call sites; reserved for webhooks/jobs) | `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | M0 (runtime use: M4+) | `REQUIRED` |
| Supabase (JWT) | Server-side JWT verification | `SUPABASE_JWT_SECRET` | **Server-only** | M0 — **ACTIVE** | `REQUIRED` |
| Stadia Maps | Geocoding, route, road-distance, time-distance matrix (M2 adapter) | `STADIA_MAPS_API_KEY` | **Server-only** — key travels only on server-side requests | M2 — **ACTIVE** | `REQUIRED` |
| Stadia Maps (client tiles) | Browser/mobile map tile display | (none yet — separate **public** token if/when vector tiles are rendered client-side) | Client-safe token | M5/M7 (first mobile map screens) | `REQUIRED LATER` — provision when map UX is built |
| Flutterwave | Payments (server: checkout creation, verification) | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_ENCRYPTION_KEY` | **Server-only** | M4 — **ACTIVE (TEST MODE)** | `AVAILABLE` — TEST-mode keys in `.env.local`; sandbox checkout verified live |
| Flutterwave (webhook) | Webhook signature verification (`verif-hash`) | `FLUTTERWAVE_WEBHOOK_HASH` | **Server-only** | M4 — **PENDING DASHBOARD CONFIG** | `MISSING` until configured in the Flutterwave dashboard; webhook route fails closed while absent |
| Flutterwave (public key) | Client-side checkout initialization (inline/redirect) | `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | Client-safe by design | M4 — **ACTIVE (TEST MODE)** | `AVAILABLE` |
| Jobs trigger | Background-job scheduler auth (`x-jobs-token`) | `JOBS_TRIGGER_TOKEN` | **Server-only** | M4 — **ACTIVE** | `OPTIONAL` — absent: job routes accept only operator sessions |
| Resend | Email delivery | (none present) | n/a | — | **NOT PART OF CURRENT V2 ARCHITECTURE** — V1-era only (CLAUDE_PREP/08, V1 baseline). MVP notifications are SMS + in-app per founder docs. Do not add without founder authorization |
| SMS / OTP provider | Confirmation SMS, OTP delivery, seller tracking-link SMS (D26 cost ownership pending) | *(provider not selected — do not invent)* — Seller spec §12 lists candidate Nigerian gateways for CTO assessment | n/a | M5/M6+ (seller tracking SMS) | **FOUNDER DECISION REQUIRED** (provider + D26) |
| Push notifications | Tracking/status push | Android: FCM server key + device tokens; iOS: APNs key + certificates (via future mobile framework's credential flow) | Server holds sender credentials; device tokens are data, not env secrets | M7 (post mobile build) | `REQUIRED LATER` — nothing to provision yet |
| Vercel | Web/operator deployment | `NEXT_PUBLIC_APP_URL` (+ none beyond provider-integration vars) | Integration via dashboard/GitHub; **no deploy token needed locally or in CI** unless CLI deploys are authorized | M10 / first deploy | `OPTIONAL` |
| Sentry | Error tracking | `SENTRY_DSN` (optional in server env schema) | DSN is server-side config; browser DSN would be client-safe by design | Not scheduled | `OPTIONAL` — off by default |
| Analytics / crash reporting / CDN | — | (none) | — | — | `NOT AUTHORIZED` — not authorized; do not add because "common" |
| Supabase Storage | Parcel/vehicle photo buckets (M6 chain of custody) | none (uses project URL + existing keys) | n/a | M6 | `REQUIRED LATER` — zero new env vars; bucket policies are migration work |

## 2. Client-safe vs server-only rule (verified in code)

- Client bundle: **only** `NEXT_PUBLIC_*` values (Supabase URL + anon key, app URL). The anon key is not a secret; RLS is the boundary (M0 model).
- Everything else is validated in `lib/env/server.ts` behind the `server-only` import guard and never serialized to props/responses/logs.
- M2 Stadia key reaches the provider adapter only inside `server-only` modules; there is no browser map client yet.
- When the mobile client exists, it is a **client**: it receives the same class of publishable credentials only. Stadia route/geocode calls from mobile go through the Next.js server (or a thin BFF edge), never with the secret key.

## 3. Environment contract (`.env.example`)

Audited and restructured this phase: grouped by phase (`# Core`, `# Supabase`,
`# Maps`, `# Payments — M4`, `# Notifications — future`, `# Observability`),
variable names + safe placeholders only, phase annotations added, and a stray
non-variable first line (`[TEMPLATE]`) removed (it would be silently ignored
by dotenv parsers but is misleading documentation).
`.env.local` remains git-ignored; it was never read.

## 4. Credential preparation report (no values requested or printed)

### PREPARE NOW
```text
Service: Stadia Maps
Credential: API key (server-side)
Purpose: geocoding/routing for quotes (M2 runtime + local dev)
Where it belongs: .env.local → deployment env settings
Client/server: SERVER only
Required phase: M2 (active) — already defined in .env.example
Status: founder-held; not present in this working tree
```

### PREPARE SOON (M4)
```text
Service: Flutterwave
Credential: secret key
Purpose: server-side payment verification (M4)
Where it belongs: .env.local / deployment secrets
Client/server: SERVER only
Required phase: M4
Status: awaiting founder account setup

Service: Flutterwave
Credential: webhook secret hash
Purpose: webhook signature verification (M4)
Where it belongs: deployment secrets; configured in Flutterwave dashboard
Client/server: SERVER only
Required phase: M4
Status: awaiting Flutterwave dashboard configuration

Service: Flutterwave
Credential: public key
Purpose: client-side checkout initialization
Where it belongs: NEXT_PUBLIC_* env (intentionally public)
Client/server: CLIENT-SAFE by design
Required phase: M4
Status: add variable to .env.example when M4 is authorized
```

### WAIT / FOUNDER DECISION
```text
Service: SMS / OTP provider
Credential: (depends on provider — do not invent)
Purpose: confirmation SMS (seller flow), OTP delivery
Where it belongs: server env (TBD)
Client/server: SERVER only
Required phase: M5/M6+
Status: FOUNDER DECISION REQUIRED (provider choice + D26 SMS cost ownership)

Service: Push (Android/iOS)
Credential: FCM server key / APNs auth key
Purpose: tracking & status push
Where it belongs: deployment secrets + mobile framework credential flow
Client/server: SERVER holds senders; clients hold only device tokens
Required phase: M7 (after mobile client exists)
Status: WAIT — nothing to provision yet

Service: Stadia Maps client tiles
Credential: separate public map token
Purpose: browser/mobile tile rendering
Where it belongs: NEXT_PUBLIC_* env
Client/server: CLIENT-SAFE
Required phase: first map-display screens (M5/M7)
Status: WAIT — provision when map UX build is authorized
```

## 5. Reconciliation addendum (post-M3)

Cross-checked against the external founder material (see CANONICAL_SOURCE_OF_TRUTH.md):

- **Stadia usage guidance from the founder Stadia decision (Sep 11)** now attaches to the
  `STADIA_MAPS_API_KEY` row: commercial production belongs on the **Starter plan ($20/mo)**;
  harden map endpoints (rate limiting, input validation, autocomplete-v2-first search,
  route/geocode caching, usage monitoring) — these are engineering requirements for the
  next maps-touching milestone, not new provider decisions.
- **Seller tracking-link SMS** (Seller spec §12) is added to the SMS row's purpose — the
  provider decision covers both OTP/status SMS and recipient tracking-link SMS.
- **Resend** stays classified NOT PART OF V2 (V1-era email provider per CLAUDE_PREP/08 +
  V1 baseline; superseded by the founder MVP notification model: SMS + in-app).
- **Flutterwave webhook hash** confirmed by Payment System.docx §2/§22 (webhook-driven
  backend verification, provider abstraction mandated for future providers/currencies).
- No other credential states changed. No secret values exist in this repository.
