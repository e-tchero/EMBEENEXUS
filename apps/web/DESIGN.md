---
version: alpha
name: Embee Nexus V2
description: Design system for the Embee Nexus motorcycle delivery platform (closed Abuja pilot). Formalizes the existing neutral, functional interface language; operator dashboard, customer journey, and rider console.
---

## Overview

Embee Nexus V2 is a mobile-first motorcycle delivery platform for Abuja. The interface is a neutral grayscale system with functional semantic color, border-first surfaces, and operational copy that mirrors the backend's canonical status vocabulary. Deliberately restrained: no gradients, glow, glassmorphism, decorative color, or icon decoration. This document ratifies the existing de-facto language as the v0.1 contract; it is not a finalized brand guide.

## Colors

The active palette is the neutral grayscale plus functional semantic colors only. Neutral Tailwind steps remain the working values; the semantic tokens below are the contract names new UI should consume. Status colors are provided for text-on-fixed-light-panels today; any status text placed on a flipping surface must use a value that passes WCAG AA in both schemes.

```yaml
colors:
  surface: "#ffffff"
  surface-muted: "#f5f5f5"
  foreground: "#171717"
  foreground-muted: "#525252"
  foreground-subtle: "#737373"
  line: "#d4d4d4"
  action: "#171717"
  action-hover: "#404040"
  action-foreground: "#ffffff"
  status-success: "#15803d"
  status-warning: "#b45309"
  status-error: "#b91c1c"
  status-info: "#1d4ed8"
```

- `surface` and `foreground` flip automatically with `prefers-color-scheme: dark` (tokens in `apps/web/src/app/globals.css`).
- `foreground-subtle` (#737373 light) fails AA on the dark surface; on flipping surfaces use `neutral-600` (#525252, passes both) until tokens are consumed directly.
- Red means error/danger, green success, amber warning/attention, blue informational. No other color meanings exist.
- No gradients, no glow, no glassmorphism, no decorative color fields.

## Themes

Dark mode follows `prefers-color-scheme` with no manual toggle. Both schemes are first-class: the dark values below are chosen centrally so text on the dark surface meets WCAG AA (normal text 4.5:1, large text 3:1). Do not add a scheme-specific class system or per-component dark overrides; adjust the tokens instead.

| Token | Dark value |
| --- | --- |
| surface | #0a0a0a |
| surface-muted | #171717 |
| foreground | #ededed |
| foreground-muted | #d4d4d4 |
| foreground-subtle | #a3a3a3 |
| line | #404040 |
| action | #ededed |
| action-hover | #d4d4d4 |
| action-foreground | #0a0a0a |
| status-success | #22c55e |
| status-warning | #fbbf24 |
| status-error | #f87171 |
| status-info | #93c5fd |

## Typography

The system sans stack is the interface typeface. A custom typeface is an unresolved owner decision and must not be introduced.

```yaml
typography:
  sans:
    fontFamily: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif
  mono:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
```

- Hierarchy by size and weight only: page titles `text-xl` to `text-3xl font-semibold tracking-tight`, body `text-sm`, metadata `text-xs`.
- Monospace (`font-mono tabular-nums`) is reserved for data: order references, OTP entry, countdowns, operational identifiers, dense numeric values. Never for headings or body copy.
- Uppercase with wide tracking is limited to small section labels (`text-xs font-medium uppercase tracking-wide`).

## Layout

Mobile-first. Single column is the default; responsive expansion (`sm:`/`lg:`) only where content requires it. The operator console is information-dense operational software (tables, wrapped top navigation), not a marketing dashboard.

- Customer and rider flows are centered single-column, `max-w-md` to `max-w-2xl`.
- Cards use a two-column phone grid or stacked lists; metric grids keep a two-column phone floor before expanding.
- Do not introduce desktop-only layouts or squeeze-desktop mobile states.

## Shapes

```yaml
rounded:
  base: 0.5rem
  lg: 0.75rem
```

- `rounded-lg` is the control radius (buttons, inputs, alerts); `rounded-xl` is the card radius.
- Borders before shadows: cards are `border border-neutral-200` on light surfaces; shadows are not part of the current language.
- Do not make every element pill-shaped; no glass cards, no floating dashboard tiles.

## Components

No shared component library exists. Components are route-local and co-located under `apps/web/src/app/**`. Ownership is documented per surface:

- Buttons: inline classes per surface; primary action is `bg-neutral-900 text-white` (light) with `hover:bg-neutral-700`, secondary is `border border-neutral-300` with `hover:bg-neutral-100`. Extraction into shared primitives is optional and must not refactor functioning route-local components for architectural taste alone.
- Status copy: customer `status-copy.ts`, rider `error-copy.ts`, operator `operator-labels.ts` are the single sources for status/error presentation; do not duplicate status vocabulary in components.
- Cards: `rounded-xl border border-neutral-200 bg-white p-4` (light, fixed) or border-only on the page surface.
- State regions: `role="alert"` for errors, `role="status"` for success/progress; every data view renders explicit loading, empty, and error states from backend truth.

## Do's and Don'ts

Do:

- Render backend truth verbatim; never invent status, amounts, or timing in the UI.
- Keep interactive controls at or above the 44px touch minimum (`min-h-11`); this is the existing rider/operator contract extended to customer surfaces.
- Verify text contrast for every new pairing in both color schemes (WCAG AA: 4.5:1 normal, 3:1 large).
- Use monospace for identifiers and numeric data.

Don't:

- Don't introduce gradients, glow, glassmorphism, decorative icons, emoji decoration, or new accent colors.
- Don't introduce a custom typeface, logo, imagery, or marketing identity (owner decisions, unresolved).
- Don't add em dashes to user-facing copy.
- Don't redesign business-presented rules (pricing, OTP, waiting charges, dispatch) into new visual metaphors; presentation follows the canonical domain vocabulary.
