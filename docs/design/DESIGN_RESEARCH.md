# Embee Nexus — Design Research

**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)

> Goal: extract reusable UX patterns from real products and grounded sources —
> not copy visual identities. Protected branding, proprietary layouts, and
> distinctive visual identities are explicitly not copied.

## 1. Method

- **References reviewed:** Mobbin / Refero pattern libraries (delivery,
  ride-hailing, logistics, marketplace, tracking flows), Aceternity UI
  (component-motion references), plus practitioner sources on delivery-flow
  design (NN/g, uxdesign.cc / UX Planet delivery case studies).
- **Focus:** complete flows, not screenshots — onboarding, location selection,
  quoting, payment, searching-for-rider, tracking, delivery verification,
  earnings, identity verification.
- **Extraction rule:** a pattern is adopted only with a documented reason and a
  documented risk. Anything tied to a competitor's protected branding or a
  distinctive trade-dress identity is excluded.

## 2. Visual direction evidence

- Dataset-driven baseline (ui-ux-pro-max design-system search, "logistics
  delivery marketplace"): **Minimalism/Swiss direction** — clean, spacious,
  high-contrast, data-scannable; anti-patterns flagged: static tracking
  (tracking must feel live), no map integration, AI purple/pink gradients.
- Color semantics converge on **tracking blue + delivery orange** across
  logistics products; adopted as `color.primary` / `color.accent` in
  BRANDKIT.md.
- Typography: editorial pairings (Playfair etc.) suit landing pages, not
  transactional mobile products. Adopted **Inter** with tabular numerals for
  all money/distance/ETA figures — legibility and low network cost (variable,
  self-hostable) suit Abuja network realities.

## 3. Flow pattern extraction

| Reference | Pattern | Why it works | Potential Embee Nexus application | Risks / reasons not to copy |
|---|---|---|---|---|
| Ride-hailing (Bolt/Uber-class) | Location selection = map + bottom sheet combo; search-first, map-confirm second | Preserves map context while typing; reduces mis-pins | C3/C4 location pickers (MOBILE_SCREEN_INVENTORY.md) | Don't copy proprietary map styling or multi-stop UI (out of MVP) |
| Ride-hailing | Progressive info disclosure for driver/rider matching | Reduces pre-accept anxiety without exposing PII | C7→C8, R5: limited info before accept, full after (matches founder dispatch rule) | Multi-driver parallel offers contradict founder rule: one rider at a time |
| Food delivery (Glovo-class) | Live status stepper with named states | Sets expectation at each step; reduces "where is my order" support load | C11 delivery status; names must match order-state names exactly | Don't gamify with invented intermediate states; server states are truth |
| Food delivery | Fee transparency line before payment | Trust: no hidden fees; matches founder pricing model (no hidden fees) | C5 quote card + price breakdown | Don't show rider/platform split to customers (operator-only data) |
| Delivery case studies (uxdesign.cc, UX Planet) | Proof-of-delivery photo + OTP confirmation loop | Closes trust loop for both parties; matches M6 chain-of-custody plan | C12/R7/R9 verification screens | Don't copy any app's specific OTP visual system; implement own |
| Ride-hailing | "Searching for driver" state with cancel affordance | Anxiety management during dispatch wait | C7 | Cancel-after-payment is a D06 founder decision — UI shows affordance only where state machine permits (customer cancel ends at `en_route_to_pickup`) |
| Ride-hailing | ETA with "updated HH:MM" timestamp | Stale data is worse than no data on flaky networks | ETA chip, order tracking | Never fabricate live-updating ETA client-side |
| Marketplace onboarding | Verify-identity-before-first-job | Prevents unverified activation; matches M1: verification ≠ availability | R2 verification status | Don't bury rejection reasons — M1 events carry them; show them |
| Navigation products | Nonmodal bottom sheet over map | Keeps map interactive while info is visible (NN/g: preserves context) | Map-context info across C3/C4/C9/C11 | See §4 rules — sheets fail in specific, documented ways |
| Aceternity UI (reference library) | Restrained motion for state transitions | Perceived quality on low-end devices without jank | 150–300 ms state transitions; reduced-motion fallbacks | Flashy scroll/parallax effects cost battery/data on low-end Androids — rejected |

## 4. Bottom-sheet rules (NN/g, June 2023 — directly applied)

Citable findings applied to the component contract (DESIGN_SYSTEM.md §6):

1. Bottom sheets preserve context (unlike page navigation) — hence used for
   map-context info, not for full flows.
2. **Always include a visible Close button** — swipe/grab-handle dismissal
   alone fails (swipe ambiguity, dexterity, screen readers).
3. **Support Back to dismiss** — sheets that trap Back break navigation
   expectations.
4. **Never stack bottom sheets** — stacked sheets confuse dismissal semantics.
5. **Short interactions only** — a sheet is a transient element, not a
   destination; flows that grow belong on pages.
6. Middle of screen, not bottom, is most reachable — so reachability is not
   the justification for sheet usage; context preservation is.

## 5. Anti-patterns rejected

- Client-computed prices/ETAs (contradicts server-authoritative architecture).
- Dark-pattern urgency ("only 2 slots left!") — no basis in the pricing model.
- AI purple/pink gradients, glassmorphism on data-dense screens (contrast +
  low-end device cost).
- Emoji as structural icons (platform-inconsistent, not token-addressable).
- Copying any competitor's wordmark, marker styling, or distinctive
  illustrations.

## 6. Open questions surfaced (founder, not resolved here)

- How much rider identity is visible to customers pre-assignment (ties to D28
  contact exposure)?
- Should the customer see a photo-verification badge before pickup handoff
  (M6 dependency)?
- Push-notification appetite for tracking updates (M7; provider = §10 of the
  credential inventory, FOUNDER DECISION REQUIRED).
