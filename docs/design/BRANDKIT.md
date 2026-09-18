# Embee Nexus — BrandKit

**Status:** RECONCILED to canonical founder brand material — see
`CANONICAL_SOURCE_OF_TRUTH.md` §2 and `CLAUDE_PREP/brand/`.
**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4); reconciled post-M3.

> **Reconciliation note (overrides the earlier version of this document).**
> The previous version stated the repository contained "no pre-existing brand
> assets" and proposed a new identity (Inter, blue `#1D4ED8`, orange `#EA580C`).
> That was **incorrect**: the repository tracks six founder-supplied logo assets
> under `CLAUDE_PREP/brand/assets/` plus the founder brand system in
> `CLAUDE_PREP/brand/` (mirrored from the external Developer Brand Kit). Under
> the authority model, founder brand material (L3) outranks this design-phase
> proposal (L5). The proposed Inter/blue/orange system is **RETRACTED**. What
> survives from the earlier proposal: token *architecture* (semantic naming,
> status/map tokens, spacing, radius), voice conventions, and accessibility
> rules — re-based on the founder values below.

## 1. Identity (canonical — founder material)

| Item | Canonical position | Source |
|---|---|---|
| Product name | **Embee Nexus** | Founder authorizations; Developer Brand Kit |
| Logo mark | **Interlocking E/N monogram** — compact, square, sharp/geometric; no literal delivery imagery (motorcycles, boxes, pins, arrows) | Developer Brand Kit §2 |
| Logo assets | 6 founder files in `CLAUDE_PREP/brand/assets/`: `FULL_COLOR.jpeg` (1024², light bg), `DARK.jpeg` (1024², dark bg), `WHITE.jpeg` (1024², dark bg), `FULL_COLOR _02.jpeg` (750², secondary), `FULL_COLOR-removebg-preview.png` (500², transparent), `LOGO_CONSTRUCTION.jpeg` (612², reference) | LOGO-INVENTORY.md; verified dimensions in CANONICAL_SOURCE_OF_TRUTH.md §3 |
| Usage rules | Do not distort, stretch, rotate or add effects; compact E/N mark for icon/small contexts; wordmark where the name must be explicit | Developer Brand Kit §2/§7 |
| Clear space / min size | **FOUNDER-PENDING** — brand kit itself lists exact construction measurements, clear-space and minimum-size rules as still-to-finalize | Developer Brand Kit §8 |
| App icon / favicon / SVG | **MISSING — FOUNDER MUST SUPPLY** vector logo, favicon, app icon, wordmark asset | LOGO-INVENTORY.md "Missing Assets" |
| Interim code mark | Text-based "EN" fallback component is explicitly interim until the official mark is available | LOGO-INVENTORY.md |
| Asset classification | `Embeenexus brandkit.png` (external) = identity board **REFERENCE**, not a production asset | CANONICAL_SOURCE_OF_TRUTH.md §3 |

## 2. Color system (canonical — founder palette)

Founder palette (Developer Brand Kit §3, mirrored in `CLAUDE_PREP/brand/COLOR-SYSTEM.md`):

| Name | Hex | Role |
|---|---|---|
| **Midnight Navy / Embee Navy** | `#0B1220` | Dark navigation, hero areas, strong brand surfaces; dark-mode background |
| **Embee Blue** | `#147BFF` | Primary brand: logo, CTAs, active states, links, key highlights |
| **Digital Cyan** | `#38BDF8` | Secondary highlights and selected accents |
| **Cool White / Embee White** | `#F5F7FA` | Light page backgrounds and UI surfaces |
| **Deep Charcoal / Embee Charcoal** | `#111827` | Primary text on light surfaces |
| **Embee Slate** | `#64748B` | Supporting text and metadata |

Semantic mapping (light) per `CLAUDE_PREP/brand/COLOR-SYSTEM.md`: `--primary` `#147BFF`
(fg `#FFFFFF`) · `--background` `#F5F7FA` · `--foreground`/`--card-foreground` `#111827` ·
`--card` `#FFFFFF` · `--secondary`/`--muted` `#F1F5F9` · `--muted-foreground` `#94A3B8` ·
`--accent` `#38BDF8` · `--destructive` `#EF4444` · `--success` `#22C55E` ·
`--warning` `#F59E0B` · `--border`/`--input` `#E2E8F0` · `--ring` `#147BFF`.
Dark mode table exists in the same document (navy base `#0B1220`, charcoal cards `#111827`).

**Status tokens map cleanly onto V2 needs** (success = payment verified/delivered/approved;
warning = under review/expiring quote; destructive = failures/rejections). Rules kept from
the earlier proposal: semantic tokens only (no raw hex in components), color never carries
meaning alone, status tokens are the only red/green/amber. Map-state tokens (`map.route.*`,
`map.marker.*`, `map.coverage.*`) remain a **PROPOSED** extension to be derived from the
founder palette (e.g. route/marker accents from Blue/Cyan) — founder review at map-UX build.

## 3. Typography (canonical — Manrope)

| Item | Canonical position | Status |
|---|---|---|
| Primary font | **Manrope** (Google Fonts, weights 200–800), single family | FOUNDER (Developer Brand Kit §4; Nexus Seller spec §3; V1 code precedent) |
| Weight roles | 800 hero/"EMBEE" · 700 headings · 600 buttons/nav · 400 body · 400–500 metadata; logo: ExtraBold "EMBEE" + Light wide-tracked "NEXUS" | FOUNDER |
| Fallback | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Frozen (engineering) |
| Numeric/financial | **Tabular numerals** (`font-variant-numeric: tabular-nums`) for all money, distances, ETAs | Frozen (engineering; V1 gap noted in TYPOGRAPHY.md) |

Scale: keep the earlier mobile-first scale (display 28 · heading 22 · subheading 17 ·
body 15 · caption 13 · financial 17/600 tabular) as **PROPOSED** sizing on the Manrope
family; V1 used Tailwind's 12–30 px utilities without a formal scale (gap to formalize).
Note: the current V2 `layout.tsx` ships no webfont — adopting Manrope is an implementation
task for a future authorized milestone, not this one.

## 4. Shape, elevation & spacing

Unchanged from the earlier proposal (these were structural, not brand-identity, decisions):
`radius.sm` 8 / `md` 12 / `lg` 16 / `sheet` 20 (top corners) / `full` 999; elevation via
borders-first, `elevation.1` cards, `elevation.2` sheets; spacing scale 4→48. The V1
direction doc's "rounded corners (0.5rem default), card-based layouts, subtle borders"
is consistent with this. Status: **PROPOSED — FOUNDER** (ratify with design system).

## 5. Voice & copy conventions

Canonical core promise (Developer Brand Kit §1/§6):
> **"You want it delivered. Embee Nexus is the right platform for the job."**

Voice: confident, clear, professional, reassuring; short direct customer-facing actions;
reliability/clarity/convenience emphasized; premium without being corporate; avoid
unprovable claims. Seller product label follows the Nexus Seller spec ("EmbeeNexus /
Nexus Seller" style product labeling is founder material — follow spec at build time).

Kept from the earlier proposal (PROPOSED — FOUNDER): money `₦2,200` (no decimals — prices
are whole naira by the pricing model), distances `5.2 km`, ETAs "12 min", status names in
copy exactly match server state vocabulary, errors state what happened + next action, no
internal jargon in customer copy ("quote" presented as "Price").

## 6. Founder-pending brand decisions

1. Ratification of written-form/capitalization rules for product surfaces (spec files
   themselves use both "Embee Nexus" and "EMBEEENEXUS"/"EmbeeNexus" inconsistently).
2. Final vector artwork + construction measurements for the E/N mark.
3. Wordmark spacing/kerning, clear-space and minimum-size rules.
4. Favicon, app icon, wordmark-only asset.
5. Map-state color assignments (derived tokens).
6. Light/dark mode priority for the mobile apps (both token sets exist; no default chosen).
