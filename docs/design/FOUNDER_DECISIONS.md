# Embee Nexus — Founder Decision Register

**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4); reconciled post-M3
against the external founder workspace — see `CANONICAL_SOURCE_OF_TRUTH.md`.
**Rule:** nothing here is resolved by the engineering agent. D-numbers reference the
**approved** register `EMBEE_NEXUS_Founder_Business_Decision_Register_260917_133156.pdf`
(Sep 17, 17pp, D01–D30), which is the canonical register.

> **UPDATE 2026-09-20 (M6 reconciliation):** the founder has confirmed the register is
> **approved and answered** — the pre-answer wording below is retained for history but
> superseded. Founder clarifications now in force: **D05** = first 10 minutes free,
> then **₦700 per additional minute** (NOT per 10-minute block), 30-minute maximum,
> then the parcel is returned to the original pickup customer and Embee covers the
> return cost; **D07+D08** = answered together (do not reopen D07 separately);
> **D23** = a seller is **not** suspended while an active delivery is taking place —
> suspension applies only once no active deliveries remain. Scheduling: 7-day
> horizon, 2-hour windows, 10 orders/slot/account, no overbooking. Remaining
> register-sourced values (D04, D06 matrix, D13–D18, D24–D30, Pro price,
> SMS provider per D26, auto-completion policy) must be **transcribed from the
> approved register** — never re-asked, never invented. See
> `EMBEE_NEXUS_M6_FOUNDER_DECISION_RECONCILIATION.md`.
>
> **UPDATE 2026-09-20 (M6 implementation):** D09/D10 and D05 are now
> **implemented**, not just answered: quote validity = 10 minutes (migration
> 0013, `QUOTE_VALIDITY_MINUTES`); waiting flow = 10 min free → ₦700/additional
> minute → 30-min cap → return to the pickup customer with the Embee-borne
> return cost recorded as a ledger-pending event (migration 0014,
> `lib/domain/waiting.ts`); D04 stays operational-discretion (no fixed minute
> value invented); no auto-completion timer exists (explicit `recipient_confirmed`
> remains the only path); D26 has no M6 dependency — the SMS provider must still
> be transcribed from the register before any M9 SMS integration.

## A. Founder decisions (statuses updated 2026-09-20; see header UPDATE)

| Decision | Status | Blocks | Design-phase note |
|---|---|---|---|
| **D01** scheduled-horizon · **D02** slot capacity · **D03** full-slot behavior · **D04** reassignment threshold | ANSWERED: 7-day horizon, 2-h windows, 10 orders/slot/account, no overbooking; D04 value to transcribe from register | Scheduling feature (post-MVP) | Founder-confirmed 2026-09 |
| Quote validity period (**D09**) / pricing changes after quote (**D10**) | ANSWERED + **IMPLEMENTED (M6)**: validity = **10 minutes** (migration 0013; `QUOTE_VALIDITY_MINUTES = 10`); confirmed quotes keep their pricing-rule version (D10 snapshot, unchanged) | Quote copy ("valid until HH:MM") already driven by `expires_at` | — |
| **D11** coverage authority / **D12** coverage change vs existing orders | ANSWERED in register — transcribe | Operator zone tooling | CTO recs recorded in register; not founder-approved |
| **D13** payout cutoff / **D14** payout approval / **D15** failed payout / **D16** earnings disputes | ANSWERED in register — transcribe | M8 ledger/payouts | Daily cadence confirmed |
| Waiting charge (**D05**) | ANSWERED + **IMPLEMENTED (M6)**: first 10 min free, then ₦700 **per additional minute** (per-minute ceiling, integer kobo), 30-min max, then return to pickup customer; Embee pays return cost (recorded as ledger-pending; settlement is M8) | Migration 0014 (`waiting_charge_kobo`, return RPCs, waiting tick) + `lib/domain/waiting.ts` | — |
| Cancellation/refund schedule (**D06**) | ANSWERED: founder-approved matrix in the register — transcribe; do not substitute a generic policy | Customer cancel affordance after payment; rider-flow cancel copy | UI shows cancel only where the M3 state machine permits |
| Refund approval authority (**D17**) / manual refunds (**D18**) | ANSWERED in register — transcribe | Operator refund tooling (admin surface) | Operator screens list a "refund tools — pending policy" placeholder |
| Operational-cost deduction (**D07**) / damage-refund responsibility (**D08**) | ANSWERED jointly in D08 — do not reopen D07 separately | M8 ledger + dispute flows | — |
| **D19** seller staff accounts | ANSWERED in register — transcribe (MVP rec: single login) | M9 seller model | — |
| Seller editing after payment (**D20**) / seller cancellation (**D21**) | ANSWERED in register — transcribe | M9 seller screens | Seller entry points only; no flows designed |
| **D22** seller rescheduling / **D23** seller suspension / **D24** dual identity / **D25** extra notifications | ANSWERED; D23 founder rule: no suspension while an active delivery is taking place — suspension applies only once no active deliveries remain | M9+ | — |
| Pro seller pricing | ANSWERED: price fixed by the register (do not invent) | M9 plans screen | Plan card shows Standard only until priced |
| SMS provider + SMS cost ownership (**D26**) + sender ID | ANSWERED in register — transcribe provider/cost; CTO candidate-gateway assessment (Seller spec §12) is the technical step. **No M6 dependency**: custody OTPs are in-app only; provider transcription is required before M9 SMS integration | Seller tracking-link SMS (M9); credential inventory | Credential placeholder documented, nothing provisioned |
| **D27** seller issue reporting | ANSWERED in register — transcribe | M9 | — |
| Contact exposure (**D28**) | ANSWERED in register — transcribe | Rider/customer contact reveal in UI | Rider card has gated contact slot; workflow doc §19 permits active-delivery contact, masking is future |
| **D29** active-seller definition / **D30** suspension financial treatment | ANSWERED in register — transcribe (P2) | M9 seller metrics | — |
| VAT / tax stance | Not authorized — pricing model has no VAT line | Any receipt/price-breakdown design | Breakdown shows delivery fee only |
| — | **HISTORICAL PRE-ANSWER ROWS FOLLOW (superseded by the header UPDATE; retained for history only — never implement from these)** | — | — |
| Auto-completion policy | Unresolved | Whether `delivered` can ever auto-become `completed` (e.g., recipient unresponsive) | M3 requires explicit `recipient_confirmed`; no timer exists |
| Waiting charge (D05) | Unresolved — amount must not be invented | M6 waiting flow; any customer-facing waiting copy | Screens show waiting state without a charge figure |
| Cancellation/refund schedule (D06) | Unresolved | Customer cancel affordance after payment; rider-flow cancel copy | UI shows cancel only where the M3 state machine permits |
| Refund approval authority (D17) / manual refunds (D18) | Unresolved | Operator refund tooling (admin surface) | Operator screens list a "refund tools — pending policy" placeholder |
| Operational-cost deduction (D07) / damage-refund responsibility (D08) | Unresolved | M8 ledger + dispute flows | — |
| Seller editing after payment (D20) / seller cancellation (D21) | Unresolved | M9 seller screens | Seller entry points only; no flows designed |
| Pro seller pricing | Unresolved (do not invent) | M9 plans screen | Plan card shows Standard only until priced |
| SMS provider + SMS cost ownership (D26) | **FOUNDER DECISION REQUIRED** — provider deliberately not chosen | OTP/SMS notifications (M5/M6+); credential inventory | Credential placeholder documented, nothing provisioned |
| VAT / tax stance | Not authorized — pricing model has no VAT line | Any receipt/price-breakdown design | Breakdown shows delivery fee only |
| Auto-completion policy | Unresolved | Whether `delivered` can ever auto-become `completed` (e.g., recipient unresponsive) | M3 requires explicit `recipient_confirmed`; no timer exists |
| Contact exposure (D28) | Unresolved | Rider/customer contact reveal in UI | Rider card has gated contact slot |

## B. Brand decisions (updated by reconciliation)

Founder brand material **does exist** (Developer Brand Kit + `CLAUDE_PREP/brand/*`); the
earlier "propose a palette / Inter / blue-orange" questions are **withdrawn**. Still open:

1. Ratify written form/capitalization rules for product surfaces (source docs are
   inconsistent: "Embee Nexus", "EMBEE NEXUS", "EmbeeNexus").
2. Supply final vector artwork (SVG) + construction measurements for the E/N mark
   (brand kit itself flags this as still-to-finalize; current assets are rasters).
3. Supply favicon, app icon and wordmark-only assets.
4. Ratify clear-space and minimum-size rules.
5. Ratify voice/copy conventions (BRANDKIT.md §5) and the mobile light/dark default.

## C. Ratified-by-use (no action needed unless the founder objects)

- Order-state names as customer-facing copy vocabulary (frozen to the M3 machine).
- Verification states exactly as M1 implements them.
- "No hidden fees" price presentation (founder pricing model).

## D. Mobile technology — reconciled status

See MOBILE_UX_ARCHITECTURE.md §8. Summary: **Expo / React Native** in the
existing pnpm monorepo, reusing `@embee/shared`; Next.js web remains the
operator/seller/public-tracking surface.

Reconciliation result: this **agrees** with the founder's documented direction — the
Reconciled Engineering Handoff V2 (Sep 15) fixes "React Native + Expo" for Customer/Rider
mobile and web for admin, and the Founder Technology Decision (Sep 9) fixes mobile-first
for Customer/Rider. What remains is vendor ratification of the specific framework choice
(the Handoff predates the V2 reset and is otherwise superseded — see
CANONICAL_SOURCE_OF_TRUTH.md §1), before any mobile implementation milestone is authorized.
