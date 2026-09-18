# PHASE 4 — STATE MACHINE SPECIFICATION

## Active Delivery, Proof of Delivery & Earnings

---

## 1. CURRENT STATE INVENTORY

### 1.1 Order States (17 — from CHECK constraint)

```sql
CHECK (status IN (
  'draft', 'pending_payment', 'paid', 'searching_rider', 'rider_assigned',
  'rider_en_route_to_pickup', 'arrived_at_pickup', 'picked_up',
  'in_transit', 'arrived_at_destination', 'delivered', 'completed',
  'cancelled', 'failed', 'expired', 'disputed', 'refunded'
))
```

| # | State | Category | Meaning |
|---|-------|----------|---------|
| 1 | draft | Pre-payment | Order created, not yet paid |
| 2 | pre-payment | Pre-payment | Payment pending |
| 3 | paid | Pre-dispatch | Payment confirmed, awaiting dispatch |
| 4 | searching_rider | Dispatch | Dispatch in progress |
| 5 | rider_assigned | Delivery | Rider accepted, delivery begins |
| 6 | rider_en_route_to_pickup | Delivery | Rider heading to pickup |
| 7 | arrived_at_pickup | Delivery | Rider at pickup location |
| 8 | picked_up | Delivery | Package picked up |
| 9 | in_transit | Delivery | Package in transit to destination |
| 10 | arrived_at_destination | Delivery | Rider at destination |
| 11 | delivered | Delivery | Delivery completed with proof |
| 12 | completed | Terminal | Order fully closed |
| 13 | cancelled | Terminal | Order cancelled |
| 14 | failed | Terminal | Delivery failed |
| 15 | expired | Terminal | Quote/order expired |
| 16 | disputed | Terminal | Customer dispute |
| 17 | refunded | Terminal | Payment refunded |

### 1.2 rider_assignments Statuses (6)

```sql
CHECK (status IN ('offered', 'accepted', 'rejected', 'expired', 'cancelled', 'completed'))
```

### 1.3 Order Timestamps

| Column | Phase 3 sets? | Phase 4 sets? |
|--------|---------------|---------------|
| rider_assigned_at | ✅ accept_rider_offer() | — |
| rider_arrived_at_pickup | ❌ | Phase 4A |
| rider_picked_up_at | ❌ | Phase 4A |
| rider_arrived_at_destination | ❌ | Phase 4A |
| delivered_at | ❌ | Phase 4B |
| completed_at | ❌ | Phase 4A |
| cancelled_at | ❌ | Phase 4D |

---

## 2. TRANSITION MATRIX

### 2.1 Complete Valid Transitions

| Current State | → Next State | Actor | Fields Changed | Side Effects |
|---------------|-------------|-------|----------------|--------------|
| draft | pending_payment | system | status | order_event |
| pending_payment | paid | system | status | order_event, payment confirmation |
| paid | searching_rider | system | status | order_event, dispatch triggered |
| searching_rider | rider_assigned | system | status, assigned_rider_id, rider_assigned_at | order_event, assignment accepted |
| rider_assigned | rider_en_route_to_pickup | rider | status, updated_at | order_event |
| rider_en_route_to_pickup | arrived_at_pickup | rider | status, rider_arrived_at_pickup, updated_at | order_event |
| arrived_at_pickup | picked_up | rider | status, rider_picked_up_at, updated_at | order_event |
| picked_up | in_transit | rider | status, updated_at | order_event |
| picked_up | arrived_at_destination | rider | status, rider_arrived_at_destination, updated_at | order_event (skip in_transit) |
| in_transit | arrived_at_destination | rider | status, rider_arrived_at_destination, updated_at | order_event |
| arrived_at_destination | delivered | rider | status, delivered_at, updated_at | order_event, proof required |
| delivered | completed | system | status, completed_at, updated_at | order_event, earnings created, assignment completed |

### 2.2 Cancellation Transitions

| Current State | → Next State | Actor | Fields Changed | Side Effects |
|---------------|-------------|-------|----------------|--------------|
| rider_assigned | cancelled | rider/customer | status, cancelled_at, cancelled_by, cancellation_reason | order_event, assignment cancelled |
| rider_en_route_to_pickup | cancelled | rider/customer | status, cancelled_at, cancelled_by, cancellation_reason | order_event, assignment cancelled |
| arrived_at_pickup | cancelled | customer | status, cancelled_at, cancelled_by, cancellation_reason | order_event, assignment cancelled |
| searching_rider | cancelled | customer | status, cancelled_at, cancelled_by, cancellation_reason | order_event |
| paid | cancelled | customer | status, cancelled_at, cancelled_by, cancellation_reason | order_event |

**Note:** Cancellation from `picked_up` and later states is NOT allowed in MVP. Once the rider has the package, the delivery must complete.

### 2.3 Failure Transitions

| Current State | → Next State | Actor | Fields Changed | Side Effects |
|---------------|-------------|-------|----------------|--------------|
| searching_rider | failed | system | status, updated_at | order_event (retry exhausted) |
| rider_assigned | failed | system | status, updated_at | order_event (timeout) |
| rider_en_route_to_pickup | failed | system | status, updated_at | order_event (timeout) |
| arrived_at_pickup | failed | system | status, updated_at | order_event (timeout) |

### 2.4 Invalid Transitions (must be rejected)

| Current State | → Requested State | Why Invalid |
|---------------|-------------------|-------------|
| delivered | rider_assigned | Cannot go backward |
| completed | any | Terminal state |
| cancelled | any | Terminal state |
| failed | any | Terminal state |
| expired | any | Terminal state |
| rider_assigned | delivered | Must go through pickup workflow |
| picked_up | rider_assigned | Cannot go backward |
| any active | completed | Only system can complete |

---

## 3. ACTOR AUTHORIZATION MATRIX

### 3.1 Who Can Trigger Each Transition

| Transition | Rider | Customer | Admin | System/Background |
|------------|-------|----------|-------|-------------------|
| rider_assigned → rider_en_route_to_pickup | ✅ | ❌ | ✅ | ❌ |
| rider_en_route_to_pickup → arrived_at_pickup | ✅ | ❌ | ✅ | ❌ |
| arrived_at_pickup → picked_up | ✅ | ❌ | ✅ | ❌ |
| picked_up → in_transit | ✅ | ❌ | ✅ | ❌ |
| in_transit → arrived_at_destination | ✅ | ❌ | ✅ | ❌ |
| arrived_at_destination → delivered | ✅ | ❌ | ✅ | ❌ |
| delivered → completed | ❌ | ❌ | ✅ | ✅ |
| any active → cancelled | ✅* | ✅ | ✅ | ❌ |
| searching_rider → failed | ❌ | ❌ | ✅ | ✅ |
| rider_assigned → failed | ❌ | ❌ | ✅ | ✅ |

*Rider cancellation only from states before pickup confirmation.

### 3.2 Authorization Rules

1. **Rider:** Must be the `assigned_rider_id` on the order
2. **Customer:** Must be the `customer_id` on the order
3. **Admin:** Must have role in ('admin', 'super_admin', 'operations')
4. **System:** Must be called via service-role or SECURITY DEFINER function

---

## 4. MUTABLE-FIELD MATRIX

### 4.1 What Each Actor Can Change

| Field | Rider | Customer | Admin | System |
|-------|-------|----------|-------|--------|
| status | ✅ (via transition) | ✅ (cancel only) | ✅ | ✅ |
| assigned_rider_id | ❌ | ❌ | ✅ | ✅ |
| rider_assigned_at | ❌ | ❌ | ✅ | ✅ |
| rider_arrived_at_pickup | ✅ | ❌ | ✅ | ✅ |
| rider_picked_up_at | ✅ | ❌ | ✅ | ✅ |
| rider_arrived_at_destination | ✅ | ❌ | ✅ | ✅ |
| delivered_at | ❌ | ❌ | ✅ | ✅ |
| completed_at | ❌ | ❌ | ✅ | ✅ |
| cancelled_at | ✅ (cancel) | ✅ (cancel) | ✅ | ✅ |
| cancelled_by | ✅ (cancel) | ✅ (cancel) | ✅ | ✅ |
| cancellation_reason | ✅ (cancel) | ✅ (cancel) | ✅ | ✅ |
| total_amount | ❌ | ❌ | ❌ | ❌ |
| base_fee | ❌ | ❌ | ❌ | ❌ |
| distance_fee | ❌ | ❌ | ❌ | ❌ |
| customer_id | ❌ | ❌ | ❌ | ❌ |
| pricing fields | ❌ | ❌ | ❌ | ❌ |
| payment fields | ❌ | ❌ | ❌ | ❌ |

### 4.2 Forbidden Rider Operations

A rider must NEVER be able to:
- Modify `total_amount`, `base_fee`, `distance_fee`, `weight_fee`, `zone_fee`, `urgency_fee`, `discount_amount`, `tax_amount`
- Modify `customer_id`, `assigned_rider_id`
- Modify `pickup_latitude`, `pickup_longitude`, `destination_latitude`, `destination_longitude`
- Modify `pricing_rule_id`, `currency`
- Set `status` directly (must go through transition function)
- Modify `cancelled_by` except when cancelling their own assignment
- Create earnings entries
- Modify financial records

---

## 5. ORDER-EVENT MATRIX

### 5.1 Events to Record

| Event Type | From Status | To Status | Actor Type | Metadata |
|------------|------------|-----------|------------|----------|
| rider_started_delivery | rider_assigned | rider_en_route_to_pickup | rider | — |
| rider_arrived_pickup | rider_en_route_to_pickup | arrived_at_pickup | rider | — |
| rider_picked_up | arrived_at_pickup | picked_up | rider | — |
| rider_started_transit | picked_up | in_transit | rider | — |
| rider_arrived_destination | in_transit | arrived_at_destination | rider | — |
| delivery_completed | arrived_at_destination | delivered | rider | proof_id, recipient_name |
| order_completed | delivered | completed | system | earnings_id |
| order_cancelled | any active | cancelled | rider/customer/admin | reason, cancelled_by |
| order_failed | any active | failed | system | reason |

---

## 6. CONCURRENCY MODEL

### 6.1 Required Locks

| Operation | Table | Lock Type | Purpose |
|-----------|-------|-----------|---------|
| State transition | orders | SELECT ... FOR UPDATE | Prevent concurrent state changes |
| Delivery completion | orders + rider_assignments | SELECT ... FOR UPDATE | Atomic multi-table update |
| Proof submission | delivery_proofs | INSERT only | Unique constraint prevents duplicates |
| Earnings creation | earnings_ledger | SELECT + INSERT | Idempotency check before insert |

### 6.2 Race Condition Protections

| Race Condition | Protection |
|----------------|------------|
| Two concurrent "start delivery" requests | Second request fails state guard (already in target state) |
| Concurrent delivery completion | SELECT FOR UPDATE serializes; first wins, second fails state guard |
| Cancel + complete simultaneously | Row lock serializes; whichever gets lock first wins |
| Proof submission after completion | State guard rejects if order not in active state |
| Duplicate earnings | UNIQUE constraint on (rider_id, order_id) + application check |
| Rider transitions another rider's order | Authorization check: assigned_rider_id must match |

### 6.3 Idempotency

| Operation | Idempotent? | Mechanism |
|-----------|-------------|-----------|
| Start delivery | Yes | State guard: if already started, return success |
| Arrive pickup | Yes | State guard: if already arrived, return success |
| Confirm pickup | Yes | State guard: if already picked up, return success |
| Complete delivery | Yes | State guard + earnings check |
| Cancel order | Yes | State guard: if already cancelled, return success |
| Submit proof | Yes | UNIQUE constraint on (order_id, proof_type) |

---

## 7. RLS CHANGES

### 7.1 Current Policies (PROBLEM)

| Policy | Table | Effect | Issue |
|--------|-------|--------|-------|
| orders_update_rider | orders | rider can UPDATE any field | ❌ CRITICAL |
| orders_update_customer | orders | customer can UPDATE any field | ⚠️ HIGH |
| rider_assignments_update_own | rider_assignments | rider can UPDATE any field | ⚠️ MEDIUM |

### 7.2 Required Changes

**Option A: Remove direct UPDATE policies, use SECURITY DEFINER only**

Remove:
- `orders_update_rider` — riders cannot directly UPDATE orders
- `orders_update_customer` — customers cannot directly UPDATE orders (except cancellation via function)

Keep:
- `orders_update_admin` — admin direct access for operational needs

All rider and customer order modifications go through SECURITY DEFINER functions that validate transitions.

**Option B: Column-level restrictions (PostgreSQL 15+)**

If the Supabase instance supports PostgreSQL 15+, use per-column policies.

**Recommended: Option A** — simpler, more secure, works on all PostgreSQL versions.

### 7.3 New Policies Needed

| Policy | Table | Effect |
|--------|-------|--------|
| delivery_proofs_select_rider | delivery_proofs | rider reads own proofs |
| earnings_ledger_insert_service | earnings_ledger | service-role can insert (via SECURITY DEFINER) |

---

## 8. SECURITY DEFINER DESIGN

### 8.1 Function: `transition_order_status()`

```sql
CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id UUID,
  p_target_status TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'rider',
  p_cancellation_reason TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_status TEXT
) AS $$
```

**Security model:**
- SECURITY DEFINER: runs with function owner privileges (bypasses RLS)
- Validates caller via auth.uid()
- Checks actor is authorized for the requested transition
- Locks order row
- Validates transition against matrix
- Updates only permitted fields
- Records order_event
- Returns result

### 8.2 Function: `complete_delivery()`

```sql
CREATE OR REPLACE FUNCTION complete_delivery(
  p_order_id UUID,
  p_proof_type TEXT,
  p_file_url TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_proof_latitude DECIMAL DEFAULT NULL,
  p_proof_longitude DECIMAL DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  proof_id UUID
) AS $$
```

**Security model:**
- SECURITY DEFINER
- Validates caller is assigned_rider
- Validates order is in correct state
- Validates proof meets requirements
- Creates delivery_proofs record
- Transitions order to delivered
- Creates earnings_ledger entry (idempotent)
- All in one transaction

### 8.3 Function: `cancel_order()`

```sql
CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id UUID,
  p_actor_type TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
```

---

## 9. PROOF AUTHORIZATION MODEL

### 9.1 Who Can Submit Proof

- Only the assigned rider (validated by assigned_rider_id = auth.uid())
- Only for orders in state arrived_at_destination (or picked_up if skipping in_transit)

### 9.2 Who Can Read Proof

- Customer who owns the order
- Admin with appropriate role
- The rider who submitted it (via delivery_proofs_select_rider policy)

### 9.3 Proof Requirements (MVP)

| proof_type | Required Fields | Optional Fields |
|------------|-----------------|-----------------|
| photo | file_url | notes, proof_latitude, proof_longitude |
| recipient_confirmation | recipient_name | file_url, notes |
| signature | signature_data | — (deferred) |
| pin | pin_code | — (deferred) |

### 9.4 Proof Storage

- Bucket: `delivery-proofs` (private)
- Path: `{order_id}/{rider_id}/{timestamp}.{ext}`
- Access: signed URLs with 1-hour expiry
- No public access

---

## 10. EARNINGS ATOMICITY MODEL

### 10.1 Calculation

```sql
-- Read commission rate (database-configurable, NOT hardcoded)
SELECT (value->>'rate')::DECIMAL INTO v_commission_rate
FROM platform_settings WHERE key = 'platform_commission_rate';
-- Default: 0.15 (15%)

v_platform_commission = v_order.total_amount * v_commission_rate;
v_rider_earning = v_order.total_amount - v_platform_commission;
```

### 10.2 Earnings Record

```sql
INSERT INTO earnings_ledger (rider_id, order_id, credit, debit, balance_after, description, reference_type, reference_id)
VALUES (v_rider_id, v_order_id, v_rider_earning, 0, v_new_balance, 'Delivery earnings', 'delivery', v_order_id);
```

### 10.3 Idempotency

Check before insert:
```sql
IF EXISTS (SELECT 1 FROM earnings_ledger WHERE order_id = p_order_id AND reference_type = 'delivery') THEN
  -- Already created, skip
  RETURN;
END IF;
```

Plus UNIQUE index on `(order_id, reference_type)` for database-level protection.

### 10.4 Transaction Boundary

Earnings creation MUST be inside the same transaction as delivery completion:
1. Lock order
2. Validate state
3. Create proof record
4. Update order status to delivered
5. Create earnings entry
6. Complete assignment
7. Record order_event
8. COMMIT

If any step fails, ALL changes roll back.

---

## 11. IDENTIFIED RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| orders_update_rider allows arbitrary field modification | CRITICAL | Remove policy, use SECURITY DEFINER functions |
| orders_update_customer allows arbitrary field modification | HIGH | Remove policy, use SECURITY DEFINER for cancellation |
| No unique constraint on earnings_ledger | HIGH | Add unique index on (order_id, reference_type) |
| State transitions not enforced at DB level | HIGH | transition_order_status() function |
| Proof files could become public | MEDIUM | Private bucket + signed URLs |
| No delivery timeout mechanism | MEDIUM | DELIVERY_TIMEOUT background job |
| rider_assignments_update_own allows arbitrary updates | MEDIUM | Use SECURITY DEFINER for all assignment changes |
| Proof after completion race | LOW | State guard in complete_delivery() |
| Concurrent earnings creation | LOW | Unique constraint + application check |

---

## 12. DATABASE CHANGES REQUIRED

### 12.1 New Functions

| Function | Purpose |
|----------|---------|
| transition_order_status() | Centralized state transitions |
| complete_delivery() | Atomic delivery completion + proof + earnings |
| cancel_order() | Centralized cancellation |

### 12.2 New Indexes

| Index | Purpose |
|-------|---------|
| idx_earnings_ledger_order_type UNIQUE | Prevent duplicate earnings per order |

### 12.3 RLS Changes

| Change | Purpose |
|--------|---------|
| DROP orders_update_rider | Remove critical security hole |
| DROP orders_update_customer | Remove high security hole |
| CREATE delivery_proofs_select_rider | Rider reads own proofs |

### 12.4 New Storage

| Bucket | Purpose |
|--------|---------|
| delivery-proofs | Proof file storage (private) |

### 12.5 Not Required

- New tables (all exist)
- New columns (all exist)
- New enums (using TEXT with CHECK)

---

## 13. IMPLEMENTATION SEQUENCE

### Phase 4A: Active Delivery Workflow
1. Create transition_order_status() function
2. Remove orders_update_rider RLS policy
3. Remove orders_update_customer RLS policy
4. Create rider delivery APIs
5. Create cancel_order() function
6. Add tests

### Phase 4B: Proof of Delivery
1. Create delivery-proofs storage bucket
2. Create complete_delivery() function
3. Create delivery completion API
4. Add delivery_proofs_select_rider RLS policy
5. Add tests

### Phase 4C: Earnings
1. Add unique index on earnings_ledger
2. Embed earnings in complete_delivery()
3. Add earnings read APIs
4. Add tests

### Phase 4D: Background Jobs
1. Register DELIVERY_TIMEOUT handler
2. Register STALE_DELIVERY_CHECK handler
3. Add timeout scheduling
4. Add tests

---

*Specification complete. STOP — awaiting authorization for implementation.*
