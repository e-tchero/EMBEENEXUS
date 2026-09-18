# PHASE 4B — DISCOVERY REPORT

## EARNINGS

---

## 1. EXECUTIVE SUMMARY

Phase 4B focuses on the earnings subsystem. The good news: **Phase 4A already implemented the core earnings logic** inside `complete_delivery()`. The earnings calculation, idempotency check, and ledger entry creation are already in place and live.

Phase 4B scope is therefore narrower than initially anticipated:
- Earnings read APIs (rider dashboard)
- Earnings aggregation/background job
- Payout request workflow (if authorized)
- Rider earnings balance display

---

## 2. REPOSITORY BASELINE

| Item | Status |
|------|--------|
| HEAD | `963fbeb` feat(milestone-3-phase4a) |
| Working tree | ✅ Clean |
| Phase 1-3 | ✅ Intact |
| Unrelated changes | ✅ None |

---

## 3. LIVE DATABASE INVENTORY

### 3.1 earnings_ledger

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| rider_id | UUID FK → rider_profiles | Rider |
| order_id | UUID FK → orders | Order |
| credit | DECIMAL(12,2) | Credit amount |
| debit | DECIMAL(12,2) | Debit amount |
| balance_after | DECIMAL(12,2) | Running balance |
| description | TEXT | Human-readable |
| reference_type | TEXT | 'delivery', 'payout', etc. |
| reference_id | UUID | Reference ID |
| created_at | TIMESTAMPTZ | Creation time |

**Row count:** 0 (empty)

**Indexes:**
- `idx_earnings_ledger_rider` ON (rider_id)
- `idx_earnings_ledger_order` ON (order_id)
- `idx_earnings_ledger_created` ON (created_at DESC)
- `idx_earnings_ledger_order_delivery` UNIQUE ON (order_id) WHERE reference_type = 'delivery' ✅

**RLS:** Enabled, SELECT for rider own + admin

**Grants:** SELECT to anon/authenticated, INSERT to service_role only

### 3.2 payouts

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| rider_id | UUID FK → rider_profiles | Rider |
| recipient_id | UUID FK → payout_recipients | Payment recipient |
| amount | DECIMAL(12,2) | Payout amount |
| currency | TEXT | Default 'NGN' |
| status | TEXT CHECK | pending/processing/success/failed |
| paystack_transfer_id | TEXT | Paystack reference |
| processed_at | TIMESTAMPTZ | When processed |
| failed_reason | TEXT | Failure reason |
| metadata | JSONB | Additional data |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Row count:** 0 (empty)

**RLS:** Enabled, SELECT for rider own + admin

### 3.3 payout_recipients

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| rider_id | UUID FK → rider_profiles | Rider |
| paystack_recipient_code | TEXT | Paystack code |
| bank_name | TEXT | Bank name |
| account_number_last4 | TEXT | Last 4 digits |
| account_name | TEXT | Account holder name |
| is_active | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Row count:** 0 (empty)

### 3.4 rider_profiles (earnings-related)

| Column | Type | Notes |
|--------|------|-------|
| cached_total_earnings | DECIMAL(12,2) | Cached balance |
| total_deliveries | INTEGER | Delivery count |

**Current values:** All 0 (no riders with deliveries yet)

---

## 4. EXISTING EARNINGS ARCHITECTURE

### 4.1 What Already Exists (Phase 4A)

**complete_delivery()** function already:
1. Reads commission rate from `platform_settings.platform_commission_rate`
2. Calculates `platform_commission = total_amount * commission_rate`
3. Calculates `rider_earning = total_amount - platform_commission`
4. Checks for existing earnings (idempotency)
5. Inserts into `earnings_ledger` with `reference_type = 'delivery'`
6. Uses `UNIQUE INDEX` on `(order_id) WHERE reference_type = 'delivery'`

**Financial flow:**
```
Customer pays total_amount (immutable, set at order creation)
  → complete_delivery() called
    → Reads commission_rate from platform_settings (default 0.15)
    → platform_commission = total_amount × commission_rate
    → rider_earning = total_amount - platform_commission
    → INSERT INTO earnings_ledger (credit = rider_earning)
    → UNIQUE INDEX prevents duplicate
```

### 4.2 What Does NOT Exist

| Component | Status |
|-----------|--------|
| Earnings read API | ❌ Missing |
| Earnings summary/aggregation | ❌ Missing |
| Rider balance endpoint | ❌ Missing |
| Payout request API | ❌ Missing |
| Payout execution | ❌ Missing |
| Payout recipient management | ❌ Missing |
| Background earnings aggregation | ❌ Missing |
| Rider earnings UI | ❌ Missing |
| Admin earnings view | ❌ Missing |

---

## 5. FINANCIAL CALCULATION FLOW

### 5.1 Commission Model

```
platform_settings.platform_commission_rate = {"rate": 0.15}
```

- **Type:** Database-configurable
- **Default:** 15%
- **Basis:** Gross order total (total_amount)
- **Not hardcoded:** Commission reads from platform_settings with COALESCE fallback

### 5.2 Calculation Example

```
Order total_amount = ₦1,010.50
Commission rate = 0.15 (15%)
Platform commission = ₦1,010.50 × 0.15 = ₦151.575
Rider earnings = ₦1,010.50 - ₦151.575 = ₦858.925
```

### 5.3 DECIMAL Precision

- `total_amount`: DECIMAL(12,2)
- `credit`: DECIMAL(12,2)
- `debit`: DECIMAL(12,2)
- `balance_after`: DECIMAL(12,2)

**Rounding:** PostgreSQL DECIMAL(12,2) rounds to 2 decimal places automatically.

### 5.4 What's NOT Calculated

| Item | Status |
|------|--------|
| Payment processing fees | ❌ Not calculated (Paystack fees) |
| VAT/tax treatment | ❌ Not separated (included in total_amount) |
| Cancellation fees | ❌ 0 for MVP |
| Bonuses/incentives | ❌ Not implemented |
| Refund interaction | ❌ Not implemented |

---

## 6. IDEMPOTENCY / CONCURRENCY AUDIT

### 6.1 Duplicate Earnings Prevention

| Mechanism | Layer | Status |
|-----------|-------|--------|
| UNIQUE INDEX on (order_id) WHERE reference_type='delivery' | Database | ✅ Live |
| Application check before insert | complete_delivery() | ✅ Live |
| Atomic transaction | complete_delivery() | ✅ Live |
| Row-level lock (FOR UPDATE) | complete_delivery() | ✅ Live |

**Tested:** Duplicate insert rejected with unique violation error.

### 6.2 Remaining Risks

| Risk | Severity | Status |
|------|----------|--------|
| Duplicate earnings from different reference_types | LOW | UNIQUE INDEX only covers 'delivery' |
| cached_total_earnings not updated | MEDIUM | No trigger/application logic updates this |
| balance_after is first entry only | LOW | First entry balance = credit (no prior balance) |
| Cancellation earnings | LOW | No earnings created on cancellation (correct) |

---

## 7. SECURITY / RLS AUDIT

### 7.1 Earnings Access

| Operation | Rider | Customer | Admin | Service-Role |
|-----------|-------|----------|-------|--------------|
| SELECT | ✅ Own only | ❌ | ✅ All | ✅ All |
| INSERT | ❌ | ❌ | ❌ | ✅ Only |
| UPDATE | ❌ | ❌ | ❌ | ✅ Only |
| DELETE | ❌ | ❌ | ❌ | ✅ Only |

**Security:** Financial records can only be created by service-role (SECURITY DEFINER functions). No client path can manipulate earnings.

### 7.2 Payout Access

| Operation | Rider | Customer | Admin | Service-Role |
|-----------|-------|----------|-------|--------------|
| SELECT | ✅ Own only | ❌ | ✅ All | ✅ All |
| INSERT | ❌ | ❌ | ❌ | ✅ Only |
| UPDATE | ❌ | ❌ | ❌ | ✅ Only |

---

## 8. HARDCODED FINANCIAL ASSUMPTIONS

### 8.1 Found in Code

| Location | Value | Issue |
|----------|-------|-------|
| delivery.test.ts | 0.15 | Test only — acceptable |
| delivery.test.ts | 0.15 | Test only — acceptable |
| delivery.test.ts | 0.15 | Test only — acceptable |

**No hardcoded commission in application code.** All commission reads from `platform_settings`.

### 8.2 Historical 70/30 Model

**Status:** Not found in any application code or database settings. The only configured rate is 15% in `platform_settings.platform_commission_rate`.

---

## 9. PRODUCT DECISIONS REQUIRING APPROVAL

| Decision | Current State | Recommendation |
|----------|---------------|----------------|
| Commission rate | 15% (database-configurable) | Keep as-is |
| Commission basis | Gross order total | Keep as-is |
| Payment processing fees | Not calculated | Defer to payout milestone |
| VAT treatment | Included in total_amount | Defer |
| Cancellation earnings | No earnings on cancel | Keep as-is |
| Failed delivery earnings | No earnings on fail | Keep as-is |
| Rider earnings balance update | Not implemented | Phase 4B |
| Payout minimum threshold | Not configured | Phase 4B |
| Payout frequency | Not configured | Phase 4B |
| Payout execution | Deferred | Confirm: still deferred? |

---

## 10. REQUIRED IMPLEMENTATION SCOPE

### 10.1 What Phase 4B Should Implement

| Component | Priority | Complexity |
|-----------|----------|------------|
| GET /api/riders/earnings (list) | HIGH | Low |
| GET /api/riders/earnings/summary | HIGH | Medium |
| GET /api/riders/earnings/balance | HIGH | Low |
| Earnings calculation already in complete_delivery() | ✅ DONE | — |
| Unique index already in place | ✅ DONE | — |
| Update cached_total_earnings on completion | MEDIUM | Low |
| Background earnings aggregation job | LOW | Medium |

### 10.2 What Phase 4B Should NOT Implement

| Component | Reason |
|-----------|--------|
| Payout execution | Deferred to later milestone |
| Paystack transfer integration | Deferred |
| Payout recipient management | Deferred |
| Payment processing fee calculation | Deferred |
| Tax/VAT separation | Deferred |

---

## 11. TEST STRATEGY

| Test | Type | Priority |
|------|------|----------|
| Earnings calculated correctly | Unit | HIGH |
| Commission from database config | Unit | HIGH |
| Duplicate prevention | Unit | HIGH |
| Rider reads own earnings | Integration | HIGH |
| Rider cannot read other earnings | Integration | HIGH |
| Admin reads all earnings | Integration | MEDIUM |
| Balance calculation | Unit | MEDIUM |
| Cancellation creates no earnings | Unit | HIGH |
| Failed delivery creates no earnings | Unit | HIGH |
| cached_total_earnings updated | Integration | MEDIUM |

---

## 12. RISKS AND MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| cached_total_earnings not updated | MEDIUM | Update in complete_delivery() or background job |
| balance_after incorrect for multi-entry | LOW | First entry = credit, subsequent = running total |
| No payout mechanism | LOW | Explicitly deferred |
| Commission rate change mid-delivery | LOW | Rate read at completion time (snapshot via order) |

---

## 13. PROPOSED IMPLEMENTATION SEQUENCE

### Phase 4B Implementation

1. **Earnings API** — GET /api/riders/earnings, GET /api/riders/earnings/summary, GET /api/riders/earnings/balance
2. **Earnings Service** — earnings.service.ts with list, summary, balance functions
3. **cached_total_earnings update** — Update rider_profiles on delivery completion
4. **Tests** — Unit and integration tests for earnings

### Estimated Scope
- 3 API routes
- 1 service file
- 1 test file
- 0 migrations (all infrastructure exists)
- 0 database changes

---

## 14. GO / NO-GO RECOMMENDATION

### DISCOVERY COMPLETE — READY FOR ARCHITECTURE REVIEW

**Scope is smaller than anticipated because Phase 4A already implemented:**
- Earnings calculation
- Idempotency protection
- Database unique index
- Commission configuration

**Phase 4B is primarily:**
- Read APIs for rider earnings display
- cached_total_earnings maintenance
- Tests

**No blockers identified.**

---

*Discovery complete. Standing by for architecture review authorization, Major.* 🫡
