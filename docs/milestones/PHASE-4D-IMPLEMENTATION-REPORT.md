# PHASE 4D IMPLEMENTATION REPORT

## Executive Summary

Phase 4D fixes two critical defects and adds operational hardening to the background job system:

1. **CRITICAL: Retry mechanism was broken** — `failJob()` set `status = 'retrying'` but `claim_next_pending_job()` only claimed `status = 'pending'`. All retriable failures were permanently stuck.
2. **CRITICAL: No production cron** — No `vercel.json` existed, so the cron endpoint was never invoked.
3. **HIGH: Cron endpoint unprotected** — Missing `CRON_SECRET` allowed unauthenticated access.
4. **HIGH: No stuck-job recovery** — Crashed workers left jobs in `processing` forever.

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260823080000_phase4d_job_hardening.sql` | `recover_stuck_jobs()` function |
| `packages/database/migrations/20260823080000_phase4d_job_hardening.sql` | Synced migration copy |
| `packages/shared/validators/background-job.test.ts` | 43 new tests |
| `vercel.json` | Vercel cron configuration |
| `docs/milestones/PHASE-4D-ARCHITECTURE-REVIEW.md` | Architecture review |
| `docs/milestones/PHASE-4D-DISCOVERY-REPORT.md` | Discovery report |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/services/background-job.service.ts` | `failJob()`: `'retrying'` → `'pending'`; clear `scheduled_at` on terminal failure; add `recoverStuckJobs()` |
| `apps/web/app/api/cron/process-jobs/route.ts` | Fail closed on missing `CRON_SECRET`; integrate `recoverStuckJobs()` |

## Database Changes

### `recover_stuck_jobs(p_stale_threshold_seconds INTEGER DEFAULT 300)`

- **Purpose**: Recover jobs stuck in `processing` after worker crash
- **Mechanism**: Resets stale `processing` jobs to `pending` (if retries remain) or `failed` (if exhausted)
- **Threshold**: 300 seconds (5 minutes)
- **Idempotent**: Yes — running multiple times only touches genuinely stale jobs
- **SECURITY DEFINER**: Yes
- **search_path**: `public`

## Retry Lifecycle (Fixed)

```
processing → handler fails
  → attempts < max_attempts?
    YES: status = 'pending', scheduled_at = NOW + backoff
         (NOT 'retrying' — the critical fix)
    NO:  status = 'failed', failed_at = NOW (terminal)

pending + scheduled_at <= NOW → claim_next_pending_job()
  → FOR UPDATE SKIP LOCKED
  → status = 'processing'
  → handler runs
```

**Backoff preserved**: The `scheduled_at` delay ensures the job is not immediately re-claimed. `claim_next_pending_job()` checks `scheduled_at <= NOW()`.

## Cron Configuration

```json
{
  "crons": [{
    "path": "/api/cron/process-jobs",
    "schedule": "every 60 seconds"
  }]
}
```

- **Platform**: Vercel Pro (minimum cron interval: 60 seconds)
- **Authentication**: `CRON_SECRET` required; fails closed when absent
- **Recovery**: Runs `recover_stuck_jobs()` before processing pending jobs

## Stuck-Job Recovery Behavior

1. Cron invocation triggers `recover_stuck_jobs(300)`
2. Any job in `processing` with `started_at` older than 5 minutes is reset
3. If `attempts + 1 < max_attempts`: status → `pending`, `scheduled_at` → `NOW` (immediate re-claim)
4. If exhausted: status → `failed` (terminal)
5. Then `processPendingJobs()` runs normally

## Job-Type Matrix

| Job Type | Handler | Status | Enqueued By |
|----------|---------|--------|-------------|
| `DISPATCH_ORDER` | ✅ Registered | ACTIVE | booking.service.ts |
| `DISPATCH_RETRY` | ✅ Registered | ACTIVE | dispatch.service.ts |
| `OFFER_TIMEOUT` | ✅ Registered | ACTIVE | dispatch.service.ts |
| `REFUND_PROCESS` | ✅ Registered | ACTIVE | cancel_order() DB function |
| `QUOTE_EXPIRATION` | ❌ None | DEFINED ONLY | Not enqueued |
| `COMPLETE_ORDER` | ❌ None | DEFINED ONLY | Not enqueued |
| `NOTIFICATION_*` | ❌ None | DEFINED ONLY | Not enqueued |
| `LOCATION_CLEANUP` | ❌ None | DEFINED ONLY | Not enqueued |
| `RIDER_LOCATION_REFRESH` | ❌ None | DEFINED ONLY | Not enqueued |
| `EARNINGS_AGGREGATION` | ❌ None | DEFINED ONLY | Not enqueued |

**Verified**: No application code enqueues the "DEFINED ONLY" job types.

## Tests Added (43 new)

### Retry State Machine (8 tests)
- retryable job uses `pending` (not `retrying`)
- backoff preserved via `scheduled_at`
- exponential backoff doubles per attempt
- exhaustion transitions to `failed` (terminal)
- terminal failure sets `failed_at`
- retryable clears `failed_at`
- retryable sets `scheduled_at` to future time
- terminal clears `scheduled_at` to null

### Cron Authentication (4 tests)
- missing `CRON_SECRET` blocks access
- incorrect secret is rejected
- correct secret is accepted
- missing header with valid secret is rejected

### Stuck-Job Recovery (5 tests)
- 5-minute threshold is reasonable
- recovery respects retry limits
- exhausted jobs marked as failed
- stuck jobs reset to pending
- recovery sets `scheduled_at` to NOW

### Idempotency (6 tests)
- `FOR UPDATE SKIP LOCKED` mechanism
- only pending and due jobs claimable
- future-scheduled jobs not prematurely claimable
- processing/failed/completed jobs not claimable

### Job-Type Handling (5 tests)
- all 4 active handlers verified
- deferred types not enqueued
- unregistered type logs warning, doesn't crash

### Concurrency Safety (4 tests)
- `SKIP LOCKED` prevents duplicate claiming
- max 5 jobs per cron invocation
- recovery only touches stale jobs
- legitimate processing jobs not touched

### Vercel Cron (2 tests)
- minimum 60-second interval
- correct endpoint path

### Regression: Phase 1-4C (8 tests)
- `complete_delivery` requires auth
- `transition_order_status` requires auth
- `cancel_order` requires auth
- `fail_delivery` requires auth
- dispatch uses `FOR UPDATE SKIP LOCKED`
- offer acceptance uses atomic operations
- rider identity from `auth.uid()`
- RLS enabled

## Verification Results

| Check | Result |
|-------|--------|
| Typecheck | ✅ PASS |
| Unit tests | ✅ **264/264 PASS** (was 221) |
| Production build | ✅ PASS |
| Secrets scan | ✅ CLEAN (only env var references) |
| Attribution scan | ✅ ZERO |
| Migration sync | ✅ IDENTICAL |
| Git diff audit | ✅ Phase 4D only |

## Known Limitations

1. **`recover_stuck_jobs()` runs before processing** — Recovery and processing happen in the same cron invocation. If the cron itself crashes mid-recovery, some jobs may remain stuck until the next invocation.
2. **5-minute stale threshold** — Jobs running legitimately longer than 5 minutes (unlikely for current handlers) could be incorrectly recovered. Threshold is configurable via the function parameter.
3. **Live database verification** — Migration must be applied manually via Supabase Dashboard SQL Editor.

## Required Manual Action

Apply migration via Supabase Dashboard:
1. Go to: `https://supabase.com/dashboard/project/dlvdpmmaanrsiriarqqc/sql/new`
2. Paste contents of: `supabase/migrations/20260823080000_phase4d_job_hardening.sql`
3. Click "Run"
4. Tell me "done" for live database verification

Also ensure `CRON_SECRET` environment variable is configured in Vercel.
