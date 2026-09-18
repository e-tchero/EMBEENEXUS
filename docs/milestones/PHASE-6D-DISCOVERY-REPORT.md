# PHASE 6D — DISCOVERY REPORT

## 1. Executive Summary

The Rider experience across 4 pages and 6 components contains extensive brand violations inherited from the pre-Phase 6A codebase. The rider registration, onboarding, dashboard, and all supporting components use generic gray Tailwind classes, old `primary-600`/`primary-700` button shades, incorrect brand name references ("MBEENEXUS"), and lack shared component integration (Logo, StatusBadge). The rider layout was upgraded in Phase 6A to use AppNav, but all other rider surfaces remain unbranded.

**Severity:** CRITICAL — The rider experience is the least branded surface in the application.

**Scope:** 10 source files, presentation-layer only. Zero backend/database/API/dependency changes.

---

## 2. Current State Inventory

### Rider Pages (4)

| File | Type | Status |
|------|------|--------|
| `app/rider/layout.tsx` | Server | ✅ **Already branded** — uses AppNav, bg-embee-white |
| `app/rider/register/page.tsx` | Client | ❌ **CRITICAL** — MBEENEXUS, gray-50 bg, all gray classes |
| `app/rider/onboarding/page.tsx` | Client | ❌ **CRITICAL** — MBEENEXUS, gray-50 bg, all gray classes |
| `app/rider/dashboard/page.tsx` | Server | ⚠️ **MINOR** — uses `<a>` tag, generic gray pending state |

### Rider Components (6)

| File | Type | Status |
|------|------|--------|
| `components/rider/rider-dashboard.tsx` | Client | ❌ **HIGH** — gray-500/900, no brand tokens |
| `components/rider/active-delivery-card.tsx` | Client | ❌ **HIGH** — gray, blue-600, purple-600, indigo-600 |
| `components/rider/availability-toggle.tsx` | Client | ⚠️ **MEDIUM** — gray-300, gray-700 |
| `components/rider/delivery-progress-steps.tsx` | Client | ⚠️ **MEDIUM** — gray, blue, green hardcoded |
| `components/rider/earnings-panel.tsx` | Client | ❌ **HIGH** — gray-50, gray-900, gray-500 |
| `components/rider/offer-card.tsx` | Client | ❌ **HIGH** — gray, blue-500, green-600 |

---

## 3. Findings by Severity

### CRITICAL (3)

| # | Finding | File | Line(s) |
|---|---------|------|---------|
| 1 | **"MBEENEXUS" brand name** — should be "Embee Nexus" with `<Logo />` | `register/page.tsx` | 110 |
| 2 | **"MBEENEXUS" brand name** — should be "Embee Nexus" with `<Logo />` | `onboarding/page.tsx` | 106 |
| 3 | **`bg-gray-50` backgrounds** — should be `bg-embee-white` | `register/page.tsx`, `onboarding/page.tsx` | 106, 86, 102 |

### HIGH (8)

| # | Finding | File | Details |
|---|---------|------|---------|
| 4 | **No `<Logo />` component** on register or onboarding | `register/page.tsx`, `onboarding/page.tsx` | Both use `<h1>MBEENEXUS</h1>` |
| 5 | **`text-gray-900` headings** — should be `text-embee-charcoal` | `register/page.tsx`, `onboarding/page.tsx`, `rider-dashboard.tsx`, `active-delivery-card.tsx`, `earnings-panel.tsx`, `offer-card.tsx` | 20+ occurrences |
| 6 | **`text-gray-600/700` body text** — should be `text-embee-slate` | `register/page.tsx`, `onboarding/page.tsx`, `rider-dashboard.tsx`, `active-delivery-card.tsx`, `earnings-panel.tsx`, `offer-card.tsx` | 15+ occurrences |
| 7 | **`bg-primary-600` buttons** — should be `bg-embee-blue` | `register/page.tsx`, `onboarding/page.tsx` | 6+ buttons |
| 8 | **`hover:bg-primary-700`** — should be `hover:bg-embee-blue/90` | `register/page.tsx`, `onboarding/page.tsx` | 6+ buttons |
| 9 | **`bg-blue-600` delivery actions** — should use brand-consistent action colors | `active-delivery-card.tsx` | ACTION_CONFIG line 35 |
| 10 | **`bg-purple-600` delivery actions** — non-brand color | `active-delivery-card.tsx` | ACTION_CONFIG lines 36, 38 |
| 11 | **`bg-indigo-600` delivery action** — non-brand color | `active-delivery-card.tsx` | ACTION_CONFIG line 37 |

### MEDIUM (7)

| # | Finding | File | Details |
|---|---------|------|---------|
| 12 | **`<a href="/rider/onboarding">`** — should be `<Link>` | `dashboard/page.tsx` | Line 31 |
| 13 | **`<a href="tel:...">`** — acceptable for tel: links but uses `text-blue-600` | `active-delivery-card.tsx` | Line 146 |
| 14 | **Inline verification badges** — should use canonical `<StatusBadge />` | `onboarding/page.tsx` | Lines 120, 160 |
| 15 | **Delivery progress step colors** — `bg-blue-500`, `bg-green-500`, `bg-gray-200` hardcoded | `delivery-progress-steps.tsx` | Lines 35-50 |
| 16 | **Earnings summary cards** — `bg-gray-50` hardcoded | `earnings-panel.tsx` | Lines 103, 107 |
| 17 | **Offer card border** — `border-blue-500` hardcoded | `offer-card.tsx` | Line 79 |
| 18 | **Availability toggle** — `bg-gray-300` for offline state | `availability-toggle.tsx` | Line 49 |

### LOW (3)

| # | Finding | File | Details |
|---|---------|------|---------|
| 19 | **`focus:ring-primary-500`** — should be `focus:ring-embee-blue` | Multiple files | All form inputs/buttons |
| 20 | **`placeholder-gray-400`** — minor, cosmetic | `register/page.tsx` | Input placeholders |
| 21 | **`border-gray-300`** — form borders, acceptable but could be `border-embee-slate/30` | Multiple files | Form elements |

---

## 4. Brand Migration Map

### Color Migrations

| From | To | Count | Files |
|------|-----|-------|-------|
| `text-gray-900` | `text-embee-charcoal` | 20+ | register, onboarding, dashboard, earnings, offer-card, active-delivery |
| `text-gray-600/700` | `text-embee-slate` | 15+ | register, onboarding, dashboard, earnings, offer-card |
| `text-gray-500` | `text-embee-slate` | 10+ | onboarding, earnings, offer-card, delivery-progress |
| `bg-gray-50` | `bg-embee-white` | 5+ | register, onboarding, earnings |
| `bg-primary-600` | `bg-embee-blue` | 6+ | register, onboarding |
| `hover:bg-primary-700` | `hover:bg-embee-blue/90` | 6+ | register, onboarding |
| `bg-blue-600` | `bg-embee-blue` | 2 | active-delivery-card |
| `bg-purple-600` | `bg-embee-blue/80` | 2 | active-delivery-card |
| `bg-indigo-600` | `bg-embee-blue` | 1 | active-delivery-card |
| `text-blue-600` | `text-embee-blue` | 2 | active-delivery-card, delivery-progress |
| `bg-blue-500` | `bg-embee-blue` | 1 | delivery-progress-steps |
| `border-blue-500` | `border-embee-blue` | 2 | offer-card, active-delivery-card |

### Semantic Status Colors — KEEP

| Color | Purpose | Status |
|-------|---------|--------|
| `bg-green-500/600` | Completed/paid/accept | ✅ KEEP — semantic |
| `bg-red-500/600` | Error/cancel/reject | ✅ KEEP — semantic |
| `bg-yellow-500/600` | Pending/warning | ✅ KEEP — semantic |
| `bg-green-50/100` | Success background | ✅ KEEP — semantic |
| `bg-red-50/100` | Error background | ✅ KEEP — semantic |
| `bg-yellow-50/100` | Warning background | ✅ KEEP — semantic |

### Brand Name

| From | To | Files |
|------|-----|-------|
| `MBEENEXUS` | `<Logo />` | `register/page.tsx`, `onboarding/page.tsx` |

---

## 5. Component Consolidation

| Duplicate | Current Location | Consolidation |
|-----------|-----------------|---------------|
| Inline verification badge (green/red/yellow/gray) | `onboarding/page.tsx` lines 120, 160 | → Use canonical `<StatusBadge />` from `components/ui/status-badge.tsx` |
| Delivery progress step colors | `delivery-progress-steps.tsx` | → Use brand-consistent `bg-embee-blue` for active step |
| Earnings summary cards | `earnings-panel.tsx` | → Use `bg-embee-white` instead of `bg-gray-50` |

---

## 6. Link / Navigation Issues

| Issue | File | Line | Fix |
|-------|------|------|-----|
| `<a href="/rider/onboarding">` | `dashboard/page.tsx` | 31 | → `<Link href="/rider/onboarding">` |
| `<a href="tel:...">` | `active-delivery-card.tsx` | 146 | → KEEP as `<a href="tel:">` (external protocol link) |
| No Logo on register page | `register/page.tsx` | 110 | → Add `<Logo />` |
| No Logo on onboarding page | `onboarding/page.tsx` | 106 | → Add `<Logo />` |

---

## 7. Mobile/Responsive Findings

| Area | Finding | Severity |
|------|---------|----------|
| Rider layout | ✅ Already responsive with AppNav + mobile hamburger | OK |
| Register form | Uses `grid grid-cols-2` for vehicle fields — works on mobile | OK |
| Dashboard grid | `grid-cols-1 lg:grid-cols-3` — responsive | OK |
| Offer card | Single column — works on mobile | OK |
| Active delivery card | Single column — works on mobile | OK |
| Earnings panel | `grid-cols-2` for summary — works on mobile | OK |
| Delivery progress steps | Fixed 6-step horizontal layout — may be tight on very small screens | LOW |

**No critical responsive issues found.** The existing responsive structure is adequate.

---

## 8. Accessibility Findings

| Area | Finding | Severity |
|------|---------|----------|
| Form labels | ✅ All inputs have `<label>` elements | OK |
| Focus states | Uses `focus:ring-primary-500` — should be `focus:ring-embee-blue` | LOW |
| ARIA | Availability toggle has `role="switch"` and `aria-checked` | OK |
| Contrast | Gray-500 text on white may fail WCAG AA | LOW |
| Touch targets | All buttons appear adequately sized | OK |
| Status communication | Inline badges use text + color — OK | OK |

---

## 9. Functionality That Must Remain Untouched

| Surface | Reason |
|---------|--------|
| Rider registration API flow | signup → login → register → redirect |
| Rider onboarding document upload flow | POST /api/riders/documents |
| Rider verification status fetch | GET /api/riders/verification-status |
| Dashboard data fetching | availability + assignment + offers |
| Offer polling (5s/10s interval) | Critical realtime behavior |
| Offer accept/reject API calls | Business logic |
| Active delivery action state machine | Server-authoritative |
| Delivery complete form | Proof submission |
| Availability toggle API | PATCH /api/riders/availability |
| Earnings summary/history fetch | GET /api/riders/earnings/* |
| All rider API routes | Zero changes |
| Authentication/authorization | Zero changes |
| Realtime subscriptions | Zero changes |
| Location tracking | Zero changes |

---

## 10. Database Impact

**ZERO.** No schema changes, no migrations, no function changes.

---

## 11. API Impact

**ZERO.** No API route changes. No request/response shape changes.

---

## 12. Dependency Impact

**ZERO.** All required components (Logo, StatusBadge, AppNav, MobileNav) already exist from Phase 6A.

---

## 13. Mapping Impact

**ZERO.** No Mapbox/Google changes. No mapping configuration changes.

---

## 14. Files Requiring Changes

| # | File | Change Type | Priority |
|---|------|-------------|----------|
| 1 | `app/rider/register/page.tsx` | Full rebrand | CRITICAL |
| 2 | `app/rider/onboarding/page.tsx` | Full rebrand | CRITICAL |
| 3 | `app/rider/dashboard/page.tsx` | Fix `<a>` → `<Link>` | MEDIUM |
| 4 | `components/rider/rider-dashboard.tsx` | Color migration | HIGH |
| 5 | `components/rider/active-delivery-card.tsx` | Color migration + action colors | HIGH |
| 6 | `components/rider/availability-toggle.tsx` | Color migration | MEDIUM |
| 7 | `components/rider/delivery-progress-steps.tsx` | Color migration | MEDIUM |
| 8 | `components/rider/earnings-panel.tsx` | Color migration | HIGH |
| 9 | `components/rider/offer-card.tsx` | Color migration | HIGH |

**Total: 9 files**

---

## 15. Proposed Phase 6D Sub-Scope

### Batch 1 — CRITICAL (register + onboarding)

- Replace "MBEENEXUS" with `<Logo />` on register and onboarding
- Replace `bg-gray-50` with `bg-embee-white`
- Replace all `text-gray-*` with brand tokens
- Replace `bg-primary-600`/`hover:bg-primary-700` with `bg-embee-blue`
- Replace inline verification badges with `<StatusBadge />`
- Add `import { Logo }` and `import { StatusBadge }` where needed

### Batch 2 — HIGH (dashboard components)

- Migrate `rider-dashboard.tsx` to brand tokens
- Migrate `active-delivery-card.tsx` — replace purple/indigo/blue with brand action colors
- Migrate `earnings-panel.tsx` — replace gray cards
- Migrate `offer-card.tsx` — replace gray/blue

### Batch 3 — MEDIUM (remaining)

- Fix `<a>` → `<Link>` in `dashboard/page.tsx`
- Migrate `delivery-progress-steps.tsx` colors
- Migrate `availability-toggle.tsx` colors
- Fix `focus:ring-primary-500` → `focus:ring-embee-blue` across all files

---

## 16. Verification Plan

After implementation:
- Typecheck
- Full unit test suite (407/407)
- Production build
- Browser verification: register, onboarding, dashboard (desktop + mobile)
- Secrets scan
- Attribution scan
- MBEENEXUS scan (expected: ZERO)
- Git diff audit

---

## 17. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking registration flow | LOW | HIGH | Visual-only changes, no logic |
| Breaking onboarding flow | LOW | HIGH | Visual-only changes, no logic |
| Breaking delivery actions | LOW | HIGH | Only color classes changed |
| Breaking earnings display | LOW | LOW | Only color classes changed |
| Accidentally modifying API calls | LOW | HIGH | No API-touching code modified |

---

## 18. Recommended Implementation Sequence

1. **Batch 1:** register + onboarding (CRITICAL — brand name + full rebrand)
2. **Batch 2:** rider-dashboard + active-delivery-card + earnings-panel + offer-card (HIGH)
3. **Batch 3:** dashboard page + delivery-progress-steps + availability-toggle (MEDIUM)
4. **Verification:** typecheck, tests, build, browser, scans

---

## 19. Explicit Recommendation

**PHASE 6D DISCOVERY — COMPLETE**
**READY FOR ARCHITECTURE REVIEW**

The rider experience has 9 files requiring presentation-layer changes. All changes are CSS/class-level with zero backend, database, API, or dependency impact. The existing Phase 6A component library provides all necessary shared components.
