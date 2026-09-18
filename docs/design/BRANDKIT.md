# Embee Nexus — BrandKit

**Status:** PROPOSED — founder review required before any consumer-facing build.
**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)

> The repository contains **no pre-existing brand assets**: no logos, no
> wordmark, no favicon, no design tokens beyond neutral Next.js scaffolding
> (`globals.css` defines only background/foreground). Everything below is a
> coherent proposed system, not an established identity. Items marked
> **FOUNDER** require confirmation before implementation consumes them.

## 1. Identity

| Item | Decision | Status |
|---|---|---|
| Product name | **Embee Nexus** | Frozen (founder-authored) |
| Written form | "Embee Nexus" — two words, both capitalized; never "EmbeeNexus", "embee nexus", or "MBEENEXUS" (legacy repo name) | PROPOSED — FOUNDER |
| Wordmark | Set in Inter SemiBold, lowercase "embee" + semibold "nexus"? — **no**: two capitalized words, tight tracking (−1%), no icon inside the wordmark | PROPOSED — FOUNDER |
| Logo mark | "N" node motif: two points (pickup → destination) connected by a curved route line inside a rounded square. Motorcycle-specific marks are avoided (future-proofing) | PROPOSED — FOUNDER |
| Clear space | Minimum padding around wordmark/mark = cap-height of the wordmark ("x" on all sides) | PROPOSED |
| Minimum sizing | Wordmark ≥ 96 px wide (screen), ≥ 24 px (print-equivalent); mark ≥ 24 × 24 px; favicon renders mark only | PROPOSED |
| App icon | Rounded-square brand-color field, white route-node mark, no text | PROPOSED — FOUNDER |
| Favicon | Mark-only SVG, monochrome-compatible (`app/icon.svg` when implemented) | PROPOSED |
| Asset naming | `embee-{asset}-{variant}.{ext}` e.g. `embee-mark-primary.svg`, `embee-wordmark-mono.svg`, `embee-icon-1024.png` | PROPOSED |

No logo files exist in the repository yet. Nothing here authorizes creating
final artwork — that is founder-owned.

## 2. Color system

Semantic tokens only; screens never use raw hex. Derived from the
design-research baseline (tracking blue + delivery orange; see
DESIGN_RESEARCH.md §2). Dark mode: same semantic names, remapped values.

### Core

| Token | Light | Dark | Usage |
|---|---|---|---|
| `color.primary` | `#1D4ED8` (blue-700) | `#60A5FA` (blue-400) | Brand actions, active states, links |
| `color.on-primary` | `#FFFFFF` | `#0B1220` | Text/icons on primary |
| `color.secondary` | `#0F172A` (slate-900) | `#E2E8F0` | Secondary buttons, chrome |
| `color.accent` | `#EA580C` (orange-600) | `#FB923C` | Highlights, rider-markers, promos — sparingly |
| `color.background` | `#F8FAFC` (slate-50) | `#0B1220` | Screen background |
| `color.surface` | `#FFFFFF` | `#111A2C` | Cards, sheets |
| `color.surface-elevated` | `#FFFFFF` + shadow | `#1B2740` | Modals, expanded sheets |
| `color.text` | `#0F172A` | `#F1F5F9` | Primary text (≥ 4.5:1 on surfaces) |
| `color.text-muted` | `#475569` | `#94A3B8` | Metadata, captions (≥ 4.5:1) |
| `color.border` | `#E2E8F0` | `#27334B` | Dividers, card outlines |
| `color.disabled` | `#94A3B8` on `#F1F5F9` | `#64748B` on `#111A2C` | Disabled controls (never rely on color alone) |

### Status

| Token | Light | Dark | Usage |
|---|---|---|---|
| `color.success` | `#15803D` | `#4ADE80` | Payment verified, delivered, approved |
| `color.warning` | `#B45309` | `#FBBF24` | Under review, expiring quote, retries |
| `color.error` | `#DC2626` | `#F87171` | Failures, rejections, destructive |
| `color.info` | `#1D4ED8` | `#60A5FA` | Neutral progress, tips |

### Map states

| Token | Usage |
|---|---|
| `map.route.active` | Primary blue — current leg |
| `map.route.completed` | Muted text color — finished leg |
| `map.marker.pickup` | Accent orange |
| `map.marker.destination` | Primary blue |
| `map.marker.rider` | Success green (live position, in-transit only) |
| `map.coverage.ok` | Subtle primary tint on covered area |
| `map.coverage.rejected` | Error tint + inline message (zone/35 km rejection) |

Rules: color never carries meaning alone (pair with icon/text); status tokens
are the *only* allowed red/green/amber; brand blue is never reused as error.

## 3. Typography

| Item | Decision | Status |
|---|---|---|
| Primary font | **Inter** (variable) | PROPOSED — FOUNDER |
| Fallback | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Frozen |
| Numeric/financial | **Inter tabular numbers** (`font-variant-numeric: tabular-nums`) for all money, distances, ETAs | Frozen |
| Rationale | High x-height, excellent naira/numeral legibility at small sizes, self-hostable, variable-weight (cheap on slow networks) | — |

### Scale (mobile-first, 4 pt rhythm)

| Token | Size/line | Weight | Usage |
|---|---|---|---|
| `type.display` | 28/34 | 700 | Welcome, major confirmations |
| `type.heading` | 22/28 | 600 | Screen titles |
| `type.subheading` | 17/24 | 600 | Card/section titles |
| `type.body` | 15/22 | 400 | Default content |
| `type.body-strong` | 15/22 | 600 | Emphasised content |
| `type.caption` | 13/18 | 400 | Metadata, timestamps |
| `type.financial` | 17/24 | 600, tabular | Prices, earnings |

Weight rules: 400/600/700 only (no 300 on small text — fails on low-end LCDs);
never all-caps body text; line-height never below 1.4 for body.

## 4. Shape & elevation

| Token | Value | Usage |
|---|---|---|
| `radius.sm` | 8 px | Inputs, chips, small buttons |
| `radius.md` | 12 px | Buttons, cards |
| `radius.lg` | 16 px | Cards, map callouts |
| `radius.sheet` | 20 px (top corners only) | Bottom sheets, modals |
| `radius.full` | 999 px | Pill buttons, avatars, status dots |

Elevation (3 levels, defined in DESIGN_SYSTEM.md §3): flat surfaces use
borders, not shadows; `elevation.1` for cards; `elevation.2` for sheets/modals.
Dark mode elevates by lightening `surface`, never by shadow.

### Spacing scale

`space.1` 4 · `space.2` 8 · `space.3` 12 · `space.4` 16 · `space.5` 20 ·
`space.6` 24 · `space.8` 32 · `space.10` 40 · `space.12` 48 px.
Screen gutters: 16 px (mobile); section gaps: 24 px; card padding: 16 px.

## 5. Voice & copy conventions

- Plain, short sentences; verb-first CTAs ("Confirm pickup", not "Pickup can now be confirmed").
- Money always `₦2,200` (naira sign, no decimals — prices are whole naira by pricing model); distances `5.2 km`; ETAs "12 min".
- Status names in copy **exactly match** order-state names (customer-visible subset) — no synonyms.
- Errors state what happened + the next action; never blame the user; never expose internals ("Payment could not be verified. You won't be charged twice. Try again.").
- No jargon ("dispatch", "RPC", "quote id") in customer-facing copy; "quote" is presented as "Price".

**Voice status: PROPOSED — FOUNDER.**
