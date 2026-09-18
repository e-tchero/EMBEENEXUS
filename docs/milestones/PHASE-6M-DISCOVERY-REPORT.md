# PHASE 6M — DISCOVERY REPORT

**Date:** August 28, 2026
**HEAD:** `ff74660` (unchanged)
**Branch:** master
**Working Tree:** Clean

---

## 1. Executive Summary

Phase 6A–6L are complete. The platform has: brand foundation, customer/rider/admin rebrand, Stadia Maps, route-based pricing, production hardening, admin operations, security remediation, and structured observability.

**The highest-value Phase 6M scope is: Customer Experience Completion + Delivery Proof Storage.**

The backend APIs for cancellation, rating, and delivery proof exist, but the customer-facing UI does not expose cancellation or rating from the order detail page. More critically, delivery proof photo storage has no Supabase Storage bucket — the backend accepts a `file_url` but there is no mechanism to upload or serve delivery proof photos. This blocks a real delivery workflow.

---

## 2. Repository Baseline

| Property | Value |
|----------|-------|
| HEAD | `ff74660` |
| Remote HEAD | `ff74660` ✅ |
| Branch | master |
| Working tree | ✅ Clean |
| Packages | 6 |
| API routes | 46 |
| Pages | 15 |
| Services | 13 |
| Components | 42 |
| Tests | 438/438 |

---

## 3. Complete Phase 6 History

| Phase | Commit | Scope |
|-------|--------|-------|
| 6A | `dc434d1` | Brand foundation (design tokens, colors, typography) |
| 6B | `56b0c07` | Homepage / marketing experience |
| 6C | `da572c4` | Customer experience rebrand |
| 6D | `6c6e42b` | Rider experience rebrand |
| 6E | `b1a60db` | Stadia Maps migration |
| 6F | `8970fac` | Admin experience rebrand |
| 6G | `e54f304` | Route geometry + brand compliance |
| 6H | `fc8018a` | Unified route pricing lifecycle |
| 6I | (discovery) | System-level audit |
| 6J | `54b4e84` | Production hardening / admin operations |
| security | `4136fa0` | RLS remediation |
| 6L | `ff74660` | Observability / operational safety |

---

## 4. Existing Functionality — VERIFIED

### Customer

| Feature | API | UI | Status |
|---------|-----|----|--------|
| Registration/login | ✅ | ✅ | Complete |
| Address management | ✅ | ✅ | Complete |
| Quote generation | ✅ | ✅ | Complete |
| Order creation | ✅ | ✅ | Complete |
| Payment initialization | ✅ | ✅ | Complete |
| Order list | ✅ | ✅ | Basic (no pagination/filtering in UI) |
| Order detail + tracking | ✅ | ✅ | Complete |
| Real-time tracking | ✅ | ✅ | Complete |
| Order cancellation | ✅ | ❌ | API exists, no UI button on detail page |
| Order rating | ✅ | ❌ | API exists, no UI on detail page |
| Refund status | ✅ | ✅ | Complete |

### Rider

| Feature | API | UI | Status |
|---------|-----|----|--------|
| Registration | ✅ | ✅ | Complete |
| Onboarding/documents | ✅ | ✅ | Complete |
| Availability toggle | ✅ | ✅ | Complete |
| GPS location updates | ✅ | ✅ | Complete |
| Offer list | ✅ | ✅ | Complete |
| Offer accept/reject | ✅ | ✅ | Complete |
| Active delivery | ✅ | ✅ | Complete |
| Delivery progress steps | ✅ | ✅ | Complete |
| Delivery completion | ✅ | ✅ | Complete |
| Earnings list | ✅ | ✅ | Complete |
| Earnings summary | ✅ | ✅ | Complete |
| Vehicle management | ✅ | ✅ | Complete |

### Admin

| Feature | API | UI | Status |
|---------|-----|----|--------|
| Dashboard stats | ✅ | ✅ | Complete |
| Rider list | ✅ | ✅ | Complete |
| Rider detail | ✅ | ✅ | Complete |
| Rider verification | ✅ | ✅ | Complete |
| Document verification | ✅ | ✅ | Complete |
| Order list | ✅ | ✅ | Complete |
| Order detail | ✅ | ✅ | Complete |
| Order cancellation | ✅ | ✅ | Complete |

---

## 5. Missing Functionality

### CRITICAL

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| C1 | **No delivery proof photo storage** | `supabase/migrations/` — no Storage bucket created | Delivery proof photos cannot be uploaded or served. The API accepts `file_url` but there is no mechanism to obtain it. Blocks real delivery workflow. |
| C2 | **No customer order cancellation UI** | `apps/web/app/(dashboard)/orders/[id]/page.tsx` | Customer cannot cancel from the order detail page. API exists but UI missing. |
| C3 | **No customer rating UI** | `apps/web/app/(dashboard)/orders/[id]/page.tsx` | Customer cannot rate from the order detail page. API exists but UI missing. |

### HIGH

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| H1 | **No notification service** | No `lib/services/notification.service.ts` | No push/email/SMS notifications sent. Notifications table exists but nothing writes to it. |
| H2 | **No rider payout execution** | `earnings.service.ts` only calculates, does not execute Paystack transfers | Riders cannot receive actual payments. Payout tables exist but no execution service. |
| H3 | **No customer list for admin** | No `apps/web/app/admin/customers/` | Admin cannot view or manage customers. |

### MEDIUM

| # | Gap | Location | Impact |
|---|-----|----------|--------|
| M1 | **No order list pagination/filtering in customer UI** | `apps/web/app/(dashboard)/orders/page.tsx` | Basic list with no search, filter by status, or pagination. |
| M2 | **No admin platform settings UI** | No `apps/web/app/admin/settings/` | Platform settings can only be changed via database. |
| M3 | **No autocomplete UI** | MapsProvider has autocomplete method but no booking UI uses it | Customer must manually enter coordinates. |

### DEFERRED / EXTERNAL

| # | Gap | Reason |
|---|-----|--------|
| D1 | Sentry/error reporting | External vendor decision |
| D2 | Redis caching | Not needed at current scale |
| D3 | Full payment reconciliation | Business decision required |
| D4 | E/N logo asset | External design |
| D5 | Stadia production config | Manual dashboard setup |
| D6 | Paystack production config | Manual dashboard setup |

---

## 6. Security Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| S1 | `prohibited_items` RLS | FIXED | ✅ Remediated |
| S2 | `spatial_ref_sys` grants | OPEN | ⚠️ Requires Dashboard fix |
| S3 | Cron timing-safe comparison | FIXED | ✅ Phase 6L |
| S4 | Rate limiting on critical endpoints | FIXED | ✅ Phase 6J |
| S5 | Structured logging | FIXED | ✅ Phase 6L |
| S6 | No IDOR paths found | VERIFIED | ✅ |

---

## 7. Concurrency Findings

| Area | Status |
|------|--------|
| Quote consumption | ✅ Atomic UPDATE with is_consumed guard |
| Order creation | ✅ Server-authoritative |
| Payment webhook | ✅ Idempotent via processed_webhook_events |
| Rider assignment | ✅ Partial unique index |
| Background jobs | ✅ FOR UPDATE SKIP LOCKED |
| Admin cancellation | ✅ Reuses order state machine |

---

## 8. Payment Findings

| Area | Status |
|------|--------|
| Quote → order → payment | ✅ Server-authoritative |
| Amount integrity | ✅ quote.total = order.total = payment.amount |
| Webhook signature | ✅ HMAC SHA-512 |
| Idempotency | ✅ processed_webhook_events |
| Refund handling | ✅ Via Paystack API |
| charge.failed handling | ✅ Phase 6J |
| Payment reconciliation | ❌ Not implemented (deferred) |

---

## 9. Mapping/Location Findings

| Area | Status |
|------|--------|
| MapsProvider abstraction | ✅ |
| Stadia Maps integration | ✅ |
| Route geometry persistence | ✅ JSONB on order |
| TrackingMap | ✅ Renders stored geometry |
| GPS throttling | ✅ |
| Autocomplete | ⚠️ Backend exists, no UI |
| Dispatch distance | ✅ Haversine (adequate for MVP) |

---

## 10. Observability Findings

| Area | Status |
|------|--------|
| Structured logger | ✅ All production code |
| Correlation IDs | ✅ All API routes |
| Request duration | ✅ Logged on completion |
| Health endpoint | ✅ /api/health |
| Error boundaries | ✅ Customer, rider, admin |
| Console calls remaining | ✅ 0 (excluding logger internals) |
| External error reporting | ❌ Deferred |

---

## 11. Testing Findings

| Area | Coverage |
|------|----------|
| Validators | ✅ Strong |
| Quote engine | ✅ Strong |
| Order lifecycle | ✅ Strong |
| Background jobs | ✅ Strong |
| Earnings | ✅ Strong |
| Cancellation/refund | ✅ Strong |
| Rate limiting | ✅ Phase 6J |
| Logger/correlation | ✅ Phase 6L |
| Webhook idempotency | ⚠️ Should add |
| Quote concurrency | ⚠️ Should add |
| Delivery proof storage | ❌ No tests (feature not implemented) |

---

## 12. Deferred Functionality

| Item | Originally Deferred | Recommended for Phase 6M? |
|------|--------------------|-----------------------------|
| Delivery proof photo storage | Phase 5D | **YES — CRITICAL** |
| Customer cancellation UI | Phase 5C | **YES — HIGH** |
| Customer rating UI | Phase 5C | **YES — HIGH** |
| Notification service | Phase 5A | DEFER — requires provider decision |
| Rider payout execution | Phase 5B | DEFER — requires founder decision |
| Customer list (admin) | Never started | SHOULD |
| Platform settings UI | Never started | DEFER |
| Autocomplete UI | Phase 6G | SHOULD |
| Order list pagination | Phase 6C | SHOULD |

---

## 13. Founder Decisions Required

| # | Decision | Impact |
|---|----------|--------|
| F1 | Rider payout architecture | Blocks actual rider payments |
| F2 | Notification provider (email/SMS/push) | Blocks all notifications |
| F3 | Payment reconciliation policy | Blocks financial auditing |
| F4 | E/N logo asset | Blocks brand completion |

---

## 14. Candidate Phase 6M Scope

| # | Item | Priority | Complexity | Production Impact | Blocker? |
|---|------|----------|-----------|-------------------|----------|
| 1 | Delivery proof Storage bucket + upload API | CRITICAL | MEDIUM | HIGH — enables real deliveries | YES |
| 2 | Customer cancellation button on order detail | HIGH | LOW | HIGH — customer cannot cancel without it | YES |
| 3 | Customer rating on order detail | HIGH | LOW | MEDIUM — completes delivery loop | YES |
| 4 | Admin customer list | MEDIUM | LOW | MEDIUM — operational visibility | NO |
| 5 | Customer order list pagination/filtering | MEDIUM | LOW | LOW — UX improvement | NO |
| 6 | Webhook idempotency tests | SHOULD | LOW | LOW — test coverage | NO |
| 7 | Quote concurrency test | SHOULD | LOW | LOW — test coverage | NO |

---

## 15. MUST / SHOULD / DEFER

### MUST IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 1 | Delivery proof Storage bucket + upload | Without this, riders cannot submit photo proof of delivery |
| 2 | Customer cancellation UI on order detail | API exists but customer has no way to trigger it |
| 3 | Customer rating UI on order detail | API exists but customer has no way to rate |

### SHOULD IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 4 | Admin customer list | Operational necessity |
| 5 | Customer order list pagination | UX for users with many orders |
| 6 | Webhook idempotency test | Test coverage for critical path |
| 7 | Quote concurrency test | Test coverage for critical path |

### DEFER

| # | Item | Reason |
|---|------|--------|
| 8 | Notification service | Requires provider decision |
| 9 | Rider payout execution | Requires founder decision |
| 10 | Platform settings UI | Low priority |
| 11 | Autocomplete UI | Nice-to-have |
| 12 | Sentry/external monitoring | External vendor decision |

---

## 16. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Storage bucket RLS misconfiguration | LOW | MEDIUM | Follow Supabase Storage best practices |
| Photo upload size abuse | LOW | LOW | Validate file size, type, auth |
| Cancellation during active delivery | LOW | LOW | Existing state machine handles this |

---

## 17. Verification

| Check | Result |
|-------|--------|
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Database modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only this report) |

---

## 18. GO / NO-GO

**GO — Architecture review is recommended.**

The proposed scope is focused, high-value, and production-critical. Delivery proof storage is a genuine blocker for real deliveries. The cancellation and rating UI gaps prevent customers from completing the delivery loop.

---

**PHASE 6M DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**
