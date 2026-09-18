# PHASE 6L — ARCHITECTURE REVIEW

**Date:** August 28, 2026
**HEAD:** `4136fa0`
**Scope:** Architecture review only. No code changes.

---

## 1. Executive Summary

Phase 6L resolves the highest-priority operational-safety gaps identified in Phase 6K: migrating 112 raw `console.log/error/warn` calls to the structured logger, establishing request-level correlation IDs, protecting the cron endpoint, and adding critical test coverage.

**Key finding:** The existing logger (`lib/logger.ts`) already supports correlation IDs and child loggers. The architecture does NOT need redesign — it needs consistent adoption.

**Target scope:** ~35 files modified, 0 new files, 0 new dependencies, 0 database changes.

---

## 2. Current Logger Assessment

### Existing Logger API

```
logger.info(message, context)
logger.warn(message, context)
logger.error(message, context, error)
logger.child(context) → child logger with pre-bound fields
generateCorrelationId() → UUID
```

### Already Supported

| Feature | Status |
|---------|--------|
| Structured JSON output | ✅ |
| Log levels (debug/info/warn/error) | ✅ |
| Context fields | ✅ `correlation_id`, `order_id`, `rider_id`, `job_id`, etc. |
| Child logger with bound context | ✅ |
| Correlation ID generation | ✅ |
| Environment-based level filtering | ✅ `LOG_LEVEL` env var |
| Error serialization | ✅ `error_name`, `error_message` |

### NOT Currently Used

| Feature | Status |
|---------|--------|
| `child()` logger | ❌ Not used anywhere — always `logger.error(msg, undefined, err)` |
| `correlation_id` propagation | ❌ Only in webhook handler |
| Event naming convention | ❌ Messages are ad-hoc strings |
| Request context binding | ❌ Each route manually creates context |

### Assessment

**The logger is sufficient.** No redesign needed. The gap is adoption and consistent usage, not capability.

---

## 3. Correlation-ID Architecture

### Design

One correlation ID per request. No separate trace/request concepts at current scale.

### Model

```
Request arrives
  → generate correlation_id (or accept X-Request-Id header)
  → bind to child logger: logger.child({ correlation_id })
  → pass child logger through service calls
  → include in response header: X-Request-Id
```

### Decision: Accept Incoming Request IDs

- Accept `X-Request-Id` header from clients (useful for client-side debugging)
- Generate a new UUID if not provided
- Do NOT use the client-supplied value as an authorization mechanism
- Do NOT trust it for security decisions

### Propagation Points

| Layer | How |
|-------|-----|
| API route | Generate/accept correlation_id, create child logger |
| Service calls | Pass child logger (already supports `LogContext`) |
| Background jobs | Generate `job_id` as correlation context |
| Webhook handler | Already generates `correlation_id` — keep as-is |
| Database operations | Pass logger context through service layer |

### Response Header

```http
X-Request-Id: <uuid>
```

Added to all API responses. Client can use this for support/debugging.

### Naming

Use `correlation_id` as the single field name across all log entries and contexts. This is the standard term in distributed systems.

---

## 4. Structured Log Schema

### Envelope (already implemented in logger.ts)

```json
{
  "level": "info",
  "message": "order.created",
  "timestamp": "2026-08-28T12:00:00.000Z",
  "context": {
    "correlation_id": "uuid",
    "order_id": "uuid",
    "user_id": "uuid",
    "route": "POST /api/orders",
    "status": 201,
    "duration_ms": 45
  },
  "error_name": "Error",
  "error_message": "optional"
}
```

### Standard Context Fields

| Field | Type | Source | Safe to Log? |
|-------|------|--------|-------------|
| `correlation_id` | UUID | Generated/accepted | ✅ Yes |
| `order_id` | UUID | Business context | ✅ Yes |
| `quote_id` | UUID | Business context | ✅ Yes |
| `rider_id` | UUID | Business context | ✅ Yes |
| `customer_id` | UUID | Business context | ✅ Yes |
| `job_id` | UUID | Job processing | ✅ Yes |
| `job_type` | string | Job processing | ✅ Yes |
| `event_id` | string | Webhook event | ✅ Yes |
| `event_type` | string | Webhook event | ✅ Yes |
| `route` | string | Request metadata | ✅ Yes |
| `method` | string | HTTP method | ✅ Yes |
| `status` | number | HTTP status | ✅ Yes |
| `duration_ms` | number | Performance | ✅ Yes |
| `attempt` | number | Retry context | ✅ Yes |

### NEVER Log

- Passwords, tokens, API keys, secrets
- Full request/response bodies (except at debug level for non-sensitive routes)
- Raw webhook signatures
- Full Paystack responses (may contain card data)
- Cookies, authorization headers

---

## 5. Request Lifecycle

### Current State (inconsistent)

```
Route A: try { ... } catch { logger.error('Error doing X', undefined, error) }
Route B: try { ... } catch { console.error('Error doing X:', error) }
Route C: try { ... } catch { logger.error('Error doing X') }  // no error object
```

### Target State

```
Request → middleware/beginning:
  correlation_id = header || generateUUID()
  reqLogger = logger.child({ correlation_id, route, method })

Request → handler:
  Use reqLogger throughout

Request → response:
  Set X-Request-Id header
  Log request completion with duration

Request → error:
  Log via reqLogger with error details
  Return safe client response
```

### Implementation Point: Shared API Route Wrapper

Rather than adding correlation logic to every route, create a lightweight `withRequestContext` wrapper:

```typescript
async function withRequestContext(
  request: NextRequest,
  handler: (logger: ChildLogger, user?: User) => Promise<NextResponse>
): Promise<NextResponse>
```

This wrapper:
1. Extracts/generates correlation_id
2. Creates child logger with route + method context
3. Measures duration
4. Sets X-Request-Id response header
5. Calls the handler
6. Logs completion with status and duration
7. Catches unhandled errors and logs them

This eliminates boilerplate from every route without modifying the logger itself.

---

## 6. Cron Security Architecture

### Current State

The cron endpoint (`/api/cron/process-jobs`) **already has Bearer token authentication**:

```typescript
const authHeader = request.headers.get('authorization');
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Assessment

**VERIFIED.** The cron endpoint is already protected.

| Check | Status |
|-------|--------|
| Bearer token required | ✅ |
| Fail-closed if secret not configured | ✅ |
| Signature validation | N/A (Bearer token, not HMAC) |
| Rate limiting | Not needed for cron (low frequency) |

### Remaining Gap

The one weakness is that the comparison `authHeader !== \`Bearer ${cronSecret}\`` is not timing-safe. An attacker could theoretically use timing analysis to guess the token character by character.

**Recommendation:** Use `crypto.timingSafeEqual()` for the comparison. This is a minor hardening, not a critical fix.

---

## 7. Console Migration Strategy

### Classification of 112 Calls

| Category | Count | Action |
|----------|-------|--------|
| Service-level error logging (dispatch, delivery, rider, refund, earnings) | ~40 | Migrate to `logger.error/warn` |
| API route error handling | ~35 | Migrate to `logger.error` or `handleApiError` |
| Service-level info/debug (dispatch flow, offer lifecycle) | ~20 | Migrate to `logger.info/debug` |
| Client component error logging | ~8 | Migrate to `logger.error` |
| Logger.ts internal (uses console.log for output) | ~5 | Keep as-is — this is the output mechanism |
| Background job warning/error | ~4 | Migrate to `logger.warn/error` |

### Migration Rules

1. **`console.error(msg)`** → `logger.error(msg)` with appropriate context
2. **`console.error(msg, error)`** → `logger.error(msg, context, error)`
3. **`console.log(msg)`** → `logger.info(msg)` with context
4. **`console.warn(msg)`** → `logger.warn(msg)` with context
5. **Client components** → `logger.error` (runs on server in Next.js App Router)
6. **Logger.ts internal** → Keep `console.log/error/warn` — this IS the output mechanism

### Event Naming Convention

Standardize on dot-notation event names:

| Current Pattern | Target Pattern |
|----------------|---------------|
| `console.error('Order creation error:', error)` | `logger.error('order.creation_failed', { order_id }, error)` |
| `console.log('[DISPATCH] Processing dispatch for order...')` | `logger.info('dispatch.processing', { order_id })` |
| `console.error('Quote linking error:', linkError)` | `logger.warn('order.quote_link_failed', { order_id, quote_id }, error)` |

### Files Requiring Migration

| Area | Files | Console Calls |
|------|-------|--------------|
| `lib/services/dispatch.service.ts` | 1 | ~12 |
| `lib/services/active-delivery.service.ts` | 1 | ~9 |
| `lib/services/rider-offer.service.ts` | 1 | ~9 |
| `lib/services/refund.service.ts` | 1 | ~8 |
| `lib/services/order.service.ts` | 1 | ~4 |
| `lib/services/admin.service.ts` | 1 | ~4 |
| `lib/services/rider.service.ts` | 1 | ~7 |
| `lib/services/background-job.service.ts` | 1 | ~4 |
| `lib/services/rider-location.service.ts` | 1 | ~1 |
| `app/api/**/route.ts` | ~25 | ~35 |
| `components/**/*.tsx` | ~3 | ~3 |
| **Total** | **~37** | **~112** |

---

## 8. Background Job Correlation

### Current State

Jobs are identified by:
- `job.id` (UUID)
- `job.job_type` (string)
- `job.attempts` (number)

But logs from job processing do not consistently include these fields.

### Target State

All job processing logs must include:

```json
{
  "job_id": "uuid",
  "job_type": "DISPATCH_ORDER",
  "attempt": 2,
  "order_id": "uuid",
  "correlation_id": "uuid"
}
```

### Implementation

In `background-job.service.ts`, create a child logger for each job execution:

```typescript
const jobLogger = logger.child({
  job_id: job.id,
  job_type: job.job_type,
  attempt: job.attempts + 1,
});
```

Pass this `jobLogger` to the handler. Handlers should accept the logger as a parameter or use the bound context.

---

## 9. Webhook Correlation

### Current State (Already Good)

The webhook handler already:
- Generates `correlationId` via `crypto.randomUUID()`
- Logs with `correlation_id` on every significant event
- Logs webhook received, duplicate ignored, payment confirmed, payment failed

### Remaining Gap

The correlation ID is generated inside the handler but is NOT propagated to downstream services (dispatch, refund). The `serviceRole.rpc()` calls and background job inserts don't carry the correlation context.

### Target

Pass correlation_id to:
- `verify_payment_and_confirm_order` RPC (as metadata)
- Background job payload (as `correlation_id`)
- Downstream service calls via logger context

---

## 10. Test Architecture

### Tests to Add

| Test | Type | Priority |
|------|------|----------|
| Logger structured output format | Unit | MUST |
| Logger child context merging | Unit | MUST |
| Logger level filtering | Unit | SHOULD |
| `withRequestContext` generates correlation_id | Unit | MUST |
| `withRequestContext` accepts X-Request-Id | Unit | MUST |
| `withRequestContext` sets response header | Unit | MUST |
| Cron: valid Bearer token accepted | Unit | MUST |
| Cron: invalid token rejected (401) | Unit | MUST |
| Cron: missing token rejected (401) | Unit | MUST |
| Webhook: duplicate event idempotent | Unit | SHOULD |
| Quote: concurrent consumption (only one succeeds) | Unit | SHOULD |

### Test Location

All new tests go in `packages/shared/validators/` following existing conventions.

---

## 11. Rate Limiting Review

### VERIFIED — No Changes Needed

| Check | Status |
|-------|--------|
| Cron endpoint rate limiting | Not needed (low frequency, already auth-protected) |
| Webhook endpoint rate limiting | Not needed (Paystack controls delivery rate) |
| Current identity derivation | ✅ Sufficient (user ID or IP) |
| Current limits | ✅ Appropriate |
| In-memory store | ✅ Adequate for current scale |

---

## 12. API Error Model

### Current State (Good)

`lib/api-error.ts` provides:
- `handleApiError(error, context)` — maps known errors to HTTP status
- Safe client responses (no stack traces)
- Server-side structured logging

### Gap

Not all routes use `handleApiError`. Many routes have inline error handling with `console.error` + generic response. These should be migrated to use `handleApiError` for consistency.

### Target

All API routes should follow this pattern:

```typescript
try {
  // ... handler logic
} catch (error) {
  return handleApiError(error, { correlation_id, route: 'POST /api/orders' });
}
```

---

## 13. Performance / Log Volume

### Assessment

| Concern | Risk | Mitigation |
|---------|------|-----------|
| 112 console calls migrated | LOW | Same volume, just structured |
| GPS/location logging | LOW | Rider location updates are already throttled |
| DEBUG level in production | LOW | Default level is `info`, debug suppressed |
| Structured JSON overhead | NEGLIGIBLE | JSON.stringify is fast for small objects |
| Log volume increase | NEGLIGIBLE | Same number of log lines, just better formatted |

**No performance concerns.**

---

## 14. External Infrastructure

### Assessment

| Item | Required? | Reason |
|------|-----------|--------|
| Sentry / error reporting | NO | Deferred — not blocking production |
| OpenTelemetry | NO | Overkill at current scale |
| Redis | NO | In-memory rate limiter sufficient |
| Log aggregation service | DEFERRED | Vercel logging sufficient for now |
| External monitoring | DEFERRED | Can add later |

**No new external dependencies required.**

---

## 15. Implementation Map

### Step 1: Create `withRequestContext` wrapper

| Property | Value |
|----------|-------|
| File | `apps/web/lib/request-context.ts` |
| Purpose | Generate/accept correlation_id, create child logger, measure duration, set response header |
| Dependencies | `lib/logger.ts` (existing) |
| Complexity | LOW |
| Database impact | NONE |
| Test requirements | 4 unit tests |

### Step 2: Migrate service files to structured logger

| Property | Value |
|----------|-------|
| Files | 9 service files |
| Purpose | Replace ~50 console calls with logger calls |
| Dependencies | `lib/logger.ts` (existing) |
| Complexity | LOW (mechanical) |
| Database impact | NONE |
| Test requirements | Logger behavior already tested |

### Step 3: Migrate API routes to use `withRequestContext`

| Property | Value |
|----------|-------|
| Files | ~25 API route files |
| Purpose | Add correlation_id, use child logger, use handleApiError |
| Dependencies | `lib/request-context.ts` (new), `lib/logger.ts`, `lib/api-error.ts` |
| Complexity | LOW (mechanical) |
| Database impact | NONE |
| Test requirements | 3 unit tests for wrapper |

### Step 4: Migrate remaining console calls

| Property | Value |
|----------|-------|
| Files | ~5 component files, ~3 service files |
| Purpose | Replace remaining ~15 console calls |
| Dependencies | `lib/logger.ts` |
| Complexity | LOW |
| Database impact | NONE |

### Step 5: Add cron timing-safe comparison

| Property | Value |
|----------|-------|
| File | `app/api/cron/process-jobs/route.ts` |
| Purpose | Use `crypto.timingSafeEqual()` for Bearer token comparison |
| Dependencies | `crypto` (Node.js built-in) |
| Complexity | TRIVIAL |
| Database impact | NONE |

### Step 6: Add tests

| Property | Value |
|----------|-------|
| Files | `packages/shared/validators/phase6l-*.test.ts` |
| Purpose | Logger, correlation, cron auth, webhook idempotency, quote concurrency |
| Dependencies | None |
| Complexity | LOW |
| Database impact | NONE |
| Test count | ~11 new tests |

---

## 16. MUST / SHOULD / DEFER / EXTERNAL

### MUST IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 1 | `withRequestContext` wrapper | Eliminates boilerplate, enables correlation |
| 2 | 112 console → logger migration | Production failures are currently untraceable |
| 3 | Cron timing-safe comparison | Minor security hardening |
| 4 | Service file logger adoption | 50+ console calls in critical services |
| 5 | API route logger adoption | 35+ console calls in API handlers |
| 6 | Cron auth test | Verify Bearer token enforcement |
| 7 | Correlation ID test | Verify generation and propagation |

### SHOULD IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 8 | Webhook idempotency test | Verify duplicate handling |
| 9 | Quote concurrency test | Verify atomic consumption |
| 10 | Child logger context test | Verify context merging |

### DEFER

| # | Item | Reason |
|---|------|--------|
| 11 | Sentry / error reporting | External vendor decision required |
| 12 | OpenTelemetry | Overkill at current scale |
| 13 | Rate limiting on remaining 40 routes | Low-priority abuse surface |
| 14 | Request-level timing metrics | Can add later |

### EXTERNAL

| # | Item | Reason |
|---|------|--------|
| 15 | Log aggregation service | Vercel logging sufficient for now |
| 16 | Stadia production config | Dashboard manual setup |

---

## 17. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Logger migration introduces regression | LOW | LOW | Mechanical replacement, same behavior |
| Correlation ID adds overhead | NEGLIGIBLE | NONE | UUID generation is fast |
| withRequestContext breaks existing routes | LOW | MEDIUM | Wrap existing handler, test all critical routes |
| Cron timing-safe comparison breaks auth | VERY LOW | LOW | crypto.timingSafeEqual is a drop-in |
| New tests fail | LOW | LOW | Test against existing behavior |

---

## 18. Verification

| Check | Result |
|-------|--------|
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Database modified | ✅ NONE |
| package.json unchanged | ✅ |
| Commits | ✅ NONE |
| Pushes | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only this report) |

---

## 19. Final Phase 6L Recommendation

### GO — Implementation is safe and justified.

The proposed scope is:
- **0** new dependencies
- **0** database changes
- **1** new utility file (`request-context.ts`)
- **~37** files modified (mechanical logger migration)
- **~11** new tests
- **0** architectural changes

The value is high: production failures become traceable, correlatable, and diagnosable. The risk is low: mechanical migration with existing patterns.

### Expected Outcomes After Phase 6L

| Before | After |
|--------|-------|
| 112 unstructured console calls | 0 — all structured |
| No request correlation | Every request has correlation_id |
| Cron endpoint uses string comparison | Timing-safe comparison |
| No webhook replay tests | Idempotency verified |
| No quote concurrency tests | Atomic consumption verified |
| ~438 tests | ~449 tests |

---

**PHASE 6L ARCHITECTURE REVIEW — COMPLETE**
**READY FOR IMPLEMENTATION AUTHORIZATION**
