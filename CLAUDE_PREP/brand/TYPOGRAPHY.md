# EMBEE NEXUS — TYPOGRAPHY (V2)

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL (founder brand material) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Canonical typeface (founder decision, reconfirmed 2026-09-29)

**Manrope** — Google Fonts, weights 200–800, single family for the product.

| Weight | Role |
|---|---|
| 800 (ExtraBold) | Hero display; "EMBEE" in the wordmark (tight tracking) |
| 700 (Bold) | Headings |
| 600 (SemiBold) | Buttons, navigation |
| 500 (Medium) | Labels, secondary text |
| 400 (Regular) | Body text |
| 300 (Light) | "NEXUS" in the wordmark (wide tracking) |

**Do not replace Manrope** with another typeface (e.g., Inter) because the
current application happens to render a system stack. No custom typeface
other than Manrope may be introduced.

## Data typography (frozen engineering rule)

Tabular numerals (`font-variant-numeric: tabular-nums`, rendered via the
app's `font-mono tabular-nums` convention) are mandatory for: order
references, OTP entry, countdowns, money, distances, ETAs, and dense
operational data. Never for headings or body copy.

## Fallback stack (frozen engineering rule)

`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` — used until and
alongside Manrope loading (with appropriate `next/font` fallback tuning at
integration).

## Implementation gap (documented, not executed in this phase)

| Item | State |
|---|---|
| Webfont in app | **NOT integrated.** `apps/web/src/app/layout.tsx` ships no font; the interface renders the system stack |
| Approval | Founder approved Manrope integration in the **next implementation phase** (2026-09-29) |
| Planned integration | `next/font/google` Manrope in the root layout, weights 300–800, applied to `<body>`; system stack remains the fallback |
| Type scale | No formal modular scale exists. V1 used Tailwind utilities 12–30px; the V2 app uses `text-xs`–`text-3xl` with weight hierarchy. A formal scale is proposed for the design-system phase, not invented here |
| Line-height / tracking tokens | Not yet defined — propose at the same design-system phase |

## Historical note

The 2026-09-01 document described the V1 layout and recommended continuing
Manrope; that recommendation is now a founder decision. The V1 document is
superseded in place; provenance preserved in `archive/v1/` narrative via the
document index.
