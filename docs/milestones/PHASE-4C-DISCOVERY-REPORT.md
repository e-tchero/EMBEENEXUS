# PHASE 4C — DISCOVERY REPORT

## Cancellation & Failure Handling

**Date:** August 23, 2026
**Baseline:** Phase 4B commit `7514a54978c9c058e38d6921db0404f7b8bd1964`
**Status:** Discovery Complete — Awaiting Architecture Review

---

## 1. Executive Summary

Phase 4C addresses cancellation and failure handling for the active delivery workflow. The existing infrastructure provides a solid foundation:

- `cancel_order()` function exists and is LIVE
- `transition_order_status()` supports 'cancelled' and 'failed' transitions
- Rider cancellation API exists at `/api/riders/deliveries/[orderId]/cancel`

**Key Gaps Identified:**
1. No customer-facing cancellation API
2. No `fail_delivery()` function for rider-reported failures
3. No failed delivery API endpoint
4. No refund handling (even minimal for MVP)
5. No cancellation notification to rider

---

## 2. Repository Baseline

### 2.1 Current HEAD

| Field | Value |
|-------|-------|
| Commit | `7514a54978c9c058e38d6921db0404f7b8bd1964` |
| Message | `feat(milestone-3-phase4b): rider earnings read APIs and accounting fixes` |
| Author | ETCHERO <etcherotech@gmail.com> |
| Working tree | Clean |

### 2.2 Previous Commits

| Commit | Message | Status |
|--------|---------|--------|
| `963fbeb` | feat(milestone-3-phase4a): active delivery and proof workflow | ✅ Untouched |
| `3c07103` | feat(milestone-3): dispatch and rider offer workflow | ✅ Untouched |
| `ee124d8` | feat(milestone-3-phase2): rider availability and location subsystem | ✅ Untouched |
| `4e5e633` | feat(milestone-2): complete customer booking flow and payment foundation | ✅ Untouched |
| `3d20e47` | feat: Milestone 1 — project foundation | ✅ Untouched |

---

## 3. Existing Cancellation Infrastructure

### 3.1 Database Foundation

| Column | Table | Purpose |
|--------|-------|---------|
| `cancelled_at` | orders | Cancellation timestamp |
| `cancelled_by` | orders | User who cancelled |
| `cancellation_reason` | orders | Reason text |
| `status = 'cancelled'` | orders | Terminal state |
| `status = 'cancelled'` | rider_assignments | Assignment cancelled |

### 3.2 PostgreSQL Functions

#### `cancel_order()` — EXISTS, LIVE

**Signature:**
```sql
cancel_order(
  p_order_id UUID,
  p_actor_type TEXT,  -- 'rider', 'customer', 'admin'
  p_reason TEXT DEFAULT NULL
) RETURNS TABLE (success BOOLEAN, message TEXT)
```

**Current Behavior:**
1. Authenticates caller via `auth.uid()`
2. Locks order row with `SELECT ... FOR UPDATE`
3. Validates order is in cancellable state
4. Validates actor authorization
5. Updates order status to 'cancelled'
6. Cancels active rider assignments
7. Restores rider availability
8. Records order_event

**Cancellable States:**
- `paid`
- `searching_rider`
- `rider_assigned`
- `rider_en_route_to_pickup`
- `arrived_at_pickup`

**NOT Cancellable (after pickup):**
- `picked_up`
- `in_transit`
- `arrived_at_destination`
- `delivered`
- `completed`

### 3.3 API Endpoints

#### Rider Cancellation — EXISTS

**Route:** `POST /api/riders/deliveries/[orderId]/cancel`
**Actor:** Rider (assigned rider only)
**Request Body:** `{ reason?: string }`
**Response:** `{ success: boolean, message: string }`

### 3.4 State Machine Transitions

From `transition_order_status()`:

```
rider_assigned → cancelled ✅
rider_en_route_to_pickup → cancelled ✅
arrived_at_pickup → cancelled ✅
picked_up → cancelled ✅ (in transition map, but blocked by rider/customer check)
in_transit → cancelled ✅ (in transition map, but blocked by rider/customer check)
arrived_at_destination → cancelled ✅ (in transition map, but blocked by rider/customer check)
```

---

## 4. Gaps Identified

### 4.1 Customer Cancellation API — MISSING

**Required:** Customer-facing endpoint to cancel their own order.

**Current State:**
- `cancel_order()` function supports `p_actor_type = 'customer'`
- No API route exists for customer cancellation
- Customer cannot cancel through the application

**Risk:** HIGH — Customers have no way to cancel orders.

### 4.2 Failed Delivery Function — MISSING

**Required:** `fail_delivery()` function for rider-reported failures.

**Current State:**
- `transition_order_status()` supports transition to 'failed'
- No dedicated function for rider-reported delivery failures
- No proof/documentation requirement for failures

**Risk:** MEDIUM — Riders cannot report delivery failures.

### 4.3 Failed Delivery API — MISSING

**Required:** Rider-facing endpoint to report delivery failure.

**Current State:**
- No API route exists for failed delivery reporting

**Risk:** MEDIUM — No way to report failures through the application.

### 4.4 Refund Handling — MISSING

**Required:** Minimal refund logic for cancellations.

**Current State:**
- No refund processing exists
- Payment remains captured after cancellation
- No Paystack refund integration

**Risk:** HIGH — Financial inconsistency after cancellation.

### 4.5 Cancellation Notifications — MISSING

**Required:** Notify rider when customer cancels.

**Current State:**
- No notification system implemented
- Rider continues delivering after customer cancels

**Risk:** MEDIUM — Rider wastes time on cancelled orders.

---

## 5. Security/Concurrency Analysis

### 5.1 Race Conditions

| Race Condition | Risk | Protection |
|----------------|------|------------|
| Customer cancels while rider transitions | Order in invalid state | `SELECT ... FOR UPDATE` in cancel_order() |
| Rider marks failed while customer cancels | Duplicate state change | Row lock prevents concurrent updates |
| Duplicate cancellation request | Double refund attempt | Idempotent cancellation (already cancelled = success) |
| Cancellation after completion | Invalid terminal state | State guard in cancel_order() |

### 5.2 Authorization Matrix

| Actor | Cancel Before Pickup | Cancel After Pickup | Mark Failed |
|-------|---------------------|--------------------|--------------------|
| Rider | ✅ | ❌ | ✅ |
| Customer | ✅ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ |
| System | ✅ | ✅ | ✅ |

### 5.3 Financial Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Double refund | HIGH | Idempotent refund with unique constraint |
| Refund after completion | HIGH | State guard: no refund after delivered |
| Partial refund | MEDIUM | MVP: full refund only |
| Refund fee handling | LOW | MVP: no fees |

---

## 6. Order State Machine Analysis

### 6.1 All 17 States

```
draft → pending_payment → paid → searching_rider → rider_assigned
→ rider_en_route_to_pickup → arrived_at_pickup → picked_up
→ in_transit → arrived_at_destination → delivered → completed

Terminal states: cancelled, failed, expired, disputed, refunded
```

### 6.2 Cancellation-Related Transitions

| Current State | → Cancelled | → Failed | Notes |
|---------------|-------------|----------|-------|
| paid | ✅ | ❌ | Before dispatch |
| searching_rider | ✅ | ✅ | During dispatch |
| rider_assigned | ✅ | ✅ | After assignment |
| rider_en_route_to_pickup | ✅ | ✅ | En route |
| arrived_at_pickup | ✅ | ✅ | At pickup |
| picked_up | ❌ | ✅ | After pickup (rider only) |
| in_transit | ❌ | ✅ | In transit (rider only) |
| arrived_at_destination | ❌ | ✅ | At destination (rider only) |
| delivered | ❌ | ❌ | Terminal |
| completed | ❌ | ❌ | Terminal |

### 6.3 Invalid Transitions

| Transition | Status |
|------------|--------|
| cancelled → any | ❌ Terminal |
| failed → any | ❌ Terminal |
| completed → any | ❌ Terminal |
| delivered → cancelled | ❌ Blocked |

---

## 7. Financial Flow Analysis

### 7.1 Current Payment Flow

```
Customer pays → Paystack → order.paid → dispatch → delivery → earnings
```

### 7.2 Cancellation Financial Impact

| Cancellation Point | Payment State | Required Action |
|--------------------|---------------|-----------------|
| Before dispatch | Captured | Full refund |
| During dispatch | Captured | Full refund |
| Before pickup | Captured | Full refund |
| After pickup | Captured | No refund (MVP) |

### 7.3 MVP Refund Decision

From Architecture Review:
> "MVP decision: No cancellation fees. All cancellations are free."

**Implication:** Cancellation before pickup = full refund.

---

## 8. API Gap Analysis

### 8.1 Existing APIs

| Route | Method | Actor | Status |
|-------|--------|-------|--------|
| `/api/riders/deliveries/[orderId]/cancel` | POST | Rider | ✅ EXISTS |

### 8.2 Required APIs

| Route | Method | Actor | Priority |
|-------|--------|-------|----------|
| `/api/orders/[orderId]/cancel` | POST | Customer | HIGH |
| `/api/riders/deliveries/[orderId]/fail` | POST | Rider | HIGH |
| `/api/admin/orders/[orderId]/cancel` | POST | Admin | MEDIUM |

### 8.3 API Specifications

#### POST /api/orders/[orderId]/cancel (Customer)

**Authentication:** Required
**Authorization:** Customer must own order
**Request Body:** `{ reason?: string }`
**Response:** `{ success: boolean, message: string }`

**Behavior:**
1. Authenticate customer
2. Verify customer owns order
3. Verify order is in cancellable state
4. Call `cancel_order()` with `p_actor_type = 'customer'`
5. Process refund if applicable
6. Return success/failure

#### POST /api/riders/deliveries/[orderId]/fail (Rider)

**Authentication:** Required
**Authorization:** Rider must be assigned
**Request Body:** `{ reason: string, proof_type?: string, proof_url?: string }`
**Response:** `{ success: boolean, message: string }`

**Behavior:**
1. Authenticate rider
2. Verify rider is assigned
3. Verify order is in active state
4. Validate failure reason
5. Call `transition_order_status()` with target_status = 'failed'
6. Record failure proof if provided
7. Restore rider availability
8. Return success/failure

---

## 9. Background Job Requirements

### 9.1 Stale Delivery Detection

**Trigger:** Background job checks for stale active deliveries
**Behavior:** If delivery exceeds expected time, mark as failed
**Priority:** MEDIUM

### 9.2 Cancellation Notification

**Trigger:** On successful cancellation
**Behavior:** Notify affected rider/customer
**Priority:** LOW (notification system not yet implemented)

---

## 10. Testing Strategy

### 10.1 Cancellation Tests

| Test | Expected Result |
|------|-----------------|
| Customer cancels own order | Success |
| Customer cancels other's order | 403 |
| Rider cancels assigned order | Success |
| Rider cancels unassigned order | 403 |
| Cancel after pickup | Rejected |
| Cancel completed order | Rejected |
| Duplicate cancellation | Idempotent |
| Concurrent cancellation | Safe |

### 10.2 Failure Tests

| Test | Expected Result |
|------|-----------------|
| Rider reports failure | Success |
| Rider reports failure without assignment | 403 |
| Failure without reason | Rejected |
| Failure after completion | Rejected |
| Duplicate failure report | Idempotent |

### 10.3 Financial Tests

| Test | Expected Result |
|------|-----------------|
| Refund on cancellation | Full refund |
| No refund after pickup | No refund |
| Duplicate refund prevention | Idempotent |
| Refund after completion | Rejected |

---

## 11. Migration Requirements

### 11.1 New Database Objects

| Object | Type | Purpose |
|--------|------|---------|
| `fail_delivery()` | FUNCTION | Rider-reported failure handling |

### 11.2 Modified Objects

| Object | Type | Change |
|--------|------|--------|
| `cancel_order()` | FUNCTION | Add refund processing |

### 11.3 New Indexes

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| None required | - | - | - |

---

## 12. Product Decisions Requiring Approval

### 12.1 Pending Decisions

| Decision | Current Value | Options | Recommendation |
|----------|---------------|---------|----------------|
| Cancellation fees | None (MVP) | None, percentage, fixed | Keep none for MVP |
| Refund timing | Immediate | Immediate, delayed | Immediate for MVP |
| Refund method | Paystack reversal | Reversal, credit | Reversal for MVP |
| Failure proof requirement | Optional | Required, optional | Optional for MVP |
| Failure notification | None | Rider→Customer, both | Defer to notification phase |

### 12.2 Approved MVP Defaults

| Decision | Value | Source |
|----------|-------|--------|
| Cancellation fees | 0 | Architecture Review |
| Refund | Full refund before pickup | Architecture Review |
| Failure proof | Optional | Discovery |
| Notifications | Deferred | Later milestone |

---

## 13. Implementation Scope

### 13.1 Phase 4C Components

| Component | Type | Priority |
|-----------|------|----------|
| Customer cancellation API | API | HIGH |
| Rider failure API | API | HIGH |
| `fail_delivery()` function | FUNCTION | HIGH |
| Refund processing | SERVICE | HIGH |
| Cancellation tests | TEST | HIGH |
| Failure tests | TEST | HIGH |

### 13.2 Estimated Effort

| Component | Files | Effort |
|-----------|-------|--------|
| Customer cancellation API | 1 | LOW |
| Rider failure API | 1 | LOW |
| `fail_delivery()` function | 1 migration | LOW |
| Refund service | 1 | MEDIUM |
| Tests | 1 | MEDIUM |

---

## 14. Risks and Mitigations

### 14.1 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Double refund | HIGH | Idempotent refund with unique constraint |
| Race condition on cancellation | HIGH | Row lock in cancel_order() |
| Financial inconsistency | HIGH | Atomic transaction for refund |
| Stale delivery not detected | MEDIUM | Background job for timeout |
| Customer cannot cancel | HIGH | Implement customer cancellation API |

### 14.2 Mitigations

1. Use existing `cancel_order()` with row locking
2. Add unique constraint for refund idempotency
3. Process refund inside cancellation transaction
4. Add background job for stale delivery detection
5. Implement customer cancellation API immediately

---

## 15. Dependencies

### 15.1 Internal Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Phase 4A (Active Delivery) | ✅ Complete | Required |
| Phase 4B (Earnings) | ✅ Complete | Required for refund calculation |
| Paystack Integration | ✅ Exists | Required for refund processing |

### 15.2 External Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Paystack Refund API | ✅ Available | Used for refund processing |
| Notification System | ❌ Not implemented | Deferred |

---

## 16. Recommendations

### 16.1 Implementation Priority

1. Customer cancellation API (HIGH)
2. `fail_delivery()` function (HIGH)
3. Rider failure API (HIGH)
4. Refund processing (HIGH)
5. Tests (HIGH)
6. Background stale delivery detection (MEDIUM)

### 16.2 Scope Control

**IN SCOPE:**
- Customer cancellation API
- Rider failure reporting
- Refund processing (full refund before pickup)
- Cancellation/failure tests

**OUT OF SCOPE:**
- Partial refunds
- Cancellation fees
- Notification system
- Dispute flow
- Admin cancellation API

---

## 17. GO/NO-GO Recommendation

### GO Conditions

| Condition | Status |
|-----------|--------|
| Existing infrastructure sufficient | ✅ |
| Security model clear | ✅ |
| Financial model clear | ✅ |
| No blocking dependencies | ✅ |
| Product decisions documented | ✅ |

### Recommendation

**DISCOVERY COMPLETE — READY FOR ARCHITECTURE REVIEW**

No blockers identified. Phase 4C scope is well-defined:
1. Customer cancellation API
2. Rider failure reporting
3. Refund processing
4. Tests

---

**END OF DISCOVERY REPORT**
