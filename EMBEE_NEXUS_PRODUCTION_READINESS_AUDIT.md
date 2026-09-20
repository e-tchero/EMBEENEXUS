# EMBEE NEXUS V2 — Production Readiness Audit

**Audit date:** 2026-09-20 · **Commit inspected:** `7216e4c` (branch `main`, working tree clean) · **M6 status:** COMPLETE — HOSTED VERIFICATION CLEARED

**Method note:** the Supabase CLI available in this environment exposes `inspect db` performance probes but no dashboard Security Advisor export; the Security-Advisor-equivalent review was executed as direct read-only SQL against the linked hosted engine (`supabase db query --linked`), covering RLS coverage, SECURITY DEFINER configuration, grants, Storage, and SSL. No secrets were printed; all credential checks are categorical.

---

## 1. Executive Summary

| Item | Result |
|---|---|
| Overall classification | **`READY WITH CONDITIONS`** |
| M5 baseline `c701663` | Untouched (verified in git log) |
| M6 hosted clearance | `7216e4c` (migrations 0001–0016 identical local/remote) |
| Security posture (DB/RLS/Storage/RPC) | **PASS** — strong, evidenced |
| Application/API posture | **PASS WITH CONDITIONS** — no rate limiting |
| Payment reliability | **PASS WITH CONDITIONS** — no reconciliation tick schedule |
| Load testing | **NOT VERIFIED** |
| Backup/restore drill | **NOT VERIFIED** |
| Environment separation | **FAIL** (single hosted environment used for dev + verification + everything) |
| CI/CD | **PASS WITH CONDITIONS** (build pipeline exists; no deploy/migration automation) |

**Overall readiness classification: `READY WITH CONDITIONS`.**

The codebase and database are materially production-quality: RLS everywhere, deny-all on sensitive tables, private evidence bucket, constant-time webhook and job authentication, server-authoritative custody. What separates this from a launch claim is operational, not architectural: **no second environment exists, no load test has run, no restore has been drilled, and there is no application-level rate limiting.** All are closeable with bounded effort; none requires product change.

**Launch blockers (genuine):**
1. **B1 — No staging environment.** Every test, verification matrix, and future experiment runs against the single hosted project. Any pre-launch defect discovery therefore happens in the only database that exists. *Close: provision one Supabase staging project; push migrations 0001–0016.*
2. **B2 — Untested restore.** Backups cannot be claimed effective without one restore rehearsal into the staging project. *Close: scripted restore drill; record RPO/RTO observed.*
3. **B3 — No rate limiting on unauthenticated/abusable endpoints** (OTP issue/verify, quotes, payments, evidence upload). Custody controls (attempt caps, reissue caps) constrain per-order abuse but do not limit request volume. *Close: edge/CDN-level limits on `/api/*` plus targeted middleware; numbers owned by CTO with documented basis.*

**Conditions (must hold at launch):** CI green on `main` (currently true: 255/255, typecheck, lint, build); secrets remain environment-only; migrations only via `supabase db push` against a declared target.

---

## 2. Baseline and Environment

| Item | Value |
|---|---|
| Repository | `e-tchero/EMBEENEXUS` (`C:\EMBEENEXUS`) |
| Branch / commit | `main` / `7216e4c` — clean tree |
| M5 baseline | `c701663` (untouched) |
| Founder reconciliation | `5e17a5d` |
| M6 commits | `fca9230`, `bd9acc7`, `629515a`, `b5999cb`, `5521276`, `7216e4c` |
| Target environment | Single hosted Supabase project (ref `iqayrbhzeuiyfuwzxtwt`), PostgreSQL 17.6 |
| Environment limitations | One project only; `.env.local` `DATABASE_URL` is a V1 leftover pointing elsewhere (never used by V2; superseded by `--linked` flows). No staging, no production instance yet. |

---

## 3. Security Audit

| Area | Status | Evidence | Findings | Required Action |
|---|---|---|---|---|
| RLS coverage | **PASS** | 19/19 application tables `relrowsecurity = true` (query vs `pg_class`); `spatial_ref_sys` (PostGIS, no app data) is the only exception | — | None |
| RLS policies | **PASS** | Every app table has ≥1 policy; `orders_select_participants` = customer ∨ assigned rider ∨ operator; `profiles` = own-row + operator; deny-by-default for tables without policies | — | None |
| Sensitive-table deny-all | **PASS** | `order_otp_codes`, `webhook_events`, `background_jobs`: 0 policies **and** 0 grants to `anon`/`authenticated` (only `postgres`/`service_role`) — OTP hashes are unreachable by clients by design | — | None |
| SECURITY DEFINER hygiene | **PASS** | All 33 application SECURITY DEFINER functions have `search_path=""` pinned (query vs `pg_proc.proconfig`); all client calls resolve to the 3-arg `order_transition` | — | None |
| Storage | **PASS** | `order-evidence` bucket: `public=false`, 10 MB limit, MIME allowlist (jpeg/png/webp); **zero Storage policies** ⇒ deny-by-default; uploads/reads only via server-mediated routes (actor + order-state + path-prefix + MIME + size re-validated inside the RPC) | — | None |
| SSL | **PASS** | `pg_stat_ssl` on live session: `ssl=true, TLSv1.3` | Network restrictions (allowlists) not assessable via CLI — see §14 F10 | Configure network restrictions at platform level if desired |
| Auth configuration | **PASS WITH CONDITIONS** | `auth.users` contains only the 5 seeded verification fixtures; email-confirmed | Dashboard settings (password policy, OTP expiry, CAPTCHA, MFA for operators) **not inspectable via CLI** — F9 | Founder/CTO records dashboard auth settings at staging setup; enable MFA for operator accounts |
| Secrets — tracked files | **PASS** | Only `.env.example` and a name-only inventory ever committed; `git grep` for live-key patterns: test file uses a documented fixture (`FLWSECK_TEST-never-print-values`), doc matches are 8-char prose placeholders (`sk_live_x`) — not credentials | — | None |
| Secrets — untracked local | **PASS WITH CONDITIONS** | `MBEENEXUS-MEMORY-BACKUP.md` gitignored + untracked; `.env.local` ignored; V1-era credential material remains on disk **uncommitted** | If V1 credentials were ever valid, treat as exposed-by-possession | Rotate V1-era credentials when authorized; keep files out of git |
| Job endpoints | **PASS** | `x-jobs-token` constant-time compare OR operator session (dispatch-tick, waiting-tick, reconcile-payments — same M4 gate) | — | None |
| Webhook authenticity | **PASS** | `verif-hash` constant-time; payload never grants value; server-side re-verification precedes grant; DB-level duplicate no-op | — | None |
| OTP model | **PASS** | sha256-hashed only; no client grants; CSPRNG generation; one-time consumption; state-gate + consumption replay protection; 5-attempt lock persists (0015/0016); reissue cap 10; plaintext never logged (grep-verified) | — | None |
| Concurrency | **PASS** | Row-lock transitions; OTP row lock serializes submissions; unique photo constraint; idempotent RPCs — all re-verified on hosted engine in M6 matrix | — | None |

---

## 4. Database and Supabase Audit

- **Migration history:** `supabase migration list` — 0001–0016 identical locally and remotely; no drift; no manual repairs (verified again this audit).
- **Performance Advisor equivalent:** `inspect db outliers` / `table-stats` run — only verification-fixture traffic exists (top query = extension catalog, then `create_order_from_quote` at 0.8 s over 4 calls); **no meaningful production inference possible — see load testing (§7, NOT VERIFIED)**.
- **Indexes:** All hot-path FKs indexed (`orders.customer_id/quote_id/rider_id`, `payments.order_id`, `dispatch_offers.order_id/rider_id`, `order_events.order_id`, `order_otp_codes.order_id`, `order_photos.order_id`, `vehicles.rider_id`, `quotes.customer_id`). **Advisory (F8, Low):** 7 FK columns have no leading index — `actor_id` (×3), `uploaded_by`, `used_by`, `confirmed_by`, `pricing_config_id` (×2); none is a hot query path today.
- **Roles/grants:** least-privilege confirmed for client roles; `service_role` restricted to expected internal tables.
- **Constraints:** FKs + business invariants verified present (OTP hash format check, expiry-after-issue check, photo unique constraint, zone polygon validity).
- **Extensions:** pgcrypto, postgis, pg_stat_statements, uuid-ossp, supabase_vault — standard set.

## 5. API and Application Audit

| Operation | Auth | Validation | Idempotency | Errors | Notes |
|---|---|---|---|---|---|
| POST /api/orders | session (service) | Zod shared schemas | unique order-per-quote (DB) | mapped 400–422 | — |
| Quotes/payments routes | session + role | Zod | payment RPC re-checks amount, idempotent | mapped | server-authoritative status |
| OTP issue/verify | order-owner / assigned-rider (RPC-checked) | RPC state gates | consumption is one-time | outcome-object model (0015) | per-order attempt caps |
| Evidence upload | actor + order state + path + MIME + size (RPC) | bucket allowlist | unique(order, kind) | mapped | private bucket |
| Jobs (×3) | token (constant-time) ∨ operator | — | DB-level no-op on rerun | 401/403/500 | cron-ready |
| Webhook | signature + re-verify | minimal parse | unique provider event id | 401/400/500 | retry-safe |
| Health | public | — | — | — | booleans only, no config exposure |
| Middleware | cookie-presence UX gate only | — | — | — | security enforced server-side + RLS; correlation ID on all responses |

**Cross-cutting gap (F1, High):** no rate limiting anywhere in the application layer (grep-verified; the only match is Flutterwave provider error classification). Per-endpoint categories, current protection is: auth flows — Supabase Auth built-in limits (unconfigured values unknown, F9); OTP issue/verify — per-order caps only; quotes/orders/payments/uploads/tracking/jobs/webhooks — none at transport level. Supabase Auth rate limits cover the auth API only; application-level abuse prevention remains ours. *Recommended action:* enable platform-level limiting on `/api/*` at the hosting edge and targeted middleware for OTP issue/verify and quote creation; concrete numbers require a load-test baseline (§7) and are a CTO-owned decision, not a founder question.

## 6. Payment and Webhook Audit

**Current (M4–M5) behavior — audited:**
- Secret handling: `FLUTTERWAVE_SECRET_KEY` server-env only; public key is the only client-exposed credential; webhook hash constant-time-compared.
- Authority: frontend success is never authoritative; webhook and status-poll paths both re-verify with the provider; value granted exactly once via DB RPC that re-checks amount/currency.
- Idempotency: unique provider-event index; duplicate deliveries stop before processing; completion RPC idempotent.
- Under-review payments hold delivery (M5-verified); failed payment ⇒ no confirmation (state machine).
- No PAN/CVV storage; payload stored verbatim for audit (contains provider fields only).

**Deferred M8 work (intentionally NOT implemented, per scope):** ledger/payout business rules (D06, D07+D08 financial implementation, D13–D18), refund execution, rider daily payouts, waiting-fee collection. The return journey records the Embee-borne return cost as ledger-pending only.

**Condition (F2, Medium):** payment reconciliation depends on manual/operator triggering of `reconcile-payments`; no schedule exists. *Required action:* wire the three job routes to a scheduler (Vercel Cron or equivalent) at staging setup — configuration, not code.

## 7. Performance and Load Testing

**Status: `NOT VERIFIED`.** No load test has been executed; current hosted statistics reflect only verification fixtures. A staging load test must cover: concurrent quote/order creation, rider availability churn, dispatch offers, OTP verification races, tracking reads, waiting ticks, concurrent payment callbacks. *Required action:* run against B1's staging environment; until then no performance claims are made. Query-shape risks reviewed statically: dispatch queue and transition queries are indexed; no N+1 patterns in service layer; no unbounded listings (routes are task-scoped).

## 8. Backup and Recovery

**Status: `NOT VERIFIED`.** Supabase platform backups exist by subscription tier (dashboard-managed; CLI cannot evidence retention/PITR). No restore rehearsal has been performed; RPO/RTO unmeasured. *Required actions:* record the project's backup tier and PITR status; perform **one scripted restore drill** into the staging project (B2); document DR ownership (founder/CTO) and the migration-recreation guarantee (migrations 0001–0016 already recreate schema from empty).

## 9. Deployment and Environment Management

| Item | Status | Evidence |
|---|---|---|
| CI (build checks) | **PASS** | `.github/workflows/ci.yml`: typecheck, lint, test, build on push/PR, Node 22, frozen lockfile |
| Migration workflow | **PASS** | All schema changes via ordered migrations; applied only via `supabase db push` after dry-run; history verified twice |
| Deploy pipeline | **NOT VERIFIED** | No Vercel config in repo; no automated deploy — deployments are manual. No rollback procedure documented |
| Branch protection | **NOT VERIFIED** | Not inspectable via CLI (GitHub settings) — F11 |
| Environment separation | **FAIL** | Single project used for development + verification; `.env.local` contains stale V1 `DATABASE_URL` (documented; unused by V2; never committed) |
| Secrets in CI | N/A | CI runs build/tests only; no secrets required — good containment |

*Recommended workflow (documented, not implemented — authorization required):* staging project ← `db push` after CI green; production ← same path with manual approval gate; Vercel preview deployments per PR; production branch protection.

## 10. Observability and Operations

**Exists:** structured logger with event names (`payments.webhook.auth_failed`, `dispatch.tick.run` …); correlation ID via middleware; job-route structured results; health endpoint with integration booleans; runbooks directory (`docs/runbooks/background-jobs.md`).
**Missing (all F3, Medium):** error monitoring wiring (`SENTRY_DSN` is declared in env schema but no SDK is installed); payment/webhook/SMS/dispatch failure alerting; failed-job visibility; suspicious-OTP-activity alerting; uptime monitoring; request-ID propagation into log lines.
**Log hygiene — PASS:** grep-verified no OTP plaintext, no payment secrets, no tokens in log calls.
**Operational runbooks for rider breakdown, damaged parcels, disputes:** founder register covers the business rules (D04, D07+D08, D06); no step-by-step operator procedures exist — F4, Low (CTO-owned drafting, no new business policy).

## 11. Privacy and Data Protection

**Data surface (schema-verified):** profiles (`full_name`, contact via auth), orders (`pickup_address`, `dropoff_address`, coordinates), rider identity/verification records, order photos (parcel evidence), order events/audit logs. No payment instruments stored.
**Controls in place:** RLS participant-scoped reads; private evidence bucket; operator-only profile reads; deny-all on OTP/webhook/job tables.
**Gaps (F5, Medium):** no retention/deletion policy for photos and addresses (who deletes evidence, when); no documented privacy policy; public tracking link (future milestone) will require its own exposure review before implementation.
**Third-party sharing (current):** Flutterwave (payment processing), Stadia Maps (geocoding), Supabase (hosting), SMS provider (recipient notification, D26 — provider from register, not yet integrated).

## 12. Findings Register

| ID | Severity | Finding | Evidence | Impact | Recommendation | Status |
|---|---|---|---|---|---|---|
| F1 | **High** | No application/edge rate limiting on any endpoint category | grep across `apps/web/src`, `packages`: zero rate-limit code; only provider error classification | OTP brute-force volume, quote/payment spam, cost abuse | Edge limits on `/api/*`; targeted limits on OTP issue/verify + quotes; numbers post-load-test | **Open — P0/P1** |
| F2 | Medium | Payment reconciliation is manually triggered; no scheduler | No cron config in repo; job routes exist and are protected | Delayed detection of missed webhooks | Wire Vercel Cron (or equivalent) for the three job routes | Open — P1 |
| F3 | Medium | No error monitoring/alerting; `SENTRY_DSN` declared but unwired | No Sentry SDK in dependencies | Failures discovered by users, not operators | Install SDK at staging setup; alert on webhook/job failures | Open — P1 |
| F4 | Low | Operational runbooks (breakdown, damage, disputes) not drafted | Runbooks dir has background-jobs only | Slower incident handling | Draft CTO-owned procedures; no new business rules | Open — P2 |
| F5 | Medium | No data retention/deletion policy for evidence and addresses | No retention logic or policy doc | Indefinite PII/evidence retention | Define retention (CTO + founder sign-off on the policy itself is a business decision — flag, don't invent) | Open — P2 |
| F6 | Medium | Single environment; no staging | One linked project; all verification ran against it | Change risk lands on the only database | Provision staging; push migrations 0001–0016 | Open — **P0** |
| F7 | High | Backup/restore never drilled | No restore test in any milestone record | Unproven recoverability | One restore drill into staging; record RPO/RTO | Open — **P0** |
| F8 | Low | 7 FK columns without leading index (`actor_id`×3, `uploaded_by`, `used_by`, `confirmed_by`, `pricing_config_id`×2) | FK/index query vs `pg_index` | Future join/sort cost | Add indexes in a routine migration before volume | Open — P3 |
| F9 | Medium | Supabase Auth dashboard settings unverified (password policy, OTP expiry, CAPTCHA, MFA) | Not inspectable via CLI | Auth hardening unconfirmed | Record settings at staging setup; enable operator MFA | Open — P1 |
| F10 | Low | Network restrictions/allowlists not assessed | Not exposed via CLI | Optional hardening | Platform-level decision | Open — P3 |
| F11 | Low | GitHub branch protection unverified | Not inspectable via CLI | Unreviewed pushes possible | Enable protection on `main` | Open — P2 |
| F12 | Informational | Load testing not performed | No load-test artifacts exist | Unknown capacity | Staging load test (§7) | Open — P1 |
| F13 | Informational | `.env.local` contains stale V1-era `DATABASE_URL` + unused Paystack/Mapbox keys (categories only; values never printed) | Env key-name inventory | Confusion risk; credential sprawl | Remove stale entries when authorized | Open — P2 |
| F14 | Informational | V1-era credential material persists in untracked local files | `MBEENEXUS-MEMORY-BACKUP.md` gitignored, untracked | Residual exposure by possession | Rotate V1 credentials when authorized | Open — P2 |

**No Critical findings.**

## 13. Launch Blockers

1. **B1 = F6** — staging environment (P0)
2. **B2 = F7** — restore drill (P0)
3. **B3 = F1** — rate limiting (P0/P1: edge limits before *any* external users; targeted tuning before pilot)

## 14. Recommended Remediation Plan

- **P0 (before any external users):** staging project (F6); restore drill (F7); edge-level rate limiting on `/api/*` (F1a); remove stale V1 env entries + rotate V1 credentials (F13/F14).
- **P1 (before controlled pilot):** targeted rate limits with documented basis (F1b); job scheduler (F2); error monitoring + alerting (F3); auth settings recorded, operator MFA (F9); staging load test (F12).
- **P2 (before wider launch):** retention/deletion policy (F5); branch protection (F11); operational runbooks (F4).
- **P3 (future hardening):** advisory FK indexes (F8); network restrictions (F10).

## 15. Final Gate

**`READY WITH CONDITIONS`**

Technical architecture, security model, and data-integrity controls are production-grade and evidenced. Readiness is withheld pending the three launch blockers (staging, restore drill, rate limiting) and the P1 operational wiring — all bounded, none requiring product or business-rule change.

## 16. M7 Status

**`M7 NOT AUTHORIZED`**
