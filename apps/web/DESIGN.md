---
version: 0.2
name: Embee Nexus V2
description: Design-system contract for the Embee Nexus motorcycle delivery platform (closed Abuja pilot). Re-based onto the founder brand palette, Manrope, and the supplied logo/favicon assets; ratified 2026-09-29.
---

## Overview

Embee Nexus V2 is a mobile-first motorcycle delivery platform for Abuja. The interface pairs the founder brand identity with a restrained, border-first system: no gradients, glow, glassmorphism, or decorative color. This contract implements the founder decisions frozen on 2026-09-29 (CLAUDE_PREP rebase, commit `13b7ef4`); it is the single token source. Raw hex in components is a lint-grade violation — components consume the tokens below.

## Colors

**Brand tokens (canonical founder values — never darkened or redefined):**

```yaml
brand:
  embee-navy: "#0b1220"
  embee-blue: "#147bff"
  digital-cyan: "#38bdf8"
  embee-white: "#f5f7fa"
  embee-charcoal: "#111827"
  embee-slate: "#64748b"
muted-brand-value: "#94a3b8"   # canonical documented muted value; #64748b remains a palette color
```

**Semantic tokens (implemented in `globals.css`; light + dark via `prefers-color-scheme`):**

```yaml
colors:
  surface: "#f5f7fa"            # Embee White
  surface-muted: "#eef1f5"
  surface-card: "#ffffff"
  surface-elevated: "#ffffff"
  foreground: "#111827"          # Embee Charcoal — 16.53:1
  foreground-muted: "#475569"    # derivative — 7.06:1
  foreground-subtle: "#526180"   # derivative — 5.79:1
  foreground-inverse: "#ffffff"
  brand: "#147bff"               # canonical Embee Blue: brand-action fill, active states, focus ring, links, brand surfaces
  brand-text: "#0b5cd0"          # derivative: normal-size blue text — 5.66:1
  action-ink: "#0b5cd0"          # derivative: solid action fill (normal-text AA with white, 6.08:1)
  action-ink-hover: "#0a4fb5"    # derivative — 7.50:1 with white
  ring: "#147bff"                # 3.69:1 vs page (≥3:1 non-text)
  line: "#e2e8f0"
  line-muted: "#eef1f5"
  line-strong: "#94a3b8"
  status-success: "#15803d"      # 4.79:1 on #F0FDF4
  status-warning: "#b45309"      # 4.84:1 on #FFFBEB
  status-error: "#b91c1c"        # 5.91:1 on #FEF2F2
  status-info: "#1d4ed8"         # 6.16:1 on #EFF6FF
```

**Dark scheme (Embee Navy base):** surface `#0b1220`, cards `#111827` (Embee Charcoal, 17.74:1 with white), muted `#b6c2d2` (derivative, 10.37:1), subtle `#94a3b8` (canonical brand value, 7.30:1 on navy), brand-text `#93c5fd` (10.38:1), action-ink `#93c5fd` with navy text (10.38:1), hover `#a9d3fe` (11.98:1), statuses `#22c55e`/`#fbbf24`/`#f87171`/`#93c5fd` (8.22/11.22/6.77/10.38:1), line `#1e293b`, same canonical `--ring #147bff` (4.73:1 vs navy).

**Usage rules:**
- `#147BFF` is the canonical brand/action color and may be used for canonical brand-action surfaces: fills, active states, focus/ring treatment, links, and other appropriate brand UI. It is never darkened or redefined. The one measured constraint: white text on `#147BFF` is 3.96:1, below the 4.5:1 normal-text threshold — so a solid action fill carrying **normal-size white text** uses the `action-ink` derivative instead. `action-ink` exists for that accessibility case only; it does not replace `#147BFF` as the brand-action token.
- Values marked *derivative* exist purely for accessibility-sensitive semantics and are labeled as derivatives wherever they appear.
- No gradients, no glow, no glassmorphism, no decorative color fields. Color never carries meaning alone.
- Every new text/background pairing is verified with the WCAG 2.x formula before use; no failing value is rounded upward. Large-text treatment (≥18.67px bold or ≥24px) must not be conflated with normal-text (4.5:1) or non-text (3:1) requirements.

## Themes

Dark mode follows `prefers-color-scheme` with no manual toggle; both schemes are first-class, navy-based in dark. Do not add per-component dark overrides; adjust tokens centrally.

## Typography

**Manrope** is the canonical typeface (founder decision), integrated via `next/font` in the root layout with weights 300–800; `--font-manrope` precedes the system fallback in the body stack. No other typeface may be introduced.

```yaml
type-scale:
  # Explicit v0.2 scale (size / weight / line-height / tracking / use)
  display:  { size: 1.875rem, weight: 800, leading: 1.1,  tracking: -0.02em, use: hero/landing H1 }
  title:    { size: 1.5rem,   weight: 800, leading: 1.15, tracking: -0.01em, use: page titles }
  heading:  { size: 1.125rem, weight: 700, leading: 1.3,  tracking: normal,  use: card/section headings }
  body:     { size: 0.875rem, weight: 400, leading: 1.5,  tracking: normal,  use: body text }
  label:    { size: 0.8125rem, weight: 600, leading: 1.4, tracking: 0.01em, use: inputs/buttons-adjacent labels }
  button:   { size: 0.875rem, weight: 600, leading: 1.2, tracking: normal, use: button text }
  metadata: { size: 0.75rem, weight: 500, leading: 1.4, tracking: normal, use: timestamps, captions }
  micro-label: { size: 0.75rem, weight: 600, leading: 1.3, tracking: 0.06em, uppercase: true, use: uppercase section labels }
```

Scale rationale: extends the existing Tailwind utility usage (no visual regression on dense operational screens) while giving every role an explicit value. **Tabular numerals** (`font-mono tabular-nums`) remain mandatory for order references, OTP entry, countdowns, money, distances, ETAs, and dense operational data; monospace is never used for headings or body copy.

## Layout

Mobile-first, single-column default; responsive expansion only where content requires it. The operator console stays information-dense with wrapped top navigation — not a marketing dashboard. Customer/rider flows are centered single-column (`max-w-md`–`max-w-2xl`). No bottom tab bars, no mobile-only navigation patterns (deferred to the mobile milestone).

## Shapes

Founder radius system 8/12/16 with 20 optional: `--radius-control` 8 (small controls), `--radius-card` 12 (cards/inputs/alerts), `--radius-panel` 16 (large panels), `--radius-sheet` 20 (optional larger surface). Border-first elevation; shadows are not part of the language. Borders before color for grouping; do not make every element pill-shaped.

## Components

Route-local co-located components remain the ownership model — extraction into shared primitives is optional and must not refactor functioning components for architectural taste alone. Working contracts:

- **Buttons:** the canonical brand-action token is `--action` (`#147BFF`). Where a solid fill carries normal-size white text, the fill uses `bg-(--action-ink) text-white hover:bg-(--action-ink-hover)` (normal-text AA at any label size — the accessibility derivative); `#147BFF` itself remains correct for action fills whose label treatment meets contrast (large/bold labels, navy text, non-text UI) and for all other brand-action surfaces. Secondary = `border border-neutral-300 hover:bg-neutral-100`; destructive = error token + typed confirmation for operators. All interactive controls ≥44px (`min-h-11`).
- **Inputs:** `rounded-(--radius-control)` (8px); labels above; `focus:border-(--ring)` + visible focus outline; inline errors below fields.
- **Cards:** `rounded-(--radius-card)` (12px) or 16px panels, `border-(--line)`, border-first.
- **Status copy:** customer `status-copy.ts`, rider `error-copy.ts`, operator `operator-labels.ts` are the single sources; never duplicate status vocabulary in components. Status is never color alone — always paired with text; text-safe status values ride on fixed-light tinted panels (`#FEF2F2`/`#F0FDF4`/`#FFFBEB`/`#EFF6FF`, all verified ≥4.79:1).
- **State regions:** `role="alert"` for errors, `role="status"` for success/progress; every data view renders explicit loading, empty, and error states from backend truth.

## Brand assets

Founder-supplied, byte-identical copies integrated 2026-09-29 (`md5` verified; identity never transformed):

- `public/brand/FULL_COLOR.png` — **primary/default logo** (md5 `54f00929…`); used on the landing at display size.
- `public/brand/FULL_COLOR-transparent.png` — approved transparent primary (md5 `b1a824ef…`).
- `public/brand/DARK.png`, `public/brand/WHITE.png` — approved variants for dark surfaces (md5s `f90a07c6…`/`3386fe30…`); use `WHITE.png`/`DARK.png` where a mark must sit on navy.
- `src/app/favicon.ico` — default favicon (md5 `05219da4…`).
- **Never create, redraw, reconstruct, vectorize, or stylize the logo.** Missing variants (SVG/vector, wordmark-only, app icons) are reported gaps, not to be generated. `LOGO_CONSTRUCTION.jpeg` is reference-only.

## Do's and Don'ts

Do:

- Render backend truth verbatim; never invent status, amounts, timing, statistics, testimonials, or capabilities.
- Consume semantic tokens; no raw hex in components (except documented Tailwind palette classes already in force).
- Keep interactive controls ≥44px (`min-h-11`); verify contrast for every new pairing in both schemes; status never by color alone.
- Use monospace/tabular numerals for identifiers and numeric data.
- Keep customer (calm), rider (thumb-first), and operator (dense) surfaces visually appropriate to their roles; do not force identical density.

Don't:

- Don't introduce gradients, glow, glassmorphism, decorative icons, emoji decoration, or provider branding ("Secure checkout", never the payment provider's name).
- Don't use `#147BFF` under white normal-size text; use `action-ink`.
- Don't open resolved decisions: logo, brand blue, muted brand token, Manrope, radius system, border-first elevation, mobile deferral.
- Don't add em dashes to user-facing copy.
- Don't redesign business-presented rules (pricing, OTP, waiting charges, dispatch) into new visual metaphors; presentation follows the canonical domain vocabulary.
