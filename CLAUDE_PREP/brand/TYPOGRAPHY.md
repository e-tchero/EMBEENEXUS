# EMBEE NEXUS — TYPOGRAPHY

**Authority:** LEVEL 1 — Derived from layout.tsx and Tailwind config
**Date:** September 1, 2026

---

## Current Font

| Property | Value |
|----------|-------|
| **Font Family** | Manrope |
| **Source** | Google Fonts (`next/font/google`) |
| **Subsets** | Latin |
| **Loaded In** | `app/layout.tsx` |
| **CSS Class** | `manrope.className` applied to `<body>` |

---

## Font Weights (Manrope)

Manrope supports weights 200–800. Current usage:

| Weight | CSS Value | Used For |
|--------|-----------|----------|
| 300 (Light) | `font-light` | "NEXUS" in logo wordmark |
| 400 (Regular) | Default | Body text, paragraphs |
| 500 (Medium) | `font-medium` | Labels, secondary text |
| 600 (Semi Bold) | `font-semibold` | Buttons, navigation |
| 700 (Bold) | `font-bold` | Headings |
| 800 (Extra Bold) | `font-extrabold` | "EMBEE" in logo, logo mark "EN" |

---

## Current Scale

The current implementation does not define a formal type scale. Font sizes are applied via Tailwind utility classes:

| Tailwind Class | Approximate Size | Usage |
|----------------|-----------------|-------|
| `text-xs` | 12px | Captions, small labels |
| `text-sm` | 14px | Secondary text, metadata |
| `text-base` | 16px | Body text (default) |
| `text-lg` | 18px | Logo (sm), section headers |
| `text-xl` | 20px | Logo (md), card titles |
| `text-2xl` | 24px | Page titles |
| `text-3xl` | 30px | Logo (lg), hero text |

---

## Typography in Logo

The logo component uses explicit font weights to create visual hierarchy:

```tsx
// "EMBEE" — Extra Bold, tight tracking
<span className="font-extrabold tracking-tight">EMBEE</span>

// "NEXUS" — Light, wide tracking
<span className="font-light tracking-widest">NEXUS</span>
```

---

## What's Missing

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| No formal type scale defined | Inconsistent sizing across components | Define a modular scale |
| No heading hierarchy specification | Inconsistent heading styles | Define h1–h6 styles |
| No line-height tokens | Inconsistent vertical rhythm | Define leading scale |
| No letter-spacing tokens | Inconsistent tracking | Define tracking scale |
| No numeric/data typography spec | Inconsistent number rendering | Consider tabular nums for data |
| No fallback font stack defined | Depends on Manrope loading | Define system fallbacks |

---

## Recommendation for Claude

Manrope is a modern, geometric sans-serif that works well for a delivery platform. It is:

- ✅ Professional and clean
- ✅ Good readability at small sizes
- ✅ Supports Nigerian language characters (Latin subset)
- ✅ Free (Google Fonts)
- ✅ Variable weight support

**Claude should continue using Manrope** unless the founder explicitly requests a font change. If changing, ensure the replacement:
1. Supports Latin characters
2. Has good mobile readability
3. Is available on Google Fonts or self-hosted
4. Maintains professional delivery-platform aesthetic
