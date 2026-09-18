# Embee Nexus — Founder Decision Register (Design Phase)

**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)
**Rule:** nothing here is resolved by the engineering agent. This register
consolidates decisions discovered/confirmed during the design phase so future
phases consume them without guessing. D-numbers reference the founder decision
list from the V2 charter.

## A. Confirmed still unresolved (blocking future implementation)

| Decision | Status | Blocks | Design-phase note |
|---|---|---|---|
| Quote validity period (D09/D10) | **Implementation default 45 min in M3** — needs ratification or a number | M4 order flow copy ("valid until HH:MM") | Surfaced in quote card design |
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

## B. Brand decisions raised by this phase (new, from BRANDKIT.md)

1. Ratify written form "Embee Nexus" and wordmark direction.
2. Ratify or replace the proposed logo-mark direction and app-icon concept.
3. Ratify the proposed color system (blue primary / orange accent) and Inter
   typography — or supply founder brand material if any exists outside the repo.
4. Ratify voice/copy conventions (§5 of BRANDKIT.md).

## C. Ratified-by-use (no action needed unless the founder objects)

- Order-state names as customer-facing copy vocabulary (frozen to the M3 machine).
- Verification states exactly as M1 implements them.
- "No hidden fees" price presentation (founder pricing model).

## D. Mobile technology recommendation — engineering recommendation, NOT a founder decision

See MOBILE_UX_ARCHITECTURE.md §8. Summary: **Expo / React Native** in the
existing pnpm monorepo, reusing `@embee/shared`; Next.js web remains the
operator/seller/public-tracking surface. Requires founder ratification before
any mobile implementation milestone is authorized.
