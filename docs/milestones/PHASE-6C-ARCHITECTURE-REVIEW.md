# PHASE 6C — ARCHITECTURE REVIEW

**Date:** August 25, 2026
**Baseline:** `56b0c07` (Phase 6B)
**Scope:** Customer UI Rebrand

---

## 1. Executive Summary

Phase 6C is a **pure presentation-layer rebrand** of 17 customer-facing files. Zero backend changes. Zero new dependencies. Zero functional logic changes. All modifications are CSS/class-level, replacing generic Tailwind colors with approved Embee Nexus brand tokens and consolidating duplicate components into the Phase 6A canonical set.

---

## 2. Current Architecture

### Phase 6A Design System (Already Established)

| Token | Value | Tailwind Class |
|-------|-------|----------------|
| Midnight Navy | `#0B1220` | `bg-embee-navy`, `text-embee-navy` |
| Embee Blue | `#147BFF` | `bg-embee-blue`, `text-embee-blue` |
| Digital Cyan | `#38BDF8` | `bg-embee-cyan`, `text-embee-cyan` |
| Cool White | `#F5F7FA` | `bg-embee-white` |
| Deep Charcoal | `#111827` | `text-embee-charcoal` |
| Slate | `#64748B` | `text-embee-slate` |

### Phase 6A Canonical Components

| Component | Location | Status |
|-----------|----------|--------|
| Logo | `components/shared/logo.tsx` | ✅ Available |
| AppNav | `components/shared/app-nav.tsx` | ✅ Available |
| MobileNav | `components/shared/mobile-nav.tsx` | ✅ Available |
| StatusBadge | `components/ui/status-badge.tsx` | ✅ Available, covers all order statuses |
| Button | `components/ui/button.tsx` | ✅ Available |
| Card | `components/ui/card.tsx` | ✅ Available |
| Input | `components/ui/input.tsx` | ✅ Available |
| Select | `components/ui/select.tsx` | ✅ Available |
| Label | `components/ui/label.tsx` | ✅ Available |
| PageHeader | `components/shared/page-header.tsx` | ✅ Available |
| EmptyState | `components/shared/empty-state.tsx` | ✅ Available |
| LoadingState | `components/shared/loading-state.tsx` | ✅ Available |

---

## 3. Color Migration Architecture

### Primary Migrations (Apply to all 17 files)

| Pattern | Replacement | Rule |
|---------|-------------|------|
| `text-gray-900` | `text-embee-charcoal` | All headings and primary text |
| `text-gray-800` | `text-embee-charcoal` | Status text |
| `text-gray-700` | `text-embee-charcoal` | Labels and body text |
| `text-gray-600` | `text-embee-slate` | Secondary text |
| `text-gray-500` | `text-embee-slate` | Metadata and timestamps |
| `text-gray-400` | `text-embee-slate/60` | Muted text |
| `bg-gray-50` | `bg-embee-white` | Page and card backgrounds |
| `bg-gray-100` | `bg-embee-white` | Subtle backgrounds |
| `bg-primary-600` | `bg-embee-blue` | Primary buttons |
| `hover:bg-primary-700` | `hover:bg-embee-blue/90` | Button hover |
| `bg-primary-50` | `bg-embee-blue/10` | Active state backgrounds |
| `text-primary-600` | `text-embee-blue` | Links and active text |
| `text-primary-700` | `text-embee-blue` | Active state text |
| `border-primary-500` | `border-embee-blue` | Active borders |
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Focus rings |
| `focus:border-primary-500` | `focus:border-embee-blue` | Focus borders |

### Tracking-Specific Migrations

| Pattern | Replacement |
|---------|-------------|
| `bg-indigo-500` (timeline dot) | `bg-embee-blue` |
| `bg-indigo-200` (timeline line) | `bg-embee-blue/20` |
| `text-indigo-600` (rider card) | `text-embee-blue` |
| `bg-indigo-100` (rider avatar) | `bg-embee-blue/10` |
| `text-blue-500` (searching spinner) | `text-embee-blue` |
| `bg-blue-100` (searching circle) | `bg-embee-blue/10` |

### Semantic Status Colors (DO NOT CHANGE)

These colors communicate system state and are acceptable per the brand kit:

| State | Colors | Keep? |
|-------|--------|-------|
| Success | `bg-green-50`, `bg-green-100`, `text-green-800`, `text-green-600`, `border-green-200`, `border-green-500` | ✅ |
| Error | `bg-red-50`, `bg-red-100`, `text-red-800`, `text-red-600`, `text-red-700`, `border-red-200`, `border-red-300`, `bg-red-600`, `bg-red-700` | ✅ |
| Warning | `bg-yellow-50`, `bg-yellow-100`, `text-yellow-800`, `text-yellow-400`, `border-yellow-200`, `border-yellow-500` | ✅ |
| Info | `bg-blue-50`, `bg-blue-100`, `text-blue-800` | ✅ |

---

## 4. Component Consolidation Architecture

### Orders List — Status Badge

**Current:** Inline `statusColors` map with 7 duplicate definitions (lines 21–29 of orders/page.tsx).

**Target:** Replace with canonical `<StatusBadge status={order.status} />`.

The canonical StatusBadge already covers: `draft`, `pending_payment`, `paid`, `searching_rider`, `rider_assigned`, `in_transit`, `delivered`, `completed`, `cancelled`, `failed`, and 15+ more statuses.

**Implementation:**
```tsx
// Remove the statusColors map entirely
// Replace inline span with:
<StatusBadge status={order.status} />
```

### Auth Pages — Logo Component

**Current:** Hard-coded `<h1 className="text-3xl font-bold text-primary">MBEENEXUS</h1>`.

**Target:** Replace with `<Logo variant="wordmark" size="md" theme="light" href="/" />`.

This renders the branded "EMBEE NEXUS" wordmark with proper typography and colors.

---

## 5. File-by-File Implementation Plan

### File 1: `apps/web/app/login/page.tsx`

| Change | From | To |
|--------|------|----|
| Brand name | `<h1>MBEENEXUS</h1>` | `<Logo variant="wordmark" size="md" theme="light" href="/" />` |
| Background | `bg-gray-50` | `bg-embee-white` |
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Subtext | `text-gray-600` | `text-embee-slate` |
| Labels | `text-gray-700` | `text-embee-charcoal` |
| Inputs | `border-gray-300` | `border-gray-200` |
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Link | `text-primary hover:text-primary-500` | `text-embee-blue hover:text-embee-blue/80` |
| Error | `bg-red-50 text-red-700` | Keep (semantic) |
| Focus | `focus:ring-primary-500` | `focus:ring-embee-blue` |

**Add import:** `import { Logo } from '@/components/shared/logo';`

**Preserve:** All form submission logic, state management, router.push, error handling.

### File 2: `apps/web/app/signup/page.tsx`

Same pattern as login, plus:

| Change | From | To |
|--------|------|----|
| Success state | `bg-green-50 text-green-800` | Keep (semantic success) |
| Success bg | `bg-green-50` | Keep (semantic success) |

**Add import:** `import { Logo } from '@/components/shared/logo';`

**Preserve:** All form validation, password confirmation, signup API call, success state.

### File 3: `apps/web/app/(dashboard)/dashboard/page.tsx`

| Change | From | To |
|--------|------|----|
| Brand text | "Welcome to MBEENEXUS" | "Welcome to Embee Nexus" |
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Body | `text-gray-600` | `text-embee-slate` |
| Loading | `text-gray-500` | `text-embee-slate` |
| Empty bg | `bg-gray-50` | `bg-embee-white` |
| Empty text | `text-gray-500` | `text-embee-slate` |
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |

**Preserve:** All API calls, booking flow, quote generation, order creation.

### File 4: `apps/web/app/(dashboard)/orders/page.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Empty text | `text-gray-500` | `text-embee-slate` |
| Button | `bg-primary-600` | `bg-embee-blue` |
| Order number | `text-gray-900` | `text-embee-charcoal` |
| Date | `text-gray-500` | `text-embee-slate` |
| Price | `text-gray-900` | `text-embee-charcoal` |
| Status | Inline `statusColors` map | `<StatusBadge status={order.status} />` |
| Distance | `text-gray-600` | `text-embee-slate` |

**Remove:** Entire `statusColors` map (lines 21–29).
**Add import:** `import { StatusBadge } from '@/components/shared/status-badge';`

**Preserve:** All server-side data fetching, Supabase queries, authentication checks.

### File 5: `apps/web/app/(dashboard)/addresses/page.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |

**Preserve:** Server-side data fetching, authentication.

### File 6: `apps/web/components/booking/booking-form.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Labels | `text-gray-700` | `text-embee-charcoal` |
| Selects | `border-gray-300` | `border-gray-200` |
| Active urgency | `bg-primary-50 border-primary-500 text-primary-700` | `bg-embee-blue/10 border-embee-blue text-embee-blue` |
| Inactive urgency | `border-gray-300 text-gray-700` | `border-gray-200 text-embee-charcoal` |
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Error | `bg-red-50 text-red-700` | Keep (semantic) |

**Preserve:** All form state, API call to `/api/orders/quote`, quote generation callback.

### File 7: `apps/web/components/booking/quote-display.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Pickup dot | `bg-green-100 text-green-600` | Keep (semantic: pickup = green) |
| Dest dot | `bg-red-100 text-red-600` | Keep (semantic: destination = red) |
| Labels | `text-gray-500` | `text-embee-slate` |
| Values | `text-gray-900` | `text-embee-charcoal` |
| Fare labels | `text-gray-600` | `text-embee-slate` |
| Payment active | `bg-primary-50 border-primary-500 text-primary-700` | `bg-embee-blue/10 border-embee-blue text-embee-blue` |
| Payment inactive | `border-gray-300 text-gray-700` | `border-gray-200 text-embee-charcoal` |
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Quote note | `text-gray-500` | `text-embee-slate` |

**Preserve:** All quote display logic, payment method selection, confirmation callback.

### File 8: `apps/web/components/tracking/order-tracking.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Tracking code | `text-gray-500` | `text-embee-slate` |
| Reconnecting bg | `bg-yellow-50 border-yellow-200 text-yellow-700` | Keep (semantic warning) |
| Searching circle | `bg-blue-100 text-blue-500` | `bg-embee-blue/10 text-embee-blue` |
| Searching text | `text-gray-900` | `text-embee-charcoal` |
| Searching sub | `text-gray-500` | `text-embee-slate` |
| Cancelled bg | `bg-red-50 border-red-200 text-red-800` | Keep (semantic error) |
| Failed bg | `bg-red-50 border-red-200 text-red-800` | Keep (semantic error) |
| Delivered bg | `bg-green-50 border-green-200 text-green-800` | Keep (semantic success) |
| Completed bg | `bg-green-50 border-green-200 text-green-800` | Keep (semantic success) |
| Details heading | `text-gray-900` | `text-embee-charcoal` |
| Detail labels | `text-gray-500` | `text-embee-slate` |
| Detail values | `text-gray-900` | `text-embee-charcoal` |

**Preserve:** All realtime subscription logic, polling, state management, cancellation/refund/proof/rating integration.

### File 9: `apps/web/components/tracking/order-timeline.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Empty text | `text-gray-500` | `text-embee-slate` |
| Completed dot | `bg-indigo-500` | `bg-embee-blue` |
| Incomplete dot | `bg-gray-300` | `bg-gray-200` |
| Completed line | `bg-indigo-200` | `bg-embee-blue/20` |
| Incomplete line | `bg-gray-200` | Keep |
| Completed text | `text-gray-900` | `text-embee-charcoal` |
| Incomplete text | `text-gray-400` | `text-embee-slate/60` |
| Timestamp | `text-gray-400` | `text-embee-slate/60` |

**Preserve:** All event rendering logic, status ordering, event labeling.

### File 10: `apps/web/components/tracking/rider-card.tsx`

| Change | From | To |
|--------|------|----|
| Avatar bg | `bg-indigo-100` | `bg-embee-blue/10` |
| Avatar text | `text-indigo-600` | `text-embee-blue` |
| Name | `text-gray-900` | `text-embee-charcoal` |
| Details | `text-gray-500` | `text-embee-slate` |
| Star | `text-yellow-400` | Keep (semantic: star rating) |
| ETA number | `text-indigo-600` | `text-embee-blue` |
| ETA label | `text-gray-500` | `text-embee-slate` |

**Preserve:** All props, rendering logic.

### File 11: `apps/web/components/order/cancel-order-button.tsx`

| Change | From | To |
|--------|------|----|
| Button text | `text-red-700` | Keep (semantic: destructive action) |
| Button border | `border-red-300` | Keep (semantic) |
| Button hover | `hover:bg-red-50` | Keep (semantic) |
| Modal heading | `text-gray-900` | `text-embee-charcoal` |
| Modal text | `text-gray-600` | `text-embee-slate` |
| Label | `text-gray-700` | `text-embee-charcoal` |
| Textarea | `border-gray-300` | `border-gray-200` |
| Confirm btn | `bg-red-600 hover:bg-red-700` | Keep (semantic: destructive) |
| Cancel btn | `border-gray-300 text-gray-700` | `border-gray-200 text-embee-charcoal` |
| Focus | `focus:ring-primary-500` | `focus:ring-embee-blue` |

**Preserve:** All cancel logic, API call, error handling, modal state.

### File 12: `apps/web/components/order/refund-status.tsx`

All status colors (`bg-yellow-50`, `bg-blue-50`, `bg-green-50`, `bg-red-50` and their text variants) are **semantic status colors** — keep as-is.

No changes needed. This component is already correctly using semantic colors.

### File 13: `apps/web/components/order/proof-display.tsx`

| Change | From | To |
|--------|------|----|
| Border | `border-green-500` | Keep (semantic: proof = completed delivery) |
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Labels | `text-gray-500` | `text-embee-slate` |
| Values | `text-gray-900`, `text-gray-700` | `text-embee-charcoal` |

**Preserve:** All proof display logic.

### File 14: `apps/web/components/order/rating-form.tsx`

| Change | From | To |
|--------|------|----|
| Existing border | `border-yellow-500` | Keep (semantic: already rated) |
| Stars filled | `text-yellow-400` | Keep (semantic: star rating) |
| Stars empty | `text-gray-300` | `text-gray-200` |
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Rating text | `text-gray-600` | `text-embee-slate` |
| Comment | `text-gray-600` | `text-embee-slate` |
| Textarea | `border-gray-300` | `border-gray-200` |
| Char count | `text-gray-500` | `text-embee-slate` |
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Success | `bg-green-50 border-green-200 text-green-800` | Keep (semantic success) |

**Preserve:** All rating logic, API call, hover state, existing rating display.

### File 15: `apps/web/components/addresses/address-list.tsx`

| Change | From | To |
|--------|------|----|
| Empty text | `text-gray-500`, `text-gray-400` | `text-embee-slate` |
| Label | `text-gray-900` | `text-embee-charcoal` |
| Default badge | `bg-primary-100 text-primary-800` | `bg-embee-blue/10 text-embee-blue` |
| Street | `text-gray-600` | `text-embee-slate` |
| City/state | `text-gray-500` | `text-embee-slate` |
| Set default | `text-primary-600` | `text-embee-blue` |
| Delete | `text-red-600` | Keep (semantic: destructive) |

**Preserve:** All address management logic, API calls.

### File 16: `apps/web/components/addresses/create-address-button.tsx`

| Change | From | To |
|--------|------|----|
| Button | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Overlay | `bg-gray-500` | `bg-embee-navy/50` |

**Preserve:** Modal open/close logic.

### File 17: `apps/web/components/addresses/create-address-form.tsx`

| Change | From | To |
|--------|------|----|
| Heading | `text-gray-900` | `text-embee-charcoal` |
| Labels | `text-gray-700` | `text-embee-charcoal` |
| Inputs | `border-gray-300` | `border-gray-200` |
| Checkbox | `text-primary-600` | `text-embee-blue` |
| Cancel btn | `border-gray-300 text-gray-700` | `border-gray-200 text-embee-charcoal` |
| Save btn | `bg-primary-600 hover:bg-primary-700` | `bg-embee-blue hover:bg-embee-blue/90` |
| Error | `bg-red-50 text-red-700` | Keep (semantic) |

**Preserve:** All form state, API call, success callback.

---

## 6. Import Changes Required

| File | Add Import |
|------|-----------|
| `login/page.tsx` | `import { Logo } from '@/components/shared/logo';` |
| `signup/page.tsx` | `import { Logo } from '@/components/shared/logo';` |
| `orders/page.tsx` | `import { StatusBadge } from '@/components/shared/status-badge';` |

No other import changes needed. All other files use existing class-based styling.

---

## 7. Functionality Protection Matrix

| Functionality | File(s) | Protection Rule |
|--------------|---------|-----------------|
| Login authentication | login/page.tsx | Preserve exact `fetch` logic, state, router |
| Signup registration | signup/page.tsx | Preserve exact validation, `fetch`, state |
| Dashboard booking | dashboard/page.tsx | Preserve exact API calls, state, components |
| Quote generation | booking-form.tsx | Preserve exact `fetch`, form state |
| Quote display | quote-display.tsx | Preserve exact display, payment selection |
| Order confirmation | dashboard/page.tsx | Preserve exact `fetch`, payment redirect |
| Order list | orders/page.tsx | Preserve exact Supabase query |
| Order detail | orders/[id]/page.tsx | Preserve exact data fetching (no changes) |
| Realtime tracking | order-tracking.tsx | Preserve exact subscription, polling |
| Timeline events | order-timeline.tsx | Preserve exact event rendering |
| Rider info | rider-card.tsx | Preserve exact props, rendering |
| Cancel order | cancel-order-button.tsx | Preserve exact API call, state |
| Refund status | refund-status.tsx | No changes (semantic colors) |
| Proof display | proof-display.tsx | Preserve exact API call |
| Rating form | rating-form.tsx | Preserve exact API call, state |
| Address list | address-list.tsx | Preserve exact API calls |
| Address creation | create-address-form.tsx | Preserve exact API call, form state |

---

## 8. Accessibility Architecture

| Check | Current | Target |
|-------|---------|--------|
| Semantic headings | ✅ h1, h2, h3 | ✅ Preserved |
| Form labels | ✅ `<label htmlFor>` | ✅ Preserved |
| Focus states | ✅ `focus:ring-primary-500` | ✅ Updated to `focus:ring-embee-blue` |
| Button semantics | ✅ `<button type="submit">` | ✅ Preserved |
| Link semantics | ✅ `<a href>` | ✅ Preserved |
| Contrast | ⚠️ Some gray-on-gray | ✅ Improved with charcoal/slate |
| Status communication | ✅ Text + color | ✅ Preserved (StatusBadge has `role="status"` and `aria-label`) |
| Keyboard navigation | ✅ | ✅ Preserved |
| Mobile usability | ✅ | ✅ Preserved |

---

## 9. Testing Strategy

### Automated

| Check | Expected |
|-------|----------|
| Typecheck | PASS — zero new TypeScript errors |
| Unit tests | 407/407 PASS — no logic changes |
| Production build | PASS |
| Secrets scan | CLEAN |
| Attribution scan | ZERO |

### Browser Verification

| Surface | Desktop | Mobile |
|---------|---------|--------|
| Login page | ✅ Logo, brand colors, form works | ✅ Responsive |
| Signup page | ✅ Logo, brand colors, form works | ✅ Responsive |
| Dashboard | ✅ Welcome text, booking form | ✅ Responsive |
| Orders list | ✅ StatusBadge renders, brand colors | ✅ Responsive |
| Addresses | ✅ Brand colors, create/delete works | ✅ Responsive |
| Booking form | ✅ Brand colors, urgency selection | ✅ Responsive |
| Quote display | ✅ Brand colors, payment selection | ✅ Responsive |
| Order tracking | ✅ Brand colors, timeline, map | ✅ Responsive |
| Cancel modal | ✅ Brand colors, form works | ✅ Responsive |
| Rating form | ✅ Stars, brand colors, submit works | ✅ Responsive |

### Regression

| Check | Expected |
|-------|----------|
| Phase 1–6B commits | Untouched |
| Login flow | Functional |
| Signup flow | Functional |
| Booking flow | Functional |
| Payment redirect | Functional |
| Order tracking | Functional |
| Realtime updates | Functional |
| Address CRUD | Functional |
| Cancel/refund | Functional |
| Rating submission | Functional |

---

## 10. Risk Assessment

| Risk | Severity | Mitigation | Residual |
|------|----------|------------|----------|
| Breaking form submission | HIGH | Only change CSS classes, never touch JS | LOW |
| Breaking realtime tracking | HIGH | Only change CSS classes in tracking | LOW |
| Breaking status display | MEDIUM | Use existing StatusBadge with proven coverage | LOW |
| Inconsistent brand application | MEDIUM | Follow migration map strictly | LOW |
| Accessibility regression | LOW | Preserve existing ARIA, focus states | LOW |
| Breaking address CRUD | HIGH | Only change CSS classes | LOW |

---

## 11. Dependency Analysis

| Item | Count |
|------|-------|
| New npm packages | 0 |
| New database tables | 0 |
| New migrations | 0 |
| New API routes | 0 |
| New components | 0 |
| Modified files | 17 |
| Import additions | 3 |

---

## 12. Implementation Sequence

### Batch 1 — Critical (3 files)
1. `login/page.tsx` — Logo + brand colors
2. `signup/page.tsx` — Logo + brand colors
3. `dashboard/page.tsx` — Fix MBEENEXUS + brand colors

### Batch 2 — High (7 files)
4. `orders/page.tsx` — StatusBadge + brand colors
5. `addresses/page.tsx` — Brand heading
6. `booking-form.tsx` — Brand colors
7. `quote-display.tsx` — Brand colors
8. `order-tracking.tsx` — Brand colors
9. `order-timeline.tsx` — Brand colors
10. `rider-card.tsx` — Brand colors

### Batch 3 — Medium (7 files)
11. `cancel-order-button.tsx` — Brand colors
12. `refund-status.tsx` — No changes needed (semantic)
13. `proof-display.tsx` — Brand colors
14. `rating-form.tsx` — Brand colors
15. `address-list.tsx` — Brand colors
16. `create-address-button.tsx` — Brand colors
17. `create-address-form.tsx` — Brand colors

### Verification
18. Typecheck
19. Unit tests
20. Production build
21. Browser verification
22. Secrets/attribution scan

---

## 13. Explicit Exclusions

- **Rider pages** → Phase 6D
- **Admin pages** → Already branded (Phase 5D)
- **Database changes** → ZERO
- **API changes** → ZERO
- **Authentication logic** → ZERO
- **Payment logic** → ZERO
- **Booking logic** → ZERO
- **Dispatch logic** → ZERO
- **Mapping infrastructure** → Deferred
- **New dependencies** → ZERO
- **Image assets** → External dependency
- **Refund status component** → No changes (already semantic)

---

## PHASE 6C ARCHITECTURE REVIEW — COMPLETE

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

17 files. CSS/class-level changes only. Zero backend. Zero logic changes. Zero new dependencies. All Phase 6A components available. Color migration map defined. Functionality protection matrix complete. Accessibility preserved. Testing strategy defined.
