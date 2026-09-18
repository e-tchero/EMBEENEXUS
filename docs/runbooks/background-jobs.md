# Background Jobs Runbook — Embee Nexus

## Overview

Embee Nexus uses a PostgreSQL-based background job system with:
- `FOR UPDATE SKIP LOCKED` for concurrent processing
- Exponential backoff for retries
- Max attempts limit
- Stuck job recovery

## Job Types

| Job Type | Purpose | Priority |
|----------|---------|----------|
| `DISPATCH_ORDER` | Find and assign riders | HIGH |
| `DISPATCH_RETRY` | Retry failed dispatch | HIGH |
| `OFFER_TIMEOUT` | Expire unanswered offers | MEDIUM |
| `QUOTE_EXPIRATION` | Expire old quotes | LOW |
| `COMPLETE_ORDER` | Finalize delivered orders | HIGH |
| `NOTIFICATION_EMAIL` | Send email notifications | MEDIUM |
| `NOTIFICATION_SMS` | Send SMS notifications | LOW |
| `NOTIFICATION_PUSH` | Send push notifications | LOW |
| `REFUND_PROCESS` | Process refunds | HIGH |
| `LOCATION_CLEANUP` | Clean stale locations | LOW |
| `RIDER_LOCATION_REFRESH` | Refresh rider locations | LOW |
| `EARNINGS_AGGREGATION` | Aggregate rider earnings | LOW |

## Common Issues

### Stuck Jobs

**Symptoms:**
- Jobs stuck in "processing" status
- Job count increasing but not completing

**Investigation:**
1. Check stuck jobs:
   ```sql
   SELECT * FROM background_jobs
   WHERE status = 'processing'
   AND started_at < NOW() - INTERVAL '5 minutes';
   ```
2. Check job handler logs
3. Check for worker crashes

**Resolution:**
```sql
-- Reset stuck jobs to pending
UPDATE background_jobs
SET status = 'pending', started_at = NULL
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '5 minutes';
```

### Failed Jobs

**Symptoms:**
- Jobs stuck in "failed" status
- Error messages in job record

**Investigation:**
1. Check failed jobs:
   ```sql
   SELECT * FROM background_jobs
   WHERE status = 'failed'
   ORDER BY failed_at DESC
   LIMIT 10;
   ```
2. Read error_message field
3. Check job handler code

**Resolution:**
- If transient error: reset to pending for retry
- If permanent error: fix code, then reset
- If max attempts exceeded: manually reset if needed

### Job Queue Backlog

**Symptoms:**
- Many pending jobs
- Jobs processing slowly

**Investigation:**
1. Check job counts by status:
   ```sql
   SELECT status, COUNT(*)
   FROM background_jobs
   GROUP BY status;
   ```
2. Check processing rate
3. Check for resource constraints

**Resolution:**
- If normal load: wait for processing
- If sustained: check for bottlenecks
- If critical: consider increasing concurrency

### Duplicate Jobs

**Symptoms:**
- Same job processed multiple times
- Duplicate side effects

**Investigation:**
1. Check for duplicate jobs:
   ```sql
   SELECT job_type, payload, COUNT(*)
   FROM background_jobs
   GROUP BY job_type, payload
   HAVING COUNT(*) > 1;
   ```
2. Check idempotency mechanism
3. Check job creation logic

**Resolution:**
- If idempotent: safe to process duplicates
- If not idempotent: add idempotency check

## Manual Intervention

### Reset All Stuck Jobs

```sql
UPDATE background_jobs
SET status = 'pending', started_at = NULL, attempts = attempts + 1
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '10 minutes';
```

### Cancel a Specific Job

```sql
UPDATE background_jobs
SET status = 'failed', error_message = 'Manually cancelled'
WHERE id = 'job-id';
```

### Retry a Failed Job

```sql
UPDATE background_jobs
SET status = 'pending', started_at = NULL, failed_at = NULL, error_message = NULL
WHERE id = 'job-id';
```

### View Job History

```sql
SELECT id, job_type, status, attempts, created_at, started_at, completed_at, failed_at, error_message
FROM background_jobs
ORDER BY created_at DESC
LIMIT 50;
```

## Monitoring

### Key Metrics

- Jobs processed per minute
- Average job duration
- Failure rate
- Stuck job count
- Queue depth

### Log Queries

```bash
# Find job failures
grep "job.failed" logs.json

# Find stuck job recovery
grep "job.stuck_recovery" logs.json

# Find job completions
grep "job.completed" logs.json
```

## Idempotency

### How It Works

1. Jobs use `FOR UPDATE SKIP LOCKED` to prevent concurrent processing
2. Job status transitions are atomic
3. Max attempts prevent infinite retries
4. Exponential backoff prevents retry storms

### Guarantee

Each job is processed exactly once under normal conditions.
Under failure conditions, a job may be processed at most `max_attempts` times.

## Performance

### Optimization

- Index on `(status, scheduled_at)` for efficient claiming
- Partial index on pending jobs
- Connection pooling for concurrent workers

### Capacity Planning

For Abuja MVP:
- 10-50 jobs/minute is typical
- Peak: 100 jobs/minute during dispatch
- Background job system handles this easily

## Recovery

### After Database Incident

1. Check job table integrity
2. Reset stuck/failed jobs
3. Resume normal processing

### After Application Incident

1. Jobs remain in database
2. Restart application
3. Jobs resume processing automatically

### After Provider Incident

1. Jobs retry automatically with backoff
2. Check delivery status when provider recovers
3. Manual retry if needed
