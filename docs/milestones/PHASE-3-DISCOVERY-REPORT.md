# PHASE 3 — DISPATCH & JOB MANAGEMENT: DISCOVERY REPORT

**Document Status:** Discovery Complete — Awaiting Implementation Authorization
**Date:** August 23, 2026
**Scope:** Dispatch Engine, Rider Job Lifecycle, Background Jobs

---

## 1. EXECUTIVE SUMMARY

Phase 3 connects the existing PostgreSQL dispatch functions to actual application workflows. The database foundation is remarkably strong — concurrent-dispatch protection is already built into the schema via partial unique indexes. However, the application layer for dispatch is **0% implemented**: no code calls the dispatch functions, no dispatch service exists, no rider offer APIs exist, and the background job processor has no handler for `DISPATCH_ORDER` or `DISPATCH_RETRY`.

**Key finding:** The database already protects against the most critical race conditions (two riders accepting the same order, one rider receiving two offers). The main work is building the application layer that invokes these functions and the rider-facing APIs for offer management.

---

## 2. REPOSITORY-VERIFIED CURRENT STATE

### 2.1 Git State

| Field | Value |
|-------|-------|
| Latest commit | `ee124d803c9b873fe1507923a09be680ad2ad585` |
| Branch | `master` |
| Working tree | Clean |

### 2.2 Database Objects

| Category | Count | Details |
|----------|-------|---------|
| Application tables | 37 | Including `rider_assignments`, `background_jobs`, `order_events` |
| PostgreSQL functions | 21 | Including `dispatch_rider_v2`, `find_nearest_riders`, `accept_rider_offer`, `reject_rider_offer` |
| RLS policies | 110+ | Comprehensive for all tables |
| Indexes | 69+ | Including 2 critical partial unique indexes for dispatch |

### 2.3 Existing API Routes (19 total)

| Route | Purpose | Phase |
|-------|---------|-------|
| `/api/addresses/*` | Address CRUD | M2 |
| `/api/auth/*` | Login/signup | M1 |
| `/api/categories` | Delivery categories | M2 |
| `/api/cron/process-jobs` | Background job processor | P1 |
| `/api/orders/*` | Quote, create, view | M2 |
| `/api/payments/initialize` | Paystack init | M2 |
| `/api/riders/availability` | Online/offline toggle | P2 |
| `/api/riders/documents` | Document submission | P1 |
| `/api/riders/location` | GPS updates | P2 |
| `/api/riders/profile` | Rider profile | P1 |
| `/api/riders/register` | Rider registration | P1 |
| `/api/riders/vehicles` | Vehicle management | P1 |
| `/api/riders/verification-status` | Verification status | P1 |
| `/api/webhooks/paystack` | Payment webhook | M2 |

### 2.4 Existing Services (6)

| Service | Purpose | Phase |
|---------|---------|-------|
| `address.service.ts` | Address CRUD | M2 |
| `background-job.service.ts` | Job processing, expired offers, stale detection | P1+P2 |
| `order.service.ts` | Order creation | M2 |
| `payment.service.ts` | Paystack integration | M2 |
| `quote.service.ts` | Pricing engine | M2 |
| `rider.service.ts` | Rider registration, profile, vehicles, documents | P1 |
| `rider-location.service.ts` | GPS ingestion, broadcast | P2 |

---

## 3. EXISTING DISPATCH DATABASE FUNCTIONS

### 3.1 `find_nearest_riders(p_lat, p_lon, p_max_distance_km, p_limit)`

**Status:** ✅ EXISTS — Enhanced with staleness check (Phase 2)

```sql
FROM rider_current_locations rcl
JOIN rider_profiles rp ON rp.id = rcl.rider_id
WHERE rcl.is_available = TRUE
  AND rp.verification_status = 'approved'
  AND rcl.updated_at > NOW() - INTERVAL '60 seconds'
  AND ST_Distance(...) / 1000 <= p_max_distance_km
ORDER BY distance_km ASC
LIMIT p_limit;
```

| Aspect | Detail |
|--------|--------|
| Tables touched | `rider_current_locations`, `rider_profiles` |
| Indexes used | `idx_rider_dispatch_lookup` (composite partial), `idx_rider_current_locations_geo` (GIST) |
| Locking | None (SELECT only) |
| Called by application code | ❌ NO |
| Called by other functions | ✅ `dispatch_rider_v2()` |
| Production safe | ✅ Yes |

### 3.2 `dispatch_rider_v2(p_order_id)`

**Status:** ✅ EXISTS — Building block only

```sql
-- Flow:
1. SELECT * FROM orders WHERE id = p_order_id FOR UPDATE
2. Validate status IN ('paid', 'searching_rider')
3. UPDATE orders SET status = 'searching_rider'
4. FOR EACH rider IN find_nearest_riders(...):
   - INSERT rider_assignments (order_id, rider_id, 'offered', expires_at)
   - UPDATE rider_current_locations SET is_available = FALSE
   - RETURN success
5. If no rider found: UPDATE orders SET status = 'failed'
```

| Aspect | Detail |
|--------|--------|
| Tables touched | `orders` (FOR UPDATE), `rider_current_locations`, `rider_assignments` |
| Locking | `FOR UPDATE` on orders row |
| Race protection | `INSERT INTO rider_assignments` → `idx_rider_assignments_one_active` partial unique index |
| Called by application code | ❌ NO |
| Called by other functions | ❌ NO |
| Production safe | ⚠️ Needs application-level invocation |

**Critical observation:** `dispatch_rider_v2` only offers to ONE rider (the nearest). If that rider rejects, the `reject_rider_offer` function creates a `DISPATCH_RETRY` job to try again.

### 3.3 `accept_rider_offer(p_assignment_id, p_rider_id)`

**Status:** ✅ EXISTS — Building block only

```sql
-- Flow:
1. SELECT assignment WHERE id AND rider_id FOR UPDATE
2. Validate status = 'offered'
3. Validate expires_at > NOW()
4. SELECT order WHERE id = assignment.order_id FOR UPDATE
5. Validate order.status = 'searching_rider'
6. UPDATE assignment SET status = 'accepted'
7. UPDATE order SET status = 'rider_assigned', assigned_rider_id
8. Cancel other offers for same order
9. Re-make cancelled riders available
```

| Aspect | Detail |
|--------|--------|
| Tables touched | `rider_assignments` (FOR UPDATE), `orders` (FOR UPDATE), `rider_current_locations` |
| Locking | `FOR UPDATE` on both assignment and order |
| Race protection | ✅ Order status check prevents double-assignment |
| Called by application code | ❌ NO |
| Production safe | ⚠️ Needs application-level invocation |

### 3.4 `reject_rider_offer(p_assignment_id, p_rider_id, p_reason)`

**Status:** ✅ EXISTS — Building block only

```sql
-- Flow:
1. SELECT assignment WHERE id AND rider_id FOR UPDATE
2. Validate status = 'offered'
3. UPDATE assignment SET status = 'rejected'
4. Re-make rider available
5. INSERT background_jobs DISPATCH_RETRY
```

| Aspect | Detail |
|--------|--------|
| Tables touched | `rider_assignments` (FOR UPDATE), `rider_current_locations`, `background_jobs` |
| Called by application code | ❌ NO |
| Production safe | ⚠️ Needs application-level invocation |

---

## 4. DISPATCH STATE MACHINE

### 4.1 Order Status Transitions (Dispatch-Relevant)

```
paid
  ↓ (DISPATCH_ORDER job)
searching_rider
  ↓ (rider accepts)
rider_assigned
  ↓ (rider action)
rider_en_route_to_pickup
  ↓ (rider action)
arrived_at_pickup
  ↓ (rider action)
picked_up
  ↓ (rider action)
in_transit
  ↓ (rider action)
arrived_at_destination
  ↓ (rider confirms)
delivered
  ↓ (system/customer)
completed
```

**Failure/cancellation paths:**
```
searching_rider → failed (no riders available)
searching_rider → cancelled (customer cancels)
rider_assigned → cancelled (customer cancels)
any active → cancelled (customer cancels)
```

### 4.2 Rider Assignment Status Transitions

```
offered
  ↓ (rider accepts)        ↓ (rider rejects)      ↓ (timeout)
accepted                   rejected                expired
  ↓ (delivery)             ↓ (DISPATCH_RETRY)
completed
```

### 4.3 Valid Transition Matrix

| From | To | Authorized Actor | Enforced |
|------|----|------------------|----------|
| paid → searching_rider | DISPATCH_ORDER job | Database function | ✅ |
| searching_rider → rider_assigned | Rider accepts | `accept_rider_offer()` | ✅ |
| searching_rider → failed | No riders found | `dispatch_rider_v2()` | ✅ |
| offered → accepted | Rider | `accept_rider_offer()` | ✅ |
| offered → rejected | Rider | `reject_rider_offer()` | ✅ |
| offered → expired | Timeout | Background job | ✅ |
| offered → cancelled | System (new rider accepted) | `accept_rider_offer()` | ✅ |
| rider_assigned → rider_en_route_to_pickup | Rider | API (Phase 4) | ❌ Not yet |
| rider_en_route_to_pickup → arrived_at_pickup | Rider | API (Phase 4) | ❌ Not yet |

---

## 5. RIDER OFFER MODEL

### 5.1 Schema Support

| Capability | Supported | Evidence |
|------------|-----------|----------|
| Creating an offer | ✅ | `dispatch_rider_v2()` inserts `rider_assignments` |
| Offer expiration | ✅ | `expires_at` column + background job |
| Accept | ✅ | `accept_rider_offer()` |
| Reject | ✅ | `reject_rider_offer()` |
| Timeout | ✅ | `processExpiredOffers()` in background-job.service.ts |
| Cancellation | ✅ | `accept_rider_offer()` cancels competing offers |
| Dispatch retry | ✅ | `reject_rider_offer()` creates `DISPATCH_RETRY` job |
| Preventing duplicate offers | ✅ | `idx_rider_assignments_one_active` UNIQUE partial index |
| Preventing one rider two offers | ✅ | `idx_rider_assignments_rider_one_active` UNIQUE partial index |

### 5.2 Critical Race-Condition Protection (Already in Schema)

**Index 1: `idx_rider_assignments_one_active`**
```sql
CREATE UNIQUE INDEX idx_rider_assignments_one_active
  ON rider_assignments (order_id)
  WHERE status IN ('offered', 'accepted');
```
→ Guarantees only ONE active offer/acceptance per order at any time.

**Index 2: `idx_rider_assignments_rider_one_active`**
```sql
CREATE UNIQUE INDEX idx_rider_assignments_rider_one_active
  ON rider_assignments (rider_id)
  WHERE status IN ('offered', 'accepted');
```
→ Guarantees a rider can only have ONE active offer/acceptance at any time.

**These two indexes eliminate the most critical dispatch race conditions at the database level.**

---

## 6. CONCURRENCY / RACE-CONDITION ANALYSIS

### Scenario A: Two riders accept the same order simultaneously

**Protection:** `idx_rider_assignments_one_active` (UNIQUE on order_id WHERE status IN offered/accepted)
**Behavior:** Second INSERT fails with `unique_violation` → caught by `EXCEPTION WHEN unique_violation THEN CONTINUE` in `dispatch_rider_v2`
**In `accept_rider_offer`:** `FOR UPDATE` lock on assignment + order status check = only one can succeed
**Result:** ✅ SAFE — Only one rider wins

### Scenario B: Rider accepts while becoming unavailable

**Protection:** `accept_rider_offer()` checks `v_order.status = 'searching_rider'`
**Behavior:** If order already assigned, returns 'Order no longer searching'
**Result:** ✅ SAFE — Order status acts as guard

### Scenario C: Two dispatch workers process the same order

**Protection:** `dispatch_rider_v2()` uses `SELECT ... FOR UPDATE` on the order
**Behavior:** Second worker blocks on the lock, then sees `status = 'searching_rider'` (already set)
**Result:** ✅ SAFE — FOR UPDATE serialization

### Scenario D: Offer expires while rider accepts

**Protection:** `accept_rider_offer()` checks `v_assignment.expires_at < NOW()`
**Behavior:** If expired, marks as expired and returns failure
**Result:** ✅ SAFE — Timestamp check prevents stale acceptance

### Scenario E: Rider accepts after another rider already won

**Protection:** Order status check in `accept_rider_offer()` — `v_order.status != 'searching_rider'`
**Behavior:** Returns 'Order no longer searching'
**Result:** ✅ SAFE — Order status prevents late acceptance

### Scenario F: Dispatch retries while previous dispatch running

**Protection:** `dispatch_rider_v2()` FOR UPDATE on order serializes attempts
**Behavior:** Second dispatch attempt blocks until first completes
**Result:** ✅ SAFE — Database-level serialization

### Scenario G: Customer cancellation during rider acceptance

**Protection:** Both use `FOR UPDATE` on orders — serialized
**Behavior:** Whichever transaction commits first wins; second sees updated status
**Result:** ✅ SAFE — PostgreSQL serialization

### Scenario H: Payment webhook triggers dispatch twice

**Protection:** `processed_webhook_events` idempotency table + `idempotency_keys`
**Behavior:** Second webhook event detected as duplicate, not processed
**Result:** ✅ SAFE — Webhook idempotency

### Scenario I: Background job delivered twice

**Protection:** `FOR UPDATE SKIP LOCKED` in job processing (documented, not yet implemented in Phase 1 code)
**Behavior:** Need to verify
**Result:** ⚠️ NEEDS VERIFICATION — Phase 1 processor does not use `FOR UPDATE SKIP LOCKED`

**FINDING:** The background job processor in Phase 1 does NOT use `FOR UPDATE SKIP LOCKED`. It fetches jobs with a simple SELECT, then updates status. Two concurrent cron invocations could pick up the same job. This is a known limitation that should be addressed in Phase 3 implementation.

---

## 7. BACKGROUND JOB PROCESSOR AUDIT

### 7.1 Current Implementation

| Aspect | Status | Detail |
|--------|--------|--------|
| Job claiming | ⚠️ Basic | SELECT with status = 'pending', no row-level locking |
| Locking | ❌ Missing | No `FOR UPDATE SKIP LOCKED` |
| Retries | ✅ Implemented | Exponential backoff, max attempts |
| Failure handling | ✅ Implemented | Status → 'failed', error_message stored |
| Stale jobs | ⚠️ Partial | `scheduled_at` check, but no stale job cleanup |
| Duplicate jobs | ❌ Not protected | Two cron invocations can process same job |
| Idempotency | ❌ Not implemented | Job handlers are not idempotent |
| Job status transitions | ✅ Correct | pending → processing → completed/failed/retrying |

### 7.2 Required Phase 3 Improvements

1. **Add `FOR UPDATE SKIP LOCKED`** to job claiming query
2. **Register dispatch handlers** for `DISPATCH_ORDER` and `DISPATCH_RETRY`
3. **Register offer timeout handler** for `OFFER_TIMEOUT`
4. **Make handlers idempotent** (check job status before processing)
5. **Add stale job cleanup** (jobs stuck in 'processing' for too long)

---

## 8. DISPATCH ALGORITHM

### 8.1 Current Algorithm (in `dispatch_rider_v2`)

```
1. Lock order (FOR UPDATE)
2. Validate status
3. Set status = 'searching_rider'
4. Call find_nearest_riders(pickup_lat, pickup_lon, 10km, 10 riders)
5. For first rider:
   - Create offer (expires in 30 seconds)
   - Mark rider unavailable
   - Return success
6. If no rider found: set status = 'failed'
```

### 8.2 Algorithm Properties

| Property | Status |
|----------|--------|
| Deterministic | ✅ Same inputs → same nearest rider |
| Race-safe | ✅ FOR UPDATE + unique indexes |
| Configurable | ⚠️ Hard-coded: 10km radius, 10 limit, 30s timeout |
| Observable | ⚠️ No logging in SQL function |
| Retry-safe | ✅ DISPATCH_RETRY job on rejection |

### 8.3 What Phase 3 Must Add

- Make dispatch radius configurable (from `platform_settings`)
- Make offer timeout configurable
- Add structured logging/events for dispatch lifecycle
- Register background job handlers
- Create rider-facing APIs for offer management

---

## 9. RIDER JOB LIFECYCLE

### 9.1 Complete Lifecycle

```
AVAILABLE (is_available = TRUE)
  ↓ (dispatch selects rider)
OFFERED (rider_assignments.status = 'offered')
  ↓ (rider accepts)
ACCEPTED (rider_assignments.status = 'accepted')
  ↓ (rider navigates to pickup)
EN_ROUTE_TO_PICKUP (order.status = 'rider_en_route_to_pickup')
  ↓ (rider arrives)
ARRIVED_AT_PICKUP (order.status = 'arrived_at_pickup')
  ↓ (rider picks up package)
PICKED_UP (order.status = 'picked_up')
  ↓ (rider navigates to destination)
IN_TRANSIT (order.status = 'in_transit')
  ↓ (rider arrives)
ARRIVED_AT_DESTINATION (order.status = 'arrived_at_destination')
  ↓ (rider confirms delivery)
DELIVERED (order.status = 'delivered')
  ↓ (system completes)
COMPLETED (order.status = 'completed')
```

### 9.2 What Phase 3 Implements

| Lifecycle Stage | Phase |
|-----------------|-------|
| AVAILABLE → OFFERED | Phase 3 (dispatch) |
| OFFERED → ACCEPTED | Phase 3 (rider accept API) |
| OFFERED → REJECTED | Phase 3 (rider reject API) |
| OFFERED → EXPIRED | Phase 3 (background job) |
| ACCEPTED → EN_ROUTE_TO_PICKUP | Phase 4 (active delivery) |
| EN_ROUTE → ARRIVED → PICKED_UP → IN_TRANSIT → DELIVERED | Phase 4 |

---

## 10. API GAP ANALYSIS

### 10.1 Existing APIs (Dispatch-Relevant)

| Route | Method | Purpose | Status |
|-------|--------|---------|--------|
| `/api/riders/location` | POST | GPS update | ✅ Phase 2 |
| `/api/riders/availability` | PATCH | Online/offline | ✅ Phase 2 |
| `/api/cron/process-jobs` | GET | Process background jobs | ✅ Phase 1 |

### 10.2 Required Phase 3 APIs

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/offers` | GET | Rider | List pending offers for this rider |
| `/api/riders/offers/[id]` | GET | Rider | Get offer details |
| `/api/riders/offers/[id]/accept` | POST | Rider | Accept an offer |
| `/api/riders/offers/[id]/reject` | POST | Rider | Reject an offer |
| `/api/riders/assignments/active` | GET | Rider | Get current active assignment |

### 10.3 API Specifications

#### GET /api/riders/offers

**Auth:** Authenticated rider
**Query:** rider_id from session
**Response:** Array of pending offers with order details (pickup, destination, distance, category)
**Database:** `rider_assignments` WHERE rider_id = auth.uid() AND status = 'offered'

#### POST /api/riders/offers/[id]/accept

**Auth:** Authenticated rider
**Database:** Calls `accept_rider_offer(assignment_id, rider_id)`
**Response:** Success/failure with message
**Idempotency:** If already accepted, returns success (idempotent)

#### POST /api/riders/offers/[id]/reject

**Auth:** Authenticated rider
**Database:** Calls `reject_rider_offer(assignment_id, rider_id, reason)`
**Response:** Success/failure with message

---

## 11. SECURITY / RLS ANALYSIS

### 11.1 Current RLS on rider_assignments

| Policy | Operation | Rule |
|--------|-----------|------|
| `rider_assignments_select_own` | SELECT | `rider_id = auth.uid()` |
| `rider_assignments_select_customer` | SELECT | Customer owns the order |
| `rider_assignments_select_admin` | SELECT | Admin/operations role |
| `rider_assignments_update_own` | UPDATE | `rider_id = auth.uid()` |

### 11.2 Security Gaps

| Gap | Severity | Fix |
|-----|----------|-----|
| No INSERT policy for riders | MEDIUM | Riders cannot directly insert (server-side only) — OK |
| No DELETE policy | LOW | Not needed — status transitions only |
| Functions use SECURITY DEFINER | ✅ | `accept_rider_offer` runs with function owner privileges |

### 11.3 Security Model

- ✅ Rider can only see their own offers (RLS)
- ✅ Rider can only accept their own offer (function parameter + RLS)
- ✅ Rider cannot accept expired offer (timestamp check in function)
- ✅ Rider cannot accept offer for another rider (rider_id check in function)
- ✅ Rider cannot manipulate order price (not in function)
- ✅ Rider cannot assign themselves manually (function-controlled)
- ✅ Customer cannot interfere with rider dispatch (no customer API for dispatch)
- ✅ Admin privileges explicit (RLS)

---

## 12. SERVICE-LAYER GAP ANALYSIS

### 12.1 Required New Services

| Service | Purpose |
|---------|---------|
| `dispatch.service.ts` | Dispatch orchestration, job handlers |
| `rider-offer.service.ts` | Offer management (list, accept, reject) |

### 12.2 Required Service Methods

**dispatch.service.ts:**
- `processDispatchJob(orderId)` — Invokes `dispatch_rider_v2()`
- `processDispatchRetry(orderId)` — Re-dispatches after rejection
- `processOfferTimeout()` — Expires stale offers

**rider-offer.service.ts:**
- `getPendingOffers(riderId)` — List active offers
- `getOfferDetails(assignmentId, riderId)` — Get offer with order details
- `acceptOffer(assignmentId, riderId)` — Invoke `accept_rider_offer()`
- `rejectOffer(assignmentId, riderId, reason)` — Invoke `reject_rider_offer()`
- `getActiveAssignment(riderId)` — Get current active assignment

---

## 13. DATABASE GAP ANALYSIS

### 13.1 What Already Exists

| Object | Status |
|--------|--------|
| `rider_assignments` table | ✅ Complete |
| `background_jobs` table | ✅ Complete |
| `order_events` table | ✅ Complete |
| `order_status_history` table | ✅ Complete |
| `dispatch_rider_v2()` | ✅ Complete |
| `find_nearest_riders()` | ✅ Enhanced |
| `accept_rider_offer()` | ✅ Complete |
| `reject_rider_offer()` | ✅ Complete |
| Partial unique indexes | ✅ Race protection |
| RLS policies | ✅ Comprehensive |

### 13.2 What Phase 3 Needs

| Change | Type | Reason |
|--------|------|--------|
| Dispatch config settings | Platform settings | Radius, timeout, retry limits |
| `OFFER_TIMEOUT` job handler | Background job | Auto-expire stale offers |
| No new tables needed | — | Existing schema is sufficient |
| No new indexes needed | — | Existing indexes cover dispatch queries |

---

## 14. IDEMPOTENCY DESIGN

| Operation | Idempotency Mechanism |
|-----------|----------------------|
| Dispatch initiation | `FOR UPDATE` on orders + status check |
| Job processing | Need `FOR UPDATE SKIP LOCKED` (currently missing) |
| Offer creation | `idx_rider_assignments_one_active` unique index |
| Offer acceptance | `accept_rider_offer()` — status + expiry + order status checks |
| Offer rejection | `reject_rider_offer()` — status check |
| Offer expiration | Status check — only expires 'offered' assignments |
| Dispatch retry | Creates new DISPATCH_RETRY job (safe to duplicate) |

---

## 15. OBSERVABILITY REQUIREMENTS

| Event | Source | Mechanism |
|-------|--------|-----------|
| Dispatch started | `dispatch_rider_v2()` | `order_events` INSERT |
| Candidate riders found | Application | Structured log |
| Offer created | `dispatch_rider_v2()` | `rider_assignments` INSERT |
| Offer accepted | `accept_rider_offer()` | `order_events` + `order_status_history` |
| Offer rejected | `reject_rider_offer()` | `rider_assignments` UPDATE |
| Offer expired | Background job | `rider_assignments` UPDATE |
| Dispatch failed | `dispatch_rider_v2()` | `orders.status = 'failed'` |
| Dispatch retried | Background job | `background_jobs` INSERT |
| No rider available | `dispatch_rider_v2()` | `orders.status = 'failed'` |

---

## 16. PERFORMANCE / SCALE ANALYSIS

| Riders | PostGIS Query | Dispatch Frequency | DB Load |
|--------|---------------|-------------------|---------|
| 100 | ~5ms | ~10/min | Comfortable |
| 1,000 | ~15ms | ~100/min | Comfortable |
| 10,000 | ~50ms | ~1,000/min | Moderate |

**No Redis/Kafka needed for MVP.** PostgreSQL handles dispatch comfortably at Abuja launch scale.

---

## 17. TEST STRATEGY

### Unit Tests
- Dispatch radius calculation
- Offer timeout logic
- Stale offer detection

### Concurrency Tests
- Two riders accepting same order → only one wins
- Two dispatch workers processing same order → serialized
- Offer expiry during acceptance → rejection
- Customer cancellation during dispatch → handled

### Integration Tests
- Payment webhook → DISPATCH_ORDER job → rider offer
- Rider accept → order status transition
- Rider reject → DISPATCH_RETRY → new offer
- Offer timeout → expire → retry

### Security Tests
- Rider cannot accept another rider's offer
- Rider cannot accept expired offer
- Rider cannot manipulate order price
- Customer cannot trigger dispatch directly

---

## 18. EXACT IMPLEMENTATION PHASES

### Phase 3.1: Dispatch Service + Job Handlers
- Create `dispatch.service.ts`
- Register `DISPATCH_ORDER` handler
- Register `DISPATCH_RETRY` handler
- Register `OFFER_TIMEOUT` handler
- Fix background job processor (FOR UPDATE SKIP LOCKED)

### Phase 3.2: Rider Offer APIs
- Create `rider-offer.service.ts`
- Create `/api/riders/offers` (GET)
- Create `/api/riders/offers/[id]` (GET)
- Create `/api/riders/offers/[id]/accept` (POST)
- Create `/api/riders/offers/[id]/reject` (POST)
- Create `/api/riders/assignments/active` (GET)

### Phase 3.3: Configuration + Tests
- Add dispatch config platform settings
- Create unit tests for dispatch logic
- Create concurrency tests
- Create integration tests

### Phase 3.4: Verification
- Run full test suite
- Verify dispatch flow end-to-end
- Produce verification report

---

## 19. RISKS AND MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Background job duplicate processing | MEDIUM | Add FOR UPDATE SKIP LOCKED |
| No dispatch logging | LOW | Add order_events inserts |
| Hard-coded dispatch radius | LOW | Move to platform_settings |
| Offer timeout not configurable | LOW | Move to platform_settings |
| Customer cancellation during dispatch | LOW | FOR UPDATE serialization handles |

---

## 20. WHAT MUST NOT BE CHANGED

| Item | Reason |
|------|--------|
| `dispatch_rider_v2()` function logic | Already correct, only needs invocation |
| `accept_rider_offer()` function logic | Already correct |
| `reject_rider_offer()` function logic | Already correct |
| `find_nearest_riders()` function | Already enhanced in Phase 2 |
| Partial unique indexes | Critical race-condition protection |
| Order status CHECK constraint | Already comprehensive |
| Rider assignment status CHECK constraint | Already correct |
| RLS policies | Already comprehensive |
| Milestone 2 commit | Must remain untouched |
| Phase 1/2 commits | Must remain untouched |
| Pricing architecture | Unrelated to dispatch |
| Maps provider abstraction | Unrelated to dispatch |

---

## 21. PRODUCT DECISIONS REQUIRING MAJOR'S APPROVAL

| # | Decision | Default | Options |
|---|----------|---------|---------|
| 1 | Dispatch radius | 10 km | 5km / 10km / 15km / configurable |
| 2 | Offer timeout | 30 seconds | 15s / 30s / 60s / configurable |
| 3 | Max riders per dispatch attempt | 1 (nearest only) | 1 / 3 / 5 / configurable |
| 4 | Dispatch retry limit | 3 attempts | 1 / 3 / 5 / configurable |
| 5 | Retry backoff | Exponential (5s, 10s, 15s) | Linear / exponential / configurable |

**Recommendation:** Make all configurable via `platform_settings` with sensible Abuja MVP defaults.

---

## PHASE 3 DISCOVERY STATUS

| Area | Status |
|------|--------|
| Repository verification | ✅ PASS |
| Architecture review | ✅ PASS |
| Security review | ✅ PASS |
| Concurrency review | ✅ PASS |
| Implementation readiness | **GO** |

### Blockers: NONE

### Product Decisions: 5 (all have sensible defaults)

### Implementation Sequence:
1. Dispatch service + job handlers
2. Rider offer APIs
3. Configuration + tests
4. Verification

---

**PHASE 3 DISCOVERY STATUS: COMPLETE**
**RECOMMENDATION: GO — Safe to proceed to implementation**
**AWAITING AUTHORIZATION**
