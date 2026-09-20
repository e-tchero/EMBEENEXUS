# EMBEE NEXUS V2 — M6 Hosted Database Deployment & Final Verification Report

**Date:** 2026-09-20 · **Branch:** `main` · **Working tree:** clean

---

## 1. Deployment Metadata

| Item | Value |
|---|---|
| Repository | `e-tchero/EMBEENEXUS` (`C:\EMBEENEXUS`) |
| Branch | `main` |
| Starting commit (this gate) | `b5999cb` (M6 implementation complete, tree clean) |
| M5-cleared baseline | `c701663` (untouched) |
| Founder reconciliation baseline | `5e17a5d` |
| M6 implementation commits | `fca9230`, `bd9acc7`, `629515a`, `b5999cb` |
| This gate's commit | `5521276` (OTP attempt persistence + matrix corrections) |
| Target environment | Supabase project linked via CLI, project ref `iqayrbhzeuiyfuwzxtwt` (identifier only; no credentials, connection strings, or secrets exposed) |
| Tooling | supabase CLI 2.117.0 (`db push --dry-run` → `db push` → `db query --linked -f`); no `psql` binary exists on this machine |
| Completion timestamp | 2026-09-20 ~14:10 UTC |

---

## 2. Migration Results

* **Pre-flight:** branch `main`, tree clean, migrations 0013–0014 and `docs/milestones/M6-DATABASE-VERIFICATION.sql` present; linked project ref confirmed.
* **Safety inspection:** 0013–0014 contain **zero** top-level `DROP`/`TRUNCATE`/`CASCADE`/`DELETE` statements (all `CREATE` / `ALTER ADD` / `CREATE OR REPLACE`); ordering correct; contents match the implementation report; no unrelated changes.
* **Dry run:** `Would push these migrations: 20260918000013, 20260918000014` — exactly the expected set, target = linked project. No drift.
* **Applied:** 0013 + 0014 via `supabase db push` (interactive confirm), then **0015** and **0016** (defect fixes discovered by the verification itself — see §4).
* **History:** `supabase migration list` shows **0001–0016 identical local/remote**, no drift, no manual edits, no history rewrites, no resets. All data preserved.

| Migration | Content |
|---|---|
| `0013` quote validity | D09: `create_quote` validity 45 → 10 minutes |
| `0014` custody/waiting/return | custody tables + RPCs, private bucket, waiting/return, real transition guards |
| `0015` OTP attempt persistence | outcome-as-data contract (fixes the ineffective attempt lock found by verification) |
| `0016` column qualification | fixes 42702 ambiguity in the attempts counter (RETURNS TABLE name collision) |

---

## 3. Hosted Verification Results

Executed: `supabase db query --linked -f <matrix>` (stop-on-error), final output:
**`ALL M6 DATABASE VERIFICATION SECTIONS PASSED`**

| Area | Result | Evidence |
|---|---|---|
| OTP/custody | **PASS** | Payment verification provisions exactly 2 OTPs (idempotent); rider/non-owner issuance rejected `FORBIDDEN`; reissue leaves exactly one live code; wrong-state verify → `INVALID_ORDER_STATE`; correct pickup verify → `picked_up` with `otp_status='verified'` |
| Photo evidence | **PASS** | Pickup verify without evidence → `EVIDENCE_MISSING` (nothing consumed); duplicate photo → `PHOTO_EXISTS`; cross-order path → `INVALID_INPUT`; rider/customer evidence split enforced; private `order-evidence` bucket exists (`public=false`) |
| Recipient confirmation | **PASS** | Owner confirmation → `completed`; double-tap idempotent; terminal state immutable on the client path |
| Waiting charges | **PASS** | Pure boundaries on the hosted engine: 540 s/600 s → 0; 601 s → 70 000; 1 200 s → 700 000 (per-minute, NOT per-block); 1 799 s/1 800 s/7 200 s → capped 1 400 000; delivered@11 min records 70 000 kobo |
| Return workflow | **PASS** | Tick at ≥30 min initiates return with capped charge; order stays non-terminal (`arrived_destination`) during the return; delivery OTP issue/verify refused during return; `order_complete_return` closes via canonical `delivery_failed` → `failed`; no `delivered` event ever recorded; idempotent tick |
| Quote validity | **PASS** | Fresh quote `expires_at ≈ now()+10 min` (D09); price from the active band; D10 pricing-version snapshot untouched |
| RLS/security | **PASS** | `authenticated` denied SELECT on `order_otp_codes` (no grants/policies by design); direct INSERT into `order_photos` denied; participant-only metadata reads; M6 audit events participant-readable |
| Replay protection | **PASS** | Replay after verification → `INVALID_ORDER_STATE` (state gate) with state unchanged; consumed-code-while-state-gate-passes → committed `already_used` no-op |
| Concurrency/idempotency | **PASS** | Row locks on order + OTP rows; tick `FOR UPDATE SKIP LOCKED`, re-run processed = 0; idempotent payment settle does not re-provision OTPs |
| Regression checks | **PASS** | 255/255 app tests (222 M5 baseline + 33 M6), typecheck/lint/build green after the service-layer change; M5 baseline commit untouched |

---

## 4. Issues

1. **M6 implementation defect — OTP attempt lock was ineffective (FIXED, migrations 0015 + 0016).** Migration 0014 raised `OTP_INVALID` after incrementing `attempts`; a raised error aborts the transaction, so the counter never persisted and the 5-attempt lock could never engage. 0015 changes OTP-verification **outcomes** to returned data (`otp_status`: verified / invalid / expired / locked / already_used / not_issued) so the counter commits (the 5th wrong attempt returns `locked` at attempts = 5); authorization, state-binding and evidence pre-checks remain exceptions. 0016 fixes SQLSTATE 42702 (`RETURNS TABLE`'s implicit `attempts` variable colliding with the column). Service layer and tests updated; applied and verified on the hosted engine. Both migrations are additive fix-migrations in the established 0008–0012 pattern (plain `DROP FUNCTION` only where the return type changed — no CASCADE — with grants re-issued).
2. **Verification-script corrections (test-only, no product code affected).** `to_regprocedure` for signature assertions (wrong tool caused one false "missing function" alarm); `set_config` GUC hygiene (lingering `request.jwt.claims` caused two false FORBIDDEN alarms); admin-context OTP-table inspections; a **deterministic rider assignment** in the shared helper (the hosted project carries pre-existing M5-era riders in `rider_availability`, so live `dispatch_offer_next` results are non-deterministic — M5's flow was verified in M5 and is untouched; the matrix now seeds the resulting precondition); replay probe split into state-gate + `already_used` branch; one over-strict return-reason assertion loosened (rider note precedence is correct behavior).
3. **Environment note (pre-existing, not an M6 defect):** the project's `auth.users` has a new-user trigger that auto-creates profiles with the default role; the matrix now forces the fixture roles explicitly. `.env.local`'s `DATABASE_URL` does not reference the linked project (V1 leftover) — it was deliberately NOT used; verification ran through `supabase db query --linked`.

## 5. Final Gate

**`M6 HOSTED VERIFICATION CLEARED`**

Migrations 0001–0016 applied and identical across local/remote; every verification section passed on the hosted PostgreSQL engine; the one genuine implementation defect surfaced by verification was fixed via additive migrations and re-verified; the application suite (255/255), typecheck, lint, and build are green; working tree clean; no resets, no CASCADE cleanup, no history rewrites, no production data harmed.

## 6. M7 Status

**`M7 NOT AUTHORIZED`** — hosted verification is cleared, but M7 (realtime tracking) must not begin without separate founder authorization, per this gate's instructions.
