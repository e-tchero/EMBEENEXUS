# EMBEE NEXUS — LOGO INVENTORY

**Authority:** LEVEL 1 — Founder-provided assets
**Date:** September 1, 2026

---

## Logo Assets

| # | Filename | Format | Size | Background | Intended Use | Light/Dark | Source |
|---|----------|--------|------|------------|--------------|------------|--------|
| 1 | `DARK.jpeg` | JPEG | 47 KB | Dark | Logo on dark backgrounds | Dark | `EMBEENEXUS_LOGOS/DARK.jpeg` |
| 2 | `FULL_COLOR.jpeg` | JPEG | 55 KB | White/Light | Primary logo, general use | Light | `EMBEENEXUS_LOGOS/FULL_COLOR.jpeg` |
| 3 | `FULL_COLOR _02.jpeg` | JPEG | 24 KB | White/Light | Secondary color variant | Light | `EMBEENEXUS_LOGOS/FULL_COLOR _02.jpeg` |
| 4 | `FULL_COLOR-removebg-preview.png` | PNG | 121 KB | Transparent | Logo without background | Both | `EMBEENEXUS_LOGOS/FULL_COLOR-removebg-preview.png` |
| 5 | `LOGO_CONSTRUCTION.jpeg` | JPEG | 40 KB | White/Light | Logo construction/specification | Reference | `EMBEENEXUS_LOGOS/LOGO_CONSTRUCTION.jpeg` |
| 6 | `WHITE.jpeg` | JPEG | 57 KB | Dark | Logo on dark backgrounds | Dark | `EMBEENEXUS_LOGOS/WHITE.jpeg` |

---

## Logo Variants

### Color Variants
1. **Full Color** — Primary logo with brand colors (blue/cyan)
2. **Dark** — Logo variant for dark backgrounds
3. **White** — Monochrome white logo for dark backgrounds

### Format Notes
- **JPEG files:** Compressed, suitable for web display
- **PNG file:** Transparent background, suitable for overlays
- **SVG files:** NOT YET PROVIDED — founder must supply SVG/vector versions for pixel-perfect rendering at all sizes

---

## Missing Assets

| Asset | Status | Required For |
|-------|--------|-------------|
| SVG vector logo | **MISSING FROM REPOSITORY — FOUNDER MUST SUPPLY** | Figma design system, responsive rendering |
| Favicon | **MISSING FROM REPOSITORY — FOUNDER MUST SUPPLY** | Browser tab icon |
| App icon | **MISSING FROM REPOSITORY — FOUNDER MUST SUPPLY** | Mobile/PWA |
| Wordmark SVG | **MISSING FROM REPOSITORY — FOUNDER MUST SUPPLY** | Text-only logo usage |

---

## Current Code Implementation

The current `Logo` component (`components/shared/logo.tsx`) uses a **text-based fallback**:

```tsx
// Compact E/N mark — text placeholder until monogram asset is available
<div className="bg-embee-blue text-white font-extrabold rounded-lg">
  EN
</div>
```

This is explicitly documented as an **interim implementation** awaiting the official SVG logo asset.

---

## Usage Guidelines

| Context | Recommended Variant |
|---------|-------------------|
| Website header | Full Color or Dark (depending on background) |
| Marketing pages | Full Color |
| Dark mode UI | White variant |
| Email signatures | Full Color |
| Social media | Full Color |
| Favicon | Pending SVG asset |
| Loading/splash | Full Color |
