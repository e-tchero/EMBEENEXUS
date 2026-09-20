# EMBEE NEXUS V2 — M6 Founder Decision Reconciliation

**Date:** 2026-09-20 · **Gate:** M6 authorization reconciliation · **Branch:** `main` · **HEAD:** `c701663` (M5-cleared, working tree clean)

**Authority basis:** the founder has stated that all answers are contained in the approved 17-page register `EMBEE_NEXUS_Founder_Business_Decision_Register_260917_133156.pdf` plus direct founder clarifications relayed in the reconciliation prompt (D05, D07+D08, D23). That register is the business source of truth (L1). This report reconciles it against the V2 specification set and the M0–M5 implementation. The register PDF itself lives **outside** the repository; its answers are not yet transcribed in-repo (see §4 and §7).

---

## 1. Executive Status

| Item | Status |
|---|---|
| Founder decision register | **APPROVED & ANSWERED** — 17pp register (260917_133156) is L1 source of truth; D05, D07+D08, D23 explicitly clarified by the founder. Register is external to the repo; transcription into the repo is a required documentation item, **not** a founder question. |
| M5 status | **VERIFIED & CLEARED** at `c701663` (222/222 tests, typecheck, lint, build, hosted PostgreSQL 17.6 matrix, migrations 0001–0012 identical, dispatch/payment/concurrency/RLS/ledger scenarios verified). Not re-run — no concrete regression discovered during reconciliation. Working tree confirmed clean; no reset, no repair, no CASCADE, V1 untouched. |
| Reconciliation status | **COMPLETE.** Every founder decision classified A/B/C/D. No genuinely unresolved business rule found. Documentation drift found and corrected (4 files, normal commits). |
| M6 authorized to proceed | **YES — READY TO AUTHORIZE**, subject to the pre-coding prerequisites in §7 (transcription of M6-relevant register values; M6 discovery report + architecture review per repo convention). |

**Reconciliation method:** founder rule (prompt + approved register, L1) → V2 specification (`docs/architecture/ARCHITECTURE-V2.md`, ADR-0001–0006, `docs/design/CANONICAL_SOURCE_OF_TRUTH.md`, `docs/design/FOUNDER_DECISIONS.md`, `docs/design/API_CREDENTIAL_INVENTORY.md`) → implementation (`supabase/migrations` 0001–0012, `apps/web/src/lib/domain/*`, `apps/web/src/lib/services/*`, 17 API routes) → test coverage (22 test files, 222 tests at M5). V1-era material (`docs/ROADMAP.md`, `CLAUDE_PREP`, `MBEENEXUS-MEMORY-BACKUP.md`, `docs/milestones/*`) is historical reference only, already classified by `CANONICAL_SOURCE_OF_TRUTH.md`; it was inspected for drift but not treated as authority.

---

## 2. Founder Decisions Reconciled

Classification key: **A** resolved/aligned · **B** resolved, technical implementation missing (CTO item) · **C** resolved, documentation drift (corrected) · **D** genuinely unresolved (founder input required).

| ID | Decision | Founder Rule | Specification Status | Implementation Status | Test Status | Classification |
|----|----------|--------------|----------------------|-----------------------|-------------|----------------|
| D01 | Scheduled-delivery horizon | Max 7 days | Register-answered; design docs stale (said "open") | Not implemented (scheduling is post-MVP; no M6–M10 slot yet) | None | B |
| D02 | Slot capacity | 10 orders per slot per account | Register-answered; design docs stale | Not implemented (post-MVP) | None | B |
| D03 | Full-slot behavior | No overbooking; approved alternative measures | Register-answered; design docs stale | Not implemented (post-MVP) | None | B |
| D04 | Reassignment threshold | Answered in register (value not restated in prompt; must be transcribed) | No in-repo value | M5 covers per-offer expiry → rider returns to queue → next offer; any order-level reassignment cap not encoded | Domain dispatch.test.ts pins per-offer rules | B |
| D05 | Waiting charge | First 10 minutes free; then **₦700 per additional minute** (NOT per 10-min block); 30-minute max; on expiry parcel returned to original pickup customer; **Embee covers the return cost** | ADR-0003 requires configurability; CANONICAL_SOURCE_OF_TRUTH contained wrong "10-min blocks" wording — **corrected** | Not implemented; waiting flow is M6 scope | None | B |
| D06 | Cancellation/refund matrix | Founder-approved matrix in the register (not generic industry policy) | Register-answered; state machine deliberately encodes only cancel affordances, refund treatment deferred to financial axis | Cancel transitions implemented (customer through `en_route_pickup`; operator through `in_transit`); refund tiers not encoded (M8) | order-state.test.ts (21) pins cancel affordances | B |
| D07 | Operational-cost/damage responsibility | **Answered jointly with D08** — do not reopen as separate question | Register-answered; gated to M8 ledger/disputes per ARCHITECTURE-V2 | Not implemented (M8) | None | B |
| D08 | Parcel damage/refusal responsibility | Answered jointly with D07 (same ruling) | Register-answered; gated to M8 | Not implemented (M8) | None | B |
| D09 | Quote validity period | Answered in register (value must be transcribed) | Implementation uses explicit 45-min default flagged "founder-pending" (`QUOTE_VALIDITY_MINUTES = 45`; migration 0005 comment) | 45-min default live | quote.test.ts pins expiry mechanics | B |
| D10 | Pricing change vs existing quote/price | Answered in register; quotes retain pricing-rule version | Aligned: immutable quote/order snapshots (ADR-0003) | Snapshot enforced in migrations 0004/0005 | pricing.test.ts (24), quote.test.ts | B (verify D09/D10 values against 45-min default) |
| D11 | Coverage authority | Answered in register | Zones are operator-controlled operational data | 17-area Zone A seeded (migration 0004); zone-edit tooling is M10 admin scope | coverage.test.ts | B (tooling M10) |
| D12 | Coverage change vs existing orders | Answered in register | Aligned: quotes/orders snapshot coverage result at creation | Snapshot fields on quotes/orders | quote.test.ts | B (tooling M10) |
| D13 | Payout cutoff | Answered in register | ADR-0005 reserves daily payout batches with decision-dependent mechanics | Not implemented (M8) | None | B |
| D14 | Payout approval | Answered in register | ADR-0005 reserved | Not implemented (M8) | None | B |
| D15 | Failed payout handling | Answered in register | ADR-0005 reserved | Not implemented (M8) | None | B |
| D16 | Earnings disputes | Answered in register | Ledger append-only; disputes via contra-entries | Ledger not yet implemented (M8) | None | B |
| D17 | Refund approval authority | Answered in register | ADR-0005: refunds post as contra-entries with approval metadata | Not implemented (M8) | None | B |
| D18 | Manual refunds | Answered in register | ADR-0005 reserved | Not implemented (M8) | None | B |
| D19 | Seller staff accounts | Answered in register (MVP rec: single login) | Seller spec frozen for M9 | Seller role exists in profiles enum only; no seller platform (M9) | None | B |
| D20 | Seller editing after payment | Answered in register | Seller spec frozen for M9 | Not implemented (M9) | None | B |
| D21 | Seller cancellation | Answered in register | Seller spec frozen for M9 | Not implemented (M9) | None | B |
| D22 | Seller rescheduling | Answered in register | Seller spec frozen for M9 | Not implemented (M9) | None | B |
| D23 | Seller suspension | **No suspension while an active delivery is taking place**; active delivery continues; suspension may take effect once no active deliveries remain; prevents new seller activity without killing the active delivery | Register-answered; not yet spec'd (M9) | Not implemented (M9) | None | B |
| D24 | Dual identity (customer+seller) | Answered in register | Not yet spec'd (M9) | Not implemented (M9) | None | B |
| D25 | Extra notifications | Answered in register | Notification channels reserved (SMS + in-app MVP) | Notifications table/jobs reserved; no service (M8/M9) | None | B |
| D26 | SMS provider + SMS cost ownership + sender ID | Answered in register (per founder, register answers all) | Credential inventory still said "FOUNDER DECISION REQUIRED" — **corrected** | No SMS integration; provider choice to be transcribed from register; CTO candidate-gateway assessment (Seller spec §12) is the technical step | None | B |
| D27 | Seller issue reporting | Answered in register | Seller spec frozen for M9 | Not implemented (M9) | None | B |
| D28 | Contact exposure | Answered in register; workflow doc permits active-delivery contact, masking future | Workflow mapping documented | Not implemented (M6/M9 UI gating) | None | B |
| D29 | Active-seller definition | Answered in register | Not yet spec'd (M9) | Not implemented (M9) | None | B |
| D30 | Suspension financial treatment | Answered in register (pairs with D23) | Not yet spec'd (M9) | Not implemented (M9) | None | B |
| — | Nexus Seller Pro price | Value fixed by register; do not invent | Spec says configurable, not hard-coded | Not implemented (M9 plans screen) | None | B |
| — | Auto-completion policy (`delivered` → `completed` without explicit confirmation) | Answered in register (value must be transcribed) | M3 founder decision: explicit `recipient_confirmed`; no timer exists | Explicit confirmation only | order-state.test.ts | B (M6-relevant) |
| — | VAT / tax stance | No VAT line in customer price | ADR-0003 drops VAT | No VAT anywhere in pricing engine or migrations | pricing.test.ts | A |
| — | Pricing bands | 0–5 km ₦2,200; >5–10 ₦2,600; >10–15 ₦3,000; >15–25 ₦3,600; >25–35 ₦4,300; actual road distance; 35 km max; no hidden fees | ADR-0003 exact | Migration 0004 seed + `pricing.ts` exact (kobo, (min,max] semantics) | pricing.test.ts (24) | A |
| — | Rider economics | 70% rider / 30% Embee, payable after successful delivery, daily payout | ADR-0003/0005; ARCHITECTURE-V2 | Split enforced arithmetically + DB constraint `pricing_bands_split_70_30`; ledger/payout execution is M8 | pricing.test.ts; M5 ledger scenarios | A (split) / B (payout execution M8) |
| — | Dispatch model | Independent motorcycle riders; manual availability; longest-available eligible rider first; one offer at a time; 20-second TTL; declined/expired returns rider to queue | ADR-0004 exact | Migrations 0007–0012 + `dispatch.ts`: TTL constant, `available_since asc` ordering, partial unique indexes (one active offer per order and per rider), SECURITY DEFINER RPCs | dispatch.test.ts; M5 concurrency scenarios | A |
| — | Payment rules | Flutterwave primary; no cash; pay before confirmation; backend verification authoritative; frontend success not authoritative; no dispatch before verified payment; failed payment = no confirmed delivery; under-review holds delivery; gateway fees paid by Embee | ADR-0002 exact | Migrations 0006/0008/0009 + `payment.ts` + Flutterwave adapter + webhook service: verify-by-reference, amount/currency/status cross-check, idempotent `webhook_events`, `awaiting_payment → payment_verified` only via canonical transition; under-review = operator hold | payment.test.ts (21), payment-webhook.test.ts, flutterwave.test.ts; M5 payment scenarios | A |
| — | Coverage Zone A | 16 named areas (17 zone rows incl. Wuse/Wuse 2) | CANONICAL confirms list | Migration 0004 seeds exactly 17 zone polygons | coverage.test.ts | A |
| — | Delivery verification chain | Customer parcel photo; rider pickup photo; rider delivery photo; pickup OTP; delivery OTP; recipient inspection before final confirmation; sender may provide delivery OTP where recipient cannot; no unauthorized handover | State machine guards (`pickupOtpVerified`, `deliveryOtpVerified`, `recipientConfirmed`) + workflow mapping documented | Guards exist but are intentionally unreachable until M6 implements OTP RPCs, photo capture, Storage, recipient confirmation | order-state.test.ts (guards) | B — **this is M6 scope itself** |
| — | Quote lifecycle | Server-computed, immutable, consumed at most once; expiry server-enforced | ARCHITECTURE-V2 §5a | `create_quote` / `create_order_from_quote` SECURITY DEFINER RPCs; consumption in same transaction | quote.test.ts; M5 scenarios | A |

**Totals:** A = 6 · B = 34 · C = 0 (all drift corrected at document level, see §4) · D = 0.

---

## 3. Confirmed Corrections

Recorded verbatim so no future phase can misread them again:

### D05 — Waiting charge
> `₦700 per additional minute after the first 10 free minutes (0–10 min = free; 10–30 min = ₦700/minute); 30-minute operational maximum; on expiry the parcel is returned to the original pickup customer and Embee covers the return cost.`

NOT ₦700 per 10-minute block. The in-repo "10-min blocks" wording (CANONICAL_SOURCE_OF_TRUTH §5) was wrong and has been corrected.

### D07 + D08
> `Answered together in D08; do not reopen D07 as a separate founder question.`

Operational-cost/damage responsibility is interpreted jointly with the D08 parcel-damage/refusal rule exactly as established in the register. Implementation is an M8 ledger/dispute item.

### D23 — Seller suspension
> `A seller cannot be suspended while an active delivery is taking place. The active delivery continues normally; suspension may take effect once there are no active deliveries. Suspension prevents new seller activity while allowing an already-active delivery to complete.`

RESOLVED. Do not ask the founder about D23 again.

---

## 4. Documentation Drift

Drift found and corrected by normal commits in this reconciliation pass:

1. **`docs/design/FOUNDER_DECISIONS.md`** — stated "All D01–D30 decision fields … are blank — none have founder answers yet." Superseded by the approved answered register; header updated, D05/D07+D08/D23 rows corrected, scheduling rows updated with founder-confirmed values, remaining register-sourced values marked "transcribe from register."
2. **`docs/design/CANONICAL_SOURCE_OF_TRUTH.md`** — §1 register row claimed all decisions unanswered; §5 recorded waiting as "10-min blocks" (contradicts the founder's explicit per-minute rule). Both corrected.
3. **`docs/architecture/ARCHITECTURE-V2.md`** — §7 closing line "Refund/waiting/seller-edit flows gated on P0 decisions (D05–D08, D17, D20, D21)" is stale: those decisions now exist. Corrected to record that the flows are unblocked and remain to be built in their scheduled milestones (waiting D05 → M6; refunds/cost D06–D08, D17, D18 → M8; seller-edit D20/D21 → M9).
4. **`docs/design/API_CREDENTIAL_INVENTORY.md`** — SMS row said "FOUNDER DECISION REQUIRED (provider + D26)". Corrected: D26 answered in the approved register; provider/cost values to be transcribed before SMS integration; CTO candidate-gateway assessment (Seller spec §12) is the technical step.

Drift inspected and intentionally **not** corrected (already classified historical by CANONICAL_SOURCE_OF_TRUTH; correcting would be churn): `docs/ROADMAP.md` (V1, Paystack/Stadia-era, stale HEAD), `CLAUDE_PREP/00–14` (V1 baseline), `MBEENEXUS-MEMORY-BACKUP.md` (V1, untracked), `docs/milestones/*` (V1 reports), root `ARCHITECTURE.md` (V1 blueprint, superseded by ARCHITECTURE-V2 per its own header).

Code-comment drift left for M6 (code untouched by this gate): `QUOTE_VALIDITY_MINUTES = 45` "founder-pending" comment in `apps/web/src/lib/domain/quote.ts` and the matching migration 0005 comment — to be updated when D09/D10 values are transcribed.

Minor gap noted: no root `README.md` exists. Optional low-priority documentation item, not M6-blocking.

---

## 5. Technical Implementation Gaps

Business-resolved items requiring CTO implementation (rule → impact). None block M6 authorization except item 1, which **is** M6.

### 5.1 M6 scope — chain of custody + waiting flow (this milestone)
* **Rule:** OTP chain (pickup + delivery OTP; sender may provide delivery OTP), three photos (customer parcel, rider pickup, rider delivery) in private Supabase Storage, recipient inspection with explicit `recipient_confirmed`, no unauthorized handover. Waiting per D05: free 10 min from rider arrival at pickup, then ₦700/additional minute (integer kobo: 70,000 kobo/min), hard stop at 30 min, then return to original pickup customer with Embee bearing the return cost.
* **Technical impact:** turn the existing `pickupOtpVerified` / `deliveryOtpVerified` / `recipientConfirmed` guards from unreachable facts into server-verified RPC-backed facts; add waiting timeline as order events/metadata (per CANONICAL_SOURCE_OF_TRUTH §4, waiting/returning/returned are **not** new states — event-sourced per existing design; a state-machine change would require new founder authorization and is not recommended); waiting charge accrual record + supplementary charge posting.
* **Affected modules:** `lib/domain/order-state.ts` (facts already defined), new `lib/domain/chain-of-custody.ts` + `lib/domain/waiting.ts` (pure, unit-tested), new services, new API routes, M6 migration(s) via `supabase/migrations` only.
* **Database impact:** OTP issuance/verification + proof-of-delivery photo tables/RPCs (SECURITY DEFINER, locked `search_path`), storage bucket policies, waiting-charge accrual columns/events; append-only; no destructive migration.
* **API impact:** rider OTP/photo submission, customer photo upload, recipient confirmation, tracking-visible status mapping.
* **UI impact:** rider custody screens, customer photo/confirmation screens, waiting timer + charge copy (₦700/min wording), return notice.
* **Tests required:** domain unit tests for waiting accrual (per-minute, cap, free window, boundary at exactly 10/30 min), OTP fact gating on transitions, recipient-confirmation gating; DB-level RLS/RPC tests mirroring M5 discipline.
* **D05 collection mechanics (CTO decision, not a founder question):** simplest consistent approach — waiting fee accrued on the order's financial record and settled via a supplementary Flutterwave charge to the original customer; return leg posted in the ledger as an Embee-borne cost per ADR-0005. Confirm exact approach in M6 discovery.

### 5.2 Quote validity reconciliation (D09/D10)
* **Rule:** register-approved validity period. **Impact:** if the register value ≠ 45 min, change `QUOTE_VALIDITY_MINUTES` + migration 0005 constant in the M6 window (single constant + test update; no schema change). **Tests:** quote expiry tests.

### 5.3 Auto-completion policy (M6-relevant transcription)
* **Rule:** register answers whether `delivered` may auto-become `completed` (e.g., unresponsive recipient). **Impact:** current machine requires explicit confirmation only. If the register specifies a timer-based fallback, implement as background job in M6; otherwise no change.

### 5.4 D04 reassignment threshold
* **Rule:** register value for when an order stops re-offering riders (escalation to operator). **Impact:** `dispatch_expire_due`/`offer_next` loop may need an order-level cap. Implement when transcribed; not M6-blocking (per-offer rules already founder-aligned).

### 5.5 M8 — financial axis (D06, D07+D08, D13–D18, payout execution)
* **Rule:** cancellation/refund matrix; operational-cost/damage rulings; payout cutoff/approval/failed-handling/disputes; daily payouts; 70/30 ledger posting.
* **Impact:** immutable ledger subsystem (ADR-0005), refund contra-entries with approval metadata, payout batches. **Affected:** new domain modules + services + M8 migrations + operator APIs/UI. **Tests:** transactional ledger/payout/refund suites before launch (ADR-0005 consequence).

### 5.6 M9 — seller platform (D19–D30, Pro price, seller SMS/tracking link)
* **Rule:** dedicated seller accounts, instant signup, 3-delivery session cap, permanent public tracking link, automatic recipient SMS on confirmation, Standard/Pro plans (Pro = 5 free deliveries/month + 10%), **D23 suspension rule (no suspension during active delivery — defer suspension effect until zero active deliveries)**, remaining register-sourced seller rulings.
* **Impact:** seller tables/RPCs/UI, public tracking surface, SMS integration (D26 provider transcribed from register). D23 implementation note: simplest compliant design = suspension flag checked at seller-activity entry points (new orders, new sessions) and ignored by in-flight delivery transitions.

### 5.7 M10 / post-MVP
* **Scheduling (D01–D03):** 7-day horizon, 2-hour windows, 10 orders/slot/account, no overbooking — no milestone slot exists yet; CTO roadmap item (post-MVP per design docs).
* **Operator zone tooling (D11/D12):** M10 admin surface over existing zone data.
* **Contact exposure (D28):** active-delivery contact per workflow; masking future.

---

## 6. Genuine Founder Clarifications

**NONE.**

Every founder decision is either aligned (A), a technical implementation item (B), or corrected documentation (C). Per the founder's authority statement, the register answers all D01–D30; the only condition attached to "NONE" is transcription, not clarification: the approved register PDF is external to the repo, so its exact values for D04, D09/D10, D24, D25, D26 (SMS provider), D27, D28, D29, D30, the D06 cancellation matrix, the auto-completion policy, and the Pro price must be **transcribed from the register by the CTO** — never re-asked, never invented. If transcription ever revealed a decision genuinely absent from the register, that would be raised then; nothing currently justifies reopening the founder questionnaire.

---

## 7. M6 Gate

* **Business specification frozen:** YES. The approved register (260917_133156) + founder clarifications (D05, D07+D08, D23) + the confirmed examples in the reconciliation prompt constitute a complete, closed business specification. No open business rule blocks M6.
* **Technical specification internally consistent:** YES, after the four documentation corrections in §4 (now committed). ARCHITECTURE-V2 + ADR-0001–0006 + migrations 0001–0012 + domain modules describe one coherent system; V1-era docs are explicitly non-authoritative.
* **Implementation can begin:** YES.
* **Must happen before M6 coding begins:**
  1. Transcribe the M6-relevant register values into the repo (FOUNDER_DECISIONS.md or a committed register extract): D09/D10 quote validity, auto-completion policy, D28 contact exposure, D26 SMS provider + sender ID (or explicitly defer SMS out of the M6 core), D04 threshold. D05 values are already fully known (§3).
  2. Produce the M6 discovery report + architecture review (repo convention: every milestone starts with DISCOVERY + ARCHITECTURE-REVIEW documents).
  3. Confirm M6 scope line from ARCHITECTURE-V2 §7: chain of custody (OTP + photos + recipient confirmation) + waiting flow per D05; tracking remains M7.
  4. Keep the M5 discipline: migrations only via `supabase/migrations`, no resets, no CASCADE repairs, V1 untouched, no changes to pricing/dispatch/payment behavior.

---

## 8. Production Readiness Note (separate engineering gate)

`Founder Decision Complete` ≠ `Production Ready`. Per current Supabase production guidance, the following must be assessed as a distinct gate before launch (not before M6):

* **Security/RLS:** strong baseline — forced RLS everywhere, non-recursive SECURITY DEFINER helpers, locked `search_path`, role grants revoked from clients; must be re-verified on every new migration.
* **Supabase Security Advisor:** run against the production project and clear findings; not evidenced in-repo yet.
* **Indexes/performance:** indexes present on hot paths (availability queue, offer expiry); EXPLAIN-verify after M6–M8 data volumes.
* **Load testing:** none in V2 yet — required before launch.
* **Backups/recovery:** Supabase-managed; PITR/restore drill not evidenced — verify and document.
* **Environment separation:** confirm distinct production Supabase project vs the M5 hosted verification matrix; production secrets only in Vercel/server env.
* **Migration discipline:** good — `supabase/migrations` is the only schema path; version-controlled deployment workflow (CLI-based `db push`/CI), never Dashboard edits, per current Supabase guidance.
* **Deployment workflow:** CI exists; Vercel production deploy config/promotion flow not yet documented.
* **Rate limiting:** V1 had in-memory rate limiting; **V2 has none yet** — required before public launch.
* **Secrets hygiene:** `MBEENEXUS-MEMORY-BACKUP.md` (untracked, local) contains what look like live V1-era Supabase credentials (service role, access token, DB URL). Not in git history via this file, but the file should be removed from the working tree and any live credentials rotated. `FLUTTERWAVE_WEBHOOK_HASH` remains unconfigured (webhook route fails closed by design).
