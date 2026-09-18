# PHASE 6C — DISCOVERY REPORT

**Date:** August 25, 2026
**Baseline:** `56b0c07` (Phase 6B — Homepage)
**Scope:** Customer UI Rebrand

---

## 1. Executive Summary

The customer-facing UI has **135+ hard-coded gray Tailwind color classes** across login, signup, dashboard, orders, booking, tracking, and address components. Three locations still display "MBEENEXUS" instead of "Embee Nexus." The orders page contains a **7th duplicate status badge definition**. No customer page uses the Phase 6A brand system (Logo component, brand tokens, shared UI components).

Phase 6C must rebrand all customer surfaces to the approved Embee Nexus identity while preserving all existing functionality.

---

## 2. Affected Files Inventory

### CRITICAL — Brand Name Errors

| File | Issue | Line |
|------|-------|------|
| `apps/web/app/login/page.tsx` | Hard-coded `<h1>MBEENEXUS</h1>` | 45 |
| `apps/web/app/signup/page.tsx` | Hard-coded `<h1>MBEENEXUS</h1>` | 75 |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | "Welcome to MBEENEXUS" | 117 |

**Remediation:** Replace with `<Logo variant="wordmark" />` or correct text "Embee Nexus."

### HIGH — Login/Signup Visual Inconsistencies

| File | Issues |
|------|--------|
| `apps/web/app/login/page.tsx` | `bg-gray-50` background, `text-gray-*` colors, `border-gray-300` inputs, `bg-primary-600` button (old shade), no Logo component, no brand |
| `apps/web/app/signup/page.tsx` | Same gray palette, `bg-green-50` success state (unbranded), no Logo component |

**Remediation:** Replace with branded auth layout using `bg-embee-white`, `text-embee-charcoal`, `text-embee-slate`, Logo component, `bg-embee-blue` buttons.

### HIGH — Dashboard Visual Inconsistencies

| File | Issues |
|------|--------|
| `apps/web/app/(dashboard)/dashboard/page.tsx` | `text-gray-900`, `text-gray-600`, `bg-gray-50`, `text-gray-500`, `bg-primary-600`, "MBEENEXUS" text |
| `apps/web/app/(dashboard)/orders/page.tsx` | `text-gray-900`, `text-gray-500`, `bg-primary-600`, inline `statusColors` map (7 duplicate status badge definitions) |
| `apps/web/app/(dashboard)/addresses/page.tsx` | `text-gray-900` heading |
| `apps/web/app/(dashboard)/layout.tsx` | ✅ Already branded (Phase 6A) |

### HIGH — Booking/Quote Components

| File | Issues |
|------|--------|
| `apps/web/components/booking/booking-form.tsx` | `text-gray-900`, `text-gray-700`, `border-gray-300`, `bg-primary-50`, `bg-primary-600`, `text-primary-700` |
| `apps/web/components/booking/quote-display.tsx` | `text-gray-900`, `text-gray-500`, `text-gray-600`, `text-gray-700`, `border-gray-300`, `bg-primary-600`, `bg-green-100`, `bg-red-100` |

### HIGH — Tracking Components

| File | Issues |
|------|--------|
| `apps/web/components/tracking/order-tracking.tsx` | `text-gray-900`, `text-gray-500`, `bg-blue-100`, `bg-yellow-50`, `bg-red-50`, `bg-green-50`, `border-red-200`, `border-green-200`, `text-blue-500` |
| `apps/web/components/tracking/order-timeline.tsx` | `text-gray-900`, `text-gray-500`, `text-gray-400`, `bg-indigo-500`, `bg-indigo-200`, `bg-gray-300`, `bg-gray-200` |
| `apps/web/components/tracking/rider-card.tsx` | `text-gray-900`, `text-gray-500`, `bg-indigo-100`, `text-indigo-600`, `text-yellow-400` |

### MEDIUM — Order Action Components

| File | Issues |
|------|--------|
| `apps/web/components/order/cancel-order-button.tsx` | `text-gray-900`, `text-gray-600`, `text-gray-700`, `border-gray-300`, `bg-red-600`, `bg-red-700` |
| `apps/web/components/order/refund-status.tsx` | `bg-yellow-50`, `bg-blue-50`, `bg-green-50`, `bg-red-50`, `text-yellow-800`, `text-blue-800`, `text-green-800`, `text-red-800` |
| `apps/web/components/order/proof-display.tsx` | `text-gray-900`, `text-gray-500`, `text-gray-700`, `border-green-500` |
| `apps/web/components/order/rating-form.tsx` | `text-gray-900`, `text-gray-600`, `text-gray-300`, `bg-primary-600`, `border-yellow-500`, `text-yellow-400` |

### MEDIUM — Address Components

| File | Issues |
|------|--------|
| `apps/web/components/addresses/address-list.tsx` | `text-gray-500`, `text-gray-400`, `text-gray-900`, `text-gray-600`, `bg-primary-100`, `bg-primary-600` |
| `apps/web/components/addresses/create-address-button.tsx` | `bg-primary-600`, `bg-gray-500` |
| `apps/web/components/addresses/create-address-form.tsx` | `text-gray-900`, `text-gray-700`, `border-gray-300`, `bg-primary-600` |

---

## 3. Brand Violations Summary

| Violation | Count | Severity |
|-----------|-------|----------|
| "MBEENEXUS" text (should be "Embee Nexus") | 3 | CRITICAL |
| `bg-gray-50` backgrounds (should be `bg-embee-white`) | 6+ | HIGH |
| `text-gray-900` headings (should be `text-embee-charcoal`) | 20+ | HIGH |
| `text-gray-600/700` body (should be `text-embee-slate`) | 15+ | HIGH |
| `border-gray-300` inputs (should be `border-gray-300` → acceptable) | 10+ | LOW |
| `bg-primary-600` buttons (should be `bg-embee-blue`) | 8+ | MEDIUM |
| No Logo component on auth pages | 2 | HIGH |
| Duplicate status badge (7th definition in orders/page.tsx) | 1 | MEDIUM |
| `bg-indigo-*` in tracking (not brand color) | 4 | MEDIUM |
| `bg-green-50/100` success states (semantic, acceptable) | 5+ | LOW |
| `bg-red-50/100` error states (semantic, acceptable) | 5+ | LOW |
| `bg-yellow-50/100` warning states (semantic, acceptable) | 3+ | LOW |

---

## 4. Duplicate Status Badge

**File:** `apps/web/app/(dashboard)/orders/page.tsx` (lines 21–29)

Contains an inline `statusColors` map with 7 status-to-color mappings. This is the **7th duplicate** of the status badge pattern already consolidated in `components/ui/status-badge.tsx`.

**Remediation:** Replace with `<StatusBadge status={order.status} />` from the canonical component.

---

## 5. Navigation Assessment

| Surface | Nav Component | Status |
|---------|--------------|--------|
| Customer layout | `AppNav` (Phase 6A) | ✅ Already branded |
| Login | None (standalone) | ❌ Needs Logo |
| Signup | None (standalone) | ❌ Needs Logo |
| Dashboard | Inherited from layout | ✅ |

**Login/Signup should display the Logo component** to maintain brand consistency.

---

## 6. Functional Regression Risks

| Risk | Mitigation |
|------|------------|
| Login form submission breaks | Preserve exact `fetch` logic, only change classes |
| Signup form submission breaks | Preserve exact `fetch` logic, only change classes |
| Dashboard booking flow breaks | Preserve exact component props and API calls |
| Order tracking realtime breaks | Only change CSS classes, not JS logic |
| Address CRUD breaks | Only change CSS classes |
| Cancellation/refund/rating breaks | Only change CSS classes |

**All changes are CSS/class-level. No logic, API, or behavioral changes.**

---

## 7. Files Requiring Changes (Ordered by Priority)

### CRITICAL (must fix)

1. `apps/web/app/login/page.tsx` — Replace MBEENEXUS, add Logo, brand colors
2. `apps/web/app/signup/page.tsx` — Replace MBEENEXUS, add Logo, brand colors
3. `apps/web/app/(dashboard)/dashboard/page.tsx` — Replace MBEENEXUS, brand colors

### HIGH (brand consistency)

4. `apps/web/app/(dashboard)/orders/page.tsx` — Replace statusColors with StatusBadge, brand colors
5. `apps/web/app/(dashboard)/addresses/page.tsx` — Brand heading
6. `apps/web/components/booking/booking-form.tsx` — Brand colors
7. `apps/web/components/booking/quote-display.tsx` — Brand colors
8. `apps/web/components/tracking/order-tracking.tsx` — Brand colors
9. `apps/web/components/tracking/order-timeline.tsx` — Brand colors
10. `apps/web/components/tracking/rider-card.tsx` — Brand colors

### MEDIUM (consistency)

11. `apps/web/components/order/cancel-order-button.tsx` — Brand colors
12. `apps/web/components/order/refund-status.tsx` — Brand colors
13. `apps/web/components/order/proof-display.tsx` — Brand colors
14. `apps/web/components/order/rating-form.tsx` — Brand colors
15. `apps/web/components/addresses/address-list.tsx` — Brand colors
16. `apps/web/components/addresses/create-address-button.tsx` — Brand colors
17. `apps/web/components/addresses/create-address-form.tsx` — Brand colors

**Total: 17 files**

---

## 8. Color Migration Map

| Current | Replacement | Notes |
|---------|-------------|-------|
| `text-gray-900` | `text-embee-charcoal` | Headings, primary text |
| `text-gray-800` | `text-embee-charcoal` | Status text |
| `text-gray-700` | `text-embee-charcoal` | Labels, body |
| `text-gray-600` | `text-embee-slate` | Secondary text |
| `text-gray-500` | `text-embee-slate` | Metadata, timestamps |
| `text-gray-400` | `text-embee-slate/60` | Muted text |
| `bg-gray-50` | `bg-embee-white` | Page/card backgrounds |
| `bg-gray-100` | `bg-embee-white` | Subtle backgrounds |
| `border-gray-300` | `border-gray-200` | Inputs, borders (acceptable) |
| `bg-primary-600` | `bg-embee-blue` | Primary buttons |
| `hover:bg-primary-700` | `hover:bg-embee-blue/90` | Button hover |
| `bg-primary-50` | `bg-embee-blue/10` | Active state backgrounds |
| `text-primary-600` | `text-embee-blue` | Links, active text |
| `text-primary-700` | `text-embee-blue` | Active state text |
| `border-primary-500` | `border-embee-blue` | Active borders |

### Status Colors (Semantic — Keep as-is)

| Status | Color | Keep? |
|--------|-------|-------|
| Success (delivered, completed, approved) | `bg-green-50/100`, `text-green-800` | ✅ Semantic |
| Error (cancelled, failed, rejected) | `bg-red-50/100`, `text-red-800` | ✅ Semantic |
| Warning (pending, pending_payment) | `bg-yellow-50/100`, `text-yellow-800` | ✅ Semantic |
| Info (searching_rider, processing) | `bg-blue-50/100`, `text-blue-800` | ✅ Semantic |

**Status semantic colors are acceptable per the brand kit** ("Status must use text + color, never color alone").

### Tracking Timeline Colors

| Current | Replacement |
|---------|-------------|
| `bg-indigo-500` (timeline dot) | `bg-embee-blue` |
| `bg-indigo-200` (timeline line) | `bg-embee-blue/20` |
| `text-indigo-600` (rider card) | `text-embee-blue` |
| `bg-indigo-100` (rider avatar) | `bg-embee-blue/10` |

---

## 9. Backend/API Assessment

**ZERO backend changes required.**

All changes are CSS/class-level only. No API modifications, no database changes, no authentication logic changes.

---

## 10. Dependencies

**ZERO new dependencies required.**

All needed components exist from Phase 6A:
- `Logo` component
- `StatusBadge` component
- `Button` component (if desired, but existing buttons work with class changes)
- Brand CSS variables and Tailwind tokens

---

## 11. Testing Strategy

After implementation, verify:

### Functional (must not break)
- Login form submission
- Signup form submission
- Dashboard booking flow
- Quote generation
- Order confirmation
- Order list display
- Order detail / tracking
- Address list
- Address creation
- Address deletion
- Cancel order flow
- Refund status display
- Proof display
- Rating submission

### Visual/Brand
- All headings use `text-embee-charcoal`
- All body text uses `text-embee-slate`
- All backgrounds use `bg-embee-white` or `bg-white`
- All primary buttons use `bg-embee-blue`
- Logo appears on login/signup
- No "MBEENEXUS" text anywhere
- StatusBadge used in orders list (not inline colors)

### Regression
- Typecheck passes
- All 407+ tests pass
- Production build succeeds
- No secrets introduced
- No AI attribution introduced

---

## 12. Scope Boundaries

### IN SCOPE (Phase 6C)
- Login page rebrand
- Signup page rebrand
- Dashboard page rebrand
- Orders list rebrand
- Addresses page rebrand
- Booking form rebrand
- Quote display rebrand
- Tracking components rebrand
- Order action components rebrand
- Address components rebrand
- Status badge consolidation

### OUT OF SCOPE
- Rider pages rebrand → Phase 6D
- Admin pages → Already branded (Phase 5D)
- Database changes → NONE
- API changes → NONE
- New components → NONE (use existing Phase 6A)
- Mapbox/mapping → Deferred
- Image assets → External dependency

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking form submission logic | HIGH | Only change CSS classes, never touch JS logic |
| Breaking realtime tracking | HIGH | Only change CSS classes in tracking components |
| Breaking status display | MEDIUM | Use existing StatusBadge, verify all states render |
| Inconsistent brand application | MEDIUM | Follow color migration map strictly |
| Accessibility regression | LOW | Preserve existing ARIA attributes, focus states |

---

## PHASE 6C DISCOVERY STATUS: **GO**

17 files require CSS/class-level rebranding. Zero backend changes. Zero new dependencies. Zero functional logic changes. All needed components exist from Phase 6A.

**READY FOR ARCHITECTURE REVIEW**
