# EMBEE NEXUS — COLOR SYSTEM

**Authority:** LEVEL 1 — Derived from Tailwind config + CSS variables
**Date:** September 1, 2026

---

## Brand Colors (Official)

| Name | Hex | HSL | CSS Variable | Tailwind |
|------|-----|-----|--------------|----------|
| **Embee Navy** | `#0B1220` | — | `--embee-navy` | `embee-navy` |
| **Embee Blue** | `#147BFF` | `213 94% 53%` | `--embee-blue` | `embee-blue` |
| **Digital Cyan** | `#38BDF8` | `199 89% 60%` | `--embee-cyan` | `embee-cyan` |
| **Embee White** | `#F5F7FA` | `210 20% 98%` | `--embee-white` | `embee-white` |
| **Embee Charcoal** | `#111827` | `222 47% 11%` | `--embee-charcoal` | `embee-charcoal` |
| **Embee Slate** | `#64748B` | `215 16% 47%` | `--embee-slate` | `embee-slate` |

---

## Semantic Token System (Light Mode)

| Token | HSL | Hex Equivalent | Usage |
|-------|-----|----------------|-------|
| `--background` | `210 20% 98%` | `#F5F7FA` | Page background |
| `--foreground` | `222 47% 11%` | `#111827` | Primary text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card background |
| `--card-foreground` | `222 47% 11%` | `#111827` | Card text |
| `--popover` | `0 0% 100%` | `#FFFFFF` | Popover background |
| `--popover-foreground` | `222 47% 11%` | `#111827` | Popover text |
| `--primary` | `213 94% 53%` | `#147BFF` | Primary buttons, links |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `210 40% 96%` | `#F1F5F9` | Secondary buttons |
| `--secondary-foreground` | `222 47% 11%` | `#111827` | Text on secondary |
| `--muted` | `210 40% 96%` | `#F1F5F9` | Muted backgrounds |
| `--muted-foreground` | `215 16% 47%` | `#94A3B8` | Subtle text |
| `--accent` | `199 89% 60%` | `#38BDF8` | Accent elements |
| `--accent-foreground` | `222 47% 11%` | `#111827` | Text on accent |
| `--destructive` | `0 84% 60%` | `#EF4444` | Errors, delete |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| `--success` | `142 71% 45%` | `#22C55E` | Success states |
| `--success-foreground` | `0 0% 100%` | `#FFFFFF` | Text on success |
| `--warning` | `38 92% 50%` | `#F59E0B` | Warning states |
| `--warning-foreground` | `0 0% 100%` | `#FFFFFF` | Text on warning |
| `--border` | `214 32% 91%` | `#E2E8F0` | Borders |
| `--input` | `214 32% 91%` | `#E2E8F0` | Input borders |
| `--ring` | `213 94% 53%` | `#147BFF` | Focus rings |

---

## Semantic Token System (Dark Mode)

| Token | HSL | Hex Equivalent | Usage |
|-------|-----|----------------|-------|
| `--background` | `222 47% 7%` | `#0B1220` | Page background |
| `--foreground` | `0 0% 100%` | `#FFFFFF` | Primary text |
| `--card` | `222 47% 11%` | `#111827` | Card background |
| `--card-foreground` | `0 0% 100%` | `#FFFFFF` | Card text |
| `--popover` | `222 47% 11%` | `#111827` | Popover background |
| `--popover-foreground` | `0 0% 100%` | `#FFFFFF` | Popover text |
| `--primary` | `213 94% 53%` | `#147BFF` | Primary buttons |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `217 33% 17%` | `#1E293B` | Secondary buttons |
| `--secondary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on secondary |
| `--muted` | `217 33% 17%` | `#1E293B` | Muted backgrounds |
| `--muted-foreground` | `215 20% 65%` | `#94A3B8` | Subtle text |
| `--accent` | `199 89% 60%` | `#38BDF8` | Accent elements |
| `--accent-foreground` | `0 0% 100%` | `#FFFFFF` | Text on accent |
| `--destructive` | `0 63% 31%` | `#7F1D1D` | Errors (dark) |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Text on destructive |
| `--border` | `217 33% 17%` | `#1E293B` | Borders |
| `--input` | `217 33% 17%` | `#1E293B` | Input borders |
| `--ring` | `213 94% 53%` | `#147BFF` | Focus rings |

---

## Color Usage Map

| Element | Light | Dark |
|---------|-------|------|
| Page background | `--background` (#F5F7FA) | `--background` (#0B1220) |
| Card surface | `--card` (#FFFFFF) | `--card` (#111827) |
| Primary button | `--primary` (#147BFF) | `--primary` (#147BFF) |
| Destructive button | `--destructive` (#EF4444) | `--destructive` (#7F1D1D) |
| Success badge | `--success` (#22C55E) | `--success` (#22C55E) |
| Warning badge | `--warning` (#F59E0B) | `--warning` (#F59E0B) |
| Border/divider | `--border` (#E2E8F0) | `--border` (#1E293B) |
| Focus ring | `--ring` (#147BFF) | `--ring` (#147BFF) |
| Muted text | `--muted-foreground` (#94A3B8) | `--muted-foreground` (#94A3B8) |

---

## What's Missing

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| No official brand color documentation | Claude must infer from code | Founder should confirm official palette |
| No accessibility contrast ratios defined | May fail WCAG AA/AAA | Define minimum contrast ratios |
| No gradient definitions | Inconsistent gradient usage | Define brand gradients if any |
| No opacity/alpha scale | Inconsistent transparency | Define opacity scale |
