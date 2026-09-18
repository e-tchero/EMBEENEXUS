# PHASE 4 — ARCHITECTURE REVIEW

## Active Delivery & Proof of Delivery

---

## 1. EXECUTIVE SUMMARY

Phase 4 covers the rider-side active delivery lifecycle: from acceptance through delivery completion, proof of delivery, and rider earnings.

**Repository baseline:**
- Milestone 2: `4e5e633`
- Phase 2: `ee124d8`
- Phase 3: `3c07103`

**Current state:**
- Order state machine: 17 states defined in CHECK constraint
- rider_assignments: 6 statuses defined
- delivery_proofs: schema exists, no application code
- earnings_ledger: schema exists, no business logic
- payouts: schema exists, no application code
- Storage: 0 buckets
- Application code: 0% for Phase 4

**Critical finding:** The existing `orders_update_rider` RLS policy allows riders to update ANY field on orders where they are the assigned rider. This is a **CRITICAL security issue** that must be resolved before Phase 4 implementation. A rider could currently change `total_amount`, `status`, `customer_id`, or any other column directly.

---

## 2. EXISTING ARCHITECTURE VERIFIED

### 2.1 Order States (17 — from CHECK constraint)

```
draft, pending_payment, paid, searching_rider, rider_assigned,
rider_en_route_to_pickup, arrived_at_pickup, picked_up,
in_transit, arrived_at_destination, delivered, completed,
cancelled, failed, expired, disputed, refunded
```

**Important:** The CHECK constraint only validates allowed VALUES. It does NOT enforce valid transitions. Any order can be updated to any valid state by anyone with UPDATE access. Transition enforcement must be application-level.

### 2.2 Order Timestamps (all exist on orders table)

| Column | Set by Phase 3? | Set by Phase 4? |
|--------|----------------|-----------------|
| `rider_assigned_at` | ✅ accept_rider_offer() | — |
| `rider_arrived_at_pickup` | ❌ | Phase 4A |
| `rider_picked_up_at` | ❌ | Phase 4A |
| `rider_arrived_at_destination` | ❌ | Phase 4A |
| `delivered_at` | ❌ | Phase 4A |
| `completed_at` | ❌ | Phase 4A |
| `cancelled_at` | ❌ | Phase 4D |

### 2.3 rider_assignments Statuses

```
offered → accepted → (delivery lifecycle) → completed
offered → rejected
offered → expired
any → cancelled
```

**Note:** There is no `active` or `in_progress` status on rider_assignments. The assignment remains `accepted` throughout the active delivery. This means we cannot distinguish between "just accepted" and "actively delivering" from the assignment status alone. The order status is the authoritative delivery state.

### 2.4 delivery_proofs Schema

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| order_id | UUID FK → orders | Order reference |
| rider_id | UUID FK → rider_profiles | Rider who submitted |
| proof_type | TEXT CHECK | photo/signature/pin/recipient_confirmation |
| file_url | TEXT | Photo URL (nullable) |
| signature_data | TEXT | Signature data (nullable) |
| pin_code | TEXT | PIN (nullable) |
| recipient_name | TEXT | Recipient name (nullable) |
| notes | TEXT | Optional notes |
| proof_latitude | DECIMAL(10,8) | GPS at proof time |
| proof_longitude | DECIMAL(11,8) | GPS at proof time |
| recorded_at | TIMESTAMPTZ | When proof was recorded |
| created_at | TIMESTAMPTZ | Creation time |

**MVP proof requirements:** photo + recipient_name (as per approved defaults).

### 2.5 earnings_ledger Schema

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| rider_id | UUID FK → rider_profiles | Rider |
| order_id | UUID FK → orders | Order |
| credit | DECIMAL(12,2) | Credit amount |
| debit | DECIMAL(12,2) | Debit amount |
| balance_after | DECIMAL(12,2) | Running balance |
| description | TEXT | Human-readable description |
| reference_type | TEXT | Reference type (e.g. 'delivery', 'payout') |
| reference_id | UUID | Reference ID |
| created_at | TIMESTAMPTZ | Creation time |

**Critical:** No UNIQUE constraint on (rider_id, order_id). Duplicate earnings prevention must be application-level or a unique index must be added.

### 2.6 platform_settings — Commission

```
key: platform_commission_rate
value: {"rate": 0.15, "description": "Internal rider payout calculation - NOT customer-facing"}
```

### 2.7 Existing Functions (Phase 1-3)

| Function | Purpose | Phase 4 relevance |
|----------|---------|-------------------|
| `accept_rider_offer()` | Assigns rider to order | ✅ Used as entry point |
| `reject_rider_offer()` | Rejects offer, triggers retry | ✅ Used |
| `dispatch_rider_v2()` | Finds and offers to riders | ✅ Pre-Phase 4 |
| `find_nearest_riders()` | Spatial rider lookup | ✅ Available |
| `claim_next_pending_job()` | Atomic job claiming | ✅ Background jobs |
| `mark_stale_riders()` | Stale rider detection | ✅ Background jobs |
| `process_expired_offers()` | Expires stale offers | ✅ Background jobs |

### 2.8 RLS Policies (Relevant)

**orders:**
- `orders_select_customer` — customer sees own orders ✅
- `orders_insert_customer` — customer creates orders ✅
- `orders_update_customer` — customer updates own orders ⚠️ (too broad?)
- `orders_select_rider` — rider sees assigned orders ✅
- `orders_update_rider` — rider updates assigned orders ❌ **CRITICAL: allows any field update**
- `orders_select_admin` / `orders_update_admin` — admin access ✅

**delivery_proofs:**
- `delivery_proofs_insert_rider` — rider creates proofs (rider_id = auth.uid()) ✅
- `delivery_proofs_select_customer` — customer reads proofs for own order ✅
- `delivery_proofs_select_admin` — admin reads proofs ✅

**earnings_ledger:**
- `earnings_ledger_select_own` — rider reads own earnings ✅
- `earnings_ledger_select_admin` — admin reads earnings ✅

**payouts:**
- `payouts_select_rider` — rider reads own payouts ✅
- `payouts_select_admin` — admin reads payouts ✅

---

## 3. CRITICAL SECURITY FINDING

### orders_update_rider Policy

**Current policy:**
```sql
CREATE POLICY "orders_update_rider" ON orders
  FOR UPDATE USING (assigned_rider_id = auth.uid());
```

**Problem:** This allows a rider to update ANY column on orders where they are the assigned rider, including:
- `total_amount`
- `status` (direct state manipulation)
- `customer_id`
- `base_fee`, `distance_fee`, etc.
- `cancellation_reason`, `cancelled_by`

**This is a CRITICAL privilege escalation vulnerability.**

**Resolution required before Phase 4:**
Either:
1. Restrict the RLS policy to specific columns (PostgreSQL supports per-column policies since v15), OR
2. Remove `orders_update_rider` entirely and enforce all rider order updates through a SECURITY DEFINER function, OR
3. Create a dedicated `update_order_delivery_status()` function with SECURITY DEFINER that validates state transitions and only updates delivery-related columns.

**Recommended approach:** Option 3 — a single SECURITY DEFINER function for all rider delivery state transitions. This provides:
- Centralized state machine validation
- Column-level protection
- Audit trail via order_events
- Atomic multi-table updates

---

## 4. ORDER STATE MACHINE — TRANSITION MATRIX

### 4.1 Current State (Phase 3 endpoint)

| Current State | → Next State | Actor | Mechanism | Enforced |
|---------------|-------------|-------|-----------|----------|
| draft | pending_payment | system | order creation | App + DB |
| pending_payment | paid | system | payment webhook | App (verify_payment) |
| paid | searching_rider | system | dispatch_rider_v2() | DB function |
| searching_rider | rider_assigned | system | accept_rider_offer() | DB function |
| searching_rider | failed | system | dispatch retry exhausted | App |

### 4.2 Required Phase 4 Transitions

| Current State | → Next State | Actor | Trigger | Mechanism |
|---------------|-------------|-------|---------|-----------|
| rider_assigned | rider_en_route_to_pickup | rider | "Start delivery" | new DB function |
| rider_en_route_to_pickup | arrived_at_pickup | rider | "Arrived at pickup" | new DB function |
| arrived_at_pickup | picked_up | rider | "Confirm pickup" | new DB function |
| picked_up | in_transit | rider | "Start transit" (optional) | new DB function |
| in_transit | arrived_at_destination | rider | "Arrived at destination" | new DB function |
| arrived_at_destination | delivered | rider | "Complete delivery" | new DB function |
| delivered | completed | system | auto or customer confirm | new DB function |

### 4.3 Cancellation/Failure Transitions

| Current State | → Next State | Actor | Trigger |
|---------------|-------------|-------|---------|
| rider_assigned | cancelled | rider/customer | cancel |
| rider_en_route_to_pickup | cancelled | rider/customer | cancel |
| arrived_at_pickup | cancelled | customer | cancel (penalty TBD) |
| any active | failed | system | timeout/stale rider |

### 4.4 State Transition Enforcement

**Current state:** CHECK constraint only validates allowed values, NOT transitions.

**Required:** Application-level state machine that:
1. Validates the transition is legal
2. Performs atomic state update with row lock
3. Records order_event
4. Updates delivery timestamp
5. Updates rider_assignments if needed

**Implementation:** A single PostgreSQL function `transition_order_status()` with SECURITY DEFINER that:
- Takes: order_id, target_status, actor_id, actor_type
- Validates the transition against a transition table
- Locks the order row (`SELECT ... FOR UPDATE`)
- Updates status + timestamp
- Inserts order_event
- Returns success/failure

---

## 5. CONCURRENCY / TRANSACTION ANALYSIS

### 5.1 Race Conditions to Prevent

| Race | Risk | Protection |
|------|------|------------|
| Rider starts delivery while customer cancels | Order in invalid state | `SELECT ... FOR UPDATE` on orders |
| Duplicate "pickup confirmed" request | Double state transition | State guard: only accept if current_state = expected |
| Delivery completion twice | Double earnings | Unique constraint on earnings_ledger + state guard |
| Proof submission after completion | Stale proof | State guard: only accept if order is in active state |
| Customer cancels during delivery | Rider still delivering | State guard: only cancel if order allows it |
| Concurrent pickup + cancellation | Race | Row-level lock ensures serial execution |

### 5.2 Transaction Boundary

All delivery state transitions MUST be within a single database transaction that includes:

1. Lock order row (`SELECT ... FOR UPDATE`)
2. Validate current state
3. Update order status + timestamp
4. Insert order_event
5. Update rider_assignment if needed
6. (On completion) Create earnings_ledger entry
7. (On completion) Create delivery_proof record

This must be a single PostgreSQL function to guarantee atomicity.

### 5.3 Existing Protections

| Protection | Mechanism | Status |
|------------|-----------|--------|
| One active offer per order | `idx_rider_assignments_one_active` | ✅ Phase 3 |
| One active offer per rider | `idx_rider_assignments_rider_one_active` | ✅ Phase 3 |
| Atomic job claiming | `claim_next_pending_job()` | ✅ Phase 3 |
| Dispatch config | `platform_settings` | ✅ Phase 3 |

---

## 6. ACTIVE DELIVERY WORKFLOW DESIGN

### 6.1 PostgreSQL Function: `transition_order_status()`

This is the single authoritative function for all rider delivery state transitions.

**Parameters:**
- `p_order_id UUID`
- `p_target_status TEXT`
- `p_actor_id UUID`
- `p_actor_type TEXT` (rider/customer/admin/system)

**Behavior:**
1. `SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE`
2. Check: `v_order.assigned_rider_id = p_actor_id` (if actor_type = 'rider')
3. Check: transition is valid per transition table
4. Update: `orders.status = p_target_status`, set appropriate timestamp
5. Insert: `order_events` record
6. Return: success + message

**Transition table (embedded in function):**

```sql
valid_transitions JSONB := '{
  "rider_assigned": ["rider_en_route_to_pickup", "cancelled"],
  "rider_en_route_to_pickup": ["arrived_at_pickup", "cancelled"],
  "arrived_at_pickup": ["picked_up", "cancelled"],
  "picked_up": ["in_transit", "arrived_at_destination", "cancelled"],
  "in_transit": ["arrived_at_destination", "cancelled"],
  "arrived_at_destination": ["delivered", "cancelled"],
  "delivered": ["completed"]
}';
```

### 6.2 Delivery Completion: `complete_delivery()`

**Parameters:**
- `p_order_id UUID`
- `p_rider_id UUID`
- `p_proof_type TEXT` (photo/signature/pin/recipient_confirmation)
- `p_file_url TEXT` (nullable)
- `p_recipient_name TEXT` (nullable)
- `p_notes TEXT` (nullable)
- `p_proof_latitude DECIMAL` (nullable)
- `p_proof_longitude DECIMAL` (nullable)

**Behavior (single transaction):**
1. Lock order: `SELECT ... FOR UPDATE`
2. Validate: order status is `arrived_at_destination` or `in_transit`
3. Validate: assigned_rider_id matches p_rider_id
4. Validate: proof_type is in allowed list
5. Validate: if proof_type = 'photo', file_url is not null
6. Validate: if proof_type = 'recipient_confirmation', recipient_name is not null
7. Insert: `delivery_proofs` record
8. Update: `orders.status = 'delivered'`, `orders.delivered_at = NOW()`
9. Update: `rider_assignments.status = 'completed'`
10. Calculate: earnings based on `orders.total_amount` and `platform_commission_rate`
11. Insert: `earnings_ledger` record (with idempotency check)
12. Insert: `order_events` record
13. Return: success + delivery_proof_id

### 6.3 Earnings Calculation

```sql
-- Read commission rate from platform_settings
SELECT (value->>'rate')::DECIMAL INTO v_commission_rate
FROM platform_settings WHERE key = 'platform_commission_rate';

-- Calculate
v_platform_commission = v_order.total_amount * v_commission_rate;
v_rider_earning = v_order.total_amount - v_platform_commission;
```

**Idempotency:** Check for existing earnings_ledger entry with `order_id = p_order_id` before creating.

**Note:** The historical 70/30 model is NOT used. The current DB-configured rate is 15%.

---

## 7. PROOF OF DELIVERY ARCHITECTURE

### 7.1 Storage Bucket

**Bucket name:** `delivery-proofs`
**Visibility:** Private (not public)
**Access:** Signed URLs with expiry

### 7.2 Object Path Structure

```
delivery-proofs/{order_id}/{rider_id}/{timestamp}.{ext}
```

### 7.3 Upload Flow

1. Rider submits proof via API
2. API validates: order is active, rider is assigned, required fields present
3. If photo: upload to storage, get signed URL
4. Create `delivery_proofs` record
5. Complete delivery (atomic operation)

### 7.4 Storage Policies

| Policy | Effect |
|--------|--------|
| Rider can upload to own path | `auth.uid() = rider_id` in path |
| Customer can read proofs for own order | Through `delivery_proofs_select_customer` RLS |
| Admin can read all proofs | Through `delivery_proofs_select_admin` RLS |
| No public access | Private bucket |

### 7.5 File Limits

- Max file size: 10MB
- Allowed MIME types: image/jpeg, image/png, image/webp
- Max dimensions: 4000x4000 (resize on upload if needed)

---

## 8. CANCELLATION / FAILURE DESIGN

### 8.1 Cancellation Rules (MVP)

| Order State | Customer Cancel | Rider Cancel | Fee |
|-------------|----------------|--------------|-----|
| rider_assigned | ✅ | ✅ | 0 |
| rider_en_route_to_pickup | ✅ | ✅ | 0 |
| arrived_at_pickup | ✅ | ❌ | 0 (MVP) |
| picked_up | ❌ | ❌ | — |
| in_transit | ❌ | ❌ | — |

**MVP decision:** No cancellation fees. All cancellations are free.

### 8.2 Cancellation Implementation

**Function:** `cancel_order(p_order_id, p_actor_id, p_actor_type, p_reason)`

**Behavior:**
1. Lock order: `SELECT ... FOR UPDATE`
2. Validate: order is in a cancellable state
3. Update: `orders.status = 'cancelled'`, `cancelled_at = NOW()`, `cancelled_by = p_actor_id`, `cancellation_reason = p_reason`
4. Update: `rider_assignments.status = 'cancelled'` (for active assignment)
5. Restore: rider availability if assignment was active
6. Insert: `order_events` record
7. Return: success

### 8.3 Failed Delivery

**Function:** `fail_delivery(p_order_id, p_actor_id, p_actor_type, p_reason)`

**Behavior:** Similar to cancellation but sets status to `failed` instead of `cancelled`.

---

## 9. API CONTRACT — PHASE 4 ENDPOINTS

### 9.1 Rider Endpoints

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/riders/deliveries/[orderId]/start` | Start delivery (en route to pickup) | Rider |
| POST | `/api/riders/deliveries/[orderId]/arrive-pickup` | Arrive at pickup | Rider |
| POST | `/api/riders/deliveries/[orderId]/confirm-pickup` | Confirm pickup | Rider |
| POST | `/api/riders/deliveries/[orderId]/arrive-destination` | Arrive at destination | Rider |
| POST | `/api/riders/deliveries/[orderId]/complete` | Complete delivery + proof | Rider |
| POST | `/api/riders/deliveries/[orderId]/cancel` | Cancel delivery | Rider |
| GET | `/api/riders/deliveries/[orderId]` | Get delivery details | Rider |

### 9.2 Customer Endpoints

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/customers/orders/[orderId]/tracking` | Get delivery status + rider location | Customer |

### 9.3 Admin Endpoints

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/admin/deliveries` | List all active deliveries | Admin |

---

## 10. BACKGROUND JOB INTERACTION

### 10.1 Existing Job Types (relevant)

| Job Type | Phase 4 Use |
|----------|-------------|
| `COMPLETE_ORDER` | Auto-complete delivery after proof submission |
| `EARNINGS_AGGREGATION` | Aggregate rider earnings (optional) |

### 10.2 New Job Types Needed

| Job Type | Trigger | Purpose |
|----------|---------|---------|
| `DELIVERY_TIMEOUT` | Scheduled when rider starts delivery | Fail delivery if no progress in X hours |
| `STALE_DELIVERY_CHECK` | Periodic cron | Detect stuck deliveries |

### 10.3 Job Registration

Add handlers for new job types in `process-jobs/route.ts`:
```typescript
registerJobHandler('DELIVERY_TIMEOUT', async (payload) => { ... });
registerJobHandler('STALE_DELIVERY_CHECK', async (payload) => { ... });
```

---

## 11. OBSERVABILITY

### 11.1 Required Events

| Event | Log Level | Data |
|-------|-----------|------|
| delivery_started | INFO | order_id, rider_id |
| arrived_at_pickup | INFO | order_id, rider_id |
| pickup_confirmed | INFO | order_id, rider_id |
| arrived_at_destination | INFO | order_id, rider_id |
| delivery_completed | INFO | order_id, rider_id, proof_id |
| delivery_cancelled | INFO | order_id, actor_type, reason |
| delivery_failed | WARN | order_id, reason |
| earnings_created | INFO | order_id, rider_id, amount |
| invalid_transition | WARN | order_id, from_status, to_status, actor |
| unauthorized_access | WARN | order_id, actor_id, reason |

### 11.2 Sensitive Data

**Do NOT log:**
- Proof image contents
- GPS coordinates (use order_id for correlation)
- Recipient personal details
- Payment credentials

---

## 12. TEST STRATEGY

### 12.1 Required Tests (minimum 30)

**State Machine (10):**
1. Valid transition: rider_assigned → rider_en_route_to_pickup
2. Valid transition: rider_en_route_to_pickup → arrived_at_pickup
3. Valid transition: arrived_at_pickup → picked_up
4. Valid transition: picked_up → in_transit → arrived_at_destination → delivered
5. Invalid transition: rider_assigned → delivered (skip steps)
6. Invalid transition: delivered → rider_assigned (backward)
7. Invalid transition: cancelled → any active state
8. Duplicate start delivery request (idempotent)
9. Duplicate complete delivery request (idempotent)
10. Cancel during active delivery

**Concurrency (8):**
11. Two riders accept same offer (already tested in Phase 3)
12. Customer cancels while rider transitions to pickup
13. Delivery completion occurs twice
14. Proof submission after delivery already completed
15. Concurrent pickup confirmations
16. Cancel + complete happen simultaneously
17. Rider starts delivery while order cancelled
18. Background job processes same delivery twice

**Authorization (6):**
19. Rider cannot start delivery for another rider's order
20. Rider cannot complete another rider's delivery
21. Customer cannot transition order states
22. Unauthenticated request rejected
23. Rider cannot access another customer's order
24. Customer cannot access another customer's tracking

**Proof of Delivery (4):**
25. Photo proof accepted
26. Photo proof rejected if no file_url
27. Recipient name required for recipient_confirmation
28. Proof belongs to correct order

**Earnings (4):**
29. Earnings calculated correctly with 15% commission
30. Duplicate earnings prevented
31. Commission rate from platform_settings
32. Earnings created atomically with delivery completion

**Financial (2):**
33. Rider cannot modify total_amount
34. Client cannot supply earnings amount

---

## 13. DATABASE CHANGES REQUIRED

### 13.1 Required

| Change | Type | Purpose |
|--------|------|---------|
| `transition_order_status()` | FUNCTION | Centralized state transitions |
| `complete_delivery()` | FUNCTION | Atomic delivery completion + proof + earnings |
| `cancel_order()` | FUNCTION | Centralized cancellation |
| Fix `orders_update_rider` RLS | POLICY | Remove or restrict rider direct UPDATE |
| Add unique constraint on earnings | INDEX | Prevent duplicate earnings |

### 13.2 Recommended

| Change | Type | Purpose |
|--------|------|---------|
| `delivery-proofs` bucket | STORAGE | Proof file storage |
| `DELIVERY_TIMEOUT` job type | TYPE | Background job |
| `STALE_DELIVERY_CHECK` job type | TYPE | Background job |

### 13.3 Not Required

- New tables (all exist)
- New columns (all exist)
- New enums (using TEXT with CHECK)
- New indexes (existing indexes sufficient)

---

## 14. RISKS AND MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| orders_update_rider allows field manipulation | CRITICAL | Remove/restrict RLS, use SECURITY DEFINER functions |
| No unique constraint on earnings_ledger | HIGH | Add unique index on (rider_id, order_id) |
| State transitions not enforced at DB level | HIGH | transition_order_status() function |
| Proof file could become public | MEDIUM | Private bucket + signed URLs |
| Delivery timeout not implemented | MEDIUM | DELIVERY_TIMEOUT background job |
| No delivery cancellation handling | MEDIUM | cancel_order() function |
| Proof after completion race | LOW | State guard in complete_delivery() |

---

## 15. IMPLEMENTATION SEQUENCE

### Phase 4A: Active Delivery Workflow
1. Create `transition_order_status()` PostgreSQL function
2. Fix `orders_update_rider` RLS policy
3. Create rider delivery APIs (start, arrive, pickup, transit, arrive-destination)
4. Create `cancel_order()` function
5. Add tests for state transitions and authorization

### Phase 4B: Proof of Delivery
1. Create `delivery-proofs` storage bucket
2. Create `complete_delivery()` PostgreSQL function
3. Create rider delivery completion API
4. Add proof validation and storage policies
5. Add tests for proof submission and completion

### Phase 4C: Earnings
1. Add unique constraint on earnings_ledger
2. Implement earnings calculation in `complete_delivery()`
3. Add earnings read APIs
4. Add tests for earnings calculation and idempotency

### Phase 4D: Background Jobs
1. Register `DELIVERY_TIMEOUT` handler
2. Register `STALE_DELIVERY_CHECK` handler
3. Add timeout scheduling in `transition_order_status()`
4. Add tests for timeout and stale delivery handling

---

## 16. PRODUCT DECISIONS CONFIRMED

| Decision | Approved Default |
|----------|-----------------|
| Proof requirements | Photo + recipient_name |
| Signature/PIN | Not required for MVP |
| Cancellation fees | 0 (MVP) |
| Platform commission | DB-configurable, currently 15% |
| Payout execution | Deferred to later milestone |
| Earnings calculation | total_amount × (1 - commission_rate) |

---

## 17. GO / NO-GO RECOMMENDATION

### BLOCKERS (must resolve before implementation)

1. **CRITICAL:** `orders_update_rider` RLS policy allows riders to update ANY order field. Must be fixed.
2. **HIGH:** No unique constraint on earnings_ledger for duplicate prevention.

### RECOMMENDATION

**GO — READY FOR IMPLEMENTATION** (with the two blockers resolved as the first implementation steps)

The two blockers can be resolved within the first hour of Phase 4A implementation. They do not require architectural redesign.

---

*Architecture review complete. Standing by for implementation authorization.*
