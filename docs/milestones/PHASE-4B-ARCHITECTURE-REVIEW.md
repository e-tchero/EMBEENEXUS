# PHASE 4B — ARCHITECTURE REVIEW

## Active Delivery, Proof of Delivery & Earnings

**Date:** August 23, 2026
**Baseline:** Phase 4A commit `963fbebae8f5695b9d1d036739902f596b4d1038`
**Status:** Architecture Review Complete

---

## 1. Executive Summary

Phase 4A implemented the core earnings logic inside `complete_delivery()`. Phase 4B scope is narrowly defined: expose the earnings data that already exists through read APIs and fix the `cached_total_earnings` / `total_deliveries` update gap.

**Key Finding:** The `complete_delivery()` function creates earnings ledger entries but does NOT update `rider_profiles.cached_total_earnings` or `rider_profiles.total_deliveries`. This must be fixed before Phase 4B APIs can display accurate rider summaries.

---

## 2. Verified Phase 4A Financial Foundation

### 2.1 Earnings Ledger (EXISTS)

**Table:** `earnings_ledger`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| rider_id | UUID | Rider who earned |
| order_id | UUID | Delivery that generated the earning |
| credit | DECIMAL(12,2) | Amount credited (positive) |
| debit | DECIMAL(12,2) | Amount debited (negative) |
| balance_after | DECIMAL(12,2) | Running balance |
| description | TEXT | Human-readable description |
| reference_type | TEXT | 'delivery', 'payout', 'adjustment', 'refund' |
| reference_id | UUID | Related payout/adjustment ID |
| created_at | TIMESTAMPTZ | Creation timestamp |

**Indexes:**
- `idx_earnings_ledger_rider` on (rider_id)
- `idx_earnings_ledger_order` on (order_id)
- `idx_earnings_ledger_created` on (created_at DESC)
- `idx_earnings_ledger_order_delivery` UNIQUE on (order_id) WHERE reference_type = 'delivery'

### 2.2 Payouts (EXISTS, NOT USED)

**Table:** `payouts`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| rider_id | UUID | Rider receiving payout |
| recipient_id | UUID | Payout recipient account |
| amount | DECIMAL(12,2) | Payout amount |
| currency | TEXT | Default 'NGN' |
| status | TEXT | 'pending', 'processing', 'success', 'failed' |
| paystack_transfer_id | TEXT | Paystack transfer reference |
| processed_at | TIMESTAMPTZ | Processing timestamp |
| failed_reason | TEXT | Failure reason |
| metadata | JSONB | Additional data |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update |

### 2.3 Rider Profile Caches (EXISTS, NOT UPDATED)

**Table:** `rider_profiles`

| Column | Type | Current Value | Status |
|--------|------|---------------|--------|
| cached_total_earnings | DECIMAL(12,2) | 0.00 | **NOT UPDATED** |
| total_deliveries | INTEGER | 0 | **NOT UPDATED** |

### 2.4 Commission Configuration (EXISTS)

**Table:** `platform_settings`

| Key | Value | Description |
|-----|-------|-------------|
| platform_commission_rate | `{"rate": 0.15}` | 15% platform commission |

---

## 3. Phase 4B Scope Boundary

### 3.1 IN SCOPE

| Component | Status | Action Required |
|-----------|--------|-----------------|
| Earnings calculation | ✅ DONE (Phase 4A) | None |
| Idempotency | ✅ DONE (Phase 4A) | None |
| Unique index | ✅ DONE (Phase 4A) | None |
| cached_total_earnings update | ❌ MISSING | Fix in complete_delivery() |
| total_deliveries update | ❌ MISSING | Fix in complete_delivery() |
| balance_after calculation | ⚠️ INCORRECT | Fix to be running balance |
| Rider earnings read API | ❌ MISSING | Create |
| Rider earnings history API | ❌ MISSING | Create |
| Rider earnings summary | ❌ MISSING | Create |
| Admin earnings visibility | ❌ MISSING | Create (if required) |

### 3.2 OUT OF SCOPE (DEFERRED)

| Component | Reason |
|-----------|--------|
| Payout execution | Deferred to later milestone |
| Bank transfer | Deferred to later milestone |
| Payout scheduling | Deferred to later milestone |
| Automatic withdrawals | Deferred to later milestone |
| Refund processing | Deferred to later milestone |

---

## 4. Canonical Financial Data Model

### 4.1 Source of Truth

```
earnings_ledger = AUTHORITATIVE financial ledger
rider_profiles.cached_total_earnings = DERIVED cache (must match ledger sum)
rider_profiles.total_deliveries = DERIVED cache (must match ledger count)
```

### 4.2 Financial Calculation Flow

```
Customer pays order.total_amount
    ↓
complete_delivery() reads platform_commission_rate
    ↓
platform_commission = total_amount × commission_rate
rider_earning = total_amount - platform_commission
    ↓
INSERT INTO earnings_ledger (credit = rider_earning)
    ↓
UPDATE rider_profiles SET cached_total_earnings += rider_earning
UPDATE rider_profiles SET total_deliveries += 1
```

### 4.3 Balance Calculation

The `balance_after` field must be the running balance for the rider:

```sql
-- For first entry:
balance_after = credit

-- For subsequent entries:
balance_after = (previous balance_after) + credit - debit
```

**Current Bug:** `complete_delivery()` sets `balance_after = credit` (just the credit amount, not running balance).

---

## 5. Earnings Read Architecture

### 5.1 API Endpoints

#### GET /api/riders/earnings

**Purpose:** Get rider's earnings history with pagination

**Authentication:** Required (Supabase JWT)
**Authorization:** Rider can only read own earnings

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)
- `reference_type` (optional filter: 'delivery', 'payout', 'adjustment', 'refund')

**Response:**
```json
{
  "earnings": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "order_number": "MBE-2026-001",
      "credit": 850.00,
      "debit": 0,
      "balance_after": 850.00,
      "description": "Delivery earnings for order MBE-2026-001",
      "reference_type": "delivery",
      "created_at": "2026-08-23T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "total_pages": 1
  }
}
```

#### GET /api/riders/earnings/summary

**Purpose:** Get rider's earnings summary

**Authentication:** Required (Supabase JWT)
**Authorization:** Rider can only read own summary

**Response:**
```json
{
  "total_earnings": 12500.00,
  "total_deliveries": 15,
  "pending_payout": 12500.00,
  "paid_out": 0.00,
  "currency": "NGN"
}
```

### 5.2 Query Patterns

**Earnings History:**
```sql
SELECT el.*, o.order_number
FROM earnings_ledger el
LEFT JOIN orders o ON o.id = el.order_id
WHERE el.rider_id = $1
  AND ($2::text IS NULL OR el.reference_type = $2)
ORDER BY el.created_at DESC
LIMIT $3 OFFSET $4;
```

**Earnings Summary:**
```sql
SELECT
  COALESCE(SUM(credit), 0) as total_earnings,
  COALESCE(SUM(debit), 0) as total_debits,
  COUNT(*) FILTER (WHERE reference_type = 'delivery') as total_deliveries
FROM earnings_ledger
WHERE rider_id = $1;
```

---

## 6. Rider Summary Architecture

### 6.1 Cached Values

The `rider_profiles.cached_total_earnings` and `rider_profiles.total_deliveries` should be updated:

**Option A: Update in complete_delivery()** (RECOMMENDED)
- Atomic with earnings creation
- Always consistent
- No background job needed

**Option B: Background aggregation job**
- More complex
- Potential for stale data
- Only needed for high-write scenarios

**Decision:** Option A — Update in `complete_delivery()` since earnings are created there.

### 6.2 Update Logic

```sql
-- After INSERT INTO earnings_ledger:
UPDATE rider_profiles
SET cached_total_earnings = (
  SELECT COALESCE(SUM(credit) - SUM(debit), 0)
  FROM earnings_ledger
  WHERE rider_id = v_caller_id
),
total_deliveries = (
  SELECT COUNT(*)
  FROM earnings_ledger
  WHERE rider_id = v_caller_id
    AND reference_type = 'delivery'
),
updated_at = NOW()
WHERE id = v_caller_id;
```

---

## 7. cached_total_earnings Analysis

### 7.1 Current State

| Property | Value |
|----------|-------|
| Column exists | ✅ Yes |
| Type | DECIMAL(12,2) |
| Default | 0.00 |
| Currently updated by | **NOTHING** |
| Current value (all riders) | 0.00 |
| Architectural role | Derived cache |

### 7.2 Consistency Requirement

`cached_total_earnings` MUST equal:
```sql
SELECT COALESCE(SUM(credit) - SUM(debit), 0)
FROM earnings_ledger
WHERE rider_id = <rider_id>;
```

### 7.3 Implementation Decision

Update `cached_total_earnings` inside `complete_delivery()` after the earnings ledger insert. This ensures:
1. Atomicity with earnings creation
2. No separate background job needed
3. Always consistent with ledger

---

## 8. RLS/Security Model

### 8.1 Existing RLS Policies (VERIFIED LIVE)

**earnings_ledger:**
- `earnings_ledger_select_own`: Rider can SELECT where rider_id = auth.uid()
- `earnings_ledger_select_admin`: Admin/super_admin can SELECT all

**payouts:**
- `payouts_select_rider`: Rider can SELECT where rider_id = auth.uid()
- `payouts_select_admin`: Admin/super_admin can SELECT all

**payout_recipients:**
- `payout_recipients_select_own`: Rider can SELECT where rider_id = auth.uid()
- `payout_recipients_insert_own`: Rider can INSERT where rider_id = auth.uid()
- `payout_recipients_select_admin`: Admin/super_admin can SELECT all

### 8.2 Security Analysis

| Operation | Authorized Actor | RLS Enforced |
|-----------|------------------|--------------|
| Read own earnings | Rider | ✅ Yes |
| Read other rider's earnings | Admin only | ✅ Yes |
| Create earnings | Server (SECURITY DEFINER) | ✅ Yes |
| Modify earnings | Nobody (immutable) | ✅ Yes |
| Read own payouts | Rider | ✅ Yes |
| Create payout | Deferred | N/A |

### 8.3 API Authorization

All earnings APIs must:
1. Verify JWT authentication
2. Derive rider_id from auth.uid()
3. Never accept rider_id from client
4. Use service-role client for database queries (bypasses RLS for performance)

---

## 9. API Specification

### 9.1 GET /api/riders/earnings

**File:** `apps/web/app/api/riders/earnings/route.ts`

**Authentication:** Required
**Authorization:** Rider only (own earnings)

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| page | integer | 1 | - | Page number |
| limit | integer | 20 | 100 | Items per page |
| reference_type | string | null | - | Filter by type |

**Response 200:**
```json
{
  "earnings": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "total_pages": 1
  }
}
```

**Response 401:** Authentication required
**Response 403:** Not authorized
**Response 500:** Internal server error

### 9.2 GET /api/riders/earnings/summary

**File:** `apps/web/app/api/riders/earnings/summary/route.ts`

**Authentication:** Required
**Authorization:** Rider only (own summary)

**Response 200:**
```json
{
  "total_earnings": 12500.00,
  "total_deliveries": 15,
  "pending_payout": 12500.00,
  "paid_out": 0.00,
  "currency": "NGN"
}
```

**Response 401:** Authentication required
**Response 403:** Not authorized
**Response 500:** Internal server error

---

## 10. Query/Index Requirements

### 10.1 Existing Indexes (SUFFICIENT)

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| idx_earnings_ledger_rider | earnings_ledger | rider_id | Rider earnings query |
| idx_earnings_ledger_order | earnings_ledger | order_id | Order lookup |
| idx_earnings_ledger_created | earnings_ledger | created_at DESC | Sorting |
| idx_earnings_ledger_order_delivery | earnings_ledger | order_id WHERE reference_type='delivery' | Idempotency |

### 10.2 New Indexes Required

**None.** The existing indexes support the required query patterns:
- Rider earnings history: `WHERE rider_id = $1 ORDER BY created_at DESC`
- Earnings summary: `WHERE rider_id = $1` with aggregate

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Test | Expected Result |
|------|-----------------|
| Rider reads own earnings | Success |
| Rider cannot read other rider's earnings | 403/empty |
| Empty earnings history | Empty array |
| Pagination works correctly | Correct page/limit |
| Summary calculates correctly | Matches ledger sum |
| Concurrent completion visibility | Both entries visible |

### 11.2 Integration Tests

| Test | Expected Result |
|------|-----------------|
| Earnings created on delivery completion | Ledger entry exists |
| cached_total_earnings updated | Rider profile updated |
| total_deliveries incremented | Count matches |
| Duplicate completion no duplicate earnings | Idempotent |

### 11.3 Security Tests

| Test | Expected Result |
|------|-----------------|
| Unauthenticated request | 401 |
| Wrong rider access | Empty/403 |
| Admin access all earnings | Success |

---

## 12. Observability

### 12.1 Structured Events

| Event | When | Data |
|-------|------|------|
| earnings_read | API called | rider_id, page, limit |
| earnings_summary_read | API called | rider_id |
| earnings_created | Delivery completed | rider_id, order_id, amount |
| earnings_authorization_denied | Wrong rider | rider_id, attempted_order_id |

### 12.2 Logging Rules

**DO NOT log:**
- Exact earnings amounts (use rider_id + order_id only)
- Commission rates
- Financial calculations
- Payout details

---

## 13. Deferred Payout Architecture

### 13.1 Future Payout Flow

```
earnings_ledger (authoritative)
    ↓
rider_profiles.cached_total_earnings (cache)
    ↓
payout request (future)
    ↓
payout execution (Paystack transfer)
    ↓
payout record in payouts table
    ↓
debit entry in earnings_ledger
```

### 13.2 Phase 4B Boundary

Phase 4B implements:
- ✅ Earnings read API
- ✅ Earnings summary
- ✅ cached_total_earnings update
- ❌ Payout request (deferred)
- ❌ Payout execution (deferred)

---

## 14. Product Decisions Requiring Approval

### 14.1 Pending Decisions

| Decision | Current Value | Options | Recommendation |
|----------|---------------|---------|----------------|
| Commission rate | 15% (DB config) | Any decimal | Keep DB-configurable |
| Payout frequency | Deferred | Per-delivery, daily, weekly | Defer to later |
| Payout minimum | Deferred | Any amount | Defer to later |
| Cancellation earnings | None | Partial/full | Keep none for MVP |
| Refund treatment | Deferred | Various | Defer to later |

### 14.2 Approved MVP Defaults

| Decision | Value | Source |
|----------|-------|--------|
| Platform commission | 15% | platform_settings |
| Rider earnings | 85% of order total | Derived from commission |
| Payout execution | Deferred | Phase 4B scope |
| Earnings calculation | Server-authoritative | complete_delivery() |

---

## 15. Implementation Sequence

### 15.1 Step 1: Fix complete_delivery() (DATABASE MIGRATION)

**File:** `supabase/migrations/YYYYMMDDHHMMSS_phase4b_earnings_fix.sql`

**Changes:**
1. Add `cached_total_earnings` update after earnings ledger insert
2. Add `total_deliveries` update after earnings ledger insert
3. Fix `balance_after` to be running balance (not just credit)

### 15.2 Step 2: Earnings Service

**File:** `apps/web/lib/services/earnings.service.ts`

**Methods:**
- `getEarningsHistory(riderId, page, limit, referenceType?)`
- `getEarningsSummary(riderId)`

### 15.3 Step 3: Earnings APIs

**Files:**
- `apps/web/app/api/riders/earnings/route.ts`
- `apps/web/app/api/riders/earnings/summary/route.ts`

### 15.4 Step 4: Tests

**File:** `packages/shared/validators/earnings.test.ts`

### 15.5 Step 5: Migration Sync

Copy migration to `packages/database/migrations/`

---

## 16. Risks and Mitigations

### 16.1 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| cached_total_earnings out of sync | HIGH | Update atomically in complete_delivery() |
| balance_after incorrect | MEDIUM | Calculate running balance from ledger |
| RLS allows cross-rider access | LOW | Existing RLS verified correct |
| API performance on large histories | LOW | Pagination + indexes |
| Commission rate changes mid-delivery | LOW | Rate read at completion time |

### 16.2 Migration Safety

- No destructive changes
- No data loss
- Additive only (new update logic)
- Backward compatible

---

## 17. GO/NO-GO Recommendation

### GO Conditions Met

| Condition | Status |
|-----------|--------|
| Security architecture sound | ✅ |
| RLS policies correct | ✅ |
| Financial model correct | ✅ |
| Idempotency guaranteed | ✅ |
| No breaking changes | ✅ |
| Backward compatible | ✅ |
| Migration safe | ✅ |
| Test coverage adequate | ✅ |

### Recommendation

**ARCHITECTURE REVIEW COMPLETE — READY FOR IMPLEMENTATION AUTHORIZATION**

Phase 4B scope is well-defined and minimal:
1. Fix cached_total_earnings update
2. Fix total_deliveries update
3. Fix balance_after calculation
4. Add earnings read API
5. Add earnings summary API

No blockers identified.

---

## 18. Files to Create/Modify

### 18.1 New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_phase4b_earnings_fix.sql` | Database migration |
| `packages/database/migrations/YYYYMMDD_phase4b_earnings_fix.sql` | Synced migration |
| `apps/web/lib/services/earnings.service.ts` | Earnings service |
| `apps/web/app/api/riders/earnings/route.ts` | Earnings history API |
| `apps/web/app/api/riders/earnings/summary/route.ts` | Earnings summary API |
| `packages/shared/validators/earnings.test.ts` | Tests |

### 18.2 Modified Files

| File | Change |
|------|--------|
| `supabase/migrations/20260823050000_phase4a_delivery.sql` | Update complete_delivery() function |

---

**END OF ARCHITECTURE REVIEW**
