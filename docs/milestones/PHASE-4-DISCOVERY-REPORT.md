# PHASE 4 DISCOVERY REPORT — ACTIVE DELIVERY & PROOF OF DELIVERY

**Date:** August 23, 2026
**Status:** DISCOVERY COMPLETE
**Recommendation:** GO — READY FOR ARCHITECTURE REVIEW

---

## Executive Summary

Phase 4 database foundation is **COMPLETE**. All required tables exist with proper columns, constraints, and RLS policies. The application layer for active delivery is **MISSING** — no API routes, no services, no PostgreSQL functions for delivery state transitions. Storage buckets are **MISSING**. This is a well-scoped implementation effort with a strong database foundation.

---

## 1. CURRENT STATE AUDIT

### Database Foundation — COMPLETE ✅

| Table | Columns | Status | Evidence |
|-------|---------|--------|----------|
| orders | 54 | ✅ Complete | All timestamp columns exist |
| rider_assignments | 10 | ✅ Complete | Status CHECK constraint enforced |
| delivery_proofs | 13 | ✅ Complete | RLS policies active |
| earnings_ledger | 10 | ✅ Complete | Indexes exist |
| payouts | 12 | ✅ Complete | RLS policies active |
| payout_recipients | 9 | ✅ Complete | Referenced by payouts |
| order_events | 9 | ✅ Complete | Event recording infrastructure |

### PostgreSQL Functions — PARTIAL

| Function | Status | Purpose |
|----------|--------|---------|
| `accept_rider_offer()` | ✅ EXISTS | Rider accepts dispatch offer |
| `dispatch_rider_v2()` | ✅ EXISTS | Dispatch eligible riders |
| `find_nearest_riders()` | ✅ EXISTS | Spatial rider lookup |
| `process_expired_offers()` | ✅ EXISTS | Expire stale offers |
| `claim_next_pending_job()` | ✅ EXISTS | Atomic job claiming |
| Start delivery | ❌ MISSING | Transition to rider_en_route_to_pickup |
| Confirm pickup | ❌ MISSING | Transition to picked_up |
| Mark arrived | ❌ MISSING | Transition to arrived_at_destination |
| Complete delivery | ❌ MISSING | Transition to delivered/completed |
| Submit proof | ❌ MISSING | Insert delivery_proofs |
| Calculate earnings | ❌ MISSING | Create earnings_ledger entry |
| Create payout | ❌ MISSING | Create payout record |

### Storage — MISSING ❌

| Bucket | Status | Purpose |
|--------|--------|---------|
| delivery-proofs | ❌ DOES NOT EXIST | Store proof photos |
| rider-documents | ❌ DOES NOT EXIST | Store rider verification docs |

### RLS Policies — COMPLETE ✅

| Policy | Table | Rule |
|--------|-------|------|
| `delivery_proofs_insert_rider` | delivery_proofs | `rider_id = auth.uid()` |
| `delivery_proofs_select_customer` | delivery_proofs | Customer owns order |
| `delivery_proofs_select_admin` | delivery_proofs | Admin/super_admin role |
| `payouts_select_rider` | payouts | `rider_id = auth.uid()` |
| `payouts_select_admin` | payouts | Admin/super_admin role |

### Application Layer — MISSING ❌

| Component | Status |
|-----------|--------|
| Active delivery API routes | ❌ 0 routes |
| Proof submission API routes | ❌ 0 routes |
| Earnings API routes | ❌ 0 routes |
| Active delivery service | ❌ Does not exist |
| Proof service | ❌ Does not exist |
| Earnings service | ❌ Does not exist |
| Rider active delivery UI | ❌ Does not exist |
| Customer tracking UI | ❌ Does not exist (Phase 5) |

---

## 2. ACTIVE DELIVERY WORKFLOW

### Current Lifecycle (After Rider Accepts)

```
Payment confirmed
  → DISPATCH_ORDER job
  → dispatch_rider_v2() finds rider
  → Rider offer created (expires in 30s)
  → Rider accepts via accept_rider_offer()
  → Order status: rider_assigned
  → Assignment status: accepted
  
  ❌ STOP — No further transitions exist
```

### Required Lifecycle (Phase 4 Target)

```
rider_assigned
  → rider starts delivery (rider_en_route_to_pickup)
  → rider arrives at pickup (arrived_at_pickup)
  → rider confirms pickup (picked_up)
  → rider in transit (in_transit)
  → rider arrives at destination (arrived_at_destination)
  → rider submits proof (delivery_proofs)
  → delivery completed (delivered)
  → order finalized (completed)
  → earnings calculated (earnings_ledger)
  → assignment completed (rider_assignments.status = 'completed')
```

### Existing Order States (17 total)

```sql
CHECK (status IN (
  'draft', 'pending_payment', 'paid', 'searching_rider', 'rider_assigned',
  'rider_en_route_to_pickup', 'arrived_at_pickup', 'picked_up',
  'in_transit', 'arrived_at_destination', 'delivered', 'completed',
  'cancelled', 'failed', 'expired', 'disputed', 'refunded'
))
```

**All 17 states are defined. None have application-layer transition functions.**

---

## 3. ORDER STATE MACHINE

### State Transition Matrix

| CURRENT STATE | EVENT | NEW STATE | ENFORCED BY |
|---------------|-------|-----------|-------------|
| rider_assigned | rider starts delivery | rider_en_route_to_pickup | ❌ NOT ENFORCED |
| rider_en_route_to_pickup | rider arrives | arrived_at_pickup | ❌ NOT ENFORCED |
| arrived_at_pickup | pickup confirmed | picked_up | ❌ NOT ENFORCED |
| picked_up | rider departs | in_transit | ❌ NOT ENFORCED |
| in_transit | rider arrives | arrived_at_destination | ❌ NOT ENFORCED |
| arrived_at_destination | proof submitted | delivered | ❌ NOT ENFORCED |
| delivered | order finalized | completed | ❌ NOT ENFORCED |
| any active | rider cancels | cancelled | ❌ NOT ENFORCED |
| any active | customer cancels | cancelled | ❌ NOT ENFORCED |
| any active | delivery fails | failed | ❌ NOT ENFORCED |

**Critical finding: The order status CHECK constraint allows all transitions. No application-layer enforcement exists.**

---

## 4. RIDER ASSIGNMENT LIFECYCLE

### Current Assignment States

```sql
CHECK (status IN ('offered', 'accepted', 'rejected', 'expired', 'cancelled', 'completed'))
```

### Assignment → Active Delivery Flow

```
offered → accepted (rider accepts)
accepted → ??? (no transition functions exist)
```

### Race Condition Protections

| Scenario | Protection | Status |
|----------|------------|--------|
| Two riders accept same order | `idx_rider_assignments_one_active` UNIQUE partial index | ✅ DATABASE |
| Rider accepts after timeout | `expires_at < NOW()` check in `accept_rider_offer()` | ✅ DATABASE |
| Order cancelled during accept | `orders.status = 'searching_rider'` check | ✅ DATABASE |
| Repeated acceptance | `rider_assignments.status = 'offered'` check | ✅ DATABASE |
| Repeated start delivery | ❌ NO PROTECTION | ❌ MISSING |
| Repeated completion | ❌ NO PROTECTION | ❌ MISSING |
| Completion vs cancellation | ❌ NO PROTECTION | ❌ MISSING |

---

## 5. PROOF OF DELIVERY

### Database Foundation

**delivery_proofs table (13 columns):**

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| id | UUID | ✅ | Primary key |
| order_id | UUID | ✅ | Links to order |
| rider_id | UUID | ✅ | Links to rider |
| proof_type | TEXT | ✅ | CHECK: photo/signature/pin/recipient_confirmation |
| file_url | TEXT | ❌ | Storage path for photo |
| signature_data | TEXT | ❌ | Base64 signature |
| pin_code | TEXT | ❌ | PIN verification |
| recipient_name | TEXT | ❌ | Who received |
| notes | TEXT | ❌ | Additional notes |
| proof_latitude | DECIMAL | ❌ | GPS at proof time |
| proof_longitude | DECIMAL | ❌ | GPS at proof time |
| recorded_at | TIMESTAMPTZ | ❌ | When proof was recorded |
| created_at | TIMESTAMPTZ | ❌ | Record creation |

### Proof Types Supported

```sql
CHECK (proof_type IN ('photo', 'signature', 'pin', 'recipient_confirmation'))
```

### What's Missing

| Component | Status |
|-----------|--------|
| Storage bucket | ❌ Does not exist |
| Upload API | ❌ Does not exist |
| Signed URL generation | ❌ Does not exist |
| Proof validation logic | ❌ Does not exist |
| Proof → completion flow | ❌ Does not exist |
| Customer proof viewing | ❌ Does not exist |

### MVP Proof Requirements (Recommended)

- **Photo** — Delivery photo (required)
- **Recipient name** — Who received (required)
- **GPS** — Location at delivery (auto-captured)
- **Timestamp** — When delivered (auto-captured)

Signature and PIN can be deferred to later milestones.

---

## 6. STORAGE SECURITY

### Current State

**Zero storage buckets exist.**

### Required Buckets

| Bucket | Purpose | Public? | Access |
|--------|---------|---------|--------|
| `delivery-proofs` | Proof photos | NO | Rider upload, customer/admin read |
| `rider-documents` | Verification docs | NO | Rider upload, admin read |

### Recommended Object Path Structure

```
delivery-proofs/{order_id}/{proof_id}.jpg
rider-documents/{rider_id}/{doc_type}/{filename}
```

### Storage Policies Required

| Policy | Bucket | Operation | Rule |
|--------|--------|-----------|------|
| Rider upload proof | delivery-proofs | INSERT | Rider owns assignment |
| Customer read proof | delivery-proofs | SELECT | Customer owns order |
| Admin read proof | delivery-proofs | SELECT | Admin role |
| Rider upload doc | rider-documents | INSERT | Rider owns profile |
| Admin read doc | rider-documents | SELECT | Admin role |

---

## 7. EARNINGS

### Database Foundation

**earnings_ledger table (10 columns):**

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| rider_id | UUID | Links to rider |
| order_id | UUID | Links to order |
| credit | DECIMAL(12,2) | Amount earned |
| debit | DECIMAL(12,2) | Amount deducted |
| balance_after | DECIMAL(12,2) | Running balance |
| description | TEXT | What this entry is for |
| reference_type | TEXT | What this entry references |
| reference_id | UUID | Reference ID |
| created_at | TIMESTAMPTZ | When created |

### Financial Model

**Current database configuration:**
```sql
platform_commission_rate = 15% (from platform_settings)
```

**Historical proposal (NOT implemented):**
- 70% rider / 30% platform

**Recommendation:** Use the database-configurable 15% rate. Do not silently introduce the 70/30 model.

### Earnings Flow (NOT IMPLEMENTED)

```
Delivery completed
  → Calculate: rider_earnings = order.total_amount × (1 - commission_rate)
  → Create ledger entry: credit = rider_earnings
  → Create ledger entry: debit = platform_commission
  → Update rider balance
  → Mark assignment as completed
```

### What's Missing

| Component | Status |
|-----------|--------|
| Earnings calculation logic | ❌ Does not exist |
| Ledger entry creation | ❌ Does not exist |
| Balance calculation | ❌ Does not exist |
| Payout creation | ❌ Does not exist |
| Payout processing (Paystack) | ❌ Does not exist |

---

## 8. DELIVERY COMPLETION ATOMICITY

### Required Atomic Operation

Delivery completion must be atomic. A single transaction should:

1. Validate active assignment (rider owns order)
2. Validate required proof exists
3. Transition order state → delivered → completed
4. Transition assignment status → completed
5. Calculate rider earnings
6. Create ledger entries
7. Prevent duplicate earnings
8. Record completion event
9. Close tracking/broadcast lifecycle

### Current State

**No atomic completion function exists.** The completion operation must be created as a PostgreSQL function with proper locking.

### Race Condition Protection Required

| Scenario | Protection |
|----------|------------|
| Duplicate completion request | Status check + row lock |
| Completion vs cancellation | Mutual exclusion via status |
| Proof submission after completion | Status check |
| Two riders completing same order | Unique index prevents (already exists) |

---

## 9. CANCELLATION / FAILED DELIVERY

### Existing Cancellation Infrastructure

- `orders.cancelled_at` — timestamp
- `orders.cancellation_reason` — text
- `orders.cancelled_by` — UUID reference

### Scenarios Requiring Implementation

| Scenario | Behavior | Product Decision Needed? |
|----------|----------|--------------------------|
| Rider cancellation during delivery | Rider marks cancelled, order reassigned | Yes — cancellation fees? |
| Customer cancellation during delivery | Customer cancels, rider notified | Yes — cancellation fees? |
| Failed delivery (recipient unavailable) | Rider marks failed, proof required | Yes — retry or refund? |
| Rider abandoning assignment | Stale detection + timeout | No — auto-reassign |
| Incorrect address | Rider reports, order disputed | Yes — dispute flow? |

### Known Constraint

- **No cancellation fees are currently configured**
- **No refund logic exists for active deliveries**
- **Recommendation:** Keep cancellation simple for MVP. No fees. Rider gets paid for completed segments only.

---

## 10. API SURFACE

### Existing Phase 4-Related Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/riders/assignments/active` | GET | Get active assignment |

### Missing Routes (Phase 4)

| Route | Method | Purpose | Priority |
|-------|--------|---------|----------|
| `/api/riders/assignments/[id]/start` | POST | Start delivery | CRITICAL |
| `/api/riders/assignments/[id]/arrive-pickup` | POST | Mark arrived at pickup | CRITICAL |
| `/api/riders/assignments/[id]/confirm-pickup` | POST | Confirm pickup | CRITICAL |
| `/api/riders/assignments/[id]/arrive-destination` | POST | Mark arrived at destination | CRITICAL |
| `/api/riders/assignments/[id]/complete` | POST | Complete delivery with proof | CRITICAL |
| `/api/riders/assignments/[id]/cancel` | POST | Rider cancellation | HIGH |
| `/api/riders/assignments/[id]/proof` | POST | Submit delivery proof | CRITICAL |
| `/api/riders/earnings` | GET | Get earnings summary | HIGH |
| `/api/riders/earnings/history` | GET | Get earnings history | MEDIUM |

---

## 11. BACKGROUND JOBS

### Phase 4 Job Requirements

| Job Type | Purpose | Priority |
|----------|---------|----------|
| `DELIVERY_TIMEOUT` | Auto-fail long-stalled deliveries | MEDIUM |
| `EARNINGS_FINALIZATION` | Finalize earnings after completion | LOW (can be synchronous) |

### Existing Infrastructure

- `claim_next_pending_job()` — FOR UPDATE SKIP LOCKED ✅
- `processPendingJobs()` — Batch processor ✅
- `registerJobHandler()` — Handler registration ✅

---

## 12. REALTIME / TRACKING HANDOFF

### Phase 2 Architecture (Already Implemented)

- Server-side Broadcast channels
- Channel: `delivery:{order_id}`
- No table publication of rider_current_locations
- Customer authorization: Phase 5 requirement

### Phase 4 Interaction

| Event | Broadcast Action |
|-------|-----------------|
| Rider starts delivery | Begin location broadcast to `delivery:{order_id}` |
| Delivery completed | Stop location broadcast |
| Order cancelled | Stop location broadcast |
| Rider reassigned | Update broadcast association |

**Phase 4 must NOT implement customer tracking UI.** It must establish the data flow that Phase 5 consumes.

---

## 13. CONCURRENCY / IDEMPOTENCY

| Scenario | Risk | Protection Required |
|----------|------|---------------------|
| Duplicate start request | MEDIUM | Status check (rider_assigned → rider_en_route_to_pickup) |
| Duplicate pickup confirmation | MEDIUM | Status check |
| Duplicate completion | HIGH | Status check + row lock |
| Concurrent completion | HIGH | Atomic PostgreSQL function |
| Completion vs cancellation | HIGH | Mutual exclusion |
| Proof submission twice | LOW | Idempotent insert |
| Proof after completion | LOW | Status check |
| Rider active on another order | HIGH | Unique partial index (already exists) |
| Customer cancellation during delivery | MEDIUM | Status check |

---

## 14. MOBILE API COMPATIBILITY

All proposed Phase 4 APIs are:
- RESTful JSON endpoints
- Authentication via Supabase Auth
- No React/Next.js dependencies
- No browser-specific behavior
- Same backend APIs for web and future mobile

**Compatible with React Native/Expo.** ✅

---

## 15. OBSERVABILITY

### Required Events

| Event | Type | Metadata |
|-------|------|----------|
| delivery_started | order_events | rider_id, timestamp |
| pickup_confirmed | order_events | rider_id, timestamp, gps |
| rider_arrived_destination | order_events | rider_id, timestamp |
| proof_submitted | order_events | rider_id, proof_type, proof_id |
| delivery_completed | order_events | rider_id, timestamp, duration |
| earnings_finalized | order_events | rider_id, amount, commission |
| invalid_transition | order_events | from_state, to_state, reason |
| unauthorized_transition | order_events | actor_id, reason |

---

## 16. SCALE REVIEW

| Metric | MVP (100 riders) | Growth (1K riders) | Scale (10K+ riders) |
|--------|------------------|--------------------|--------------------|
| Active assignments | 50 | 500 | 5,000 |
| Proof uploads/day | 100 | 1,000 | 10,000 |
| Ledger entries/day | 100 | 1,000 | 10,000 |
| Storage (proofs) | ~50MB/day | ~500MB/day | ~5GB/day |

**PostgreSQL + Supabase Storage is sufficient for MVP through growth.** Scale triggers:
- Storage: Consider CDN at 10K+ proofs/day
- Ledger: Consider partitioning at 1M+ entries
- Active assignments: Consider dedicated query at 10K+ concurrent

---

## 17. PRODUCT DECISIONS

| Decision | Question | Recommended Default | Implementation Consequence |
|----------|----------|---------------------|---------------------------|
| Proof requirements | What proof is required? | Photo + recipient name | Minimal proof flow |
| Signature requirement | Should signature be required? | No (MVP) | Simpler proof submission |
| PIN requirement | Should PIN be required? | No (MVP) | Simpler proof flow |
| Cancellation fees | Should cancellation incur fees? | No (MVP) | No payment reversal logic |
| Failed delivery | What happens on failure? | Mark failed, notify customer | Dispute flow deferred |
| Earnings timing | When are earnings finalized? | Immediately on completion | Real-time balance updates |
| Payout frequency | How often are payouts? | Deferred to later milestone | No payout processing in Phase 4 |

---

## 18. IMPLEMENTATION SCOPE

### Phase 4A — Active Delivery Workflow (CRITICAL)

**Objective:** Enable rider to progress through delivery states

| Component | Type | Count |
|-----------|------|-------|
| PostgreSQL function | `transition_order_state()` | 1 |
| Service | `active-delivery.service.ts` | 1 |
| API routes | start/arrive-pickup/confirm-pickup/arrive-destination/complete | 5 |
| Tests | State transition tests | 10+ |

### Phase 4B — Proof of Delivery (CRITICAL)

**Objective:** Enable rider to submit delivery proof

| Component | Type | Count |
|-----------|------|-------|
| Storage bucket | `delivery-proofs` | 1 |
| Storage policies | Upload/read access | 3 |
| Service | `delivery-proof.service.ts` | 1 |
| API routes | submit-proof | 1 |
| Tests | Proof validation tests | 5+ |

### Phase 4C — Earnings (HIGH)

**Objective:** Calculate and record rider earnings

| Component | Type | Count |
|-----------|------|-------|
| PostgreSQL function | `calculate_rider_earnings()` | 1 |
| Service | `earnings.service.ts` | 1 |
| API routes | earnings/history | 2 |
| Tests | Earnings calculation tests | 5+ |

### Phase 4D — Cancellation & Failure (MEDIUM)

**Objective:** Handle rider/customer cancellation and failed delivery

| Component | Type | Count |
|-----------|------|-------|
| API routes | cancel | 1 |
| Service | Cancellation logic in active-delivery.service.ts | — |
| Tests | Cancellation tests | 5+ |

---

## 19. GO / NO-GO

| Area | Status |
|------|--------|
| Architecture readiness | ✅ GO |
| Database readiness | ✅ GO — all tables exist |
| Application readiness | ✅ GO — well-scoped implementation |
| Security readiness | ✅ GO — RLS policies exist |
| Concurrency readiness | ✅ GO — unique indexes exist |
| Storage readiness | ⚠️ BLOCKED — buckets need creation |
| Product decision blockers | ✅ NONE — defaults are clear |

### RECOMMENDATION: GO — READY FOR ARCHITECTURE REVIEW

---

## 20. EXPLICIT "NOT IMPLEMENTED" SECTION

The following are **NOT implemented** and must NOT be claimed as existing:

1. ❌ Active delivery state transition functions
2. ❌ Delivery completion atomic operation
3. ❌ Proof submission API
4. ❌ Storage buckets for delivery proofs
5. ❌ Earnings calculation logic
6. ❌ Ledger entry creation
7. ❌ Payout processing
8. ❌ Customer tracking UI
9. ❌ Rider active delivery dashboard
10. ❌ Cancellation fee logic
11. ❌ Failed delivery retry logic
12. ❌ Delivery timeout detection
13. ❌ Realtime tracking broadcast (data exists, broadcast not triggered)

---

*MBEENEXUS — Phase 4 Discovery Report — August 23, 2026*
