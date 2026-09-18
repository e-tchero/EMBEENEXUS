# PHASE 3 FINAL ARCHITECTURE & CONCURRENCY AUDIT

**Date:** August 23, 2026
**Status:** AUDIT COMPLETE — ISSUES FOUND
**Recommendation:** NO-GO — fixes required before commit

---

## Executive Summary

The Phase 3 implementation provides the correct architectural shape: a dispatch service, rider offer APIs, background job handlers, and configuration. However, the audit discovered **1 critical** and **3 high-severity** issues that must be corrected before commit authorization. The most serious is that the background job processor does not use `FOR UPDATE SKIP LOCKED` as explicitly required, and the PostgreSQL dispatch function hardcodes values that the application reads from configurable settings.

---

## 1. Background Job Concurrency — CRITICAL

### Original Requirement
> "Job claiming must be concurrency-safe. Use PostgreSQL: FOR UPDATE SKIP LOCKED where appropriate for claiming background jobs so multiple workers cannot process the same pending job simultaneously."

### Actual Implementation
The `processPendingJobs()` function in `background-job.service.ts` uses:
```typescript
.update({ status: 'processing' })
.eq('status', 'pending')
.order('priority', { ascending: false })
.order('created_at', { ascending: true })
.limit(1)
.select('*')
.single()
```

This is a **claim-then-process pattern** using Supabase's `.update().eq('status', 'pending').limit(1).select().single()`.

### Race-Safety Analysis

**Scenario: Two concurrent cron invocations**
- Worker A: `.update({ status: 'processing' }).eq('status', 'pending').limit(1).select().single()`
- Worker B: `.update({ status: 'processing' }).eq('status', 'pending').limit(1).select().single()`

**Result:** PostgreSQL processes these as two separate UPDATE statements. Both target rows WHERE `status = 'pending'`. With default READ COMMITTED isolation:
- If both target the same row: Worker A's UPDATE acquires a row lock. Worker B's UPDATE waits, then sees the row already updated to 'processing' — its WHERE clause no longer matches. Worker B gets no rows.
- If both target different rows: Each succeeds on its own row.

**Conclusion:** The claim-then-process pattern IS race-safe for the row-lock scenario. However, it is **NOT equivalent to FOR UPDATE SKIP LOCKED** for two reasons:

1. **Worker B blocks** while Worker A's row lock is held. With `SKIP LOCKED`, Worker B would immediately skip to the next job. This matters at scale.
2. **No explicit guarantee** that the `.update().eq('status', 'pending').limit(1).single()` pattern is atomic in all Supabase client versions. The atomicity depends on PostgreSQL's statement-level behavior, not an explicit row lock.

**Severity: CRITICAL** — The original requirement explicitly mandated `FOR UPDATE SKIP LOCKED`. The current implementation does not meet this requirement and introduces blocking behavior under concurrent load.

### Fix Required
Replace the claim pattern with `FOR UPDATE SKIP LOCKED` using a raw SQL query or Supabase's RPC to call a PostgreSQL function that claims jobs atomically.

---

## 2. Concurrent Offer Acceptance — VERIFIED SAFE

### Database Mechanism
The `accept_rider_offer()` PostgreSQL function uses:
```sql
SELECT * INTO v_assignment FROM rider_assignments
WHERE id = p_assignment_id AND rider_id = p_rider_id
FOR UPDATE;
-- ... checks ...
SELECT * INTO v_order FROM orders WHERE id = v_assignment.order_id FOR UPDATE;
-- ... checks v_order.status = 'searching_rider' ...
UPDATE rider_assignments SET status = 'accepted' WHERE id = p_assignment_id;
UPDATE orders SET status = 'rider_assigned' WHERE id = v_assignment.order_id;
```

### Race-Safety Proof
- `FOR UPDATE` acquires a row-level lock on both the assignment and order rows
- Two concurrent accept attempts for the same order: the second transaction waits for the first's lock, then sees `orders.status = 'rider_assigned'` (not 'searching_rider') and returns FALSE
- Two concurrent accept attempts for different orders by the same rider: prevented by `idx_rider_assignments_rider_one_active` UNIQUE partial index
- `rider_id = p_rider_id` in the WHERE clause ensures a rider cannot accept another rider's offer
- Expired offers are caught by the `expires_at < NOW()` check within the transaction

**Severity: NONE** — The database functions are correctly designed for concurrency.

---

## 3. Duplicate Dispatch Protection — VERIFIED SAFE (with caveats)

### Database Mechanism
`dispatch_rider_v2()` uses:
```sql
FOR v_rider IN SELECT * FROM find_nearest_riders(...) LOOP
  BEGIN
    INSERT INTO rider_assignments (...) VALUES (...)
    RETURNING id INTO v_assignment_id;
    -- ...
    RETURN QUERY SELECT TRUE, v_rider.rider_id, ...;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    CONTINUE;
  END;
END LOOP;
```

The `EXCEPTION WHEN unique_violation THEN CONTINUE` catches the unique constraint violation from:
- `idx_rider_assignments_one_active` (one active offer per order)
- `idx_rider_assignments_rider_one_active` (one active offer per rider)

If two dispatch workers try to assign the same order simultaneously, one succeeds and the other gets a unique_violation, continues to the next rider, or fails with "No eligible riders available."

**Severity: NONE** — The database constraints are correct.

---

## 4. Retry Semantics — HIGH

### Issue: Dispatch function ignores configurable retry/radius values

`dispatch_rider_v2()` hardcodes:
```sql
SELECT * FROM find_nearest_riders(v_order.pickup_latitude, v_order.pickup_longitude, 10, 10)
-- hardcoded: 10km radius, 10 max riders
VALUES (..., 'offered', NOW() + INTERVAL '30 seconds')
-- hardcoded: 30 second timeout
```

The application's `DispatchConfig` reads from `platform_settings`:
```typescript
radiusKm: settings.dispatch_radius_km?.km ?? 10,
offerTimeoutSeconds: settings.dispatch_offer_timeout_seconds?.seconds ?? 30,
```

But the PostgreSQL function `dispatch_rider_v2()` is called WITHOUT these parameters:
```typescript
const { data, error } = await serviceRole.rpc('dispatch_rider_v2', {
  p_order_id: orderId,
});
```

**Result:** The configurable settings are NOT consumed by the actual dispatch logic. Changing `dispatch_radius_km` in `platform_settings` has ZERO effect on dispatch behavior.

**Severity: HIGH** — Configuration is read and cached but never passed to the authoritative database function.

### Fix Required
Either:
A. Modify `dispatch_rider_v2()` to accept `p_radius_km` and `p_offer_timeout_seconds` parameters, or
B. Read config inside the PostgreSQL function from `platform_settings`, or
C. Accept that the PostgreSQL function uses defaults and the application config is for future use (but document this clearly).

---

## 5. Offer Timeout Semantics — MEDIUM

### Issue: processExpiredOffers() bypasses the configurable offer timeout

`processExpiredOffers()` in `background-job.service.ts` independently queries for expired offers and creates `DISPATCH_RETRY` jobs. This duplicates the OFFER_TIMEOUT handler logic.

**Risk:** If both the background `processExpiredOffers()` and the `OFFER_TIMEOUT` job handler fire for the same offer, TWO `DISPATCH_RETRY` jobs are created for the same order. This amplifies retry attempts beyond the configured maximum.

### Fix Required
Remove the independent `processExpiredOffers()` from the cron loop. Let only the `OFFER_TIMEOUT` background job handle expiration. The PostgreSQL function `process_expired_offers()` (which uses `FOR UPDATE SKIP LOCKED`) already exists for this purpose.

---

## 6. Order State Transition Audit

### Phase 3 Transitions

| CURRENT STATE | EVENT | NEW STATE | ENFORCED BY |
|---------------|-------|-----------|-------------|
| paid | dispatch_rider_v2() | searching_rider | PostgreSQL function (FOR UPDATE) |
| searching_rider | accept_rider_offer() | rider_assigned | PostgreSQL function (FOR UPDATE) |
| searching_rider | reject_rider_offer() | searching_rider | PostgreSQL function (no state change) |
| searching_rider | OFFER_TIMEOUT + retries exhausted | failed | Application code (direct UPDATE) |
| searching_rider | dispatch_rider_v2() no riders | failed | PostgreSQL function |

### Issues Found

**Issue A:** The `processDispatchRetry()` function directly updates order status:
```typescript
await serviceRole
  .from('orders')
  .update({ status: 'failed', updated_at: new Date().toISOString() })
  .eq('id', orderId)
  .eq('status', 'searching_rider');
```

This bypasses the PostgreSQL function architecture. While the `.eq('status', 'searching_rider')` provides a guard, it does not:
- Acquire `FOR UPDATE` on the order row
- Record an order_event through the database function
- Cancel any remaining active offers

**Severity: MEDIUM** — Direct UPDATE with status guard is acceptable for MVP but inconsistent with the pattern of using PostgreSQL functions.

**Issue B:** The retry count check in `processDispatchRetry()` queries `background_jobs` to find the current retry job's attempts:
```typescript
const { data: pendingJobs } = await serviceRole
  .from('background_jobs')
  .select('payload, attempts')
  .eq('job_type', 'DISPATCH_RETRY')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
  .limit(1);
```

This may find the WRONG job if multiple DISPATCH_RETRY jobs exist for different orders. The `payload.order_id` filter is applied in JavaScript, not in the database query.

**Severity: MEDIUM** — Race condition where multiple orders' retry jobs could be cross-matched.

---

## 7. Database/Application Responsibility Boundary

| Operation | Authoritative Layer | Status |
|-----------|-------------------|--------|
| Dispatch rider selection | DATABASE (find_nearest_riders) | ✅ Correct |
| Offer creation | DATABASE (dispatch_rider_v2) | ✅ Correct |
| Offer acceptance | DATABASE (accept_rider_offer) | ✅ Correct |
| Offer rejection | DATABASE (reject_rider_offer) | ✅ Correct |
| Offer expiration | DATABASE (process_expired_offers) + APP (processExpiredOffers) | ⚠️ DUPLICATE |
| Retry scheduling | APPLICATION (dispatch.service.ts) | ✅ Correct |
| Order state transitions | MIXED (database functions + direct UPDATE) | ⚠️ Inconsistent |
| Job claiming | APPLICATION (supabase update) | ❌ Missing FOR UPDATE SKIP LOCKED |

---

## 8. Security Audit

| Check | Status |
|-------|--------|
| Rider identity from auth.uid() | ✅ All 5 API routes use `supabase.auth.getUser()` |
| Client cannot supply rider_id | ✅ Service functions derive rider_id from user.id |
| Offer ownership enforced | ✅ `rider_id = p_rider_id` in WHERE clause |
| Assignment ownership enforced | ✅ Same pattern |
| Customers cannot access rider endpoints | ✅ Endpoints use rider-authenticated client |
| Customers cannot manipulate dispatch | ✅ Dispatch triggered by system, not customer |
| Service-role usage isolated | ✅ Service-role used only in trusted server services |
| No secrets in tracked files | ✅ Verified |
| RLS enabled on all tables | ✅ Verified in Phase 2 |

**Severity: NONE** — Security model is correct.

---

## 9. API Contract Audit

| Endpoint | Auth | AuthZ | Validation | Ownership | Idempotency | Status |
|----------|------|-------|------------|-----------|-------------|--------|
| GET /api/riders/offers | getUser() | rider only | none needed | rider_id filter | safe (GET) | ✅ |
| GET /api/riders/offers/[id] | getUser() | rider only | params.id | rider_id filter | safe (GET) | ✅ |
| POST /api/riders/offers/[id]/accept | getUser() | rider only | params.id | p_rider_id in RPC | DB atomic | ✅ |
| POST /api/riders/offers/[id]/reject | getUser() | rider only | params.id + Zod | p_rider_id in RPC | DB atomic | ✅ |
| GET /api/riders/assignments/active | getUser() | rider only | none needed | rider_id filter | safe (GET) | ✅ |

**Severity: NONE** — API contracts are correct.

---

## 10. Configuration Audit

| Setting | Stored | Read By App | Read By DB Function | Effective |
|---------|--------|-------------|--------------------|----|
| dispatch_radius_km | ✅ platform_settings | ✅ DispatchConfig | ❌ hardcoded '10' in SQL | **NO** |
| dispatch_offer_timeout_seconds | ✅ platform_settings | ✅ DispatchConfig | ❌ hardcoded '30' in SQL | **NO** |
| dispatch_max_riders_per_attempt | ✅ platform_settings | ✅ DispatchConfig | N/A (app-level) | YES |
| dispatch_max_retry_attempts | ✅ platform_settings | ✅ DispatchConfig | N/A (app-level) | YES |
| dispatch_retry_base_delay_seconds | ✅ platform_settings | ✅ DispatchConfig | N/A (app-level) | YES |

**Critical finding:** 2 of 5 settings are NOT consumed by the PostgreSQL function that actually performs dispatch. Changing them in the database has no effect.

**Severity: HIGH** — Configuration values are misleading. They appear to be active but are not.

---

## 11. Test Matrix

### Current Tests: 68 total

**Category Breakdown:**
| Category | Count | Coverage |
|----------|-------|----------|
| Unit (configuration values) | 11 | Dispatch config defaults, offer lifecycle states |
| Unit (location validation) | 14 | Coordinate validation, haversine distance |
| Unit (quote engine) | 13 | Pricing calculations |
| Unit (validators) | 30 | Shared type validation |

**Critical Test Gaps:**

| # | Required Test | Status |
|---|---------------|--------|
| 1 | Dispatch eligibility | ❌ NOT TESTED (only tests config values) |
| 2 | Radius configuration | ❌ NOT TESTED (only tests default value) |
| 3 | Offer creation | ❌ NOT TESTED |
| 4 | Offer expiration | ❌ NOT TESTED |
| 5 | Rider rejection | ❌ NOT TESTED |
| 6 | Rider acceptance | ❌ NOT TESTED |
| 7 | Concurrent acceptance | ❌ NOT TESTED |
| 8 | Cross-rider authorization | ❌ NOT TESTED |
| 9 | Expired offer rejection | ❌ NOT TESTED |
| 10 | Duplicate dispatch prevention | ❌ NOT TESTED |
| 11 | Retry behavior | ❌ NOT TESTED |
| 12 | Retry exhaustion | ❌ NOT TESTED |
| 13 | Background job concurrency | ❌ NOT TESTED |
| 14 | No-rider-found behavior | ❌ NOT TESTED |
| 15 | Malformed job handling | ❌ NOT TESTED |

**All 11 dispatch tests are pure configuration-value assertions.** They test that constants are within expected ranges, not that the dispatch system actually works.

**Severity: HIGH** — No behavioral tests for the dispatch system exist.

---

## 12. Idempotency Audit

### DISPATCH_ORDER
- If processed twice: `dispatch_rider_v2()` acquires `FOR UPDATE` on the order row. Second invocation sees `status = 'searching_rider'` (already set by first) or `rider_assigned` (if first succeeded). If status is already 'rider_assigned', returns "Order not in dispatchable state." If status is still 'searching_rider' (first failed to find riders), a second dispatch attempt is acceptable.
- **Result: Idempotent** ✅

### DISPATCH_RETRY
- If processed twice: Both call `processDispatchJob()`, which calls `dispatch_rider_v2()`. The second invocation may succeed if the first failed, or return "not in dispatchable state" if the first succeeded. However, the retry count check queries `background_jobs` for the CURRENT pending job — if both jobs are for the same order, the count may be incorrectly split across two jobs.
- **Result: PARTIALLY IDEMPOTENT** ⚠️ — The retry count tracking is fragile.

### OFFER_TIMEOUT
- If processed twice: Both query `rider_assignments WHERE status = 'offered' AND expires_at < NOW()`. The first processing marks the offer as 'expired'. The second finds no matching offers and returns early. However, the `processExpiredOffers()` in the cron loop may also create a second DISPATCH_RETRY job.
- **Result: PARTIALLY IDEMPOTENT** ⚠️ — Duplicate DISPATCH_RETRY jobs can be created.

---

## 13. Observability Audit

### Structured Logs Present

| Event | Location | Level |
|-------|----------|-------|
| Dispatch processing started | `dispatch.service.ts` | console.log |
| Offer sent to rider | `dispatch.service.ts` | console.log |
| No riders found | `dispatch.service.ts` | console.log |
| Offer accepted | `rider-offer.service.ts` | console.log |
| Offer rejected | `rider-offer.service.ts` | console.log |
| Offer expired | `dispatch.service.ts` | console.log |
| Retry exhausted | `dispatch.service.ts` | console.log |
| Dispatch retry attempt | `dispatch.service.ts` | console.log |
| Job failed | `background-job.service.ts` | console.error |
| Stale rider detected | `background-job.service.ts` | console.error (on failure) |

### Missing Observability
- No structured logging format (uses raw `console.log`)
- No request/correlation IDs
- No metrics (dispatch latency, success rate, etc.)
- No sensitive-data filtering beyond not logging tokens

**Severity: LOW** — Acceptable for MVP. Structured logging and metrics are future improvements.

---

## 14. Regression Verification

| Check | Result |
|-------|--------|
| Typecheck | ✅ PASS |
| Lint | ✅ PASS |
| Unit tests | ✅ 68/68 PASS |
| Production build | ✅ PASS |
| Phase 2 location ingestion | ✅ Unchanged |
| Phase 2 availability | ✅ Unchanged |
| Phase 2 stale detection | ✅ Unchanged |
| Maps abstraction | ✅ Unchanged |
| Pricing architecture | ✅ Unchanged |
| Payment architecture | ✅ Unchanged |

**Severity: NONE** — No regressions detected.

---

## 15. Git Scope Audit

| Check | Result |
|-------|--------|
| Only Phase 3 files changed | ✅ Verified |
| No secrets | ✅ Verified |
| No .env files | ✅ Verified |
| No generated junk | ✅ Verified |
| No unrelated refactors | ✅ Verified |
| Milestone 2 untouched | ✅ Commit 4e5e633 intact |
| Phase 2 untouched | ✅ Commit ee124d8 intact |

**Severity: NONE** — Clean scope.

---

## 16. Issues Summary

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1 | Background job processor does not use FOR UPDATE SKIP LOCKED | **CRITICAL** | Concurrency |
| 2 | dispatch_rider_v2() hardcodes radius/timeout, ignores platform_settings | **HIGH** | Configuration |
| 3 | processExpiredOffers() creates duplicate DISPATCH_RETRY jobs | **HIGH** | Idempotency |
| 4 | All dispatch tests are config-value assertions, no behavioral tests | **HIGH** | Testing |
| 5 | processDispatchRetry() retry count query may match wrong job | **MEDIUM** | Correctness |
| 6 | processDispatchRetry() directly UPDATEs order status (bypasses DB functions) | **MEDIUM** | Architecture |
| 7 | Uses console.log instead of structured logging | **LOW** | Observability |

---

## 17. Required Fixes

### Fix 1: Background Job Concurrency (CRITICAL)
Replace the claim-then-process pattern with `FOR UPDATE SKIP LOCKED`.

### Fix 2: Dispatch Function Parameters (HIGH)
Either:
- A. Add parameters to `dispatch_rider_v2()` for radius and timeout, OR
- B. Read from `platform_settings` inside the PostgreSQL function, OR
- C. Document that the DB function uses defaults and app config is for future use

### Fix 3: Remove Duplicate Expiration Processing (HIGH)
Remove `processExpiredOffers()` from the cron loop. Let only `OFFER_TIMEOUT` background jobs handle expiration.

### Fix 4: Fix Retry Count Query (MEDIUM)
Change the retry count query to filter by `order_id` in the payload, not just by job type.

---

## 18. Remaining Limitations

1. No integration tests for concurrent dispatch scenarios
2. No database-level concurrency tests
3. Console.log instead of structured logging
4. No request correlation IDs
5. No dispatch metrics/monitoring
6. The PostgreSQL function architecture is not fully parameterized

---

## 19. FINAL GO/NO-GO

### NO-GO — Fixes Required

**Blocking issues:**
1. **CRITICAL:** Background job concurrency does not meet the explicit requirement
2. **HIGH:** Configuration values are not consumed by the authoritative dispatch function
3. **HIGH:** Duplicate DISPATCH_RETRY jobs can be created
4. **HIGH:** No behavioral tests exist for the dispatch system

**Recommendation:** Fix issues #1-#3 (the critical and high severity items), then proceed to commit. Issue #4 (tests) can be addressed in a follow-up if commit authorization is given with that understanding.

---

*MBEENEXUS — Phase 3 Final Audit — August 23, 2026*
