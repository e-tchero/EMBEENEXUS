# PHASE 4C — IMPLEMENTATION REPORT

## CANCELLATION, DELIVERY FAILURE & REFUND PROCESSING

**Baseline:** Phase 4B commit `7514a54978c9c058e38d6921db0404f7b8bd1964`

---

## 1. FILES CREATED

| File | Purpose |
|------|---------|
| `supabase/migrations/20260823070000_phase4c_cancellation_refund.sql` | Database migration |
| `packages/database/migrations/20260823070000_phase4c_cancellation_refund.sql` | Synced migration copy |
| `apps/web/lib/services/refund.service.ts` | Refund processing service |
| `apps/web/app/api/orders/[id]/cancel/route.ts` | Customer cancellation API |
| `apps/web/app/api/orders/[id]/refund/route.ts` | Refund status API |
| `apps/web/app/api/riders/deliveries/[orderId]/fail/route.ts` | Rider failure API |
| `packages/shared/validators/cancellation-refund.test.ts` | 73 new tests |
| `docs/milestones/PHASE-4C-ARCHITECTURE-REVIEW.md` | Architecture review |
| `docs/milestones/PHASE-4C-DISCOVERY-REPORT.md` | Discovery report |

## 2. FILES MODIFIED

| File | Change |
|------|--------|
| `apps/web/app/api/webhooks/paystack/route.ts` | Store Paystack transaction ID on payment record |
| `apps/web/app/api/cron/process-jobs/route.ts` | Register REFUND_PROCESS job handler |

## 3. DATABASE CHANGES

### 3.1 New Columns
- `payments.paystack_transaction_id TEXT` — stores Paystack transaction ID for refund processing

### 3.2 New Indexes
- `idx_payments_paystack_txn` — on `payments(paystack_transaction_id)`
- `idx_refunds_one_pending_per_order` — UNIQUE INDEX on `refunds(order_id)` WHERE `status IN ('pending', 'processing')`

### 3.3 New Functions
- `fail_delivery(UUID, TEXT, TEXT)` — SECURITY DEFINER, rider-reported delivery failure

### 3.4 Modified Functions
- `cancel_order(UUID, TEXT, TEXT)` — now creates refund record and REFUND_PROCESS background job when payment was captured
- `transition_order_status(UUID, TEXT, TEXT, TEXT)` — updated to handle `failed` state transitions for riders

### 3.5 New Platform Settings
- `cancellation_refund_enabled` — toggle refund on cancellation
- `cancellation_refund_before_dispatch` — refund before rider dispatch
- `cancellation_refund_after_dispatch` — refund after rider dispatch

## 4. API ROUTES

| Method | Route | Actor | Purpose |
|--------|-------|-------|---------|
| POST | `/api/orders/[id]/cancel` | Customer | Cancel order with refund |
| POST | `/api/riders/deliveries/[orderId]/fail` | Rider | Report delivery failure |
| GET | `/api/orders/[id]/refund` | Customer | Read refund status |

## 5. STATE TRANSITIONS

### 5.1 Customer Cancellation
```
paid → cancelled → refunded (if refund successful)
searching_rider → cancelled
```

### 5.2 Rider Cancellation (existing, unchanged)
```
rider_assigned → cancelled
rider_en_route_to_pickup → cancelled
arrived_at_pickup → cancelled
```

### 5.3 Rider Failure (new)
```
rider_assigned → failed
rider_en_route_to_pickup → failed
arrived_at_pickup → failed
picked_up → failed
in_transit → failed
arrived_at_destination → failed
```

### 5.4 Refund Processing
```
cancelled + refund pending → refunded (via REFUND_PROCESS job)
```

## 6. REFUND LIFECYCLE

```
1. Customer cancels order
2. cancel_order() creates refunds record (status='pending')
3. cancel_order() creates REFUND_PROCESS background job
4. REFUND_PROCESS job is claimed atomically (FOR UPDATE SKIP LOCKED)
5. Handler updates refund status to 'processing'
6. Handler calls Paystack Refund API
7. On success: refund → 'success', payment → 'refunded', order → 'refunded'
8. On failure: refund → 'failed', order remains 'cancelled'
```

## 7. CONCURRENCY PROTECTIONS

| Protection | Mechanism |
|------------|-----------|
| Order row locking | `SELECT ... FOR UPDATE` in cancel_order(), fail_delivery(), transition_order_status() |
| Duplicate refund prevention | UNIQUE INDEX on refunds(order_id) WHERE status IN ('pending','processing') |
| Job claiming | `FOR UPDATE SKIP LOCKED` via claim_next_pending_job() |
| Refund idempotency | Status check before processing — skip if already 'success' or 'failed' |
| Webhook idempotency | processed_webhook_events table |

## 8. SECURITY MODEL

| Check | Implementation |
|-------|----------------|
| Customer authorization | `auth.uid()` must equal `orders.customer_id` |
| Rider authorization | `auth.uid()` must equal `orders.assigned_rider_id` |
| Admin authorization | `get_user_role()` must include admin role |
| SECURE search_path | All functions use `SET search_path = public` |
| Protected financial fields | Refund amount from `payments.amount` (server-authoritative) |
| No client-controlled amounts | Refund amount never accepted from client |
| RLS preserved | All existing policies unchanged |

## 9. BACKGROUND JOBS

| Job Type | Handler | Retry | Max Attempts |
|----------|---------|-------|--------------|
| REFUND_PROCESS | `refundService.processRefundJob()` | Exponential backoff | 3 |

## 10. TESTS

### 10.1 Test Count
- **Previous baseline:** 148/148 PASS
- **New tests:** 73
- **Current total:** 221/221 PASS

### 10.2 Test Coverage

| Category | Tests |
|----------|-------|
| Failure type validation | 2 |
| Cancellation state window | 8 |
| Failure state window | 7 |
| State transition matrix | 11 |
| Refund amount calculation | 4 |
| Paystack transaction identifier | 4 |
| Refund status transitions | 5 |
| Background job payload | 2 |
| Order status after cancellation | 3 |
| Idempotency | 5 |
| Authorization | 7 |
| Cancel_order return type | 2 |
| Refund service idempotency | 4 |
| Payment webhook integration | 2 |
| Regression: Phase 1-4B | 6 |
| **Total** | **73** |

## 11. VERIFICATION RESULTS

| Check | Result |
|-------|--------|
| Typecheck | ✅ PASS |
| Unit tests | ✅ 221/221 PASS |
| Secrets scan | ✅ CLEAN (no hardcoded secrets) |
| Attribution scan | ✅ ZERO prohibited references |
| Migration sync | ✅ IDENTICAL |
| Git history | ✅ Phase 1-4B untouched |

### Build Note
Production build encountered a Turbopack internal error (`Expected to inject all imports, missing incrementalCacheHandler in template`). This is a pre-existing environment issue unrelated to Phase 4C changes. Typecheck passes cleanly.

## 12. LIMITATIONS / BLOCKERS

| Item | Severity | Description |
|------|----------|-------------|
| Live database migration | BLOCKED | Migration not yet applied to live database |
| Production build | BLOCKED | Turbopack internal error (pre-existing) |
| Partial refunds | DEFERRED | MVP = full refund only |
| Cancellation fees | DEFERRED | MVP = no fees |
| Earnings clawback | NOT NEEDED | State restrictions prevent post-delivery cancellation |
| Notifications | DEFERRED | Phase 5+ |

## 13. GIT STATUS

```
?? apps/web/app/api/orders/[id]/cancel/
?? apps/web/app/api/orders/[id]/refund/
?? apps/web/app/api/riders/deliveries/[orderId]/fail/
?? apps/web/lib/services/refund.service.ts
?? packages/database/migrations/20260823070000_phase4c_cancellation_refund.sql
?? packages/shared/validators/cancellation-refund.test.ts
?? supabase/migrations/20260823070000_phase4c_cancellation_refund.sql
?? docs/milestones/PHASE-4C-ARCHITECTURE-REVIEW.md
?? docs/milestones/PHASE-4C-DISCOVERY-REPORT.md
 M apps/web/app/api/cron/process-jobs/route.ts
 M apps/web/app/api/webhooks/paystack/route.ts
```

- **New files:** 9
- **Modified files:** 2
- **Phase 1-4B commits:** Untouched
- **Not committed yet**

---

## RECOMMENDATION

**PHASE 4C IMPLEMENTATION COMPLETE — AWAITING LIVE DATABASE VERIFICATION AND COMMIT AUTHORIZATION**

Standing by, Major.
