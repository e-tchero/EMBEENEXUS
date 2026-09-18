# PHASE 4D — ARCHITECTURE REVIEW

## BACKGROUND JOB HARDENING & OPERATIONAL RESILIENCE

**Baseline:** Phase 4C commit `858f2c6a69dcc5a208a4838d5b8fdfdca29d88ec`

---

## 1. CURRENT BACKGROUND-JOB ARCHITECTURE

### 1.1 Schema

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

### 1.2 Indexes

| Index | Definition | Purpose |
|-------|------------|---------|
| `idx_background_jobs_status` | `(status, scheduled_at)` | Claim query performance |
| `idx_background_jobs_type` | `(job_type)` | Job type filtering |
| `idx_background_jobs_no_duplicate_retry` | UNIQUE `(job_type, payload->>'order_id')` WHERE `status IN ('pending', 'processing')` AND `job_type IN ('DISPATCH_RETRY', 'OFFER_TIMEOUT')` | Prevent duplicate dispatch/timeout jobs |

### 1.3 Live Database State

- **Total jobs:** 1 (completed DISPATCH_RETRY)
- **No stuck jobs** currently
- **No retrying jobs** currently

---

## 2. CURRENT JOB STATE MACHINE

```
                  ┌─────────────┐
                  │   pending   │◄──────────────┐
                  └──────┬──────┘               │
                         │ claim_next_          │ failJob()
                         │ pending_job()        │ (shouldRetry=true)
                         ▼                      │
                  ┌──────────────┐              │
                  │  processing  │──────────────┘
                  └──────┬───────┘   failJob()
                         │           (shouldRetry=true)
                    ┌────┴────┐
                    │         │
              success     failure
                    │         │
                    ▼         ▼
             ┌──────────┐  ┌──────────┐
             │completed │  │ retrying │ ◄── DEAD END
             └──────────┘  └──────────┘
                                    │
                                    │ failJob()
                                    │ (shouldRetry=false)
                                    ▼
                             ┌──────────┐
                             │  failed  │
                             └──────────┘
```

### 2.1 CRITICAL: `retrying` Is a Dead End

| Step | Code | Status Set |
|------|------|------------|
| Job claimed | `claim_next_pending_job()` | `'processing'` |
| Handler succeeds | `completeJob()` | `'completed'` |
| Handler fails, retries remain | `failJob()` | `'retrying'` |
| Handler fails, no retries | `failJob()` | `'failed'` |
| Next cron invocation | `claim_next_pending_job()` WHERE `status = 'pending'` | — |
| **`retrying` jobs** | **NEVER matched** | **PERMANENTLY STUCK** |

**Evidence:**
- `claim_next_pending_job()` at line 29: `WHERE bj.status = 'pending'`
- `failJob()` at line 81: `status: shouldRetry ? 'retrying' : 'failed'`
- No code anywhere transitions `'retrying'` → `'pending'`

---

## 3. RETRY LIFECYCLE ANALYSIS

### 3.1 Current Backoff Formula

```typescript
scheduled_at: shouldRetry
  ? new Date(Date.now() + 5000 * Math.pow(2, attempts - 1)).toISOString()
  : undefined
```

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1st failure (attempts=1) | 5s | 5s |
| 2nd failure (attempts=2) | 10s | 15s |
| 3rd failure (attempts=3) | — | Marked `'failed'` |

### 3.2 Backoff Analysis

- Exponential formula: ✅ Correct
- Bounded retries: ✅ `max_attempts` default 3
- **But `scheduled_at` is set while status is `'retrying'`**, which is never claimed

### 3.3 Required Fix: Two Options

**Option A: Change `failJob()` to set `'pending'`**
```typescript
status: shouldRetry ? ('pending' satisfies JobStatus) : ('failed' satisfies JobStatus),
```
- `scheduled_at` future timestamp already prevents premature re-execution
- `claim_next_pending_job()` will pick it up when `scheduled_at <= NOW()`
- ✅ Simple, correct, minimal change

**Option B: Change `claim_next_pending_job()` to also match `'retrying'`**
```sql
WHERE bj.status IN ('pending', 'retrying')
  AND bj.scheduled_at <= NOW()
```
- Requires modifying a PostgreSQL function (migration needed)
- Also correct but more invasive

**Recommendation: Option A** — single line change in TypeScript, no migration needed.

### 3.4 Why Option A Is Safe

1. `scheduled_at` is set to a future time (5s, 10s, 20s)
2. `claim_next_pending_job()` checks `scheduled_at <= NOW()`
3. So `'pending'` + future `scheduled_at` = job waits until backoff expires
4. Then gets claimed normally
5. ✅ Backoff is preserved without needing `'retrying'` status

---

## 4. CLAIMING / CONCURRENCY MODEL

### 4.1 Claim Flow (Verified)

```
1. claim_next_pending_job()
   → SELECT id FROM background_jobs
     WHERE status = 'pending'
       AND scheduled_at <= NOW()
     ORDER BY priority DESC, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
   → UPDATE SET status = 'processing', started_at = NOW()
   → RETURN job details

2. processPendingJobs()
   → Increments attempts
   → Calls handler
   → On success: completeJob() → status = 'completed'
   → On failure: failJob() → status = 'retrying'/'failed'
```

### 4.2 Concurrency Safety

| Scenario | Protection | Status |
|----------|------------|--------|
| Two workers claim same job | `FOR UPDATE SKIP LOCKED` | ✅ Safe |
| Two cron invocations | `SKIP LOCKED` | ✅ Safe |
| Duplicate DISPATCH_RETRY | Partial unique index | ✅ Safe |
| Duplicate OFFER_TIMEOUT | Partial unique index | ✅ Safe |
| Duplicate REFUND_PROCESS | No unique index — refund status check | ⚠️ Partial |

### 4.3 Stuck Processing Jobs

| Scenario | Current Behavior | Risk |
|----------|-----------------|------|
| Worker crashes after claim | Job stays `'processing'` forever | **HIGH** |
| Request times out (Vercel 60s/300s) | Job stays `'processing'` forever | **HIGH** |
| Database connection fails mid-handler | Job stays `'processing'` forever | **HIGH** |
| Handler hangs | Job stays `'processing'` until Vercel timeout | **MEDIUM** |

**No recovery mechanism exists.** Jobs permanently stuck in `'processing'` consume no resources but are never retried.

---

## 5. FAILURE / RECOVERY MODEL

### 5.1 Stuck-Job Recovery Design

**Mechanism:** Sweeper query in cron processor, before claiming new jobs.

```sql
-- Mark jobs stuck in 'processing' for more than 5 minutes as 'failed'
UPDATE background_jobs
SET status = 'failed',
    error_message = 'Job exceeded maximum processing time',
    failed_at = NOW(),
    updated_at = NOW()
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '5 minutes';
```

**Threshold:** 5 minutes
- Vercel Hobby max function duration: 60s
- Vercel Pro max function duration: 300s (5 minutes)
- 5 minutes covers the longest possible Vercel function execution
- Jobs legitimately taking >5 minutes are pathological for this architecture

**Implementation:**
- Run the sweeper query at the start of each cron invocation
- Use service-role client (bypasses RLS)
- Log how many stuck jobs were recovered
- Do NOT increment attempts (the job didn't actually run)

### 5.2 Recovery Guarantees

| Property | Guarantee |
|----------|-----------|
| Concurrency-safe | ✅ UPDATE ... WHERE is atomic |
| Idempotent | ✅ Running twice doesn't double-count |
| Distinguishes crashed vs slow | ⚠️ 5-minute threshold is a heuristic |
| Preserves attempt count | ✅ Sweeper does NOT increment attempts |
| Terminal after max_attempts | ✅ If attempts >= max_attempts, job goes to 'failed' permanently |

---

## 6. CRON EXECUTION MODEL

### 6.1 Vercel Cron Constraints (Verified from Official Docs)

| Plan | Minimum Interval | Scheduling Precision |
|------|-----------------|---------------------|
| **Hobby** | Once per day | Per-hour (±59 min) |
| **Pro** | Once per minute | Per-minute |
| **Enterprise** | Once per minute | Per-minute |

**Critical:** The discovery report suggested "every 30 seconds." This is **NOT possible on any Vercel plan.** The minimum on Pro is once per minute.

### 6.2 Recommended Cron Schedule

**For Pro plan:**
```json
{
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

**For Hobby plan (if testing locally):**
```json
{
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Impact of once-per-minute vs every-30-seconds:**
- Dispatch offer timeout: 30 seconds default → with 1-minute cron, worst case 90 seconds before timeout is processed
- Refund processing: minutes of delay → acceptable for async refund
- Stale rider detection: runs every minute → acceptable
- **Conclusion:** Once per minute is adequate for MVP

### 6.3 Vercel Cron Behavior

- Vercel makes HTTP GET to the production deployment URL
- Includes `Authorization: Bearer {CRON_SECRET}` header
- Includes `x-vercel-cron-schedule` header
- User agent: `vercel-cron/1.0`
- Can be triggered manually from Vercel dashboard

---

## 7. AUTHENTICATION / SECURITY MODEL

### 7.1 Current Cron Auth (BUG)

```typescript
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Bug:** When `CRON_SECRET` is not set:
- `cronSecret` is `undefined`
- `undefined && ...` evaluates to `false`
- **Endpoint is UNPROTECTED**

### 7.2 Vercel Recommended Pattern

```typescript
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

When `CRON_SECRET` is not set:
- `!cronSecret` is `true`
- **Endpoint is PROTECTED** (rejects all requests)

### 7.3 Required Fix

Change the condition from:
```typescript
if (cronSecret && authHeader !== `Bearer ${cronSecret}`)
```
To:
```typescript
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`)
```

This ensures:
- If CRON_SECRET is not set → endpoint rejects all requests (safe default)
- If CRON_SECRET is set → validates the Bearer token
- Matches Vercel's official recommendation

### 7.4 Environment Configuration

| Variable | Required | Status |
|----------|----------|--------|
| `CRON_SECRET` | Yes | ❌ Not set in .env.local |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | ✅ Set |
| `PAYSTACK_SECRET_KEY` | Yes (for refunds) | ❌ Not set in .env.local |

---

## 8. COMPLETE JOB-TYPE INVENTORY

| Job Type | Created By | Handler | Registered | Status |
|----------|-----------|---------|------------|--------|
| `DISPATCH_ORDER` | `paystack/route.ts` (webhook) | `dispatchService.processDispatchJob()` | ✅ | **ACTIVE** |
| `DISPATCH_RETRY` | `dispatch.service.ts` (offer timeout) | `dispatchService.processDispatchRetry()` | ✅ | **ACTIVE** |
| `OFFER_TIMEOUT` | `dispatch.service.ts` (dispatch success) | `dispatchService.processOfferTimeout()` | ✅ | **ACTIVE** |
| `REFUND_PROCESS` | `cancel_order()` (cancellation) | `refundService.processRefundJob()` | ✅ | **ACTIVE** |
| `QUOTE_EXPIRATION` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `COMPLETE_ORDER` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `NOTIFICATION_EMAIL` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `NOTIFICATION_SMS` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `NOTIFICATION_PUSH` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `LOCATION_CLEANUP` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `RIDER_LOCATION_REFRESH` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |
| `EARNINGS_AGGREGATION` | ❌ Not created anywhere | ❌ None | ❌ | **DEFINED ONLY** |

### 8.1 Action for Each Unregistered Type

| Job Type | Action | Reason |
|----------|--------|--------|
| `QUOTE_EXPIRATION` | **Keep defined, no handler needed** | Quotes expire via DB query, not background job |
| `COMPLETE_ORDER` | **Keep defined, no handler needed** | Completion is synchronous via API |
| `NOTIFICATION_EMAIL` | **Defer to Phase 5** | Notifications not yet implemented |
| `NOTIFICATION_SMS` | **Defer to Phase 5** | Notifications not yet implemented |
| `NOTIFICATION_PUSH` | **Defer to Phase 5** | Notifications not yet implemented |
| `LOCATION_CLEANUP` | **Keep defined, no handler needed** | Cleanup runs via stale rider detection |
| `RIDER_LOCATION_REFRESH` | **Keep defined, no handler needed** | Location updates are real-time via API |
| `EARNINGS_AGGREGATION` | **Defer to Phase 5** | Earnings are calculated synchronously |

---

## 9. PROPOSED PHASE 4D CHANGES

### 9.1 CRITICAL Fixes

| # | Change | File | Lines |
|---|--------|------|-------|
| 1 | Fix retry: `failJob()` sets `'pending'` not `'retrying'` | `background-job.service.ts` | 1 line |
| 2 | Fix cron auth: `!cronSecret \|\|` pattern | `cron/process-jobs/route.ts` | 1 line |
| 3 | Add `vercel.json` with cron schedule | `vercel.json` (new) | 5 lines |

### 9.2 HIGH Priority Fixes

| # | Change | File | Lines |
|---|--------|------|-------|
| 4 | Add stuck-job sweeper | `cron/process-jobs/route.ts` | ~15 lines |
| 5 | Add sweeper PostgreSQL function | Migration | ~15 lines |

### 9.3 MEDIUM Priority Improvements

| # | Change | File | Lines |
|---|--------|------|-------|
| 6 | Add job processing duration tracking | `background-job.service.ts` | ~5 lines |
| 7 | Add handler timeout (Promise.race) | `background-job.service.ts` | ~10 lines |

---

## 10. DATABASE CHANGES REQUIRED

### 10.1 New Function (Sweeper)

```sql
CREATE OR REPLACE FUNCTION recover_stuck_jobs(
  p_stale_threshold_minutes INTEGER DEFAULT 5
) RETURNS INTEGER AS $$
DECLARE
  v_recovered INTEGER;
BEGIN
  UPDATE background_jobs
  SET status = 'failed',
      error_message = format('Job exceeded maximum processing time (%s minutes)', p_stale_threshold_minutes),
      failed_at = NOW(),
      updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - (p_stale_threshold_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;
  RETURN v_recovered;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;
```

### 10.2 No Other Database Changes

- No new tables
- No new columns
- No new indexes
- No modified existing functions

---

## 11. APPLICATION CHANGES REQUIRED

### 11.1 `background-job.service.ts`

```diff
- status: shouldRetry ? ('retrying' satisfies JobStatus) : ('failed' satisfies JobStatus),
+ status: shouldRetry ? ('pending' satisfies JobStatus) : ('failed' satisfies JobStatus),
```

### 11.2 `cron/process-jobs/route.ts`

```diff
- if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
+ if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
```

Add sweeper call before job processing:
```typescript
// Recover stuck processing jobs
const recoveredCount = await serviceRole.rpc('recover_stuck_jobs', {
  p_stale_threshold_minutes: 5
});
if (recoveredCount > 0) {
  console.warn(`[CRON] Recovered ${recoveredCount} stuck jobs`);
}
```

---

## 12. DEPLOYMENT / ENVIRONMENT CHANGES

### 12.1 New File: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

### 12.2 Environment Variables

| Variable | Action |
|----------|--------|
| `CRON_SECRET` | Generate and set in Vercel dashboard |
| `VERCEL_TEAM_ID` | Verify correct team/project |

---

## 13. IDEMPOTENCY GUARANTEES

| Operation | Idempotent? | Mechanism |
|-----------|-------------|-----------|
| `claim_next_pending_job()` | ✅ | `FOR UPDATE SKIP LOCKED` |
| `completeJob()` | ✅ | Status check (already completed → no-op) |
| `failJob()` | ✅ | Status update (idempotent write) |
| `recover_stuck_jobs()` | ✅ | `UPDATE WHERE status = 'processing'` (idempotent) |
| `DISPATCH_ORDER` handler | ⚠️ Partially | DB constraints prevent duplicate assignments |
| `DISPATCH_RETRY` handler | ⚠️ Partially | Completed retry count check |
| `OFFER_TIMEOUT` handler | ✅ | Atomic status update `offered → expired` |
| `REFUND_PROCESS` handler | ✅ | Refund status check before processing |

---

## 14. CONCURRENCY GUARANTEES

| Guarantee | Mechanism | Status |
|-----------|-----------|--------|
| No double-claim | `FOR UPDATE SKIP LOCKED` | ✅ |
| No duplicate active assignments | Partial unique index | ✅ |
| No duplicate DISPATCH_RETRY | Partial unique index | ✅ |
| No duplicate OFFER_TIMEOUT | Partial unique index | ✅ |
| Stuck-job recovery atomic | `UPDATE WHERE` is atomic | ✅ |
| Sweeper vs handler race | Sweeper only targets stale (>5min) jobs | ✅ |

---

## 15. FAILURE SCENARIOS

| Scenario | Current Behavior | After Phase 4D |
|----------|-----------------|----------------|
| Handler throws exception | Job → `'retrying'` (stuck) | Job → `'pending'` with future `scheduled_at` |
| Worker crashes after claim | Job stuck `'processing'` forever | Sweeper marks as `'failed'` after 5 min |
| Paystack API fails | Job → `'retrying'` (stuck) | Job → `'pending'`, retries with backoff |
| Paystack API times out | Job stuck `'processing'` | Sweeper after 5 min, then retry |
| Cron never runs | Jobs never processed | `vercel.json` enables cron |
| CRON_SECRET missing | Endpoint unprotected | Endpoint rejects all requests |
| Retry exhausted | Job → `'failed'` | Same (terminal state) |
| Duplicate webhook event | Handled by idempotency | Same |

---

## 16. TESTING STRATEGY

### 16.1 New Tests Required

| # | Test | Type | Priority |
|---|------|------|----------|
| 1 | `failJob()` sets status to `'pending'` not `'retrying'` | Unit | CRITICAL |
| 2 | Cron auth rejects when `CRON_SECRET` not set | Unit | HIGH |
| 3 | Cron auth accepts valid `CRON_SECRET` | Unit | HIGH |
| 4 | `recover_stuck_jobs()` marks old processing jobs as failed | Unit | HIGH |
| 5 | `recover_stuck_jobs()` does NOT touch recent processing jobs | Unit | HIGH |
| 6 | `recover_stuck_jobs()` is idempotent | Unit | MEDIUM |
| 7 | Stale job threshold is configurable | Unit | MEDIUM |
| 8 | Job retry respects `scheduled_at` delay | Unit | HIGH |
| 9 | Existing Phase 1-4C tests still pass | Regression | CRITICAL |

### 16.2 Total: ~9 new tests

---

## 17. RISKS AND TRADE-OFFS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Changing `'retrying'` → `'pending'` may affect existing jobs | LOW | No jobs currently in `'retrying'` status |
| 5-minute stuck threshold may be too short | LOW | Vercel max duration is 5 min on Pro |
| Once-per-minute cron may be too slow for dispatch | MEDIUM | Acceptable for MVP; dispatch offer timeout already 30s |
| Sweeper may mark legitimately slow jobs as failed | LOW | 5 minutes is generous for current handlers |
| `vercel.json` requires redeployment | LOW | Standard Vercel workflow |

---

## 18. EXPLICIT IMPLEMENTATION SEQUENCE

### Step 1: Database Migration
- Create `recover_stuck_jobs()` function
- Sync migration to both locations

### Step 2: Fix retry mechanism
- Change `failJob()` status from `'retrying'` to `'pending'`

### Step 3: Fix cron authentication
- Change condition to `!cronSecret || authHeader !== ...`

### Step 4: Add stuck-job sweeper
- Call `recover_stuck_jobs()` at start of cron processor
- Log recovery count

### Step 5: Add `vercel.json`
- Configure cron schedule

### Step 6: Tests
- Add new tests for retry, auth, sweeper

### Step 7: Verification
- Typecheck, lint, tests, build
- Migration sync
- Secrets/attribution scan

---

## 19. FINAL RECOMMENDATION

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

| Finding | Severity | Fix Effort |
|---------|----------|------------|
| Retry mechanism broken | CRITICAL | 1 line |
| Cron auth vulnerability | HIGH | 1 line |
| No cron configuration | CRITICAL | 1 file |
| No stuck-job recovery | HIGH | ~15 lines |
| Unregistered job types | LOW | No action needed (deferred) |

All fixes are small, targeted, and do not change architecture.

---

*Architecture review completed: August 24, 2026*
*Baseline: 858f2c6a69dcc5a208a4838d5b8fdfdca29d88ec*
