# PHASE 6F DISCOVERY REPORT

**Date:** August 27, 2026
**Status:** DISCOVERY COMPLETE — READY FOR ARCHITECTURE REVIEW
**Baseline HEAD:** `b1a60db`

---

## 1. Baseline

| Check | Result |
|-------|--------|
| HEAD | `b1a60db` ✅ |
| Branch | `master` ✅ |
| Working tree | Clean ✅ |
| Phase 1–6E commits | 17 commits, all intact ✅ |

---

## 2. Current Architecture State

### 2.1 Milestone Structure

| Milestone | Phases | Status |
|-----------|--------|--------|
| Milestone 1 | Project foundation | ✅ COMPLETE |
| Milestone 2 | Customer booking + payment | ✅ COMPLETE |
| Milestone 3 | Rider subsystem + dispatch | ✅ COMPLETE |
| Milestone 3 Phase 4A–4D | Delivery, earnings, cancellation, jobs | ✅ COMPLETE |
| Milestone 4 Phase 5A–5D | Real-time tracking, rider dashboard, customer enhancements, admin verification | ✅ COMPLETE |
| Milestone 5 Phase 6A–6E | Brand foundation, homepage, customer rebrand, rider rebrand, mapping migration | ✅ COMPLETE |

### 2.2 Feature Inventory

| Feature | Status | Notes |
|---------|--------|-------|
| Customer auth (login/signup) | ✅ Complete | Branded with Logo + Manrope |
| Customer dashboard | ✅ Complete | Branded, booking entry point |
| Address management | ✅ Complete | CRUD with branded components |
| Booking flow | ✅ Complete | Quote → book → pay |
| Payment (Paystack) | ✅ Complete | Webhook + verification |
| Order list | ✅ Complete | StatusBadge consolidated |
| Order detail | ✅ Complete | Tracking, cancel, refund, proof, rating |
| Real-time tracking | ✅ Complete | MapLibre + Stadia Maps + broadcast |
| Rider registration | ✅ Complete | Branded with Logo |
| Rider onboarding | ✅ Complete | Document upload |
| Rider dashboard | ✅ Complete | Availability, offers, delivery, earnings |
| Active delivery | ✅ Complete | Full state machine |
| Admin verification | ✅ Complete | Queue, detail, approve/reject |
| Homepage | ✅ Complete | Marketing, 8 sections |
| 404 page | ✅ Complete | Branded |
| Background jobs | ✅ Complete | Cron processing |
| Brand system | ✅ Complete | Manrope, tokens, shared components |
| Mapping | ✅ Complete | MapLibre + Stadia Maps |

### 2.3 API Inventory (43 endpoints)

| Category | Count | Status |
|----------|-------|--------|
| Auth | 2 | ✅ |
| Addresses | 3 | ✅ |
| Orders | 5 | ✅ |
| Payments | 2 | ✅ |
| Rider (profile, availability, location, documents, vehicles, verification) | 8 | ✅ |
| Rider offers | 3 | ✅ |
| Rider deliveries | 8 | ✅ |
| Rider earnings | 2 | ✅ |
| Admin riders | 4 | ✅ |
| Categories | 1 | ✅ |
| Cron | 1 | ✅ |
| Webhooks | 1 | ✅ |
| Orders (cancel, refund, rating, proof) | 4 | ✅ |

---

## 3. Findings

### 3.1 Payment Reference Brand Name

**Severity: LOW (cosmetic)**

| Finding | Detail |
|---------|--------|
| Location | `lib/services/order.service.ts:77` |
| Issue | Payment reference uses `MBEENEXUS-${orderNumber}-${Date.now()}` |
| Impact | Payment references sent to Paystack contain "MBEENEXUS" prefix |
| Risk | Changing this would break reference matching for existing orders |
| Recommendation | **Defer** — cosmetic only, functional risk of changing |

### 3.2 Admin Pages Remaining Gray Classes

**Severity: MEDIUM (cosmetic)**

| Finding | Detail |
|---------|--------|
| Locations | `admin/dashboard/page.tsx` (6), `admin/rider-queue.tsx` (8), `admin/document-card.tsx` (3), `admin/rider-detail.tsx` (4), `admin/verification-history.tsx` (3), `admin/verify-actions.tsx` (3) |
| Issue | `bg-gray-50`, `border-gray-300`, `hover:bg-gray-50` remain in admin components |
| Impact | Minor visual inconsistency with brand system |
| Recommendation | Migrate to `bg-embee-white`, `border-embee-slate/30`, `hover:bg-embee-white` |

### 3.3 Status Badge Semantic Colors

**Severity: NONE (intentional)**

| Finding | Detail |
|---------|--------|
| Location | `components/ui/status-badge.tsx` |
| Issue | `bg-indigo-100`, `bg-purple-100` used for rider/delivery states |
| Assessment | **NOT a brand violation** — these are semantic status colors communicating system state (rider_assigned, arrived_at_pickup, etc.) |
| Recommendation | **Keep as-is** — status colors must remain distinguishable from brand colors |

### 3.4 E/N Monogram Logo

**Severity: EXTERNAL DEPENDENCY**

| Finding | Detail |
|---------|--------|
| Status | Not yet available from founder |
| Current state | Interim text wordmark "EMBEE NEXUS" |
| Impact | Visual identity incomplete |
| Recommendation | **Defer** — await founder asset delivery |

### 3.5 Mapping Operational Configuration

**Severity: EXTERNAL / MANUAL**

| Finding | Detail |
|---------|--------|
| Status | Code complete, operational setup pending |
| Required | Stadia Maps account, API key, domain auth configuration |
| Impact | Maps will not work in production until configured |
| Recommendation | **Document as manual production setup step** |

---

## 4. Severity Classification

| Severity | Count | Items |
|----------|-------|-------|
| **CRITICAL** | 0 | — |
| **HIGH** | 0 | — |
| **MEDIUM** | 1 | Admin gray classes (27 occurrences across 6 files) |
| **LOW** | 1 | Payment reference "MBEENEXUS" prefix |
| **NONE** | 1 | Status badge semantic colors (intentional) |
| **EXTERNAL** | 2 | E/N logo asset, Stadia Maps operational config |

---

## 5. Files Potentially Affected

| File | Change | Effort |
|------|--------|--------|
| `app/admin/dashboard/page.tsx` | Gray → brand tokens | LOW |
| `components/admin/rider-queue.tsx` | Gray → brand tokens | LOW |
| `components/admin/document-card.tsx` | Gray → brand tokens | LOW |
| `components/admin/rider-detail.tsx` | Gray → brand tokens | LOW |
| `components/admin/verification-history.tsx` | Gray → brand tokens | LOW |
| `components/admin/verify-actions.tsx` | Gray → brand tokens | LOW |
| `lib/services/order.service.ts` | "MBEENEXUS" → "EMBEE" (DEFER) | LOW |

---

## 6. Proposed Phase 6F Scope

### IN SCOPE

1. **Admin brand compliance** — Migrate remaining gray classes in admin components to Embee Nexus brand tokens
2. **Payment reference cleanup** — Rename `MBEENEXUS` prefix to `EMBEE` in payment reference (if safe to do so without breaking existing order matching)

### DEFERRED

| Item | Reason |
|------|--------|
| E/N monogram logo | External asset dependency — await founder |
| Stadia Maps operational config | Manual production setup — not code |
| General admin dashboard features | Explicitly out of scope for branding phase |
| Analytics/reporting | Future milestone |
| Notification system | Future milestone |
| Advanced dispatch optimization | Future milestone (Matrix API) |

---

## 7. Explicit Out-of-Scope Items

- Database changes
- Migrations
- New API endpoints
- New dependencies
- Authentication/authorization changes
- Payment logic changes
- Booking logic changes
- Dispatch logic changes
- Rider workflow changes
- Customer workflow changes
- Tracking infrastructure changes
- Mapping provider rework
- New UI components (unless replacing duplicates)
- General admin dashboard expansion

---

## 8. Dependency Analysis

| Dependency | Required? | Notes |
|------------|-----------|-------|
| New npm packages | NO | — |
| Database changes | NO | — |
| API changes | NO | — |
| External assets | E/N logo (deferred) | — |
| Stadia Maps account | Manual setup | Not a code dependency |

---

## 9. Security Considerations

| Check | Status |
|-------|--------|
| No new auth surfaces | ✅ |
| No new API endpoints | ✅ |
| No database changes | ✅ |
| No credential exposure | ✅ |
| No IDOR risks introduced | ✅ |
| No privilege escalation | ✅ |

---

## 10. Mapping Operational Dependencies

| Item | Status | Action Required |
|------|--------|-----------------|
| Stadia Maps account | NOT YET | Sign up at stadiamaps.com |
| Starter plan upgrade | NOT YET | $20/month for commercial use |
| API key generation | NOT YET | Server-side geocoding/routing |
| Domain auth configuration | NOT YET | Add production domain to dashboard |
| Environment variables | NOT YET | Set STADIA_MAPS_API_KEY in production |

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin gray class migration breaks layout | LOW | LOW | Test each file individually |
| Payment reference change breaks existing orders | MEDIUM | HIGH | **Defer** — do not change if any risk |
| E/N logo delayed indefinitely | LOW | LOW | Interim wordmark is acceptable |

---

## 12. Recommended Next Step

**Architecture review for Phase 6F** — confirm the minimal scope (admin gray class cleanup + optional payment reference rename) and produce implementation plan.

Estimated effort: **1–2 hours** for admin brand compliance.

---

## 13. Verification Results

| Check | Result |
|-------|--------|
| HEAD | `b1a60db` ✅ |
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Git history modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only this report) |

---

**PHASE 6F DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**
