# PHASE 6B — DISCOVERY REPORT

**Date:** August 25, 2026
**Baseline:** `dc434d1` (Phase 6A — Brand Foundation)

---

## 1. Executive Summary

The current Embee Nexus homepage is a **pure Next.js boilerplate** — a dark-gradient "Coming Soon" page with zero brand identity, zero product positioning, and zero marketing value. The login, signup, and rider registration pages also lack brand identity, using hard-coded "MBEENEXUS" text and generic gray styling.

Phase 6B must transform this into a **premium Embee Nexus marketing page** that communicates the actual implemented platform capabilities using the approved brand system.

---

## 2. Current Homepage State

### `apps/web/app/page.tsx`

| Element | Current State | Issue |
|---------|--------------|-------|
| Content | "Delivery Platform — Coming Soon" | Placeholder text |
| Brand | None — dark gradient, gray borders | No Embee identity |
| Logo | None | No Logo component used |
| Navigation | None | No nav, no footer |
| CTAs | 4 generic card links (gray borders) | No primary CTA, no hierarchy |
| Links | `/register`, `/track`, `/rider/register`, `/business` | `/register` and `/track` don't exist; `/business` doesn't exist |
| Typography | Inter (old) / now Manrope via Phase 6A | Font loaded but styles override it |
| Colors | `dark:` mode classes, gray-300, zinc-800 | No brand colors |
| Responsive | Desktop-only grid | No mobile consideration |
| Accessibility | No landmarks, no skip links | Poor |

### Assessment: **CRITICAL** — Must be completely replaced.

---

## 3. Login / Signup / Rider Registration

### Login (`/login`)
- Uses hard-coded `<h1 className="text-3xl font-bold text-primary">MBEENEXUS</h1>`
- Gray background (`bg-gray-50`)
- Functional but completely unbranded
- No Logo component

### Signup (`/signup`)
- Same "MBEENEXUS" hard-coded text
- Same gray background
- Functional but unbranded

### Rider Registration (`/rider/register`)
- Same "MBEENEXUS" hard-coded text
- Same gray background
- Two-step form (account → vehicle)
- Functional but unbranded

### Assessment: **HIGH** — Should be rebranded in Phase 6C (customer rebrand), not 6B.

---

## 4. Existing Reusable Components (from Phase 6A)

| Component | Available | Use in Homepage |
|-----------|-----------|-----------------|
| `Logo` | ✅ `components/shared/logo.tsx` | Header, footer |
| `AppNav` | ✅ `components/shared/app-nav.tsx` | Customer nav (with links) |
| `MobileNav` | ✅ `components/shared/mobile-nav.tsx` | Mobile hamburger |
| `Button` | ✅ `components/ui/button.tsx` | CTAs |
| `Card` | ✅ `components/ui/card.tsx` | Feature cards |
| `Badge` | ✅ `components/ui/badge.tsx` | Status indicators |
| `PageHeader` | ✅ `components/shared/page-header.tsx` | Section headers |
| `EmptyState` | ✅ `components/shared/empty-state.tsx` | Not needed for marketing |
| `LoadingState` | ✅ `components/shared/loading-state.tsx` | Not needed for marketing |

### CSS Variables (from Phase 6A)
```css
--embee-navy: #0B1220;
--embee-blue: #147BFF;
--embee-cyan: #38BDF8;
--embee-white: #F5F7FA;
--embee-charcoal: #111827;
--embee-slate: #64748B;
```

### Tailwind Classes Available
```css
bg-embee-navy, text-embee-blue, text-embee-cyan, bg-embee-white,
text-embee-charcoal, text-embee-slate, border-embee-blue, etc.
```

---

## 5. Brand Compliance Audit

### Current Homepage Violations

| Brand Rule | Current | Required |
|------------|---------|----------|
| Typography | Inter (overridden by Manrope) | Manrope |
| Primary color | None — dark gradients | Embee Blue `#147BFF` |
| Background | Dark gradients (`dark:` mode) | Cool White `#F5F7FA` / White |
| Text | Gray-300, zinc-800 | Deep Charcoal `#111827` |
| Logo | None | Logo component |
| Navigation | None | AppNav |
| CTA | Gray border cards | Embee Blue buttons |
| Brand name | "Delivery Platform" | "Embee Nexus" |
| Footer | None | Branded footer |

### Login/Signup Violations

| Brand Rule | Current | Required |
|------------|---------|----------|
| Brand name | "MBEENEXUS" | "Embee Nexus" |
| Logo | Hard-coded h1 | Logo component |
| Background | `bg-gray-50` | `bg-embee-white` |
| Input styling | Gray borders | Brand-consistent |
| Button | `bg-primary-600` (old shade) | Embee Blue |

---

## 6. Product Capabilities Available for Marketing

### Implemented (can truthfully market)

| Capability | Status | API Evidence |
|------------|--------|-------------|
| Customer booking with instant quotes | ✅ Implemented | `POST /api/orders/quote`, `POST /api/orders` |
| Multiple delivery categories | ✅ Implemented | `GET /api/categories` |
| Address management | ✅ Implemented | `GET/POST /api/addresses` |
| Payment via Paystack (card, bank transfer, USSD) | ✅ Implemented | `POST /api/payments/initialize` |
| Real-time order tracking with Mapbox | ✅ Implemented | Phase 5A, broadcast infrastructure |
| Rider dispatch & offer system | ✅ Implemented | Background jobs, offers API |
| Active delivery workflow | ✅ Implemented | 7-step rider delivery API |
| Delivery proof | ✅ Implemented | Proof upload, recipient confirmation |
| Order cancellation & refunds | ✅ Implemented | Phase 4C |
| Rider earnings & accounting | ✅ Implemented | Phase 4B |
| Admin rider verification | ✅ Implemented | Phase 5D |
| Background job reliability | ✅ Implemented | Phase 4D |

### Not Implemented (do NOT market)

| Capability | Status |
|------------|--------|
| Business/enterprise API | Not implemented |
| Multi-package batching | Not implemented |
| International delivery | Not implemented |
| Same-day guaranteed delivery | Not implemented |
| Fleet management | Not implemented |

---

## 7. Recommended Homepage Information Architecture

### Structure

```
┌─────────────────────────────────────────┐
│  HEADER / NAVIGATION                    │
│  Logo · Customer · Rider · Sign In      │
├─────────────────────────────────────────┤
│  HERO                                   │
│  Headline · Subheadline · Primary CTA   │
│  Secondary CTA                          │
├─────────────────────────────────────────┤
│  HOW IT WORKS                           │
│  3-step process: Book → Track → Receive │
├─────────────────────────────────────────┤
│  FEATURES / SERVICES                    │
│  Delivery categories, tracking, proof   │
├─────────────────────────────────────────┤
│  FOR RIDERS                             │
│  Value prop · CTA to register           │
├─────────────────────────────────────────┤
│  TRUST / RELIABILITY                    │
│  Security, payment, verification        │
├─────────────────────────────────────────┤
│  FINAL CTA                              │
│  "Get Started"                          │
├─────────────────────────────────────────┤
│  FOOTER                                 │
│  Logo, links, copyright                 │
└─────────────────────────────────────────┘
```

### Content Mapping

| Section | Content | CTA |
|---------|---------|-----|
| **Hero** | "You want it delivered." + core promise | "Send a Package" → /signup |
| **How It Works** | 3 steps: Book, Track, Receive | — |
| **Features** | Booking, tracking, proof, payments | "Get Started" → /signup |
| **For Riders** | Earn money, flexible schedule | "Become a Rider" → /rider/register |
| **Trust** | Verified riders, secure payments, real-time tracking | — |
| **Final CTA** | Reiterate core promise | "Send a Package" → /signup |
| **Footer** | Logo, navigation links, copyright | — |

---

## 8. Responsive / Mobile Considerations

| Breakpoint | Header | Hero | Features | Footer |
|------------|--------|------|----------|--------|
| Mobile (< 640px) | Hamburger + Logo | Stacked, large text | Single column | Stacked |
| Tablet (640–1024px) | Full nav + Logo | Stacked | 2-column grid | Horizontal |
| Desktop (> 1024px) | Full nav + Logo | Side-by-side possible | 3-column grid | Horizontal |

---

## 9. SEO / Metadata Considerations

Current metadata (set in Phase 6A):
```typescript
title: 'Embee Nexus'
description: 'You want it delivered. Embee Nexus is the right platform for the job.'
```

Recommended additions:
- Open Graph title/description
- OG image (placeholder or brand asset)
- Canonical URL
- Structured data (Organization)

These are LOW priority and can be deferred.

---

## 10. Asset Requirements

| Asset | Status | Notes |
|-------|--------|-------|
| E/N monogram SVG | ❌ External dependency | Not in repo — use text wordmark |
| Hero illustration | ❌ Not available | Use CSS/gradient or defer |
| Feature icons | ❌ Not available | Use SVG inline or defer |
| Favicon | ❌ Not in public/ | Create minimal placeholder |
| OG image | ❌ Not available | Defer |

### Decision: **No new image assets required for MVP homepage.**

The homepage should work with:
- Text wordmark (existing Logo component)
- CSS gradients and shapes for visual interest
- Inline SVG icons for features/steps
- Brand colors as the primary visual language

---

## 11. Dependencies

**ZERO new dependencies required.**

All needed components exist from Phase 6A:
- Logo, AppNav, MobileNav, Button, Card, Badge
- CSS variables, Tailwind embee tokens
- Manrope font

---

## 12. Backend / API Requirements

**ZERO backend changes required.**

The homepage is purely a presentation layer. No new APIs, no database changes, no migrations.

---

## 13. Broken Links on Current Homepage

| Link | Target | Exists? |
|------|--------|---------|
| `/register` | Customer signup | ✅ `/signup` (wrong path) |
| `/track` | Order tracking | ❌ No standalone page |
| `/rider/register` | Rider registration | ✅ Exists |
| `/business` | Business delivery | ❌ Not implemented |

### Decision: Correct paths in the new homepage. `/track` should go to `/signup` (tracking requires auth). `/business` should be removed or replaced with a working link.

---

## 14. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Over-designing the homepage | MEDIUM | Keep it clean and minimal — the brand kit says "restrained" |
| Making false capability claims | HIGH | Only claim implemented features |
| Breaking existing routes | LOW | Only modify `page.tsx` |
| Accessibility regression | MEDIUM | Test keyboard nav, contrast, landmarks |
| Mobile UX | MEDIUM | Design mobile-first |

---

## 15. Out of Scope for Phase 6B

- Login/signup rebrand → Phase 6C
- Customer dashboard rebrand → Phase 6C
- Rider pages rebrand → Phase 6D
- Image assets / illustrations → External dependency
- E/N monogram → External dependency
- Blog / content marketing
- SEO optimization beyond basic metadata
- Analytics / tracking
- A/B testing

---

## 16. Recommended Implementation Sequence

### Step 1: Replace `apps/web/app/page.tsx`
- Complete rewrite — remove all boilerplate
- Build hero, how-it-works, features, rider, trust, CTA, footer sections
- Use existing Phase 6A components (Logo, Button, Card)
- Use brand CSS variables and Tailwind embee tokens
- Mobile-first responsive design
- Accessible: landmarks, headings hierarchy, focus states

### Step 2: Create minimal footer component (if needed)
- Or inline it in page.tsx for simplicity

### Step 3: Create minimal favicon
- Simple placeholder (text or shape) — not the final brand asset

### Step 4: Verification
- Typecheck
- Tests
- Production build
- Browser verification (desktop + mobile)
- Brand compliance check
- Attribution scan

---

## 17. Files Expected to Change

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/app/page.tsx` | **REWRITE** | Complete homepage replacement |
| `apps/web/app/not-found.tsx` | **MODIFY** | Brand-consistent 404 |
| `apps/web/public/favicon.ico` | **CREATE** | Placeholder favicon |

### Files NOT changed
- No component changes
- No layout changes (Phase 6A layouts already branded)
- No API changes
- No database changes
- No dependency changes

---

## PHASE 6B DISCOVERY STATUS: **GO**

The current homepage is a clear critical gap. The architecture is straightforward — a single page rewrite using existing components and brand tokens. Zero backend work, zero new dependencies, zero database changes.

**Ready for architecture review.**
