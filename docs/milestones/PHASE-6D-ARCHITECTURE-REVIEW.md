# PHASE 6D — ARCHITECTURE REVIEW

## 1. Executive Summary

Phase 6D rebrands the Rider experience to match the approved Embee Nexus Developer Brand Kit. The scope is **9 files**, all presentation-layer. Zero backend, database, API, dependency, or mapping changes.

The Rider layout was already branded in Phase 6A (AppNav + bg-embee-white). All other rider surfaces — registration, onboarding, dashboard, and 6 components — remain in the pre-brand generic gray state.

This architecture review defines the exact change for every affected file, specifies which Phase 6A components to reuse, and confirms functionality protection boundaries.

---

## 2. Current Architecture

### Rider Route Structure

```
/rider/layout.tsx          — Server layout, AppNav, auth check ✅ BRANDED
/rider/register/page.tsx   — Client, 2-step registration form ❌ UNBRANDED
/rider/onboarding/page.tsx — Client, document upload/verification ❌ UNBRANDED
/rider/dashboard/page.tsx  — Server, auth + profile fetch ⚠️ MINOR ISSUES
```

### Rider Components

```
components/rider/rider-dashboard.tsx         — Main dashboard client component
components/rider/active-delivery-card.tsx    — Active delivery display + actions
components/rider/availability-toggle.tsx     — Online/offline toggle
components/rider/delivery-progress-steps.tsx — Step progress indicator
components/rider/earnings-panel.tsx          — Earnings summary + history
components/rider/offer-card.tsx              — Incoming offer display + actions
```

### Existing Shared Components (from Phase 6A)

| Component | Location | Available |
|-----------|----------|-----------|
| `<Logo />` | `components/shared/logo.tsx` | ✅ |
| `<AppNav />` | `components/shared/app-nav.tsx` | ✅ (already in rider layout) |
| `<MobileNav />` | `components/shared/mobile-nav.tsx` | ✅ (via AppNav) |
| `<StatusBadge />` | `components/ui/status-badge.tsx` | ✅ |
| `<Button />` | `components/ui/button.tsx` | ✅ |
| `<Card />` | `components/ui/card.tsx` | ✅ |
| `<Input />` | `components/ui/input.tsx` | ✅ |
| `<Select />` | `components/ui/select.tsx` | ✅ |
| `<Label />` | `components/ui/label.tsx` | ✅ |
| `<Badge />` | `components/ui/badge.tsx` | ✅ |
| `<PageHeader />` | `components/shared/page-header.tsx` | ✅ |
| `<EmptyState />` | `components/shared/empty-state.tsx` | ✅ |
| `<LoadingState />` | `components/shared/loading-state.tsx` | ✅ |
| `cn()` | `lib/utils.ts` | ✅ |

**All required components already exist.** No new components needed.

---

## 3. File-by-File Architecture

### 3.1 `app/rider/register/page.tsx` — CRITICAL

**Current issues:**
- `<h1 className="text-3xl font-bold text-primary">MBEENEXUS</h1>` — wrong brand name, no Logo
- `bg-gray-50` background — should be `bg-embee-white`
- All form inputs use `text-gray-700`, `border-gray-300`, `placeholder-gray-400`
- Buttons use `bg-primary-600 hover:bg-primary-700` — old shade
- Focus rings use `focus:ring-primary-500`
- Step indicator uses `text-primary`, `border-primary`, `bg-primary` — will work once CSS variable is Embee Blue (already fixed in Phase 6A)

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `<h1>MBEENEXUS</h1>` | `<Logo variant="full" size="lg" theme="dark" />` | Brand identity |
| `bg-gray-50` | `bg-embee-white` | Brand background |
| `text-gray-900` headings | `text-embee-charcoal` | Brand text |
| `text-gray-600` body | `text-embee-slate` | Brand text |
| `text-gray-700` labels | `text-embee-charcoal` | Brand text |
| `bg-primary-600` buttons | `bg-embee-blue` | Brand primary |
| `hover:bg-primary-700` | `hover:bg-embee-blue/90` | Brand hover |
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Brand focus |
| `border-gray-300` | `border-embee-slate/30` | Brand border |
| `placeholder-gray-400` | `placeholder-embee-slate/50` | Brand placeholder |
| `text-primary-600` link | `text-embee-blue` | Brand link |

**Functionality protection:**
- Preserve exact `handleAccountSubmit` flow (validate → setStep(2))
- Preserve exact `handleVehicleSubmit` flow (signup → login → register → redirect)
- Preserve all form state management
- Preserve all error handling
- Preserve step indicator logic (uses `text-primary` which resolves to Embee Blue via CSS variable)

**New imports:**
```typescript
import { Logo } from '@/components/shared/logo';
```

---

### 3.2 `app/rider/onboarding/page.tsx` — CRITICAL

**Current issues:**
- `<h1 className="text-3xl font-bold text-primary">MBEENEXUS</h1>` — wrong brand name, no Logo
- `bg-gray-50` background (both loading and main)
- All headings use `text-gray-900`
- All body text uses `text-gray-600/500`
- Buttons use `bg-primary-600 hover:bg-primary-700`
- Inline verification badges with hardcoded green/red/yellow/gray
- Document status badges with hardcoded colors
- Blue info box uses `bg-blue-50 border-blue-200 text-blue-800`
- Green success box uses `bg-green-50 border-green-200 text-green-800`

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `<h1>MBEENEXUS</h1>` | `<Logo variant="full" size="lg" theme="dark" />` | Brand identity |
| `bg-gray-50` (loading) | `bg-embee-white` | Brand background |
| `bg-gray-50` (main) | `bg-embee-white` | Brand background |
| `text-gray-500` loading | `text-embee-slate` | Brand text |
| `text-gray-900` headings | `text-embee-charcoal` | Brand text |
| `text-gray-600` body | `text-embee-slate` | Brand text |
| `bg-primary-600` upload btn | `bg-embee-blue` | Brand primary |
| Inline verification badge | `<StatusBadge status={...} />` | Canonical component |
| Document status badge | `<StatusBadge status={...} />` | Canonical component |
| `bg-blue-50` info box | `bg-embee-blue/5 border-embee-blue/20 text-embee-blue` | Brand info |
| `bg-green-50` success box | Keep semantic green (success) | Semantic |
| `bg-red-50` error | Keep semantic red (error) | Semantic |
| `text-primary-600` link | `text-embee-blue` | Brand link |
| `border-gray-200` doc card | `border-embee-slate/20` | Brand border |
| `text-gray-500` descriptions | `text-embee-slate` | Brand text |

**StatusBadge mapping for inline badges:**

| Current inline | StatusBadge prop |
|----------------|-----------------|
| `bg-green-100 text-green-800` "Approved" | `<StatusBadge status="approved" />` |
| `bg-red-100 text-red-800` "Rejected" | `<StatusBadge status="rejected" />` |
| `bg-yellow-100 text-yellow-800` "Under Review" | `<StatusBadge status="under_review" />` |
| `bg-gray-100 text-gray-800` "Pending" | `<StatusBadge status="pending" />` |
| `bg-green-100 text-green-800` doc "Approved" | `<StatusBadge status="approved" />` |
| `bg-red-100 text-red-800` doc "Rejected" | `<StatusBadge status="rejected" />` |
| `bg-yellow-100 text-yellow-800` doc "Pending" | `<StatusBadge status="pending" />` |

**Functionality protection:**
- Preserve exact `fetchStatus` flow
- Preserve exact `handleDocumentUpload` flow
- Preserve all document type definitions
- Preserve verification status display logic
- Preserve `allDocumentsSubmitted` logic
- Preserve error handling
- Preserve redirect behavior

**New imports:**
```typescript
import { Logo } from '@/components/shared/logo';
import { StatusBadge } from '@/components/ui/status-badge';
```

---

### 3.3 `app/rider/dashboard/page.tsx` — MEDIUM

**Current issues:**
- Line 31: `<a href="/rider/onboarding">` — should be `<Link>`
- Pending verification state uses `bg-yellow-50 border-yellow-200 text-yellow-800` — acceptable semantic yellow
- Pending state uses `<a>` tag — should be `<Link>`

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `<a href="/rider/onboarding">` | `<Link href="/rider/onboarding">` | Next.js routing |
| `text-yellow-800` heading | Keep (semantic) | Warning state |
| `text-yellow-700` body | Keep (semantic) | Warning state |
| `text-yellow-800` link | `text-embee-blue` | Brand link |

**Functionality protection:**
- Preserve exact auth check flow
- Preserve exact profile fetch
- Preserve verification status check
- Preserve redirect logic

**New imports:**
```typescript
import Link from 'next/link';
```

---

### 3.4 `components/rider/rider-dashboard.tsx` — HIGH

**Current issues:**
- `text-gray-900` heading — should be `text-embee-charcoal`
- `text-gray-500` subtitle — should be `text-embee-slate`
- `text-gray-500` loading state — should be `text-embee-slate`
- `text-gray-400` emoji icons — keep (decorative)
- `text-gray-900` section headings — should be `text-embee-charcoal`
- `text-gray-500` section text — should be `text-embee-slate`
- `bg-white shadow rounded-lg` cards — acceptable (Cool White default)
- Empty state uses emoji + gray text

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `text-gray-900` headings | `text-embee-charcoal` | Brand text |
| `text-gray-500` body/subtitle | `text-embee-slate` | Brand text |
| `bg-white shadow rounded-lg` | Keep | Clean card |
| `bg-green-50 text-green-700` | Keep (semantic) | Success |
| `bg-red-50 text-red-700` | Keep (semantic) | Error |

**Functionality protection:**
- Preserve exact data fetching (availability, assignment, offers)
- Preserve exact polling interval logic (5s/10s)
- Preserve offer accept/reject handlers
- Preserve delivery action complete handler
- Preserve availability change handler
- Preserve auto-dismiss message logic
- Preserve all state management

---

### 3.5 `components/rider/active-delivery-card.tsx` — HIGH

**Current issues:**
- ACTION_CONFIG uses `bg-blue-600`, `bg-purple-600`, `bg-indigo-600`, `bg-green-600` — non-brand colors
- `border-l-4 border-blue-500` — should be `border-embee-blue`
- `text-gray-900` heading — should be `text-embee-charcoal`
- `text-gray-500/700` body — should be `text-embee-slate`
- `text-blue-600` phone link — should be `text-embee-blue`
- Form inputs use `border-gray-300 focus:ring-primary-500`
- Cancel button uses `text-red-600 bg-white hover:bg-red-50` — semantic (keep)
- Complete button uses `bg-green-600` — semantic (keep)

**Proposed ACTION_CONFIG color mapping:**

| Status | Current | Proposed | Rationale |
|--------|---------|----------|-----------|
| `rider_assigned` | `bg-blue-600` | `bg-embee-blue` | Brand primary action |
| `rider_en_route_to_pickup` | `bg-purple-600` | `bg-embee-blue/80` | Brand secondary action |
| `arrived_at_pickup` | `bg-indigo-600` | `bg-embee-blue` | Brand primary action |
| `picked_up` | `bg-purple-600` | `bg-embee-blue/80` | Brand secondary action |
| `in_transit` | `bg-green-600` | Keep green | Semantic (progress) |
| `arrived_at_destination` | `bg-green-600` | Keep green | Semantic (completion) |

**Other changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `border-l-4 border-blue-500` | `border-l-4 border-embee-blue` | Brand accent |
| `text-gray-900` heading | `text-embee-charcoal` | Brand text |
| `text-gray-500` labels | `text-embee-slate` | Brand text |
| `text-gray-700` addresses | `text-embee-charcoal` | Brand text |
| `text-blue-600` phone link | `text-embee-blue` | Brand link |
| `border-gray-300` inputs | `border-embee-slate/30` | Brand border |
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Brand focus |

**Functionality protection:**
- Preserve exact ACTION_CONFIG state machine
- Preserve `executeAction` API call logic
- Preserve `handleAction` decision tree
- Preserve `handleComplete` proof submission
- Preserve recipient name validation
- Preserve all error handling
- Preserve `<a href="tel:">` for phone calls (external protocol)

---

### 3.6 `components/rider/availability-toggle.tsx` — MEDIUM

**Current issues:**
- `bg-gray-300` for offline state — should be `bg-embee-slate/30`
- `bg-green-500` for online — keep (semantic)
- `text-gray-700` label — should be `text-embee-charcoal`
- `focus:ring-primary-500` — should be `focus:ring-embee-blue`

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `bg-gray-300` offline | `bg-embee-slate/30` | Brand neutral |
| `bg-green-500` online | Keep (semantic) | Semantic success |
| `text-gray-700` label | `text-embee-charcoal` | Brand text |
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Brand focus |

**Functionality protection:**
- Preserve exact toggle API call
- Preserve state management
- Preserve `aria-checked`, `role="switch"`, `aria-label`
- Preserve error handling

---

### 3.7 `components/rider/delivery-progress-steps.tsx` — MEDIUM

**Current issues:**
- `bg-green-500` completed step — keep (semantic)
- `bg-blue-500` current step — should be `bg-embee-blue`
- `ring-blue-200` current ring — should be `ring-embee-blue/20`
- `text-blue-600` current label — should be `text-embee-blue`
- `bg-gray-200` incomplete step — should be `bg-embee-slate/20`
- `text-gray-500` labels — should be `text-embee-slate`

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `bg-green-500` completed | Keep (semantic) | Semantic |
| `bg-blue-500` current | `bg-embee-blue` | Brand primary |
| `ring-blue-200` ring | `ring-embee-blue/20` | Brand accent |
| `text-blue-600` label | `text-embee-blue` | Brand text |
| `bg-gray-200` incomplete | `bg-embee-slate/20` | Brand neutral |
| `text-gray-500` labels | `text-embee-slate` | Brand text |
| `bg-green-500` connector | Keep (semantic) | Semantic |
| `bg-gray-200` connector | `bg-embee-slate/20` | Brand neutral |

**Functionality protection:**
- Preserve exact step definitions
- Preserve current step calculation
- Preserve terminal status detection
- Preserve step rendering logic

---

### 3.8 `components/rider/earnings-panel.tsx` — HIGH

**Current issues:**
- `bg-gray-50` summary cards — should be `bg-embee-white`
- `text-gray-900` headings — should be `text-embee-charcoal`
- `text-gray-500` labels — should be `text-embee-slate`
- `text-gray-700` entries — should be `text-embee-charcoal`
- `border-gray-100` dividers — should be `border-embee-slate/10`
- `text-primary-600` load more — should be `text-embee-blue`
- `text-red-600` error — keep (semantic)
- `bg-yellow-50` pending — keep (semantic)
- `bg-green-50` paid — keep (semantic)
- `text-green-600` earnings amount — keep (semantic)

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `bg-gray-50` summary cards | `bg-embee-white` | Brand background |
| `text-gray-900` headings/values | `text-embee-charcoal` | Brand text |
| `text-gray-500` labels | `text-embee-slate` | Brand text |
| `text-gray-700` descriptions | `text-embee-charcoal` | Brand text |
| `border-gray-100` dividers | `border-embee-slate/10` | Brand border |
| `text-primary-600` load more | `text-embee-blue` | Brand link |
| `hover:text-primary-700` | `hover:text-embee-blue/80` | Brand hover |
| `bg-yellow-50` pending | Keep (semantic) | Semantic |
| `bg-green-50` paid | Keep (semantic) | Semantic |
| `text-green-600` amount | Keep (semantic) | Semantic |

**Functionality protection:**
- Preserve exact summary fetch logic
- Preserve exact history fetch logic
- Preserve pagination
- Preserve currency formatting
- Preserve date formatting
- Preserve all state management

---

### 3.9 `components/rider/offer-card.tsx` — HIGH

**Current issues:**
- `border-l-4 border-blue-500` — should be `border-embee-blue`
- `text-gray-500` labels — should be `text-embee-slate`
- `text-gray-700` addresses — should be `text-embee-charcoal`
- `text-gray-900` fee — should be `text-embee-charcoal`
- `bg-gray-200` progress bar — should be `bg-embee-slate/20`
- `text-gray-700` countdown — should be `text-embee-charcoal`
- Accept button `bg-green-600` — keep (semantic)
- Reject button `border-gray-300 text-gray-700` — should use brand tokens
- `focus:ring-primary-500` — should be `focus:ring-embee-blue`
- `text-red-600` urgent countdown — keep (semantic)
- `bg-red-500` urgent progress — keep (semantic)
- `bg-yellow-500` warning progress — keep (semantic)
- `bg-green-500` safe progress — keep (semantic)

**Proposed changes:**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `border-l-4 border-blue-500` | `border-l-4 border-embee-blue` | Brand accent |
| `text-gray-500` labels | `text-embee-slate` | Brand text |
| `text-gray-700` addresses | `text-embee-charcoal` | Brand text |
| `text-gray-900` fee | `text-embee-charcoal` | Brand text |
| `bg-gray-200` progress bar | `bg-embee-slate/20` | Brand neutral |
| `text-gray-700` countdown | `text-embee-charcoal` | Brand text |
| `border-gray-300` reject btn | `border-embee-slate/30` | Brand border |
| `text-gray-700` reject text | `text-embee-charcoal` | Brand text |
| `hover:bg-gray-50` reject | `hover:bg-embee-white` | Brand hover |
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Brand focus |
| `bg-green-60` accept btn | Keep (semantic) | Semantic |
| `text-red-600` urgent | Keep (semantic) | Semantic |

**Functionality protection:**
- Preserve exact countdown logic
- Preserve progress bar calculation
- Preserve accept/reject handlers
- Preserve error handling
- Preserve auto-hide on expiry

---

## 4. Component Reuse Confirmation

| Needed | Source | Status |
|--------|--------|--------|
| Logo | `components/shared/logo.tsx` | ✅ Reuse — `variant="full"`, `size="lg"`, `theme="dark"` |
| StatusBadge | `components/ui/status-badge.tsx` | ✅ Reuse — inline verification badges in onboarding |
| Button | `components/ui/button.tsx` | ✅ Available but NOT replacing existing buttons — the register/onboarding buttons have complex multi-class styling that is better migrated in-place. Using Button component would require rewriting form layout. |
| Card | `components/ui/card.tsx` | ✅ Available but NOT replacing — existing card patterns (`bg-white shadow rounded-lg`) are simple enough to migrate via class tokens. |
| AppNav | `components/shared/app-nav.tsx` | ✅ Already in rider layout |
| cn() | `lib/utils.ts` | ✅ Available for conditional classes |

**Decision: No new components created.** Existing shared components used where they directly replace duplicates (Logo, StatusBadge). Inline button/card patterns migrated via class token replacement rather than component replacement to minimize diff size and risk.

---

## 5. Color Token Reference

All proposed color changes use the established Phase 6A tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `text-embee-charcoal` | `#111827` | Headings, primary text, addresses |
| `text-embee-slate` | `#64748B` | Labels, descriptions, metadata |
| `text-embee-blue` | `#147BFF` | Links, active step, info text |
| `bg-embee-white` | `#F5F7FA` | Page backgrounds, card backgrounds |
| `bg-embee-blue` | `#147BFF` | Primary buttons, active progress |
| `bg-embee-blue/90` | opacity variant | Button hover |
| `bg-embee-blue/80` | opacity variant | Secondary actions |
| `bg-embee-blue/5` | opacity variant | Info backgrounds |
| `border-embee-blue` | `#147BFF` | Card accents, active borders |
| `border-embee-blue/20` | opacity variant | Info borders |
| `border-embee-slate/30` | opacity variant | Form borders |
| `border-embee-slate/20` | opacity variant | Card borders |
| `border-embee-slate/10` | opacity variant | Dividers |
| `bg-embee-slate/30` | opacity variant | Toggle offline |
| `bg-embee-slate/20` | opacity variant | Progress incomplete |
| `ring-embee-blue` | `#147BFF` | Focus rings |
| `ring-embee-blue/20` | opacity variant | Step ring |
| `placeholder-embee-slate/50` | opacity variant | Input placeholders |

---

## 6. Semantic Status Colors — PRESERVED

These colors remain unchanged because they communicate system state:

| Color Class | Purpose | Files |
|-------------|---------|-------|
| `bg-green-500/600` | Completed, paid, accept action | active-delivery, offer-card, earnings, delivery-progress |
| `bg-red-500/600` | Error, cancel, reject | active-delivery, offer-card, earnings |
| `bg-yellow-500/600` | Pending, warning, urgent countdown | earnings, offer-card |
| `bg-green-50/100` | Success background | onboarding, earnings |
| `bg-red-50/100` | Error background | onboarding, register, active-delivery |
| `bg-yellow-50/100` | Warning background | dashboard, earnings, onboarding |
| `text-green-600` | Positive amounts, success links | earnings, offer-card |
| `text-red-600` | Errors, urgent | active-delivery, offer-card |
| `text-yellow-600/700/800` | Warning text | dashboard, earnings |

---

## 7. Security Review

### Presentation-Only Changes

All proposed changes are CSS class replacements and component imports. The following security properties are **unaffected**:

| Security Property | Impact |
|-------------------|--------|
| Rider authentication | ZERO — no auth logic changed |
| Rider authorization | ZERO — no role/permission logic changed |
| Verification controls | ZERO — no verification logic changed |
| Document access | ZERO — no document access logic changed |
| Delivery access | ZERO — no delivery authorization changed |
| Rider/customer data isolation | ZERO — no data access logic changed |
| Server-side role enforcement | ZERO — no server logic changed |
| API contracts | ZERO — no API changes |
| RLS policies | ZERO — no database changes |
| Form validation | ZERO — no validation logic changed |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking registration flow | NEGLIGIBLE | HIGH | Only CSS classes changed |
| Breaking onboarding flow | NEGLIGIBLE | HIGH | Only CSS classes + component swap |
| Breaking delivery actions | NEGLIGIBLE | HIGH | Only color classes in ACTION_CONFIG |
| Weakening authorization | IMPOSSIBLE | CRITICAL | No auth code modified |
| Introducing IDOR | IMPOSSIBLE | CRITICAL | No data access code modified |

---

## 8. Accessibility Review

| Current Issue | Proposed Fix | WCAG Impact |
|---------------|-------------|-------------|
| `focus:ring-primary-500` | `focus:ring-embee-blue` | Same contrast, brand-consistent |
| `text-gray-500` on white | `text-embee-slate` (#64748B) | AA compliant (4.6:1 ratio) |
| `text-gray-400` placeholders | `placeholder-embee-slate/50` | Decorative, not critical |
| Availability toggle ARIA | PRESERVED | `role="switch"`, `aria-checked` |
| Form labels | PRESERVED | All inputs have `<label>` |
| Status text + color | PRESERVED via StatusBadge | Not color-dependent |

---

## 9. Responsive Behavior

No responsive layout changes required. Existing patterns:

| Surface | Current Responsive | Action |
|---------|-------------------|--------|
| Register | `grid-cols-2` vehicle fields | Keep |
| Dashboard | `grid-cols-1 lg:grid-cols-3` | Keep |
| Offer card | Single column | Keep |
| Active delivery | Single column | Keep |
| Earnings | `grid-cols-2` summary | Keep |
| Progress steps | Horizontal 6-step | Keep |

---

## 10. Implementation Sequence

### Batch 1 — CRITICAL (2 files)

**`app/rider/register/page.tsx`**
- Add `import { Logo }` 
- Replace MBEENEXUS h1 with `<Logo />`
- Replace `bg-gray-50` with `bg-embee-white`
- Replace all `text-gray-*` with brand tokens
- Replace `bg-primary-600`/`hover:bg-primary-700` with `bg-embee-blue`
- Replace `focus:ring-primary-500` with `focus:ring-embee-blue`
- Replace `border-gray-300` with `border-embee-slate/30`
- Replace `placeholder-gray-400` with `placeholder-embee-slate/50`

**`app/rider/onboarding/page.tsx`**
- Add `import { Logo }` + `import { StatusBadge }`
- Replace MBEENEXUS h1 with `<Logo />`
- Replace `bg-gray-50` with `bg-embee-white`
- Replace all `text-gray-*` with brand tokens
- Replace inline verification badges with `<StatusBadge />`
- Replace `bg-primary-600` with `bg-embee-blue`
- Replace `border-gray-200` with `border-embee-slate/20`

### Batch 2 — HIGH (4 files)

**`components/rider/rider-dashboard.tsx`**
- Replace `text-gray-900` with `text-embee-charcoal`
- Replace `text-gray-500` with `text-embee-slate`

**`components/rider/active-delivery-card.tsx`**
- Replace ACTION_CONFIG colors: blue → embee-blue, purple → embee-blue/80, indigo → embee-blue
- Replace `border-blue-500` with `border-embee-blue`
- Replace `text-gray-*` with brand tokens
- Replace `text-blue-600` with `text-embee-blue`
- Replace `border-gray-300` with `border-embee-slate/30`

**`components/rider/earnings-panel.tsx`**
- Replace `bg-gray-50` with `bg-embee-white`
- Replace `text-gray-*` with brand tokens
- Replace `border-gray-100` with `border-embee-slate/10`
- Replace `text-primary-600` with `text-embee-blue`

**`components/rider/offer-card.tsx`**
- Replace `border-blue-500` with `border-embee-blue`
- Replace `text-gray-*` with brand tokens
- Replace `bg-gray-200` with `bg-embee-slate/20`
- Replace `border-gray-300` with `border-embee-slate/30`
- Replace `focus:ring-primary-500` with `focus:ring-embee-blue`

### Batch 3 — MEDIUM (3 files)

**`app/rider/dashboard/page.tsx`**
- Add `import Link from 'next/link'`
- Replace `<a href="/rider/onboarding">` with `<Link href="/rider/onboarding">`
- Replace `text-yellow-800` link with `text-embee-blue`

**`components/rider/delivery-progress-steps.tsx`**
- Replace `bg-blue-500` with `bg-embee-blue`
- Replace `ring-blue-200` with `ring-embee-blue/20`
- Replace `text-blue-600` with `text-embee-blue`
- Replace `bg-gray-200` with `bg-embee-slate/20`
- Replace `text-gray-500` with `text-embee-slate`

**`components/rider/availability-toggle.tsx`**
- Replace `bg-gray-300` with `bg-embee-slate/30`
- Replace `text-gray-700` with `text-embee-charcoal`
- Replace `focus:ring-primary-500` with `focus:ring-embee-blue`

---

## 11. Verification Plan

### Automated

| Check | Expected |
|-------|----------|
| Typecheck | PASS |
| Unit tests | 407/407 PASS |
| Production build | PASS |
| Secrets scan | CLEAN |
| Attribution scan | ZERO |
| MBEENEXUS scan | ZERO |

### Browser — Desktop

| Surface | Check |
|---------|-------|
| `/rider/register` | Logo renders, brand colors, form functional, step indicator works |
| `/rider/onboarding` | Logo renders, verification badges use StatusBadge, document cards functional |
| `/rider/dashboard` | Brand heading, availability toggle, earnings panel, offer cards, delivery card |
| Navigation | AppNav with Logo + mobile hamburger |

### Browser — Mobile

| Surface | Check |
|---------|-------|
| Register | Form fields stack, buttons full-width, no overflow |
| Onboarding | Document cards readable, buttons accessible |
| Dashboard | Grid stacks, earnings accessible, offers readable |
| Navigation | Hamburger menu works |

### Regression

| Check | Expected |
|-------|----------|
| Phase 1–6C functionality | Untouched |
| Registration flow | Functional |
| Onboarding flow | Functional |
| Dashboard data loading | Functional |
| Offer polling | Functional |
| Delivery actions | Functional |
| Earnings display | Functional |

---

## 12. Scope Guarantee

| Category | Impact |
|----------|--------|
| Database | **ZERO** |
| Migrations | **ZERO** |
| Backend/APIs | **ZERO** |
| Dependencies | **ZERO** |
| Mapping | **ZERO** |
| Customer pages | **ZERO** |
| Admin pages | **ZERO** |
| Authentication | **ZERO** |
| Authorization | **ZERO** |
| Business logic | **ZERO** |

---

## 13. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Token class not defined | LOW | LOW | All tokens verified in Phase 6A globals.css |
| StatusBadge missing status | LOW | LOW | All rider statuses already in STATUS_CONFIG |
| Logo theme mismatch | LOW | LOW | `theme="dark"` for light backgrounds |
| Button regression | LOW | MEDIUM | In-place class migration, no component swap |
| Polling breakage | IMPOSSIBLE | HIGH | No polling code modified |

---

## 14. Explicit Recommendation

**PHASE 6D ARCHITECTURE REVIEW — COMPLETE**

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

- 9 files, presentation-layer only
- Zero backend/database/API/dependency/mapping changes
- All required components already exist
- All functionality preserved
- Security unaffected
- Brand-compliant token mapping defined
- Semantic status colors preserved
- Responsive behavior preserved
- Accessibility maintained or improved
