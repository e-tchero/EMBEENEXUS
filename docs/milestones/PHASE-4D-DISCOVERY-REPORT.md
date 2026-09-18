# PHASE 4D — DISCOVERY REPORT

## BACKGROUND JOB HARDENING & OPERATIONAL RESILIENCE

**Baseline:** Phase 4C commit `858f2c6a69dcc5a208a4838d5b8fdfdca29d88ec`

---

## 1. EXECUTIVE SUMMARY

Phase 4D discovery revealed **two critical defects** in the existing background job system that must be fixed before production deployment:

1. **CRITICAL: Retry mechanism is completely broken.** `claim_next_pending_job()` only matches `status = 'pending'`, but `failJob()` sets status to `'retrying'`. No code ever transitions `'retrying'` back to `'pending'`. All retriable failures become permanently stuck.

2. **HIGH: No stuck-job recovery.** If a worker claims a job (`status = 'processing'`) and the request times out or crashes, the job remains in `'processing'` forever. No reaper/sweeper mechanism exists.

Additionally, there is **no cron configuration** (`vercel.json` missing), meaning the background job processor is not actually running on a schedule in production.

---

## 2. REPOSITORY BASELINE

| Commit | Description |
|--------|-------------|
| `858f2c6` | Phase 4C — cancellation, failure, refund (HEAD) |
| `7514a54` | Phase 4B — earnings read APIs |
| `963fbeb` | Phase 4A — active delivery workflow |
| `3c07103` | Phase 3 — dispatch and rider offers |
| `ee124d8` | Phase 2 — rider location subsystem |
| `4e5e633` | Milestone 2 — customer booking flow |
| `3d20e47` | Milestone 1 — project foundation |

Working tree: **clean**

---

## 3. EXISTING BACKGROUND JOB ARCHITECTURE

### 3.1 Schema

```sql
background_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 3.2 Indexes

| Index | Definition |
|-------|------------|
| `idx_background_jobs_status` | `(status, scheduled_at)` |
| `idx_background_jobs_type` | `(job_type)` |
| `idx_background_jobs_no_duplicate_retry` | UNIQUE `(job_type, payload->>'order_id')` WHERE `status IN ('pending', 'processing')` AND `job_type IN ('DISPATCH_RETRY', 'OFFER_TIMEOUT')` |

### 3.3 RLS

- `background_jobs_select_admin` — SELECT for admin/super_admin only
- No INSERT/UPDATE policies for authenticated users
- GRANT: `service_role` has INSERT, UPDATE
- RLS is enabled but service-role bypasses it

### 3.4 Claiming Function

```sql
claim_next_pending_job() — SECURITY DEFINER
  UPDATE background_jobs
  SET status = 'processing', started_at = NOW()
  WHERE id = (
    SELECT id FROM background_jobs
    WHERE status = 'pending'       -- ← ONLY matches 'pending'
      AND scheduled_at <= NOW()
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
```

---

## 4. JOB TYPE INVENTORY

| Job Type | Registered Handler | Has Tests | Idempotent | Retry-Safe |
|----------|-------------------|-----------|------------|------------|
| `DISPATCH_ORDER` | ✅ `dispatchService.processDispatchJob()` | ⚠️ Config tests only | ✅ DB-level | ⚠️ May create duplicate offers |
| `DISPATCH_RETRY` | ✅ `dispatchService.processDispatchRetry()` | ⚠️ Config tests only | ✅ Status guard | ⚠️ Retry count by completed jobs |
| `OFFER_TIMEOUT` | ✅ `dispatchService.processOfferTimeout()` | ⚠️ Config tests only | ✅ Atomic update + pending check | ✅ |
| `REFUND_PROCESS` | ✅ `refundService.processRefundJob()` | ✅ Behavioral tests | ✅ Status check | ✅ Throws to trigger retry |
| `QUOTE_EXPIRATION` | ❌ No handler | ❌ No tests | N/A | N/A |
| `COMPLETE_ORDER` | ❌ No handler | ❌ No tests | N/A | N/A |
| `NOTIFICATION_EMAIL` | ❌ No handler | ❌ No tests | N/A | N/A |
| `NOTIFICATION_SMS` | ❌ No handler | ❌ No tests | N/A | N/A |
| `NOTIFICATION_PUSH` | ❌ No handler | ❌ No tests | N/A | N/A |
| `LOCATION_CLEANUP` | ❌ No handler | ❌ No tests | N/A | N/A |
| `RIDER_LOCATION_REFRESH` | ❌ No handler | ❌ No tests | N/A | N/A |
| `EARNINGS_AGGREGATION` | ❌ No handler | ❌ No tests | N/A | N/A |

---

## 5. CLAIMING / CONCURRENCY ANALYSIS

### 5.1 Claim Flow

```
1. claim_next_pending_job()
   → SELECT ... WHERE status = 'pending' AND scheduled_at <= NOW()
   → FOR UPDATE SKIP LOCKED
   → UPDATE SET status = 'processing'
   → Returns claimed job

2. processPendingJobs()
   → Increments attempts
   → Calls handler
   → On success: completeJob() → status = 'completed'
   → On failure: failJob() → status = 'retrying' or 'failed'
```

### 5.2 CRITICAL BUG: Retries Are Broken

**Evidence:**

| Step | Expected | Actual |
|------|----------|--------|
| Job fails | `failJob()` sets status to `'retrying'` | ✅ Correct |
| `failJob()` sets `scheduled_at` to future | ✅ Correct |
| Next cron invocation | `claim_next_pending_job()` picks up retried job | ❌ **BROKEN** |
| Reason | `claim_next_pending_job()` only matches `status = 'pending'` | `retrying` ≠ `pending` |
| Result | Job stays in `'retrying'` forever | **PERMANENTLY STUCK** |

**Impact:**
- DISPATCH_ORDER failures → no retry → order stays in `searching_rider` forever
- DISPATCH_RETRY failures → no retry → order stays in `searching_rider` forever
- OFFER_TIMEOUT failures → no retry → stale offers not expired
- REFUND_PROCESS failures → no retry → customer never gets refund

**Fix required:** Change `failJob()` to set status back to `'pending'` (not `'retrying'`) when retrying, OR update `claim_next_pending_job()` to also match `'retrying'` status.

### 5.3 Concurrency Safety

| Scenario | Protection |
|----------|------------|
| Two workers claim same job | ✅ `FOR UPDATE SKIP LOCKED` |
| Two cron invocations | ✅ SKIP LOCKED prevents double-claim |
| Duplicate DISPATCH_RETRY | ✅ Partial unique index |
| Duplicate OFFER_TIMEOUT | ✅ Partial unique index |
| Duplicate REFUND_PROCESS | ⚠️ No unique index — relies on refund status check |

---

## 6. RETRY & BACKOFF ANALYSIS

### 6.1 Current Backoff

```typescript
scheduled_at: shouldRetry
  ? new Date(Date.now() + 5000 * Math.pow(2, attempts - 1)).toISOString()
  : undefined
```

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1st failure | 5s | 5s |
| 2nd failure | 10s | 15s |
| 3rd failure | Marked 'failed' | — |

### 6.2 Backoff Analysis

- Exponential backoff: ✅ Correct formula
- Maximum attempts: 3 (default) — ✅ Bounded
- **But retries never execute** due to the `retrying` vs `pending` bug
- Backoff is effectively unused

---

## 7. FAILURE & RECOVERY ANALYSIS

### 7.1 Stuck Processing Jobs

| Scenario | Current Behavior | Risk |
|----------|-----------------|------|
| Worker crashes after claim | Job stays `'processing'` forever | **HIGH** — no recovery |
| Request times out | Job stays `'processing'` forever | **HIGH** — no recovery |
| Database connection fails during handler | Job stays `'processing'` forever | **HIGH** — no recovery |
| Paystack API hangs | Job stays `'processing'` until timeout | **MEDIUM** — depends on fetch timeout |
| Handler throws | Job goes to `'retrying'` (broken) or `'failed'` | **CRITICAL** — retry path broken |

### 7.2 Missing Recovery Mechanisms

| Mechanism | Status |
|-----------|--------|
| Stuck job reaper (mark old 'processing' as 'failed') | ❌ MISSING |
| Lease/timeout for processing jobs | ❌ MISSING |
| Dead-letter queue | ❌ MISSING |
| Job completion monitoring | ❌ MISSING |
| Alerting on repeated failures | ❌ MISSING |
| Historical job cleanup | ❌ MISSING |

### 7.3 Terminal Failure Behavior

- After `max_attempts` (default 3): status = `'failed'`
- `failed_at` is set
- Job is never retried
- No notification/alerting
- No admin visibility (RLS restricts to admin SELECT only)

---

## 8. IDEMPOTENCY AUDIT

| Handler | Duplicate Execution Safe? | Mechanism |
|---------|--------------------------|-----------|
| `DISPATCH_ORDER` | ⚠️ Partially | `dispatch_rider_v2()` uses partial unique index on assignments |
| `DISPATCH_RETRY` | ⚠️ Partially | Status guard + completed retry count |
| `OFFER_TIMEOUT` | ✅ Yes | Atomic update `status = 'offered' → 'expired'` + pending retry check |
| `REFUND_PROCESS` | ✅ Yes | Refund status check (`success`/`failed` → skip) |
| `QUOTE_EXPIRATION` | N/A | No handler |
| `COMPLETE_ORDER` | N/A | No handler |

### 8.1 DISPATCH_ORDER Idempotency Concern

If `DISPATCH_ORDER` runs twice for the same order:
- `dispatch_rider_v2()` creates a rider assignment
- Partial unique index `idx_rider_assignments_one_active` prevents duplicate active assignments
- **BUT**: The function may create an offer for a different rider if the first one already accepted
- **Risk**: LOW — database constraints prevent inconsistent state, but may waste an offer

### 8.2 REFUND_PROCESS Idempotency Concern

If `REFUND_PROCESS` runs twice:
- First run: checks refund.status = 'pending' → sets to 'processing' → calls Paystack
- Second run: checks refund.status → may be 'processing' or 'success' → skips
- **Risk**: LOW — status check prevents duplicate Paystack calls
- **EDGE CASE**: If first run sets status to 'processing' and then crashes before Paystack call, second run sees 'processing' and skips. The refund is now stuck in 'processing' forever (no recovery mechanism).

---

## 9. CRON PROCESSOR AUDIT

### 9.1 Endpoint

```
GET /api/cron/process-jobs
Authorization: Bearer {CRON_SECRET}
```

### 9.2 Configuration

| Setting | Value | Status |
|---------|-------|--------|
| vercel.json | ❌ MISSING | No cron schedule configured |
| CRON_SECRET | ❌ NOT SET in .env.local | Authorization bypass possible |
| Batch size | 5 jobs per invocation | ✅ Reasonable |
| Handler registration | Module-level (cold start) | ✅ Correct for serverless |

### 9.3 Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| No vercel.json | **CRITICAL** | Cron never runs automatically |
| No CRON_SECRET | **HIGH** | Endpoint is unprotected if env var not set |
| No timeout protection | **MEDIUM** | Long-running handlers can block cron |
| No health check | **LOW** | No way to verify processor is running |
| Batch size hardcoded | **LOW** | Should be configurable |

### 9.4 Vercel Serverless Considerations

- Max function duration: 60s (Hobby) / 300s (Pro)
- Cron invocations may overlap if handler is slow
- Cold starts may delay handler registration
- `registerJobHandler()` is called at module level — ✅ correct for serverless

---

## 10. SECURITY AUDIT

### 10.1 Cron Authorization

```typescript
const authHeader = request.headers.get('authorization');
const cronSecret = process.env.CRON_SECRET;

if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Issue:** If `CRON_SECRET` is not set, the `if (cronSecret && ...)` condition is false, and the endpoint is **completely unprotected**.

### 10.2 Job Payload Trust

- All handlers trust the `payload` from the database
- Payload is set by server-side code (cancel_order(), dispatch service, etc.)
- Clients cannot directly create background jobs (RLS + service_role only)
- **Risk**: LOW — but defense-in-depth would validate payload schema

### 10.3 Service-Role Usage

- All job processing uses `createServiceRoleClient()`
- Service-role bypasses RLS
- Appropriate for server-side background processing
- **Risk**: LOW

### 10.4 Sensitive Data in Payloads

| Job Type | Payload Contains | Sensitive? |
|----------|-----------------|------------|
| DISPATCH_ORDER | `order_id` | LOW |
| DISPATCH_RETRY | `order_id` | LOW |
| OFFER_TIMEOUT | `order_id` | LOW |
| REFUND_PROCESS | `refund_id`, `payment_id`, `amount`, `paystack_reference` | **MEDIUM** — financial data |

---

## 11. OBSERVABILITY AUDIT

### 11.1 Current Logging

| Event | Logged? | Location |
|-------|---------|----------|
| Job claimed | ❌ No | — |
| Job started | ❌ No | — |
| Job completed | ❌ No | — |
| Job failed | ✅ Yes | `console.error` in processPendingJobs() |
| Job retrying | ❌ No | — |
| Handler error | ✅ Yes | `console.error` in handlers |
| Dispatch offer created | ✅ Yes | `[DISPATCH]` prefix |
| Dispatch failed | ✅ Yes | `[DISPATCH]` prefix |
| Refund processing | ✅ Yes | `[REFUND]` prefix |
| Refund success | ✅ Yes | `[REFUND]` prefix |
| Refund failure | ✅ Yes | `[REFUND]` prefix |

### 11.2 Missing Observability

| Metric | Status |
|--------|--------|
| Job processing duration | ❌ MISSING |
| Job queue depth | ❌ MISSING |
| Retry count per job type | ❌ MISSING |
| Stuck processing detection | ❌ MISSING |
| Failed job alerting | ❌ MISSING |
| Job type throughput | ❌ MISSING |
| Handler execution time | ❌ MISSING |

### 11.3 Structured Logging

- Current: `console.log/error` with prefix tags
- Not structured JSON
- Not sent to any logging service
- **Risk**: LOW for MVP, but limits production debugging

---

## 12. DATABASE FINDINGS

### 12.1 Required Changes

| Change | Priority | Description |
|--------|----------|-------------|
| Fix `claim_next_pending_job()` or `failJob()` | **CRITICAL** | Retry mechanism is broken |
| Add stuck-job recovery query | **HIGH** | Mark old 'processing' jobs as 'failed' |
| Add `vercel.json` with cron schedule | **CRITICAL** | Cron never runs without it |
| Set `CRON_SECRET` env var | **HIGH** | Endpoint is unprotected |

### 12.2 Optional Improvements

| Change | Priority | Description |
|--------|----------|-------------|
| Add job processing duration tracking | MEDIUM | `started_at` exists but not used |
| Add structured job event logging | MEDIUM | Better debugging |
| Add dead-letter visibility | LOW | Admin can see failed jobs via RLS |
| Historical job cleanup | LOW | Prevent unbounded table growth |

### 12.3 Not Required

| Change | Reason |
|--------|--------|
| New tables | Existing schema is sufficient |
| Redis/Kafka | PostgreSQL is sufficient for MVP |
| New job types | Existing types cover current needs |
| New indexes | Existing indexes are sufficient |

---

## 13. TESTING COVERAGE

### 13.1 Existing Tests

| Category | Tests | Coverage |
|----------|-------|----------|
| Job type definitions | 2 | Type existence only |
| REFUND_PROCESS payload | 2 | Structure assertions |
| REFUND_PROCESS idempotency | 1 | Logic assertion |
| Dispatch config values | 4 | Configuration only |
| **Total background job tests** | **9** | **Configuration/structure only** |

### 13.2 Missing Tests

| Test | Priority | Description |
|------|----------|-------------|
| Concurrent job claiming | **HIGH** | Two workers cannot claim same job |
| Retry lifecycle | **CRITICAL** | Failed job becomes pending and is re-claimed |
| Stuck job recovery | **HIGH** | Old processing jobs are marked failed |
| Cron authorization | **MEDIUM** | Valid/invalid cron secret |
| Handler failure propagation | **MEDIUM** | Handler error → job retry/fail |
| Batch processing | **LOW** | Max 5 jobs per invocation |
| Duplicate job prevention | **MEDIUM** | Unique index enforcement |
| Refund processing recovery | **HIGH** | Refund stuck in 'processing' |
| Dispatch retry exhaustion | **MEDIUM** | Order marked failed after max retries |
| Job payload validation | **LOW** | Malformed payload handling |

---

## 14. PRODUCTION / VERCEL SUITABILITY

### 14.1 Current Architecture Assessment

| Aspect | Assessment |
|--------|------------|
| PostgreSQL-backed jobs | ✅ Appropriate for MVP |
| FOR UPDATE SKIP LOCKED | ✅ Correct concurrency primitive |
| Serverless cron | ✅ Compatible with Vercel |
| Batch size (5) | ✅ Reasonable for serverless timeout |
| No external queue | ✅ Correct for MVP scale |

### 14.2 Vercel-Specific Issues

| Issue | Impact | Fix |
|-------|--------|-----|
| No `vercel.json` | Cron never runs | Add cron configuration |
| Max function duration | Long handlers may timeout | Already bounded by batch size |
| Cold starts | Handler registration delay | Module-level registration ✅ |
| Concurrent invocations | SKIP LOCKED handles this | ✅ |

### 14.3 Scale Assessment

| Scale | Assessment |
|-------|------------|
| 100 orders/day | ✅ PostgreSQL sufficient |
| 1,000 orders/day | ✅ PostgreSQL sufficient |
| 10,000 orders/day | ⚠️ May need dedicated worker |
| 100,000 orders/day | ❌ Need Redis/Kafka |

**MVP threshold:** PostgreSQL is appropriate through 10,000 orders/day.

---

## 15. CONCRETE GAPS

### 15.1 CRITICAL

| Gap | Impact | Fix |
|-----|--------|-----|
| Retries broken (`retrying` vs `pending`) | All retriable failures permanently stuck | Change `failJob()` to set `status = 'pending'` |
| No `vercel.json` | Cron never runs automatically | Add Vercel cron configuration |

### 15.2 HIGH

| Gap | Impact | Fix |
|-----|--------|-----|
| No stuck-job recovery | Processing jobs stuck forever | Add sweeper query in cron |
| No `CRON_SECRET` configured | Endpoint unprotected | Set env var |

### 15.3 MEDIUM

| Gap | Impact | Fix |
|-----|--------|-----|
| No job processing metrics | Cannot monitor performance | Add duration tracking |
| No handler timeout | Slow handler blocks cron | Add Promise.race timeout |
| 8 unregistered job types | Jobs silently dropped | Register handlers or remove types |

### 15.4 LOW

| Gap | Impact | Fix |
|-----|--------|-----|
| No structured logging | Harder to debug | Add JSON logging |
| No historical cleanup | Table grows forever | Add retention policy |
| No dead-letter visibility | Failed jobs hidden | Add admin API |

---

## 16. PROPOSED PHASE 4D SCOPE

### 16.1 Must-Fix (CRITICAL)

1. **Fix retry mechanism:** Change `failJob()` to set `status = 'pending'` when retrying (not `'retrying'`). The `scheduled_at` future timestamp already prevents premature re-execution.

2. **Add `vercel.json` with cron schedule:** Configure cron to call `/api/cron/process-jobs` every 30 seconds.

### 16.2 Should-Fix (HIGH)

3. **Add stuck-job recovery:** In the cron processor, before claiming new jobs, mark any `'processing'` jobs older than 5 minutes as `'failed'` with an error message.

4. **Set `CRON_SECRET`:** Configure the environment variable.

### 16.3 Should-Add (MEDIUM)

5. **Add job processing duration tracking:** Record processing time in job metadata.

6. **Add handler timeout:** Wrap handler execution in `Promise.race` with a configurable timeout (e.g., 25 seconds for Vercel).

7. **Clean up unregistered job types:** Either register handlers for `QUOTE_EXPIRATION`, `COMPLETE_ORDER`, etc., or remove them from the `JobType` union.

### 16.4 Nice-to-Have (LOW)

8. **Add retry state logging:** Log when a job transitions to retrying/pending.

9. **Add job queue depth monitoring:** Log pending/processing/failed counts.

---

## 17. EXPLICITLY DEFERRED WORK

| Item | Reason |
|------|--------|
| Redis/Kafka queue | PostgreSQL sufficient for MVP |
| Dedicated background workers | Vercel cron sufficient for MVP |
| Admin job management UI | Phase 5+ |
| Real-time job monitoring | Phase 5+ |
| Job priority queuing | Existing priority field is sufficient |
| Job dependencies | Not needed for current job types |
| Distributed tracing | Phase 5+ |

---

## 18. RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Retry bug causes order stuck in `searching_rider` | **CRITICAL** | Fix in Phase 4D |
| Stuck processing jobs consume capacity | **HIGH** | Add sweeper |
| Cron never runs in production | **CRITICAL** | Add vercel.json |
| Unprotected cron endpoint | **HIGH** | Set CRON_SECRET |
| Refund stuck in 'processing' | **HIGH** | Fix retry + add recovery |
| 8 unregistered job types silently dropped | **MEDIUM** | Register or remove |

---

## 19. RECOMMENDATION

**PHASE 4D DISCOVERY STATUS: GO**

The architecture is ready for review. Two critical defects must be fixed:

1. Retry mechanism (`retrying` → `pending`)
2. Cron configuration (`vercel.json`)

These are small, targeted fixes that do not require architectural changes.

---

*Discovery completed: August 24, 2026*
*Baseline: 858f2c6a69dcc5a208a4838d5b8fdfdca29d88ec*
