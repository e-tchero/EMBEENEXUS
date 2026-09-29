# EMBEE NEXUS — UX QUALITY STANDARDS (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Standards below are in force for the V2 web pilot. Patterns marked **mobile
milestone** are future Figma/mobile design-system requirements, deliberately
not applied to the current web pilot (founder decision, 2026-09-29).

## Responsive breakpoints

| Breakpoint | Width | Target |
|---|---|---|
| Mobile | 0–639px | Primary — delivery is mobile-first |
| Tablet | 640–1023px | Secondary |
| Desktop | 1024px+ | Operator console, comfortable reading |

## In force (web pilot)

- **Touch targets ≥ 44×44px** (`min-h-11`) on all primary/secondary interactive
  controls across customer, rider, and operator surfaces.
- **WCAG 2.1 AA contrast:** 4.5:1 normal text, 3:1 large text — verified per
  pairing in both color schemes; AA derivatives are engineering-frozen values,
  never new brand colors.
- **Focus visibility** on every interactive element; keyboard-reachable flows.
- **`role="alert"`** for errors, **`role="status"`** for success/progress
  regions on data surfaces.
- **Explicit loading, empty, and error states** on every data view, rendered
  from backend truth (no optimistic status invention).
- **Backend-truth copy:** status names, amounts, and timestamps come from the
  server; status vocabulary is single-sourced per role.
- **Forms:** labels above inputs, inline errors below fields, disabled submit
  while processing, no placeholder-as-label.
- **Errors:** what happened + next action; no stack traces or raw provider
  errors.
- **Destructive actions** require explicit confirmation (typed for operator
  cancel).
- **Motion:** none beyond state transitions; no decorative animation.
- **Copy:** whole-naira `₦`, distances in km, no internal jargon in customer
  copy, no em dashes in user-facing prose.

## Mobile milestone (deferred — do not apply to V2 web)

- Bottom tab-bar navigation (customer/rider thumb-zone) — V2 web uses
  role-forked single-column flows; no tab bar exists or is planned for web.
- Skeleton loaders / shimmer — web uses explicit text/region loading states;
  skeletons are future component-spec work.
- Pull-to-refresh, swipeable cards — future mobile patterns.
- Admin sidebar navigation — the V2 operator console is a dense top-nav web
  layout by design.

## Empty-state copy anchors (current)

| Context | Message direction |
|---|---|
| No orders (customer) | invite first booking |
| No active delivery (rider) | availability-first guidance |
| No offers (rider, available) | explicit "waiting for offers" state |
| Operator attention queue empty | explicit "nothing needs attention" state |

## Historical note

The V1 standards document is preserved in `archive/v1/10-UX-QUALITY-STANDARDS.md`.
