# Embee Nexus — Founder Decision Register

**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4); reconciled post-M3
against the external founder workspace — see `CANONICAL_SOURCE_OF_TRUTH.md`.
**Rule:** nothing here is resolved by the engineering agent. D-numbers reference
`EMBEE_NEXUS_Founder_Business_Decision_Register_FINAL.pdf` (Sep 17, 17pp, D01–D30),
which is the canonical register. **All D01–D30 decision fields in that document are
blank** — none have founder answers yet; this file mirrors that state so future
phases consume it without guessing.

## A. Confirmed still unresolved (blocking future implementation)

| Decision | Status | Blocks | Design-phase note |
|---|---|---|---|
| **D01** scheduled-horizon · **D02** slot capacity · **D03** full-slot behavior · **D04** reassignment threshold | Unresolved (register fields blank) | Scheduling feature (post-MVP) | Founder workflow doc confirms 3-h minimum notice + 2-h windows; horizon/capacity open |
| Quote validity period (**D09**) / pricing changes after quote (**D10**) | **Implementation default 45 min in M3** — needs ratification or a number (CTO rec. was 15 min) | M4 order flow copy ("valid until HH:MM") | Surfaced in quote card design |
| **D11** coverage authority / **D12** coverage change vs existing orders | Unresolved | Operator zone tooling | CTO recs recorded in register; not founder-approved |
| **D13** payout cutoff / **D14** payout approval / **D15** failed payout / **D16** earnings disputes | Unresolved | M8 ledger/payouts | Daily cadence confirmed; mechanics open |
| Waiting charge (**D05**) | Unresolved — amount must not be invented | M6 waiting flow; any customer-facing waiting copy | Screens show waiting state without a charge figure |
| Cancellation/refund schedule (**D06**) | Unresolved | Customer cancel affordance after payment; rider-flow cancel copy | UI shows cancel only where the M3 state machine permits |
| Refund approval authority (**D17**) / manual refunds (**D18**) | Unresolved | Operator refund tooling (admin surface) | Operator screens list a "refund tools — pending policy" placeholder |
| Operational-cost deduction (**D07**) / damage-refund responsibility (**D08**) | Unresolved | M8 ledger + dispute flows | — |
| **D19** seller staff accounts | Unresolved (MVP rec: single login) | M9 seller model | — |
| Seller editing after payment (**D20**) / seller cancellation (**D21**) | Unresolved | M9 seller screens | Seller entry points only; no flows designed |
| **D22** seller rescheduling / **D23** seller suspension / **D24** dual identity / **D25** extra notifications | Unresolved | M9+ | — |
| Pro seller pricing | Unresolved (do not invent; spec says "build configurable, not hard-coded") | M9 plans screen | Plan card shows Standard only until priced |
| SMS provider + SMS cost ownership (**D26**) + sender ID | **FOUNDER DECISION REQUIRED** — provider deliberately not chosen; Seller spec §12 lists candidate gateways for assessment | OTP/SMS notifications (M5/M6+); seller tracking-link SMS; credential inventory | Credential placeholder documented, nothing provisioned |
| **D27** seller issue reporting | Unresolved | M9 | — |
| Contact exposure (**D28**) | Unresolved | Rider/customer contact reveal in UI | Rider card has gated contact slot; workflow doc §19 permits active-delivery contact, masking is future |
| **D29** active-seller definition / **D30** suspension financial treatment | Unresolved (P2) | M9 seller metrics | — |
| VAT / tax stance | Not authorized — pricing model has no VAT line | Any receipt/price-breakdown design | Breakdown shows delivery fee only |
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
