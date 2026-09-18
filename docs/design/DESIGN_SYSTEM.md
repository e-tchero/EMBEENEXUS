# Embee Nexus — Design System Contract

**Status:** PROPOSED — consumes BRANDKIT.md tokens; founder review required.
**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)

> This is the component **contract**, not an implementation. No component code
> is authorized in this phase. Every component lists the tokens it consumes
> (from BRANDKIT.md) so future implementation maps 1:1 without guessing.

## 0. Token architecture

```text
BRANDKIT.md (semantic tokens)
   ↓ consumed by
Components (this document)
   ↓ implemented as
Platform themes (Tailwind theme / mobile theme) — single source per platform
```

Rule: components reference semantic tokens only; raw hex/px values are
lint-grade violations, not style choices.

## 1. Navigation

| Component | Contract | Tokens |
|---|---|---|
| Bottom navigation | 3–5 destinations, top-anchored labels, active = primary + icon fill; thumb-zone; safe-area padded | `radius`, `color.primary`, `color.text-muted`, safe-area insets |
| Top app bar | Title (heading), optional back affordance, max one action; collapses on scroll | `type.heading`, `color.surface`, `color.border` |
| Back navigation | System back always dismisses sheets first, then returns; never traps user | — |
| Contextual navigation | Inline links inside content; primary color, underlined on focus | `color.primary` |

## 2. Inputs

| Component | Contract | Tokens |
|---|---|---|
| Address search | Debounced suggestions via server geocoding; recent locations when offline; **never** computes distance/price client-side | `radius.sm`, `color.border`, `color.text` |
| Location picker | Full-screen map + nonmodal bottom sheet (confirmed addresses list); drag-pin to refine; reverse-geocoded label shown before confirm | map tokens, `radius.sheet`, `elevation.2` |
| Text input | 56 px min height, label always visible (never placeholder-as-label), inline error below field, `aria-describedby` | `radius.sm`, `color.error` |
| Phone input | +234 default, national format hint, paste-tolerant | `radius.sm` |
| OTP input | 6 boxes, paste support, auto-advance, auto-submit on completion; paste is never blocked (accessibility) | `type.financial`, `radius.sm` |
| Parcel details | Size presets (motorcycle-sized only), description, photo attach placeholder (photo capture is M6 scope) | `radius.md` |

## 3. Actions

| Component | Contract | Tokens |
|---|---|---|
| Primary button | 56 px height (min touch 44×44), full-width on mobile, 150–300 ms state transition, loading spinner replaces label in place (no layout shift) | `color.primary`, `color.on-primary`, `radius.md` |
| Secondary button | Outline on surface | `color.secondary`, `color.border` |
| Destructive action | Error color + confirmation dialog stating consequence; never inline-only | `color.error`, modal |
| Loading button | Disabled + spinner; double-tap safe (server idempotency is the backstop — M3 RPCs) | — |
| Disabled action | 40% opacity + explanatory text where the reason is non-obvious | `color.disabled` |

## 4. Commerce

| Component | Contract | Tokens |
|---|---|---|
| Quote card | Pickup → destination lines, distance (server), price (server snapshot); "prices valid until HH:MM" from quote expiry; tap → breakdown | `radius.lg`, `type.financial` |
| Price breakdown | Delivery fee only (no hidden fees by pricing model); shows rider/platform split **only in operator surfaces**, never customer | `type.financial`, tabular nums |
| Payment state | Awaiting / verified / failed — driven by server status; client never marks paid | status tokens |
| Order summary | Status, timeline, endpoints, rider (once assigned), financial snapshot as persisted | `type.body`, `radius.lg` |
| Seller order list | Batch-session aware; max 3 deliveries/session rule visible; future-phase content | `type.subheading` |

## 5. Delivery

| Component | Contract | Tokens |
|---|---|---|
| Rider card | Name, vehicle, verification badge (state from server), contact gated by D28 | `radius.lg`, `color.success` |
| Delivery status | Stepper of customer-visible states; names exactly match order-state names | status tokens |
| Progress indicator | Current state highlighted; completed collapsed; never invents states | `color.primary` |
| ETA | Server-provided estimate + "updated HH:MM" timestamp; never computed client-side | `type.financial` |
| Map overlay | Route polyline, markers, ETA chip; overlays never block map gestures | map tokens |
| Pickup / destination / OTP / proof states | Each state renders its server fact (verified/unverified), never optimistic | status tokens |

## 6. Feedback

NN/g-grounded rules (DESIGN_RESEARCH.md §4): every sheet has a visible Close
button, back always dismisses, sheets never stack, sheets are for short
interactions only.

| Component | Contract | Tokens |
|---|---|---|
| Toast | Transient, auto-dismiss ≥ 5 s, max 1 visible | `radius.md`, `elevation.1` |
| Banner | Persistent until resolved (offline, under_review) | `color.warning` |
| Bottom sheet | Modal or nonmodal; grab handle **plus** visible close; short interactions only | `radius.sheet`, `elevation.2` |
| Modal | Destructive confirmations, blocking decisions | `radius.sheet` |
| Skeleton | Shape-matching placeholders during load | `color.border` |
| Empty state | Illustration-free (asset-free phase): icon + one sentence + primary action | `color.text-muted` |
| Error state | What happened + retry + support path; server error codes never surfaced raw | `color.error` |

## 7. Identity

| Component | Contract | Tokens |
|---|---|---|
| Verification state | `pending / under_review / approved / rejected` chip exactly matching M1 domain | status tokens |
| Profile | Minimal PII; role-aware fields | `type.body` |
| Vehicle state | Motorcycle record (plate, ownership doc status) — matches M1 `vehicles` model | status tokens |
| Rider readiness | Verification **and** availability are separate toggles (M1 rule: verification ≠ availability) | status tokens |

## 8. States every screen must define

Loading (skeleton), empty, error (retry), offline (banner + last-known data),
permission-denied (settings deep-link), no-coverage / >35 km (map rejection).
Screens missing any of these fail design review.
