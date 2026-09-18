# PHASE 6F ARCHITECTURE REVIEW

**Date:** August 27, 2026
**Status:** ARCHITECTURE REVIEW COMPLETE — READY FOR IMPLEMENTATION AUTHORIZATION
**Baseline HEAD:** `b1a60db`

---

## 1. Architecture Summary

Phase 6F is a **presentation-layer-only** remediation. Six admin components contain remaining generic Tailwind gray classes (`bg-gray-50`, `border-gray-200`, `border-gray-300`, `hover:bg-gray-50`, `bg-gray-100`, `divide-gray-200`) that should migrate to the established Embee Nexus brand tokens.

**No backend, database, API, authentication, authorization, business logic, or mapping changes.**

---

## 2. Exact Affected Files

| # | File | Gray Occurrences | Change Type |
|---|------|-----------------|-------------|
| 1 | `app/admin/dashboard/page.tsx` | 6 | Token migration |
| 2 | `components/admin/rider-queue.tsx` | 8 | Token migration |
| 3 | `components/admin/document-card.tsx` | 3 | Token migration |
| 4 | `components/admin/rider-detail.tsx` | 4 | Token migration |
| 5 | `components/admin/verification-history.tsx` | 3 | Token migration |
| 6 | `components/admin/verify-actions.tsx` | 3 | Token migration |
| **Total** | | **27** | |

---

## 3. Per-File Migration Decisions

### 3.1 `app/admin/dashboard/page.tsx` (6 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~42 | `border border-gray-200` | `border border-embee-slate/20` | Stat card border |
| ~52 | `border border-gray-200` | `border border-embee-slate/20` | Stat card border |
| ~62 | `border border-gray-200` | `border border-embee-slate/20` | Stat card border |
| ~72 | `border border-gray-200` | `border border-embee-slate/20` | Stat card border |
| ~82 | `border border-gray-200` | `border border-embee-slate/20` | Quick Actions card border |
| ~89 | `border border-gray-300 hover:bg-gray-50` | `border border-embee-slate/30 hover:bg-embee-white` | Secondary button |

### 3.2 `components/admin/rider-queue.tsx` (8 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~75 | `border-gray-200 hover:border-embee-blue` | `border-embee-slate/20 hover:border-embee-blue` | Filter button (inactive) |
| ~93 | `border border-gray-200` | `border border-embee-slate/20` | Empty state card |
| ~100 | `border border-gray-200` | `border border-embee-slate/20` | Table container |
| ~102 | `divide-y divide-gray-200` | `divide-y divide-embee-slate/20` | Table header divider |
| ~104 | `bg-gray-50` | `bg-embee-white` | Table header background |
| ~119 | `divide-y divide-gray-200` | `divide-y divide-embee-slate/20` | Table body divider |
| ~124 | `hover:bg-gray-50` | `hover:bg-embee-white` | Table row hover |
| ~67 | `bg-gray-100 text-gray-800` | `bg-embee-white text-embee-charcoal` | Fallback status badge |

### 3.3 `components/admin/document-card.tsx` (3 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~76 | `border border-gray-200` | `border border-embee-slate/20` | Document card border |
| ~153 | `border border-gray-300 hover:bg-gray-50` | `border border-embee-slate/30 hover:bg-embee-white` | Cancel button |
| ~55 | `bg-gray-100 text-gray-800` | `bg-embee-white text-embee-charcoal` | Fallback status badge |

### 3.4 `components/admin/rider-detail.tsx` (4 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~88 | `border border-gray-200` | `border border-embee-slate/20` | Rider info card |
| ~118 | `border border-gray-200` | `border border-embee-slate/20` | Vehicle info card |
| ~148 | `border border-gray-200` | `border border-embee-slate/20` | Documents card |
| ~55 | `bg-gray-100 text-gray-800` | `bg-embee-white text-embee-charcoal` | Fallback status badge |

### 3.5 `components/admin/verification-history.tsx` (3 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~38 | `border border-gray-200` | `border border-embee-slate/20` | History card |
| ~52 | `bg-gray-100` | `bg-embee-white` | Avatar circle background |
| ~30 | `bg-gray-100 text-gray-800` | `bg-embee-white text-embee-charcoal` | Fallback status badge |

### 3.6 `components/admin/verify-actions.tsx` (3 occurrences)

| Line | Current | Target | Context |
|------|---------|--------|---------|
| ~68 | `border border-gray-200` | `border border-embee-slate/20` | Actions card |
| ~82 | `border border-gray-300` | `border border-embee-slate/30` | Notes textarea |
| ~133 | `border border-gray-300 hover:bg-gray-50` | `border border-embee-slate/30 hover:bg-embee-white` | Cancel button |

---

## 4. Source → Target Token Mapping

| Source Class | Target Class | Rationale |
|-------------|-------------|-----------|
| `bg-gray-50` | `bg-embee-white` | Light background → Cool White |
| `bg-gray-100` | `bg-embee-white` | Slightly darker background → Cool White |
| `border-gray-200` | `border-embee-slate/20` | Subtle border → Slate at 20% opacity |
| `border-gray-300` | `border-embee-slate/30` | Medium border → Slate at 30% opacity |
| `divide-gray-200` | `divide-embee-slate/20` | Table divider → Slate at 20% opacity |
| `hover:bg-gray-50` | `hover:bg-embee-white` | Hover background → Cool White |
| `text-gray-800` (fallback badge) | `text-embee-charcoal` | Fallback text → Deep Charcoal |

---

## 5. Semantic-Color Exceptions

**DO NOT migrate these classes** — they are semantic status indicators, not generic presentation:

| Class | Usage | Reason to Keep |
|-------|-------|---------------|
| `bg-yellow-100 text-yellow-800` | Pending status | Semantic: warning/pending state |
| `bg-blue-100 text-blue-800` | Under review status | Semantic: informational/in-progress state |
| `bg-green-100 text-green-800` | Approved status | Semantic: success/approved state |
| `bg-red-100 text-red-800` | Rejected status | Semantic: error/rejected state |
| `bg-green-600` | Approve button | Semantic: success action |
| `bg-red-600` | Reject/confirm button | Semantic: destructive action |
| `text-red-600` | Rejection reason text | Semantic: error/destructive text |
| `border-red-300` | Reject button border | Semantic: destructive border |
| `hover:bg-red-50` | Reject button hover | Semantic: destructive hover |
| `bg-red-50` | Rejection dialog background | Semantic: destructive context |
| `border-red-200` | Rejection dialog border | Semantic: destructive border |
| `text-green-600` | Approved doc count | Semantic: success text |
| `text-yellow-600` | Pending doc count | Semantic: warning text |
| `text-red-600` | Rejected doc count | Semantic: error text |
| `focus:ring-red-500` | Rejection textarea focus | Semantic: destructive focus |
| `border-red-300` | Rejection textarea border | Semantic: destructive border |

**These are NOT brand violations.** They communicate system state and must remain distinguishable.

---

## 6. Functionality Preservation Analysis

| File | Functional Risk | Assessment |
|------|----------------|------------|
| `dashboard/page.tsx` | NONE | Server component, layout only |
| `rider-queue.tsx` | NONE | Client component, layout only |
| `document-card.tsx` | NONE | Client component, layout only |
| `rider-detail.tsx` | NONE | Client component, layout only |
| `verification-history.tsx` | NONE | Server component, layout only |
| `verify-actions.tsx` | NONE | Client component, layout only |

**All changes are CSS class replacements.** No JavaScript logic, state management, API calls, event handlers, or data flow is modified.

---

## 7. Security Analysis

| Check | Result |
|-------|--------|
| Auth changes | ✅ NONE |
| Authorization changes | ✅ NONE |
| RLS changes | ✅ NONE |
| API changes | ✅ NONE |
| Database changes | ✅ NONE |
| Secrets introduced | ✅ NONE |
| Client-side credential exposure | ✅ NONE |
| IDOR risk | ✅ NONE |

---

## 8. Scope Boundaries

### IN SCOPE

- 6 admin files
- 27 gray class occurrences
- Token migration only
- No functional changes

### EXPLICITLY OUT OF SCOPE

| Item | Reason |
|------|--------|
| Payment reference "MBEENEXUS" | Risk of breaking existing payment matching |
| E/N monogram logo | External asset dependency |
| Stadia Maps operational config | Manual production setup, not code |
| New admin features | Future milestone |
| Database/migrations | Not a presentation change |
| API endpoints | Not a presentation change |
| Business logic | Not a presentation change |
| Authentication/authorization | Not a presentation change |
| Mapping provider | Completed in Phase 6E |
| New dependencies | Not needed |
| Customer/rider pages | Already branded in 6C/6D |

---

## 9. Dependency Analysis

| Dependency | Required? |
|------------|-----------|
| New npm packages | NO |
| Database changes | NO |
| API changes | NO |
| External assets | NO |
| Environment variables | NO |

---

## 10. Stadia / Manual Configuration Boundary

The following are **NOT source-code tasks** and must not be implemented in Phase 6F:

| Item | Type | Action Required |
|------|------|-----------------|
| Stadia Maps account signup | Manual | Founder/developer action |
| Starter plan upgrade | Manual | Billing configuration |
| API key generation | Manual | Dashboard action |
| Domain auth configuration | Manual | Dashboard action |
| Production env vars | Manual | Deployment configuration |

**Do NOT add `NEXT_PUBLIC_STADIA_MAPS_API_KEY` or any client-side Stadia credentials.**

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Token migration breaks layout | LOW | LOW | Test each file individually |
| Slate/20 too subtle for borders | LOW | LOW | Visual verification |
| Fallback badge contrast change | LOW | LOW | Verify readability |

---

## 12. Implementation Sequence

### Batch 1: Card borders (highest frequency)

1. `admin/dashboard/page.tsx` — 4 stat cards + Quick Actions card
2. `admin/rider-detail.tsx` — 3 info cards
3. `admin/rider-queue.tsx` — table container + empty state
4. `admin/verification-history.tsx` — history card
5. `admin/verify-actions.tsx` — actions card
6. `admin/document-card.tsx` — document card

### Batch 2: Interactive elements

7. `admin/dashboard/page.tsx` — secondary button
8. `admin/rider-queue.tsx` — filter buttons, table header, table rows
9. `admin/document-card.tsx` — cancel button
10. `admin/verify-actions.tsx` — textarea border, cancel button

### Batch 3: Fallback badges

11. `admin/rider-queue.tsx` — fallback status badge
12. `admin/document-card.tsx` — fallback status badge
13. `admin/rider-detail.tsx` — fallback status badge
14. `admin/verification-history.tsx` — fallback badge + avatar circle

---

## 13. Verification Plan

| Check | Requirement |
|-------|-------------|
| Typecheck | PASS |
| Unit tests | 407/407 PASS |
| Production build | PASS |
| Secrets scan | CLEAN |
| Attribution scan | ZERO |
| Gray class scan | ZERO remaining in admin files |
| Semantic color preservation | All status badges intact |
| Admin functionality | All actions work |
| Visual verification | Borders, backgrounds, hover states render correctly |

---

## 14. Final Recommendation

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

Scope is minimal (27 CSS class changes across 6 files), zero functional risk, zero security impact, and zero dependency changes.
