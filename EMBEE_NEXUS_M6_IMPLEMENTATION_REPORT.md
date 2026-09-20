# EMBEE NEXUS V2 — M6 Implementation Report

**Date:** 2026-09-20 · **Branch:** `main` · **Working tree:** clean

---

## 1. Baseline

| Item | Value |
|---|---|
| M5-cleared implementation baseline | `c701663` (untouched — not rewritten, not destabilized) |
| Founder reconciliation baseline | `5e17a5d` (`EMBEE_NEXUS_M6_FOUNDER_DECISION_RECONCILIATION.md`) |
| Starting state | `main`, working tree clean, migrations 0001–0012 applied remotely, 222/222 tests green |
| M6 commits | `fca9230` feat(db) · `bd9acc7` feat(web) · `629515a` docs(m6) · (this report) |

---

## 2. Implemented

**Chain of custody (M6 authorization §3–§6):**

* **Pickup OTP** — issued atomically at `payment_verified`; verified by the **assigned rider only** at `arrived_pickup`; 6-digit CSPRNG code; only the sha256 hash is stored; one-time consumption; 5-failed-attempt lock; owner reissue (invalidates the previous code, capped at 10 issues per order/kind); wrong-rider/wrong-order/wrong-state attempts rejected before any OTP logic; replay → `OTP_ALREADY_USED`; consumption + canonical transition are **one transaction** (a failed transition rolls the consumption back).
* **Delivery OTP** — same mechanism, bound to `arrived_destination`; refused once a return was initiated; the order owner may display/reissue it to relay the code to a recipient who cannot access it (the approved founder rule — no new identity-verification workflow).
* **In-transit lifecycle** — unchanged and server-authoritative; the client path can still never assert guarded facts directly (the three custody guards in `order_transition` are now real, checked inside the transition transaction).
* **Delivery completion** — only after delivery-OTP verification AND the required photo evidence; terminal states immutable on the client path.
* **Recipient confirmation** — owner-confirmed inspection attestation (`order_recipient_confirmations`) is the `delivered → completed` guard fact; double-tap is idempotent.

**Photo evidence (three-photo chain, §15 storage security):**

1. `customer_parcel` — order owner, from creation until pickup;
2. `rider_pickup` — assigned rider at `arrived_pickup`;
3. `rider_delivery` — assigned rider at `arrived_destination`.

All objects live in the **private** `order-evidence` bucket (10 MB / jpeg-png-webp limits enforced at bucket, route and RPC layers). **No client Storage policies exist** — upload and signed-URL access are entirely server-mediated after session/ownership checks; paths are `{order_id}/{kind}/{uuid}.ext` and path scoping is re-validated inside the RPC. Duplicate evidence per kind is rejected (`unique(order_id, kind)`); nothing is publicly accessible.

**Waiting flow + return journey (§7–§10, founder D05):**

* Waiting clock starts at `rider_arrived_destination` (server clock, never reset), ends at `delivered` or return initiation.
* Charge computed by the single pure function `waiting_charge_kobo` (SQL, mirrored in `lib/domain/waiting.ts`): **0** for the first 10 minutes, then **₦70,000 kobo per additional minute started** (per-minute ceiling — 10 min + 1 s ⇒ ₦700), **capped at 20 billable minutes (₦14,000)**.
* **No new lifecycle states** (§9): waiting/return ride on dedicated `orders` columns + `order_events` (`otp_codes_issued`, `otp_issued`, `photo_recorded`, `return_initiated`, `return_completed`). The order stays non-terminal (rider still committed) during the return leg, then closes via the **canonical** `arrived_destination → failed` (`delivery_failed`) transition with a return reason — the original delivery can never be marked `delivered`/`completed` after return initiation.
* Return initiation is **system-only** (`process_waiting_expiry` tick; idempotent, `FOR UPDATE SKIP LOCKED`), preserving the founder rule that the return happens at the 30-minute maximum. The Embee-borne return cost is recorded on the order/event as **ledger-pending**; no financial rules were invented (collection/settlement is M8).
* M6-window transcriptions: **D09** = 10-minute quote validity (implemented); **D10** = pricing-version preservation (already implemented; unchanged); **D04** = reassignment stays operational discretion — **no fixed minute value invented**; **auto-completion** = explicit `recipient_confirmed` only, **no timer implemented** (the M3 founder rule; a timer would be added only if the register's answer requires one); **D26** = no M6 dependency (custody OTPs are in-app only); the register's SMS provider must still be transcribed before any M9 integration — configuration placeholders documented, none provisioned.

---

## 3. Database Changes

| Migration | Content |
|---|---|
| `20260918000013_quote_validity_ten_minutes.sql` | `create_quote` re-created with `v_validity := 10` (D09); body otherwise byte-identical to 0005; grants re-asserted. Historical quotes keep their original `expires_at`. |
| `20260918000014_custody_waiting_return.sql` | New tables `order_otp_codes` (hashed OTPs, partial-unique active row, **no RLS policies and no client grants** — a readable hash would be offline-brute-forceable), `order_photos` (unique per order/kind), `order_recipient_confirmations` (unique per order). `orders` gains `waiting_started_at/ended_at`, `waiting_charge_kobo` (≥ 0), `return_initiated_at/completed_at` + backfill of in-flight `arrived_destination` orders from their arrival events. Pure `waiting_charge_kobo(started, ended)` (IMMUTABLE, integer math). RPCs: `ensure_order_otp_codes` (system), `issue_order_otp`, `verify_order_otp`, `confirm_order_receipt`, `register_order_photo`, `order_initiate_return`, `order_complete_return`, `process_waiting_expiry`. `order_transition` (3-arg client path) re-created with **real custody guards** + waiting-clock maintenance; `payment_complete_verified` re-created to provision custody OTPs **atomically with payment verification**. Private `order-evidence` Storage bucket created (public=false, size/MIME limits). RLS: force-enabled on all new tables; participants/operator read on photos + confirmations; **nothing** on OTP codes. |

No applied migration was modified; no CASCADE; no resets; no destructive operations; all changes reproducible from migrations. Migrations 0001–0012 untouched.

---

## 4. API/RPC Changes

| Surface | Actor | Purpose |
|---|---|---|
| `POST /api/orders/[orderId]/otp/issue` | customer owner | Display/reissue a custody code — plaintext returned **once**, to the owner only |
| `POST /api/orders/[orderId]/otp/verify` | assigned rider | One-time OTP verification → canonical transition (replay-proof) |
| `POST /api/orders/[orderId]/confirm-receipt` | customer owner | Recipient/owner inspection confirmation → `completed` |
| `POST /api/orders/[orderId]/photos` | owner / assigned rider | Multipart upload → private bucket → RPC-registered metadata |
| `GET /api/orders/[orderId]/photos?kind=` | participants/operator | Short-lived (5-min) signed URL after RLS-bound authorization |
| `POST /api/jobs/waiting-tick` | jobs token / operator | 30-minute waiting maximum → return initiation (idempotent tick) |

New shared schemas: `custody-schemas.ts` (zod, re-validated server-side). New service boundary: `lib/services/custody-service.ts` (cookie client for caller-attributed RPCs; service role only for storage I/O and the tick). No changes to any M4/M5 API contract; `orderTransitionSchema` remains unchanged (OTP/recipient triggers stay non-client-sendable).

---

## 5. Security

* **Authentication/authorization:** every RPC re-derives the actor from `auth.uid()` + database-owned roles; ownership/assignment enforced per call; `order_transition` re-checks actors under the row lock.
* **RLS:** force-enabled everywhere; OTP codes have **no policies and no grants** (deliberate — hash brute-force defense); photos/confirmations participant+operator read only; no client write grants on any table.
* **Storage:** private bucket; no client policies; server-mediated upload/signed-URL; bucket-level size/MIME limits mirrored in route and RPC; path scoping re-validated server-side.
* **OTP:** CSPRNG-backed 6-digit codes (40 CSPRNG bits, ≈1e-6 mapping bias, documented); sha256 at rest (core `sha256()`, no extension dependency); one-time use; expiry safety-net (7 days) behind the operative state gates; 5-attempt lock; reissue cap; codes never logged (only failure **classes** are logged); plaintext exists only in the single issue response to the owner.
* **Replay/idempotency/races:** OTP row lock + order row lock serialize concurrent submissions; consumption and transition commit atomically; return-vs-delivery serialized by the order lock (loser rejected by state/return-flag checks); return tick `SKIP LOCKED` + idempotent; duplicate photos rejected by constraint; recipient confirmation idempotent on double-tap while remaining immutable thereafter.
* **No client trust:** clients never supply state, prices, identity, or authorization; `search_path=''` on all SECURITY DEFINER functions; input bounds enforced in SQL (lengths, enums, sizes).

---

## 6. Waiting Flow — explicit confirmation

**10 minutes free → ₦700 per additional minute → 30-minute cap → return to the original pickup customer → Embee bears the return cost.**

Implemented exactly as stated: per-minute (NOT per-10-minute-block), per-minute-started ceiling (§8 boundary matrix unit-tested: 600 s ⇒ 0; 601 s ⇒ ₦700; 1,200 s ⇒ ₦7,000; 1,800 s ⇒ capped ₦14,000; beyond ⇒ clamped), integer kobo only, deterministic and documented (migration 0014 header + `lib/domain/waiting.ts`).

## 7. Quote Validity — explicit confirmation

**10 minutes (D09).** Confirmed quotes retain the pricing-rule version that produced them (D10 — immutable snapshot, unchanged from M3).

---

## 8. Tests

| Check | Result |
|---|---|
| Total tests | **255 passed** (shared 30 + web 225); M5 baseline 222 → **+33 M6 tests**, 0 regressions |
| M6 new suites | `waiting.test.ts` (19 — full D05 boundary matrix), `custody.test.ts` (13 — OTP/photo gates, evidence requirements, path scoping), `quote.test.ts` (+1 — D09 window) |
| Regression coverage | All M0–M5 suites re-run and green (state machine, pricing, coverage, dispatch, payment, providers, middleware, health) |
| typecheck / lint / build | all green (`pnpm -r` on Node ≥ 20; build verified with the repo-root `.env.local` sourced — see Known Limitations) |
| Database verification | `docs/milestones/M6-DATABASE-VERIFICATION.sql` — self-contained hosted-engine matrix (schema sanity, pure charge boundaries, D09 window, OTP security matrix, evidence gating, replay, waiting-max return, RLS/privilege matrix). **Pending the authorized push** — see below |

---

## 9. Known Limitations

> **ADDENDUM 2026-09-20 (hosted gate):** migrations 0013–0014 (plus fix-migrations
> 0015–0016) have since been applied to the hosted engine and the full verification
> matrix PASSED — see `EMBEE_NEXUS_M6_HOSTED_VERIFICATION_REPORT.md`. During that
> gate, verification exposed that the 0014 OTP attempt counter could never persist
> (raise-aborts-transaction); 0015/0016 fix it with an outcome-as-data contract.
> Limitation 1 below is resolved; the others stand.

1. ~~**Hosted-engine application pending authorized push.**~~ **RESOLVED** — applied and verified on the hosted engine (see the hosted verification report).
2. **Waiting-fee collection is not implemented** — the charge is computed and recorded on the order (authoritative), but collection/split/settlement are M8 ledger concerns; the waiting-fee rider/platform split is not specified in the M6 authorization and was **not invented**.
3. **No auto-completion timer** — explicit recipient confirmation is the only `delivered → completed` path (safe default pending the register value's transcription; nothing invented).
4. **D26 SMS provider** not transcribed into configuration (register access required) — no M6 dependency exists.
5. **Operator hold does not pause the waiting clock** (documented wall-clock convention); and a pre-0014 order that was under review with `pre_hold_status='arrived_destination'` has no backfilled clock — the operator's existing `delivery_failed` authority remains the backstop.
6. **Build environment gap (pre-existing):** `next build` reads env from `apps/web`, but the repo's `.env.local` sits at the root — the build fails on env validation unless vars are exported (verified successfully with the root file sourced). No repo change was made for this; worth a one-line ops note or an `apps/web` env symlink decision at the deployment gate.
7. `next build` on this machine emits ESLint-plugin and CRLF warnings — pre-existing, cosmetic, unrelated to M6.

## 10. Deferred Work (intentionally NOT implemented)

* **M8 (ledger/payouts):** waiting-fee collection; Embee-borne return-cost ledger entry; refunds (D06 matrix); operational-cost/damage rules (D07+D08, jointly answered); payout cutoff/approval/disputes (D13–D18).
* **M9 (seller platform):** seller accounts/orders (D19), seller edit/cancel (D20/D21), suspension with the active-delivery defer rule (D23), rescheduling (D22), notifications (D25), SMS integration after the D26 transcription, seller metrics (D29/D30), Pro pricing display.
* **M10/post-MVP:** zone tooling (D11/D12), advanced scheduling (D01–D03, D04 transcription), rate limiting/load hardening (unless a security defect demands earlier action), credential rotation of the V1-era keys that remain in the local (git-ignored) `.env.local` — Paystack/Mapbox entries are stale and untracked; rotation recommended, not performed (no authorization to touch credentials).

## 11. Final Gate

**`M6 COMPLETE`**

*Founder rule fidelity:* waiting flow and quote validity exactly as authorized; no financial rules invented; no lifecycle-state redesign; M5 behavior preserved (all 222 baseline tests green); V1 untouched; working tree clean; no destructive operations; no history rewritten (one message-only amend of an unpushed commit created moments earlier). *Caveat carried openly:* the hosted-engine push + verification-matrix run is the single remaining operational step before M6 is live on the hosted database — it is prepared, scripted, and requires only the standard M5-style authorization.
