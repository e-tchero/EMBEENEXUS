# PHASE 6 — DISCOVERY REPORT

**Date:** 2026-08-25
**Status:** DISCOVERY COMPLETE — READY FOR ARCHITECTURE REVIEW

---

## 1. Executive Summary

Phase 6 must transform the **technically complete MVP** into a **coherent, branded, production-ready Embee Nexus product**.

The backend is comprehensive (42 API routes, 26 components, full state machine, payment processing, background jobs). The critical gap is **visual/brand coherence** — the customer-facing and rider-facing UIs still use the original Next.js boilerplate design, while only the admin (Phase 5D) implements the EMBEE NEXUS brand kit.

### Key Findings

| Area | Status | Severity |
|------|--------|----------|
| Homepage | Next.js boilerplate | **CRITICAL** |
| Login/Signup | Generic gray design, no brand | **CRITICAL** |
| Dashboard layout | Generic, no brand | **HIGH** |
| Customer nav | "MBEENEXUS" text, no logo | **HIGH** |
| Rider nav | "MBEENEXUS" text, no logo | **HIGH** |
| Root font | Inter (should be Manrope) | **HIGH** |
| Root metadata | "Delivery Platform" (should be "Embee Nexus") | **HIGH** |
| Primary color | `hsl(222, 47%, 11%)` dark navy (should be Embee Blue) | **HIGH** |
| Hard-coded colors | 419 occurrences of generic Tailwind colors | **HIGH** |
| Embee token usage | Only 86 occurrences | **MEDIUM** |
| Status badges | 15 duplicate definitions across components | **MEDIUM** |
| Logo assets | Zero — no SVG/PNG logo in public/ | **HIGH** |
| No hero section | No marketing/landing page | **MEDIUM** |
| `/track` page | Linked from homepage but doesn't exist | **MEDIUM** |
| `/register` page | Linked from homepage but doesn't exist | **MEDIUM** |
| `/business` page | Linked from homepage but doesn't exist | **LOW** |
| Mobile nav | No mobile hamburger menu | **MEDIUM** |
| Rider document upload | Placeholder URLs, no real storage | **LOW** |

---

## 2. Current Product State

### Repository Baseline

| Field | Value |
|-------|-------|
| HEAD | `729bc862d931c3bc7487a6a0cb86aefc1ade7465` |
| Total commits | 12 (Milestone 1–4 complete) |
| API routes | 42 |
| Components | 26 |
| Pages | 13 |
| Test files | 12 (407 tests) |

### What Exists

**Backend (COMPLETE):**
- Auth (login, signup, session, middleware)
- Customer booking flow (quote, order, payment, Paystack)
- Order tracking (real-time, polling, map)
- Rider registration, onboarding, verification
- Rider offers, delivery workflow (7 state transitions)
- Rider earnings, earnings summary
- Admin rider verification (approve/reject)
- Background jobs (dispatch, offer timeout, refund, stuck-job recovery)
- Payment webhook processing
- Cancellation, refund workflow
- Rating system
- Delivery proof

**Frontend (FUNCTIONAL but UNBRANDED):**
- Homepage (Next.js boilerplate)
- Login/Signup (generic gray)
- Customer dashboard (booking form)
- Order list
- Order detail with tracking
- Rider dashboard (Phase 5B — functional)
- Admin dashboard (Phase 5D — branded)

---

## 3. Customer Experience Audit

### 3.1 Homepage (`/`)

**Status:** CRITICAL — Next.js default boilerplate

| Issue | Severity |
|-------|----------|
| "Delivery Platform — Coming Soon" title | CRITICAL |
| "Powered by Next.js" link | CRITICAL |
| No EMBEE NEXUS branding | CRITICAL |
| No hero section | CRITICAL |
| No value proposition | HIGH |
| Generic card layout with `->` arrows | HIGH |
| Links to non-existent `/register`, `/track`, `/business` | HIGH |
| Uses `<a>` tags instead of `<Link>` | MEDIUM |
| `font-mono` monospace for navigation text | LOW |

### 3.2 Login (`/login`)

**Status:** HIGH — Functional but generic

| Issue | Severity |
|-------|----------|
| "MBEENEXUS" text (should be "Embee Nexus" with logo) | HIGH |
| Generic `bg-gray-50` background | HIGH |
| `text-primary` uses wrong color (dark navy, not Embee Blue) | HIGH |
| No EMBEE NEXUS logo | HIGH |
| No tagline/branding | MEDIUM |
| Generic gray form styling | MEDIUM |

### 3.3 Signup (`/signup`)

**Status:** HIGH — Same issues as login

| Issue | Severity |
|-------|----------|
| Same branding issues as login | HIGH |
| "MBEENEXUS" text instead of branded logo | HIGH |
| Green success state uses generic Tailwind green | LOW |

### 3.4 Customer Dashboard (`/dashboard`)

**Status:** HIGH — Functional booking flow, unbranded

| Issue | Severity |
|-------|----------|
| "Welcome to MBEENEXUS" text (not branded) | HIGH |
| Booking form uses generic gray styling | HIGH |
| No EMBEE NEXUS branding | MEDIUM |
| Empty state is plain | MEDIUM |

### 3.5 Order List (`/orders`)

**Status:** MEDIUM — Functional, needs brand alignment

| Issue | Severity |
|-------|----------|
| Duplicate `statusColors` object (not using StatusBadge) | MEDIUM |
| Uses `<a>` tags instead of `<Link>` | MEDIUM |
| Generic gray card styling | MEDIUM |
| No brand colors | LOW |

### 3.6 Order Detail / Tracking (`/orders/[id]`)

**Status:** MEDIUM — Functional, needs brand alignment

| Issue | Severity |
|-------|----------|
| StatusBadge component exists and is used ✅ | — |
| Map integration works ✅ | — |
| Real-time tracking works ✅ | — |
| Cancel, refund, proof, rating all integrated ✅ | — |
| Terminal state banners use generic colors | MEDIUM |
| "Finding a rider" animation uses generic blue | LOW |

### 3.7 Addresses (`/addresses`)

**Status:** LOW — Functional, needs minor brand alignment

---

## 4. Rider Experience Audit

### 4.1 Rider Layout (`/rider/*`)

**Status:** HIGH — Generic navbar

| Issue | Severity |
|-------|----------|
| "MBEENEXUS" text, no logo | HIGH |
| Generic white navbar with gray text | HIGH |
| No brand colors | HIGH |
| No mobile hamburger menu | MEDIUM |

### 4.2 Rider Dashboard (`/rider/dashboard`)

**Status:** MEDIUM — Functional Phase 5B implementation

| Issue | Severity |
|-------|----------|
| Generic gray styling throughout | MEDIUM |
| Empty states use emoji (🔍, ⏸️) | LOW |
| Earnings panel functional ✅ | — |
| Offer card functional ✅ | — |
| Active delivery functional ✅ | — |

### 4.3 Rider Registration (`/rider/register`)

**Status:** HIGH — Generic design

| Issue | Severity |
|-------|----------|
| "MBEENEXUS" text, no logo | HIGH |
| Generic gray form styling | HIGH |

### 4.4 Rider Onboarding (`/rider/onboarding`)

**Status:** MEDIUM — Functional

| Issue | Severity |
|-------|----------|
| Duplicate status badge definitions (not using StatusBadge) | MEDIUM |
| Generic styling | MEDIUM |

---

## 5. Admin Experience Audit

### 5.1 Admin Layout (`/admin/*`)

**Status:** GOOD — Branded with EMBEE NEXUS kit ✅

| Check | Result |
|-------|--------|
| Midnight Navy sidebar | ✅ |
| Embee Blue active state | ✅ |
| Manrope font | ✅ |
| Logo/wordmark | ✅ (EN text mark) |
| Navigation | ✅ |
| Responsive (mobile sidebar hidden) | ✅ |

### 5.2 Admin Dashboard

**Status:** GOOD — Branded ✅

### 5.3 Admin Rider Queue

**Status:** GOOD — Branded ✅

### 5.4 Admin Rider Detail

**Status:** GOOD — Branded ✅

---

## 6. Design-System Audit

### 6.1 Color Usage

| Metric | Count | Status |
|--------|-------|--------|
| Hard-coded Tailwind colors | 419 | ❌ INCONSISTENT |
| Embee token usages | 86 | ✅ |
| Total color references | ~505 | — |
| Brand token adoption | ~17% | ❌ LOW |

**Specific violations:**

| Color | Should Be | Used As |
|-------|-----------|---------|
| Primary buttons | `bg-embee-blue` | `bg-primary-600` (dark navy) |
| Page backgrounds | `bg-embee-white` | `bg-gray-50` |
| Text | `text-embee-charcoal` | `text-gray-900` |
| Metadata | `text-embee-slate` | `text-gray-500` |
| Borders | `border-embee-slate/20` | `border-gray-300` |
| Status green | Brand green | `bg-green-100 text-green-800` |
| Status red | Brand red | `bg-red-100 text-red-800` |

### 6.2 Typography

| Area | Font | Status |
|------|------|--------|
| Root layout | Inter | ❌ Should be Manrope |
| Admin layout | Manrope | ✅ |
| Customer pages | Inter (inherited) | ❌ |
| Rider pages | Inter (inherited) | ❌ |

### 6.3 Component Duplication

| Component | Definitions | Status |
|-----------|-------------|--------|
| StatusBadge | `shared/status-badge.tsx` (canonical) | ✅ |
| Duplicate: orders page | `statusColors` object | ❌ Not using StatusBadge |
| Duplicate: onboarding | Inline status colors | ❌ Not using StatusBadge |
| Duplicate: admin document-card | `getStatusBadge` | ❌ Not using StatusBadge |
| Duplicate: admin rider-detail | `getStatusBadge` | ❌ Not using StatusBadge |
| Duplicate: admin rider-queue | `getStatusBadge` | ❌ Not using StatusBadge |
| Duplicate: admin verification-history | Inline status styles | ❌ Not using StatusBadge |
| Duplicate: refund-status | `STATUS_CONFIG` | ❌ Separate but similar |

**Total duplicate status definitions: 7** (should be 0)

### 6.4 Navigation Patterns

| Area | Pattern | Brand Status |
|------|---------|-------------|
| Customer nav | Horizontal top bar | ❌ Generic gray |
| Rider nav | Horizontal top bar | ❌ Generic gray |
| Admin nav | Left sidebar | ✅ Branded |
| Mobile nav | None (hidden) | ❌ Missing |

### 6.5 Shared Components

| Component | Exists | Used Everywhere |
|-----------|--------|----------------|
| StatusBadge | ✅ | ❌ Only in tracking |
| Button variants | ❌ | — |
| Card component | ❌ | — |
| Input component | ❌ | — |
| Dialog/Modal | ❌ | — |
| Toast/Notification | ❌ | — |
| Loading skeleton | ❌ | — |
| Empty state | ❌ | — |
| Error boundary | ❌ | — |

---

## 7. Brand Compliance Audit

### 7.1 EMBEE NEXUS Brand Kit vs Implementation

| Brand Requirement | Implementation | Status |
|-------------------|----------------|--------|
| **Logo (E/N monogram)** | Not present anywhere | ❌ |
| **App Icon** | Not present | ❌ |
| **Favicon** | Default Next.js | ❌ |
| **Manrope typography** | Only admin layout | ❌ Partial |
| **Midnight Navy #0B1220** | Only admin sidebar | ❌ Partial |
| **Embee Blue #147BFF** | Only admin active state | ❌ Partial |
| **Digital Cyan #38BDF8** | Only admin sidebar | ❌ Minimal |
| **Cool White #F5F7FA** | Only admin background | ❌ Partial |
| **Deep Charcoal #111827** | Only admin text | ❌ Partial |
| **Slate #64748B** | Only admin metadata | ❌ Partial |
| **Premium Tech feel** | Only admin | ❌ Partial |
| **Restrained cards/borders** | Only admin | ❌ Partial |
| **Generous whitespace** | Inconsistent | ⚠️ |
| **Text + color status** | Mostly correct | ✅ |
| **Brand name "Embee Nexus"** | "MBEENEXUS" everywhere | ❌ |

### 7.2 Critical Brand Violations

1. **No logo** — The E/N monogram is not implemented anywhere. Admin uses a text "EN" placeholder.
2. **Wrong primary color** — `--primary` CSS variable is dark navy (`hsl(222, 47%, 11%)`), not Embee Blue. All `text-primary`, `bg-primary-600` buttons are the wrong color.
3. **Wrong font** — Inter is global, Manrope is admin-only.
4. **Wrong brand name** — "MBEENEXUS" (no space, all caps) vs "Embee Nexus" (proper casing).
5. **Homepage is boilerplate** — Next.js default template, not an EMBEE NEXUS landing page.
6. **No marketing/landing page** — No hero, no value proposition, no CTA.

---

## 8. Backend/API Gap Analysis

### 8.1 Existing APIs (42 routes)

| Category | Routes | Status |
|----------|--------|--------|
| Auth | 2 (login, signup) | ✅ |
| Addresses | 3 | ✅ |
| Categories | 1 | ✅ |
| Orders | 4 (CRUD, quote, cancel, refund, proof, rating) | ✅ |
| Payments | 1 (initialize) | ✅ |
| Webhooks | 1 (Paystack) | ✅ |
| Rider | 15 (profile, register, documents, vehicles, location, availability, offers, assignments, earnings, delivery actions) | ✅ |
| Admin | 4 (riders list, detail, verify, document verify) | ✅ |
| Cron | 1 (process-jobs) | ✅ |

### 8.2 Missing APIs

| API | Required For | Priority |
|-----|-------------|----------|
| `GET /api/auth/me` | Profile page, current user info | MEDIUM |
| `PATCH /api/profile` | Customer profile editing | LOW |
| `GET /api/orders/[id]/events` | Dedicated events endpoint (currently server-side only) | LOW |

### 8.3 Backend Verdict

**The backend is production-complete for the current scope.** Phase 6 should be primarily UI/brand work, not new backend features.

---

## 9. Database Gap Analysis

| Item | Status |
|------|--------|
| All tables | ✅ Complete |
| All functions | ✅ Complete |
| All RLS policies | ✅ Complete |
| All triggers | ✅ Complete |
| Storage buckets | ⚠️ `delivery-proofs` not created (deferred) |

**No database changes required for Phase 6.**

---

## 10. Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| All APIs use `auth.uid()` | — | ✅ |
| RLS enforced | — | ✅ |
| SECURITY DEFINER functions | — | ✅ |
| Admin middleware | — | ✅ |
| No client-trusted roles | — | ✅ |
| IDOR protection verified | — | ✅ |
| No secrets in source | — | ✅ |
| `.env.local` untracked | — | ✅ |

**No security changes required for Phase 6.**

---

## 11. Performance Findings

| Finding | Severity |
|---------|----------|
| No image optimization (no `<Image>` usage) | MEDIUM |
| No lazy loading for below-fold content | LOW |
| Bundle size adequate for current scope | ✅ |
| No excessive client-side rendering | ✅ |

---

## 12. Mobile UX Findings

| Area | Status | Issue |
|------|--------|-------|
| Customer nav | ❌ | No hamburger menu — nav hidden on mobile |
| Rider nav | ❌ | No hamburger menu — nav hidden on mobile |
| Admin nav | ✅ | Sidebar hidden on mobile (could add hamburger) |
| Booking form | ✅ | Single column on mobile |
| Order list | ✅ | Cards stack on mobile |
| Tracking | ✅ | Map and cards responsive |
| Rider dashboard | ✅ | Grid collapses |
| Forms | ✅ | Inputs full width on mobile |

---

## 13. Accessibility Findings

| Finding | Severity |
|---------|----------|
| No `aria-label` on interactive elements | LOW |
| No skip-to-content link | LOW |
| No focus management for modals | MEDIUM |
| Color contrast: Embee Blue on white may fail WCAG AA | MEDIUM |
| Form inputs have labels ✅ | — |
| Buttons have visible text ✅ | — |

---

## 14. Production Readiness Assessment

| Category | Score | Notes |
|----------|-------|-------|
| Backend | 95% | Complete and solid |
| Auth/Security | 95% | Comprehensive |
| Payment processing | 90% | Paystack integration working |
| Background jobs | 85% | Working, needs monitoring |
| Customer UI | 40% | Functional but unbranded |
| Rider UI | 50% | Phase 5B functional, unbranded |
| Admin UI | 80% | Phase 5D branded and functional |
| Brand compliance | 20% | Only admin area compliant |
| Mobile UX | 60% | Functional but missing mobile nav |
| Documentation | 70% | Milestone docs exist |

---

## 15. Recommended Phase 6 Sub-Phases

Based on the discovery, Phase 6 should be divided into focused sub-phases:

### Phase 6A — Brand Foundation & Design System

**Priority: CRITICAL**
**Effort: Medium**

- Replace Inter with Manrope globally
- Fix `--primary` CSS variable to Embee Blue
- Update root metadata to "Embee Nexus"
- Create EMBEE NEXUS logo SVG assets
- Create favicon and app icon
- Create shared design system components (Button, Card, Input, Badge, etc.)
- Update brand name from "MBEENEXUS" to "Embee Nexus" everywhere
- Update Tailwind primary color to Embee Blue

### Phase 6B — Homepage & Marketing

**Priority: CRITICAL**
**Effort: Medium**

- Build EMBEE NEXUS landing page with hero section
- Value proposition
- Feature highlights
- CTA (Sign Up / Become a Rider)
- Fix broken links (`/register` → `/signup`, remove `/track` and `/business`)
- Remove "Powered by Next.js"
- Premium Tech aesthetic

### Phase 6C — Customer Auth & Dashboard Rebrand

**Priority: HIGH**
**Effort: Medium**

- Rebrand login page with EMBEE NEXUS identity
- Rebrand signup page
- Rebrand customer dashboard layout with branded navigation
- Add mobile hamburger menu
- Apply brand colors to booking form
- Rebrand order list
- Unify status badges (use StatusBadge component everywhere)

### Phase 6D — Rider Experience Rebrand

**Priority: HIGH**
**Effort: Medium**

- Rebrand rider layout with EMBEE NEXUS navigation
- Add mobile hamburger menu
- Apply brand colors to rider dashboard
- Rebrand rider registration
- Rebrand rider onboarding
- Unify status badges

### Phase 6E — Tracking & Order Detail Polish

**Priority: MEDIUM**
**Effort: Low**

- Apply brand colors to tracking UI
- Polish terminal state banners
- Polish rider card
- Polish search animation
- Apply brand colors to timeline

### Phase 6F — Final Polish & QA

**Priority: MEDIUM**
**Effort: Low**

- Cross-browser testing
- Mobile responsiveness audit
- Accessibility pass
- Performance optimization
- Final brand compliance check

---

## 16. Dependency Analysis

| Dependency | Required | Notes |
|------------|----------|-------|
| `next/font/google` | Already installed | Manrope available |
| `lucide-react` | Check | May need for icons |
| `@radix-ui/react-dialog` | Check | For modals |
| `@radix-ui/react-dropdown-menu` | Check | For mobile nav |

**No new major dependencies expected.** The existing stack should support all Phase 6 work.

---

## 17. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep into new features | HIGH | HIGH | Strict sub-phase discipline |
| Breaking existing functionality | MEDIUM | HIGH | Incremental changes, test after each |
| Font loading performance | LOW | MEDIUM | Use `next/font` (already done in admin) |
| Color contrast failures | MEDIUM | MEDIUM | Test against WCAG AA |
| Mobile nav complexity | LOW | LOW | Simple hamburger pattern |

---

## 18. Recommended Implementation Order

1. **Phase 6A** — Brand Foundation (colors, font, tokens, shared components)
2. **Phase 6B** — Homepage (landing page, hero, CTAs)
3. **Phase 6C** — Customer rebrand (auth, dashboard, orders)
4. **Phase 6D** — Rider rebrand (layout, dashboard, registration)
5. **Phase 6E** — Tracking polish
6. **Phase 6F** — Final QA

Each sub-phase must:
- Pass typecheck, lint, tests, build
- Pass brand compliance check
- Not break existing functionality
- Be independently committable

---

## 19. Files Likely to Change

### Phase 6A (Brand Foundation)

| File | Change |
|------|--------|
| `apps/web/app/layout.tsx` | Inter → Manrope, metadata update |
| `apps/web/app/globals.css` | Fix primary color, update tokens |
| `apps/web/tailwind.config.ts` | Update primary to Embee Blue |
| `apps/web/public/` | Add logo SVGs, favicon |
| `apps/web/components/shared/` | Add Button, Card, Input, etc. |

### Phase 6B (Homepage)

| File | Change |
|------|--------|
| `apps/web/app/page.tsx` | Complete rewrite |

### Phase 6C (Customer Rebrand)

| File | Change |
|------|--------|
| `apps/web/app/login/page.tsx` | Brand redesign |
| `apps/web/app/signup/page.tsx` | Brand redesign |
| `apps/web/app/(dashboard)/layout.tsx` | Branded nav |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Brand colors |
| `apps/web/app/(dashboard)/orders/page.tsx` | Brand colors, use StatusBadge |
| `apps/web/app/(dashboard)/orders/[id]/page.tsx` | Minor brand |
| `apps/web/app/(dashboard)/addresses/page.tsx` | Minor brand |

### Phase 6D (Rider Rebrand)

| File | Change |
|------|--------|
| `apps/web/app/rider/layout.tsx` | Branded nav |
| `apps/web/app/rider/register/page.tsx` | Brand redesign |
| `apps/web/app/rider/onboarding/page.tsx` | Brand redesign, use StatusBadge |
| `apps/web/app/rider/dashboard/page.tsx` | Minor brand |
| `apps/web/components/rider/*.tsx` | Brand colors |

---

## 20. Verification

| Check | Result |
|-------|--------|
| Source code modified | NONE (discovery only) |
| Migrations modified | NONE |
| Dependencies changed | NONE |
| Git history modified | NONE |
| Working tree clean | ✅ (only untracked docs) |
| AI attribution | ZERO |

---

**PHASE 6 DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**
