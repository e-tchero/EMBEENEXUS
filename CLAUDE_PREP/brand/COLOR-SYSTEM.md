# EMBEE NEXUS — COLOR SYSTEM (V2)

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL (founder brand material) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Founder resolutions recorded 2026-09-29

1. **Muted foreground:** `#94A3B8` is the documented muted-foreground value
   (the historical document's HSL/hex contradiction is resolved in its favor).
   `#64748B` (Embee Slate) remains a brand palette color in its own right —
   the token is not rewritten. Where `#94A3B8` fails contrast for normal-size
   text on light surfaces, the separate AA derivative in §3 governs.
2. **Embee Blue:** `#147BFF` is canonical and is never darkened or redefined.
   It is used for primary brand surfaces, CTA backgrounds, active states,
   links where appropriate, and focus/ring treatment. Normal-size text whose
   foreground is Embee Blue uses the AA text derivative in §3.
3. Derivatives are **engineering values, never new brand colors.** They are
   labeled as derivatives wherever they appear and are consumed through the
   app's semantic tokens (`apps/web/DESIGN.md`), not duplicated in components.

## 1. Brand tokens (founder palette — unchanged)

| Name | Hex | HSL | Role |
|---|---|---|---|
| **Embee Navy** | `#0B1220` | 222 47% 7% | Dark backgrounds/hero, dark-mode page background, authority surfaces |
| **Embee Blue** | `#147BFF` | 213 94% 53% | Primary brand: CTAs, active states, links, focus/ring |
| **Digital Cyan** | `#38BDF8` | 199 89% 60% | Accents, highlights, "NEXUS" in the wordmark |
| **Embee White** | `#F5F7FA` | 210 20% 98% | Light page backgrounds and UI surfaces |
| **Embee Charcoal** | `#111827` | 222 47% 11% | Primary text on light surfaces; cards on dark |
| **Embee Slate** | `#64748B` | 215 16% 47% | Supporting text and metadata (see §3 for contrast) |

## 2. Semantic UI tokens (documented mapping — provenance: V1-era derivation, founder-acknowledged)

Light mode:

| Token | Value | Usage |
|---|---|---|
| `--background` | `#F5F7FA` | Page background |
| `--foreground` | `#111827` | Primary text |
| `--card` / `--card-foreground` | `#FFFFFF` / `#111827` | Card surface / text |
| `--primary` | `#147BFF` | Primary buttons, links |
| `--primary-foreground` | `#FFFFFF` | Text on primary — **large text/fills only; see §3** |
| `--secondary` / `--secondary-foreground` | `#F1F5F9` / `#111827` | Secondary buttons |
| `--muted` | `#F1F5F9` | Muted backgrounds |
| `--muted-foreground` | `#94A3B8` | Subtle text — **normal-size text on light uses the §3 derivative** |
| `--accent` / `--accent-foreground` | `#38BDF8` / `#111827` | Accent elements |
| `--destructive` | `#EF4444` | Errors, destructive actions |
| `--success` | `#22C55E` | Success states |
| `--warning` | `#F59E0B` | Warning states |
| `--border` / `--input` | `#E2E8F0` | Borders, input borders |
| `--ring` | `#147BFF` | Focus rings |

Dark mode (navy base):

| Token | Value |
|---|---|
| `--background` | `#0B1220` |
| `--foreground` | `#FFFFFF` |
| `--card` / `--card-foreground` | `#111827` / `#FFFFFF` |
| `--secondary` / `--muted` / `--border` / `--input` | `#1E293B` |
| `--muted-foreground` | `#94A3B8` (7.30:1 on navy — dark-surface safe) |
| `--accent` | `#38BDF8` |
| `--destructive` | `#7F1D1D` |
| `--primary` / `--ring` | `#147BFF` |

## 3. Engineering accessibility derivatives (frozen 2026-09-29 — NOT brand colors)

Computed with the WCAG 2.x relative-luminance formula against the brand
surfaces.

| Derivative | Hex | Verified pairings | Use |
|---|---|---|---|
| Blue text (AA) | `#0B5CD0` | 5.66:1 on `#F5F7FA` · 6.08:1 on `#FFFFFF` | Normal-size text with Embee Blue foreground (links, text buttons) |
| Muted text (AA) | `#475569` | 7.06:1 on `#F5F7FA` · 7.58:1 on `#FFFFFF` | Normal-size secondary/metadata text on light surfaces |

Verified brand pairings (for reference, not overrides):

| Pairing | Ratio | Verdict |
|---|---|---|
| `#FFFFFF` on `#147BFF` | 3.96:1 | Large text (≥3:1) and fills only |
| `#111827` on `#F5F7FA` | 16.53:1 | Pass |
| `#FFFFFF` on `#0B1220` | 18.72:1 | Pass |
| `#94A3B8` on `#0B1220` | 7.30:1 | Pass (dark surfaces) |
| `#64748B` on `#F5F7FA` | 4.43:1 | Large text / non-essential decoration only |
| `#38BDF8` with white text | 2.14:1 | Decoration only; never text |

## 4. Usage rules

- Semantic tokens only in components; raw hex in components is a lint-grade
  violation (repo DESIGN_SYSTEM.md §0).
- Color never carries meaning alone — pair with text/icons.
- Status hues: success `#22C55E`, warning `#F59E0B`, destructive `#EF4444`
  (light) / `#7F1D1D` (dark). Text-safe status variants for specific
  surfaces are chosen per pairing and verified against AA.
- No gradients, no glow, no decorative color fields.
- **Implementation note:** the app's `globals.css` currently carries the v0.1
  neutral token values; the approved re-base to these founder values is a
  subsequent implementation phase. Until then, `globals.css` + `apps/web/DESIGN.md`
  remain the implementation truth; this document is the brand truth.
