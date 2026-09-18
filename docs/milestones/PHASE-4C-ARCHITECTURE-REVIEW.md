# PHASE 4C — ARCHITECTURE REVIEW

## CANCELLATION, DELIVERY FAILURE & REFUND PROCESSING

**Baseline:** Phase 4B commit `7514a54978c9c058e38d6921db0404f7b8bd1964`

---

## 1. CURRENT-STATE FINDINGS

### 1.1 What EXISTS

| Component | Status | Evidence |
|-----------|--------|----------|
| `cancel_order()` function | ✅ EXISTS | `20260823050000_phase4a_delivery.sql:372` — SECURITY DEFINER |
| `transition_order_status()` function | ✅ EXISTS | `20260823050000_phase4a_delivery.sql:20` — SECURITY DEFINER |
| Rider cancel API | ✅ EXISTS | `apps/web/app/api/riders/deliveries/[orderId]/cancel/route.ts` |
| `refunds` table | ✅ EXISTS | `20240101000000_initial_schema.sql:563` — full schema with RLS |
| `payments` table | ✅ EXISTS | `20240101000000_initial_schema.sql:518` — includes `refunded` status |
| `REFUND_PROCESS` job type | ✅ EXISTS | `packages/shared/types/index.ts:516` |
| `processed_webhook_events` | ✅ EXISTS | `20240101000000_initial_schema.sql:546` — idempotency |
| Order states `cancelled`, `failed`, `refunded` | ✅ EXISTS | CHECK constraint at line 263 |
| `complete_delivery()` with earnings | ✅ EXISTS | Phase 4B — handles earnings atomically |
| Paystack payment initialization | ✅ EXISTS | `apps/web/lib/services/payment.service.ts` |
| Paystack webhook handler | ✅ EXISTS | `apps/web/app/api/webhooks/paystack/route.ts` — `charge.success` only |

### 1.2 What is MISSING

| Component | Status | Evidence |
|-----------|--------|----------|
| Customer cancellation API | ❌ MISSING | No endpoint at `/api/orders/[id]/cancel` |
| `fail_delivery()` function | ❌ MISSING | No PostgreSQL function exists |
| Rider failure API | ❌ MISSING | No endpoint at `/api/riders/deliveries/[orderId]/fail` |
| Paystack refund API integration | ❌ MISSING | No code calls Paystack refund endpoint |
| Refund processing in cancel_order() | ❌ MISSING | Cancellation does NOT trigger refund |
| Earnings clawback on cancellation | ❌ MISSING | Cancellation does NOT reverse earnings |
| REFUND_PROCESS job handler | ❌ MISSING | No handler registered in background job processor |
| Refund webhook handler (`refund.processed`) | ❌ MISSING | Only `charge.success` is handled |
| cancel_order() actor_type parameter issue | ⚠️ SECURITY | Client passes `actor_type` — should be derived server-side |

### 1.3 Critical Bug: `cancel_order()` actor_type Parameter

**Current behavior:**
```sql
cancel_order(p_order_id UUID, p_actor_type TEXT, p_reason TEXT)
```

A client can pass `p_actor_type = 'admin'` and the function will check admin role (which fails safely via `get_user_role()`). But this is architecturally wrong — `actor_type` should be derived from `auth.uid()`, not supplied by the client.

**The same issue exists in `transition_order_status()`.**

Both functions are SECURE (authorization fails correctly), but the API surface leaks the actor_type choice to the client.

**Fix:** Modify both functions to derive actor_type from the caller identity, not from client input. Or: keep the parameter but validate it against the caller's actual role (current behavior is safe but noisy).

**Severity:** LOW (functionally safe, architecturally imprecise)

---

## 2. PROPOSED ARCHITECTURE

### 2.1 Customer Cancellation

**Route:** `POST /api/orders/[orderId]/cancel`

**Authorization:** `auth.uid()` must equal `orders.customer_id`

**State restriction:** Customer can cancel only when:
- `orders.status IN ('paid', 'searching_rider')`

**Business rules:**
- Customer cannot cancel after rider is assigned (`rider_assigned` and later)
- If order is in `paid` state → refund required
- If order is in `searching_rider` state → no payment captured yet → no refund needed

**Alternative (more permissive MVP):** Allow customer cancellation up to `rider_assigned` state, and handle refund if payment was captured.

**Decision needed:** Should customer cancellation be allowed after rider assignment but before pickup?

**MVP Recommendation:** Customer can cancel from `paid` and `searching_rider` states only. After rider assignment, customer must contact support (admin cancellation).

### 2.2 Rider-Reported Delivery Failure

**Route:** `POST /api/riders/deliveries/[orderId]/fail`

**Authorization:** `auth.uid()` must equal `orders.assigned_rider_id`

**Valid states for failure reporting:**
- `rider_en_route_to_pickup`
- `arrived_at_pickup`
- `picked_up`
- `in_transit`
- `arrived_at_destination`

**Required fields:**
- `reason` (required) — why delivery failed
- `failure_type` (required) — one of: `recipient_unavailable`, `wrong_address`, `package_damaged`, `rider_emergency`, `other`

**Business rules:**
- Rider cannot report failure if they haven't accepted the assignment
- Rider cannot report failure on completed orders
- Failure transitions order to `failed` state
- Rider earnings for this order are NOT created (order wasn't delivered)
- If rider already picked up package, a return trip may be needed (future feature)

### 2.3 Refund Processing

**Approach:** Asynchronous via `REFUND_PROCESS` background job.

**Why async:**
1. Paystack refund API may be slow (1-30 seconds)
2. Refund processing should not block rider APIs
3. Retry semantics are cleaner with background jobs
4. Matches existing architecture (all background work goes through `background_jobs`)

**Refund flow:**
```
cancel_order() (SECURITY DEFINER)
  → creates refunds record (status='pending')
  → creates REFUND_PROCESS background job
  → returns success immediately

REFUND_PROCESS job handler:
  → reads refunds record
  → calls Paystack Refund API
  → updates refunds.status to 'success' or 'failed'
  → updates payments.status
  → updates orders.status to 'refunded'
  → records order_event
```

**Idempotency:**
- UNIQUE constraint on `refunds(order_id)` WHERE `status IN ('pending', 'processing')` prevents duplicate refund records
- `processed_webhook_events` prevents duplicate webhook processing
- The REFUND_PROCESS handler checks `refunds.status` before processing

**Paystack Refund API:**
```
POST https://api.paystack.co/refund
Authorization: Bearer {secret_key}
{
  "transaction": paystack_transaction_id,
  "amount": amount_in_kobo,
  "reason": "Customer cancellation"
}
```

**Requirements:**
- Need Paystack transaction ID from `payments.paystack_response` (or from webhook `data.id`)
- Need `PAYSTACK_SECRET_KEY` to be configured
- Amount must be in kobo (amount × 100)

---

## 3. STATE-TRANSITION MATRIX

### 3.1 Customer Cancellation Transitions

| CURRENT STATE | → NEW STATE | ACTOR | REFUND NEEDED | EARNINGS CLAWBACK |
|---------------|-------------|-------|---------------|-------------------|
| `paid` | `cancelled` | customer | YES (payment captured) | NO (no delivery) |
| `searching_rider` | `cancelled` | customer | NO (pre-dispatch) | NO |
| `rider_assigned` | `cancelled` | customer | YES | NO |
| `rider_en_route_to_pickup` | `cancelled` | customer | YES | NO |
| `arrived_at_pickup` | `cancelled` | customer | YES | NO |

**Invalid customer transitions:**

| CURRENT STATE | → REQUESTED | RESULT |
|---------------|-------------|--------|
| `picked_up` | `cancelled` | REJECTED — package already picked up |
| `in_transit` | `cancelled` | REJECTED — in transit |
| `arrived_at_destination` | `cancelled` | REJECTED — at destination |
| `delivered` | `cancelled` | REJECTED — already delivered |
| `completed` | `cancelled` | REJECTED — completed |
| `cancelled` | `cancelled` | REJECTED — already cancelled |
| `failed` | `cancelled` | REJECTED — already failed |

### 3.2 Rider Cancellation Transitions (EXISTING)

| CURRENT STATE | → NEW STATE | ACTOR | REFUND NEEDED |
|---------------|-------------|-------|---------------|
| `rider_assigned` | `cancelled` | rider | YES |
| `rider_en_route_to_pickup` | `cancelled` | rider | YES |
| `arrived_at_pickup` | `cancelled` | rider | YES |

**Invalid rider transitions (EXISTING):**

| CURRENT STATE | → REQUESTED | RESULT |
|---------------|-------------|--------|
| `picked_up` | `cancelled` | REJECTED — after pickup |
| `in_transit` | `cancelled` | REJECTED — after pickup |

### 3.3 Rider Failure Transitions (NEW)

| CURRENT STATE | → NEW STATE | ACTOR | REFUND NEEDED |
|---------------|-------------|-------|---------------|
| `rider_en_route_to_pickup` | `failed` | rider | MAYBE (depends on policy) |
| `arrived_at_pickup` | `failed` | rider | MAYBE |
| `picked_up` | `failed` | rider | MAYBE |
| `in_transit` | `failed` | rider | MAYBE |
| `arrived_at_destination` | `failed` | rider | MAYBE |

**MVP Decision:** Failure = no delivery completed = refund to customer = no rider earnings created.

### 3.4 Refund State Transitions

| CURRENT STATE | → NEW STATE | ACTOR | MECHANISM |
|---------------|-------------|-------|-----------|
| `paid` + refund pending | `refunded` | system | REFUND_PROCESS job |
| `cancelled` + refund pending | `refunded` | system | REFUND_PROCESS job |
| `failed` + refund pending | `refunded` | system | REFUND_PROCESS job |
| `refunded` + refund pending | `refunded` | system | IDEMPOTENT — no-op |

### 3.5 Complete Transition Matrix (All Valid Transitions)

```
paid → searching_rider → rider_assigned → rider_en_route_to_pickup → arrived_at_pickup → picked_up → in_transit → arrived_at_destination → delivered → completed

 paid → cancelled (customer)
 searching_rider → cancelled (customer, rider, admin)
 rider_assigned → cancelled (customer, rider, admin), failed (rider)
 rider_en_route_to_pickup → cancelled (customer, rider, admin), failed (rider)
 arrived_at_pickup → cancelled (customer, rider, admin), failed (rider)
 picked_up → cancelled (admin only), failed (rider)
 in_transit → cancelled (admin only), failed (rider)
 arrived_at_destination → cancelled (admin only), failed (rider)
 delivered → completed (rider via complete_delivery)

 Any cancellable state → cancelled → refunded (if refund pending)
```

---

## 4. SECURITY MODEL

### 4.1 Authorization Matrix

| OPERATION | CUSTOMER | RIDER | ADMIN | SYSTEM |
|-----------|----------|-------|-------|--------|
| Cancel order (pre-pickup) | ✅ own order | ✅ assigned order | ✅ any order | — |
| Cancel order (post-pickup) | ❌ | ❌ | ✅ | — |
| Report delivery failure | ❌ | ✅ assigned order | — | — |
| Process refund | ❌ | ❌ | — | ✅ via job |
| Read refunds | ✅ own order | ❌ | ✅ any | — |

### 4.2 cancel_order() actor_type Fix

**Current:** Client passes `p_actor_type` as parameter.

**Proposed fix:** Remove `p_actor_type` parameter. Derive actor from `auth.uid()`:
- If `auth.uid() = orders.customer_id` → actor is customer
- If `auth.uid() = orders.assigned_rider_id` → actor is rider
- If `get_user_role() IN ('admin', 'super_admin', 'operations')` → actor is admin
- Otherwise → reject

**Impact:** Existing rider cancel API passes `'rider'` — will break. Must update API to not pass actor_type.

**Alternative:** Keep parameter but validate: if `p_actor_type = 'admin'`, require admin role; if `p_actor_type = 'rider'`, require matching rider_id; if `p_actor_type = 'customer'`, require matching customer_id. This is the current behavior and is safe.

**Recommendation:** Keep current behavior for now (safe, just noisy). Fix in a future hardening pass.

### 4.3 RLS Implications

- `refunds` table has SELECT policies for customers (own order) and admins
- Only `service_role` can INSERT/UPDATE refunds
- REFUND_PROCESS job runs as service_role — safe
- Customer cancel API runs as authenticated user — safe via SECURITY DEFINER

### 4.4 Protected Financial Fields

- `cancel_order()` does NOT modify: `total_amount`, `base_fee`, payment fields
- Refund amount comes from `payments.amount` (server-authoritative)
- Rider cannot control refund amount
- Customer cannot control refund amount
- Refund amount is always the original payment amount (full refund for MVP)

---

## 5. CONCURRENCY MODEL

### 5.1 Race Conditions

| SCENARIO | RISK | PROTECTION |
|----------|------|------------|
| Customer cancels while rider accepts | Both succeed, inconsistent state | `FOR UPDATE` lock on orders row in both functions |
| Rider cancels while customer cancels | Double cancellation | `FOR UPDATE` lock + state check |
| Customer cancels while delivery completes | Conflict | `complete_delivery()` checks state — cancellation already happened |
| Rider fails while delivery completes | Conflict | `FOR UPDATE` lock — only one succeeds |
| Multiple refund attempts | Duplicate refund | UNIQUE INDEX on refunds(order_id) WHERE status IN ('pending','processing') |
| Webhook arrives while refund processing | Duplicate effect | `processed_webhook_events` idempotency |
| REFUND_PROCESS job runs twice | Duplicate Paystack call | Idempotent: check refunds.status before processing |

### 5.2 Required Database Protections

```sql
-- Prevent duplicate pending refunds per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_one_pending_per_order
  ON refunds (order_id)
  WHERE status IN ('pending', 'processing');

-- Prevent duplicate earnings on cancellation (future clawback)
-- Already protected by: idx_earnings_ledger_order_delivery
```

### 5.3 Transaction Boundaries

**Customer cancellation:**
```sql
BEGIN;
  SELECT * FROM orders WHERE id = $1 FOR UPDATE;
  -- validate state
  -- update order to cancelled
  -- cancel rider assignments
  -- restore rider availability
  -- create refunds record (if payment captured)
  -- create REFUND_PROCESS background job
  -- record order_event
COMMIT;
```

**Refund processing (REFUND_PROCESS job):**
```sql
BEGIN;
  SELECT * FROM refunds WHERE id = $1 FOR UPDATE;
  -- validate status is 'pending'
  -- call Paystack API
  -- update refunds.status
  -- update payments.status
  -- update orders.status to 'refunded'
  -- record order_event
COMMIT;
```

---

## 6. REFUND / PAYMENT MODEL

### 6.1 Current Paystack Integration

- `PaymentService.initializePayment()` → calls Paystack `/transaction/initialize`
- Webhook handler → processes `charge.success` → calls `verify_payment_and_confirm_order()`
- No refund API integration exists

### 6.2 Paystack Refund API

```
POST https://api.paystack.co/refund
Headers:
  Authorization: Bearer {PAYSTACK_SECRET_KEY}
  Content-Type: application/json
Body:
  {
    "transaction": 12345,  // Paystack transaction ID
    "amount": 500000,     // in kobo
    "reason": "Customer requested cancellation"
  }
```

**Requirements:**
- Paystack transaction ID is needed — must be stored in `payments.paystack_response` during webhook processing
- Amount must be in kobo
- `PAYSTACK_SECRET_KEY` must be configured

### 6.3 Missing: Transaction ID Storage

Currently, `verify_payment_and_confirm_order()` does NOT store the Paystack transaction ID. The webhook receives `data.id` (transaction ID) but does not persist it.

**Required fix:** Store `data.id` (Paystack transaction ID) in `payments.paystack_response` during webhook processing, or add a `paystack_transaction_id` column to `payments`.

**Proposed:** Add `paystack_transaction_id TEXT` column to `payments` table. Populate it during webhook processing. Use it for refunds.

### 6.4 Refund Amount

**MVP rule:** Full refund of original payment amount.

- Refund amount = `payments.amount` (server-authoritative)
- No partial refunds for MVP
- No cancellation fees for MVP
- Platform commission is reversed when earnings are clawed back

### 6.5 Earnings Clawback

**Current:** `cancel_order()` does NOT reverse earnings.

**Decision needed:** Should cancellation after delivery completion claw back rider earnings?

**MVP Recommendation:** 
- Cancellation BEFORE delivery → no earnings created → no clawback needed
- Cancellation AFTER delivery → should not happen (admin-only) → admin handles manually
- Rider failure → no delivery → no earnings → no clawback needed

**Conclusion:** Earnings clawback is NOT required for MVP Phase 4C. The state restrictions prevent cancellation after delivery completion.

---

## 7. DATABASE CHANGES REQUIRED

### 7.1 New Columns

```sql
-- Add Paystack transaction ID to payments
ALTER TABLE payments ADD COLUMN paystack_transaction_id TEXT;
CREATE INDEX idx_payments_paystack_txn ON payments(paystack_transaction_id);
```

### 7.2 New Indexes

```sql
-- Prevent duplicate pending refunds per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_one_pending_per_order
  ON refunds (order_id)
  WHERE status IN ('pending', 'processing');
```

### 7.3 Modified Functions

```sql
-- Modified: cancel_order() to create refund record and REFUND_PROCESS job
-- Modified: transition_order_status() to support 'failed' transition properly
```

### 7.4 New Functions

```sql
-- fail_delivery() — rider-reported delivery failure
CREATE OR REPLACE FUNCTION fail_delivery(
  p_order_id UUID,
  p_failure_type TEXT,
  p_reason TEXT
) RETURNS TABLE (success BOOLEAN, message TEXT);
```

### 7.5 New Platform Settings

```sql
-- Cancellation policy
INSERT INTO platform_settings (key, value, category) VALUES
  ('cancellation_refund_enabled', '{"enabled": true}', 'cancellation'),
  ('cancellation_refund_before_pickup', '{"enabled": true}', 'cancellation'),
  ('cancellation_refund_after_pickup', '{"enabled": false}', 'cancellation');
```

### 7.6 Summary of Changes

| Change Type | Count | Details |
|-------------|-------|---------|
| New columns | 1 | `payments.paystack_transaction_id` |
| New indexes | 2 | `idx_payments_paystack_txn`, `idx_refunds_one_pending_per_order` |
| Modified functions | 2 | `cancel_order()`, `transition_order_status()` |
| New functions | 1 | `fail_delivery()` |
| New platform_settings | 3 | Cancellation policy settings |
| Migrations | 1 | `20260823070000_phase4c_cancellation_refund.sql` |

---

## 8. API CONTRACTS

### 8.1 Customer Cancellation

```
POST /api/orders/[orderId]/cancel

Authentication: Required (customer session)
Authorization: auth.uid() == orders.customer_id

Request Body:
{
  "reason": "string (optional)"
}

Response 200:
{
  "data": {
    "success": true,
    "message": "Order cancelled successfully",
    "refund_initiated": true  // true if refund processing started
  }
}

Response 400:
{
  "error": "Cannot cancel order in status: picked_up"
}

Response 401:
{
  "error": "Unauthorized"
}

Response 404:
{
  "error": "Order not found"
}
```

### 8.2 Rider Delivery Failure

```
POST /api/riders/deliveries/[orderId]/fail

Authentication: Required (rider session)
Authorization: auth.uid() == orders.assigned_rider_id

Request Body:
{
  "failure_type": "recipient_unavailable" | "wrong_address" | "package_damaged" | "rider_emergency" | "other",
  "reason": "string (required)"
}

Response 200:
{
  "data": {
    "success": true,
    "message": "Delivery failure reported"
  }
}

Response 400:
{
  "error": "Cannot report failure from status: delivered"
}

Response 401:
{
  "error": "Unauthorized"
}
```

### 8.3 Customer Refund Status (Read)

```
GET /api/orders/[orderId]/refund

Authentication: Required (customer session)
Authorization: auth.uid() == orders.customer_id

Response 200:
{
  "data": {
    "refund_id": "uuid",
    "status": "pending" | "processing" | "success" | "failed",
    "amount": 5000.00,
    "created_at": "2026-08-23T..."
  }
}

Response 404:
{
  "error": "No refund found for this order"
}
```

---

## 9. BACKGROUND JOBS

### 9.1 REFUND_PROCESS Job

**Trigger:** Created by `cancel_order()` when order has been paid.

**Payload:**
```json
{
  "refund_id": "uuid",
  "order_id": "uuid",
  "payment_id": "uuid",
  "amount": 5000.00,
  "paystack_transaction_id": "12345"
}
```

**Retry behavior:**
- Max attempts: 3
- Backoff: exponential (5s, 10s, 20s)
- On failure: mark refund as 'failed', record order_event

**Idempotency:**
- Check `refunds.status` before processing
- If already 'success' → return (no-op)
- If already 'processing' → return (no-op)
- If 'pending' → process and update to 'success' or 'failed'

**Failure handling:**
- If Paystack API returns error → mark refund as 'failed'
- Record order_event: `refund_failed`
- Do NOT mark order as 'refunded' until Paystack confirms

---

## 10. TEST PLAN

### 10.1 Customer Cancellation Tests

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Customer cancels own order in `paid` state | Unit | Success + refund initiated |
| 2 | Customer cancels own order in `searching_rider` state | Unit | Success, no refund |
| 3 | Customer cancels order in `picked_up` state | Unit | Rejected |
| 4 | Customer cancels another customer's order | Unit | Rejected (403) |
| 5 | Unauthenticated cancel request | Unit | Rejected (401) |
| 6 | Customer cancels already cancelled order | Unit | Rejected (idempotent) |
| 7 | Concurrent customer + rider cancel | Integration | Only one succeeds |

### 10.2 Rider Failure Tests

| # | Test | Type | Expected |
|---|------|------|----------|
| 8 | Rider reports failure in `rider_en_route_to_pickup` | Unit | Success |
| 9 | Rider reports failure in `picked_up` state | Unit | Success |
| 10 | Rider reports failure in `delivered` state | Unit | Rejected |
| 11 | Rider reports failure on another rider's order | Unit | Rejected |
| 12 | Rider reports failure without reason | Unit | Rejected |
| 13 | Unauthenticated failure report | Unit | Rejected |

### 10.3 Refund Processing Tests

| # | Test | Type | Expected |
|---|------|------|----------|
| 14 | REFUND_PROCESS job succeeds | Unit | Refund marked 'success' |
| 15 | REFUND_PROCESS job fails (Paystack error) | Unit | Refund marked 'failed' |
| 16 | REFUND_PROCESS job runs twice (idempotent) | Unit | No duplicate API call |
| 17 | Duplicate pending refund prevented | Unit | UNIQUE constraint violation |
| 18 | Refund amount matches payment amount | Unit | Correct amount |

### 10.4 Concurrency Tests

| # | Test | Type | Expected |
|---|------|------|----------|
| 19 | Customer cancel vs rider acceptance (simultaneous) | Integration | One wins, consistent state |
| 20 | Customer cancel vs delivery completion | Integration | One wins |
| 21 | Rider failure vs delivery completion | Integration | One wins |
| 22 | Two REFUND_PROCESS jobs for same order | Unit | Only one processes |

### 10.5 Regression Tests

| # | Test | Type | Expected |
|---|------|------|----------|
| 23 | Phase 1-3 all still pass | Regression | 148/148+ pass |
| 24 | Phase 4A delivery workflow unaffected | Regression | Existing tests pass |
| 25 | Phase 4B earnings unaffected | Regression | Existing tests pass |

### 10.6 Total: ~25 new tests

---

## 11. RISKS AND MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| PAYSTACK_SECRET_KEY not configured | HIGH | Validate in REFUND_PROCESS handler, fail gracefully |
| Paystack transaction ID not stored | HIGH | Add column, update webhook handler |
| Refund API rate limits | MEDIUM | Retry with backoff, max 3 attempts |
| Partial refund complexity | LOW | MVP = full refund only |
| Earnings clawback complexity | LOW | Not needed for MVP (state restrictions) |
| Webhook arrives before refund job | MEDIUM | processed_webhook_events prevents duplicates |
| Refund job fails permanently | MEDIUM | Mark as 'failed', admin can manually retry |
| Customer cancels during refund processing | LOW | FOR UPDATE lock prevents conflict |

---

## 12. EXACT IMPLEMENTATION SEQUENCE

### Step 1: Database Migration
- Add `paystack_transaction_id` to `payments`
- Add UNIQUE INDEX on `refunds(order_id)` WHERE status IN ('pending','processing')
- Add platform_settings for cancellation policy
- Modify `cancel_order()` to create refund record and REFUND_PROCESS job
- Create `fail_delivery()` function
- Modify `transition_order_status()` to support `failed` transitions for riders
- Sync migration to both locations

### Step 2: Webhook Handler Update
- Store Paystack transaction ID in `payments` during `charge.success` processing

### Step 3: Refund Service
- Create `apps/web/lib/services/refund.service.ts`
- Implement `initiateRefund()` — creates refund record + background job
- Implement `processRefund()` — handles REFUND_PROCESS job (Paystack API call)
- Implement `getRefundStatus()` — reads refund status for customer

### Step 4: Customer Cancellation API
- Create `apps/web/app/api/orders/[orderId]/cancel/route.ts`
- Derive customer from `auth.uid()`
- Call `cancel_order()` with appropriate parameters
- Return refund status if refund initiated

### Step 5: Rider Failure API
- Create `apps/web/app/api/riders/deliveries/[orderId]/fail/route.ts`
- Validate rider identity
- Call `fail_delivery()` or `transition_order_status()` with 'failed'

### Step 6: Refund Status API
- Create `apps/web/app/api/orders/[orderId]/refund/route.ts`
- Customer reads own refund status

### Step 7: Background Job Handler
- Register `REFUND_PROCESS` handler in background job service
- Implement Paystack refund API call
- Handle success/failure/retry

### Step 8: Tests
- Unit tests for all new functions
- Integration tests for concurrency
- Regression tests for existing behavior

### Step 9: Verification
- Typecheck, lint, tests, build
- Migration sync check
- Security/RLS audit
- AI attribution scan

---

## 13. PRODUCT DECISIONS REQUIRING APPROVAL

| Decision | Question | MVP Default | Alternatives |
|----------|----------|-------------|--------------|
| Customer cancellation window | Can customer cancel after rider assignment? | YES (up to pickup) | NO (only before dispatch) |
| Failure refund | Does rider failure trigger refund? | YES (full refund) | NO (admin decides) |
| Partial refund | Support partial refunds? | NO (full only) | YES (configurable) |
| Cancellation fee | Is there a cancellation fee? | NO (0%) | YES (configurable %) |
| Earnings clawback | Reverse rider earnings on cancellation? | NO (not needed) | YES (debit entry) |
| Refund timing | Immediate or async? | ASYNC (background job) | SYNC (blocking) |

---

## 14. SCOPE BOUNDARY

### IN SCOPE (Phase 4C)
- Customer cancellation API
- Rider failure reporting
- Refund processing (async via background job)
- Refund status read API
- Database schema additions
- Tests
- Security hardening

### OUT OF SCOPE (Future Phases)
- Customer tracking UI
- Rider dashboard UI
- Admin dashboard
- Notifications (email, SMS, push)
- Payout execution
- Partial refunds
- Cancellation fees
- Earnings clawback
- Dispute workflow

---

## 15. GO / NO-GO RECOMMENDATION

**ARCHITECTURE REVIEW COMPLETE — READY FOR IMPLEMENTATION AUTHORIZATION**

### Evidence:
- All existing database foundations verified
- Missing components clearly identified
- State machine fully mapped
- Concurrency model designed
- Security model verified
- API contracts defined
- Test plan comprehensive
- Risks identified with mitigations
- No blocking architectural issues

### Remaining Product Decisions:
- Customer cancellation window (MVP default: up to pickup)
- Failure refund (MVP default: yes, full refund)
- Cancellation fee (MVP default: none)

### Blocks:
None. All decisions have sensible MVP defaults.

---

*Reviewed: August 24, 2026*
*Baseline: 7514a54978c9c058e38d6921db0404f7b8bd1964*
