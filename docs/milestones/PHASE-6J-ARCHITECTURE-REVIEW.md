# PHASE 6J — ARCHITECTURE REVIEW

**Date:** August 28, 2026
**Baseline:** `fc8018a` — feat(milestone-4-phase6h): unify route pricing lifecycle
**Reference:** PHASE-6I-DISCOVERY-REPORT.md

---

## 1. EXECUTIVE SUMMARY

Phase 6J addresses the production-hardening gaps identified in Phase 6I. The architecture targets the minimum changes required to make Embee Nexus production-safe without introducing unnecessary complexity.

### Scope Decision

After review, the Phase 6J scope is **narrower** than the full discovery report suggested. Several items are deferred or reclassified:

| Discovery Item | Decision | Rationale |
|----------------|----------|-----------|
| Rider payouts | **DEFERRED** | Requires founder business decision on payout provider, minimum thresholds, and KYC. Cannot architect without this. |
| Caching (Redis) | **DEFERRED** | Current scale (100 customers/day) does not justify caching infrastructure. PostgreSQL handles the load. |
| CSRF protection | **NOT REQUIRED** | Supabase Auth uses httpOnly SameSite cookies. No localStorage token auth exists. CSRF is not applicable. |
| Payment reconciliation | **DEFERRED** | Requires a scheduled batch job that cross-references Paystack transactions with internal records. Important but not blocking for initial production. |
| Expanded integration/E2E tests | **DEFERRED** | Requires test infrastructure decision (Playwright, Cypress, etc.). Out of scope for Phase 6J. |

### Approved Phase 6J Scope

| # | Item | Priority | Classification |
|---|------|----------|----------------|
| 1 | Rate limiting | HIGH | MUST IMPLEMENT |
| 2 | Error boundaries | HIGH | MUST IMPLEMENT |
| 3 | Structured logging | HIGH | MUST IMPLEMENT |
| 4 | Health check endpoint | HIGH | MUST IMPLEMENT |
| 5 | Database indexes | HIGH | MUST IMPLEMENT |
| 6 | Admin order management | HIGH | MUST IMPLEMENT |
| 7 | Webhook hardening | MEDIUM | SHOULD IMPLEMENT |
| 8 | console.log cleanup | LOW | SHOULD IMPLEMENT |
| 9 | .env.local cleanup | LOW | OPTIONAL |

---

## 2. CURRENT-STATE ASSESSMENT

### Security Model

The application uses **Supabase Auth with httpOnly SameSite cookies**. All API routes verify authentication via `supabase.auth.getUser()`. All database access uses either the user's session (RLS-enforced) or the service-role client (server-side only). No tokens are stored in localStorage. No Authorization headers are sent from the browser.

**CSRF Assessment:** Because authentication is cookie-based with SameSite=Strict/Lax, and no bearer tokens are stored client-side, CSRF attacks are already mitigated by the browser's SameSite policy. Adding CSRF tokens would provide defense-in-depth but is not required for the current auth model. **Decision: NOT REQUIRED for Phase 6J.**

### Error Handling Model

All API routes use a consistent pattern:
```typescript
try {
  // auth check
  // business logic
  // return success
} catch (error) {
  console.error('...', error);
  return NextResponse.json({ error: '...' }, { status: 500 });
}
```

**Gaps:** No per-route error boundaries in React. No structured logging. No correlation IDs. Errors are logged to console only.

### Database Index Model

50+ indexes already exist across all major tables. The schema was designed with performance in mind. The remaining gaps are specific composite indexes for high-frequency query patterns.

---

## 3. PHASE 6J SCOPE BOUNDARY

### IN SCOPE

- Rate limiting middleware for API routes
- React error boundaries for customer/rider/admin routes
- Structured logging utility replacing console.log
- Health check API endpoint
- Targeted database indexes (5 specific indexes)
- Admin order-management API + UI (read-only initially, with careful mutation design)
- Webhook hardening (idempotency improvements)
- console.log migration to structured logging

### OUT OF SCOPE

- Redis / caching layer
- CSRF token implementation
- Rider payout mechanism
- Payment reconciliation batch job
- Integration / E2E tests
- External observability vendor (Sentry, etc.)
- Notification system
- SEO / metadata
- New UI components or visual redesign
- Mapping changes
- Pricing changes
- Business logic changes
- Database schema changes (except additive indexes)

---

## 4. RATE-LIMITING ARCHITECTURE

### Design Principle

Rate limiting at the **API middleware level** using an in-memory sliding-window counter. No external dependency (Redis) is introduced.

### Implementation Approach

Create a lightweight rate-limiting utility in `apps/web/lib/rate-limit.ts` using a **Map-based in-memory store** with automatic cleanup. Apply it as a wrapper around API route handlers.

**Trade-off accepted:** In-memory counters reset on serverless cold starts. This is acceptable for MVP because:
1. Vercel serverless functions have consistent lifecycle
2. Rate limiting is defense-in-depth, not the sole security boundary
3. Supabase RLS and auth provide the primary protection
4. The application is single-instance during cron processing

### Rate Limit Tiers

| Tier | Endpoints | Limit | Window | Identity Key |
|------|-----------|-------|--------|--------------|
| **Auth** | `/api/auth/login`, `/api/auth/signup` | 10 requests | 1 minute | IP address |
| **Quote** | `/api/orders/quote` | 20 requests | 1 minute | User ID |
| **Order** | `/api/orders` (POST) | 10 requests | 1 minute | User ID |
| **Payment** | `/api/payments/initialize` | 5 requests | 1 minute | User ID |
| **GPS** | `/api/riders/location` | 20 requests | 1 minute | User ID |
| **Default** | All other API routes | 60 requests | 1 minute | User ID or IP |
| **Webhook** | `/api/webhooks/*` | No limit | — | — |
| **Cron** | `/api/cron/*` | No limit | — | — |

### Identity Resolution

1. If authenticated (Supabase session): rate limit by `user.id`
2. If unauthenticated: rate limit by `x-forwarded-for` IP header
3. Webhook/cron endpoints: no rate limiting (protected by signature/cron secret)

### Failure Response

```json
{
  "error": "Rate limit exceeded",
  "retry_after": 30
}
```

HTTP status: `429 Too Many Requests`

### File Location

- `apps/web/lib/rate-limit.ts` — Rate limit utility
- Applied in API route handlers as a wrapper function

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Cold start resets counters | Acceptable — auth/RLS remain |
| Memory pressure | Max 10,000 entries with TTL cleanup |
| Distributed systems | N/A — single serverless instance |

---

## 5. ERROR-HANDLING ARCHITECTURE

### React Error Boundaries

Create three route-level error boundaries:

| Boundary | Location | Fallback |
|----------|----------|----------|
| CustomerErrorBoundary | `(dashboard)/layout.tsx` | "Something went wrong" + retry + link to dashboard |
| RiderErrorBoundary | `rider/layout.tsx` | "Something went wrong" + retry + link to rider dashboard |
| AdminErrorBoundary | `admin/layout.tsx` | "Something went wrong" + retry + link to admin dashboard |

### Error Boundary Behavior

1. **Catch** React rendering errors in child routes
2. **Log** the error with correlation ID via structured logger
3. **Display** a user-friendly fallback with retry button
4. **Never** expose stack traces, API keys, or internal details to the user
5. **Distinguish** recoverable errors (retry) from fatal errors (contact support)

### Server/API Error Handling

Standardize the existing catch pattern into a shared helper:

```typescript
// apps/web/lib/api-error.ts
export function handleApiError(error: unknown, context: string): NextResponse {
  // 1. Log with structured logger (correlation ID, context, error details)
  // 2. Return generic error message (no internal details)
  // 3. Preserve existing status code mapping
}
```

### Error Classification

| Type | User Message | Status | Retry |
|------|-------------|--------|-------|
| Authentication | "Please sign in" | 401 | No |
| Authorization | "You don't have access" | 403 | No |
| Not found | "Resource not found" | 404 | No |
| Validation | "Invalid input" | 400 | No |
| Rate limit | "Too many requests" | 429 | Yes (after delay) |
| Payment | "Payment processing failed" | 402 | Yes |
| External service | "Service temporarily unavailable" | 503 | Yes |
| Internal | "Something went wrong" | 500 | Yes |

### Sensitive Information Protection

The error handler MUST NOT expose:
- Database error messages
- SQL queries
- Stack traces
- API keys
- Payment secrets
- Internal service names
- File paths

---

## 6. OBSERVABILITY / LOGGING ARCHITECTURE

### Design Principle

Replace `console.log` with a structured logging utility that outputs JSON. No external observability vendor is introduced.

### Implementation Approach

Create `apps/web/lib/logger.ts`:

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  correlation_id?: string;
  order_id?: string;
  rider_id?: string;
  customer_id?: string;
  duration_ms?: number;
  error_name?: string;
  error_message?: string;
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Development-only diagnostic information |
| `info` | Normal business events (order created, payment received, dispatch initiated) |
| `warn` | Degraded but recoverable conditions (rate limit hit, stale rider detected) |
| `error` | Failures requiring attention (payment failed, dispatch failed, API error) |

### Correlation Strategy

1. **Request-level:** Generate a UUID correlation ID at the start of each API request. Include it in all log entries for that request.
2. **Order-level:** Include `order_id` in all logs related to a specific order.
3. **Job-level:** Include `job_id` and `job_type` in all background job logs.
4. **Webhook-level:** Include `event_id` and `event_type` in webhook processing logs.

### What to Log

| Event | Level | Fields |
|-------|-------|--------|
| API request received | info | method, path, correlation_id, user_id |
| Quote generated | info | order_id, distance_km, total_amount |
| Order created | info | order_id, customer_id, total_amount |
| Payment initialized | info | order_id, reference |
| Payment webhook received | info | event_id, event_type, reference |
| Dispatch initiated | info | order_id, rider_id |
| Rider offer sent | info | order_id, rider_id |
| Delivery transitioned | info | order_id, from_status, to_status |
| Delivery completed | info | order_id, rider_id |
| Rating submitted | info | order_id, rating |
| Rate limit hit | warn | user_id/ip, endpoint, count |
| Stale rider detected | warn | rider_id, last_update |
| Mapping API failed | warn | provider, error |
| Payment failed | error | order_id, reference, error |
| Dispatch failed | error | order_id, reason |
| Background job failed | error | job_id, job_type, error |
| Unhandled API error | error | correlation_id, path, error |

### What NOT to Log

- API keys or secrets
- Passwords or authentication tokens
- Full payment card details
- Personal data beyond user IDs
- Database connection strings
- Internal stack traces (log error name + message only)

### Migration Strategy

1. Create `apps/web/lib/logger.ts` with structured output
2. Replace `console.log` in API routes (highest value)
3. Replace `console.log` in services (second priority)
4. Leave `console.error` in catch blocks until the logger handles error formatting
5. Do NOT replace `console.error` in the error boundary or global error handler

---

## 7. HEALTH-CHECK ARCHITECTURE

### Endpoint

```
GET /api/health
```

### Response Format

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2026-08-28T00:00:00Z",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 12 },
    "background_jobs": { "status": "healthy", "pending": 0, "stuck": 0 }
  }
}
```

### Check Categories

| Check | Type | Method | Threshold |
|-------|------|--------|-----------|
| Database | Liveness + Readiness | `SELECT 1` via Supabase | < 500ms |
| Background jobs | Readiness | Count pending + stuck jobs | stuck > 0 = degraded |

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| No external dependency checks | Stadia/Paystack availability is not required for liveness |
| No Redis check | No Redis in the stack |
| Lightweight checks only | Health endpoint must not create load |
| Separate from cron | Health checks run independently of job processing |

### Authentication

The health endpoint is **unauthenticated**. It returns operational status only, no sensitive data. This enables Vercel Uptime Robot, Uptime监控, or similar monitoring to poll it.

---

## 8. DATABASE INDEX ARCHITECTURE

### Existing Index Coverage (Verified)

The schema already has comprehensive indexes. After auditing all query patterns in the service layer, the following **5 specific gaps** are identified:

### Proposed Indexes

| # | Table | Columns | Query Pattern | Benefit | Write Impact |
|---|-------|---------|---------------|---------|--------------|
| 1 | `orders` | `(customer_id, status, created_at DESC)` | `listOrders()` — dashboard order listing | Covers the most common customer query | Minimal |
| 2 | `rider_assignments` | `(rider_id, status)` | `getPendingOffers()` — rider offer list | Covers the primary rider query | Minimal |
| 3 | `background_jobs` | `(status, scheduled_at, priority DESC)` | `claim_next_pending_job()` — job processing | Covers the core job polling query | Minimal |
| 4 | `earnings_ledger` | `(rider_id, created_at DESC)` | `getEarningsHistory()` — rider earnings | Covers earnings pagination | Minimal |
| 5 | `delivery_quotes` | `(customer_id, is_consumed, valid_until)` | Quote consumption validation | Covers atomic quote consumption | Minimal |

### Index Justification

**Index 1 — orders (customer_id, status, created_at):**
```sql
CREATE INDEX idx_orders_customer_status_created
  ON orders(customer_id, status, created_at DESC);
```
- Supports: `listOrders()` which filters by `customer_id`, optionally by `status`, and orders by `created_at DESC`
- Existing `idx_orders_customer` covers `customer_id` but not the composite
- This eliminates a sort operation on the status-filtered order list

**Index 2 — rider_assignments (rider_id, status):**
```sql
CREATE INDEX idx_rider_assignments_rider_status
  ON rider_assignments(rider_id, status);
```
- Supports: `getPendingOffers()` which filters by `rider_id` AND `status = 'offered'`
- Existing `idx_rider_assignments_rider` covers `rider_id` but not the composite
- This is the primary query riders make when checking for deliveries

**Index 3 — background_jobs (status, scheduled_at, priority):**
```sql
CREATE INDEX idx_background_jobs_pending_jobs
  ON background_jobs(status, scheduled_at, priority DESC)
  WHERE status = 'pending';
```
- Supports: `claim_next_pending_job()` which filters by `status = 'pending'` AND `scheduled_at <= NOW()` ORDER BY `priority DESC`
- Partial index (WHERE pending) keeps the index small
- This is the highest-frequency background query

**Index 4 — earnings_ledger (rider_id, created_at):**
```sql
CREATE INDEX idx_earnings_ledger_rider_created
  ON earnings_ledger(rider_id, created_at DESC);
```
- Supports: `getEarningsHistory()` which filters by `rider_id` and orders by `created_at DESC`
- Existing index is on `(order_id)` only

**Index 5 — delivery_quotes (customer_id, is_consumed, valid_until):**
```sql
CREATE INDEX idx_delivery_quotes_consumption
  ON delivery_quotes(customer_id, is_consumed, valid_until)
  WHERE is_consumed = false;
```
- Supports: Atomic quote consumption query in `OrderService.createOrder()`
- Partial index (WHERE is_consumed = false) keeps the index small since most quotes are eventually consumed

### What NOT to Index

| Table | Reason |
|-------|--------|
| `order_events` | Insert-heavy, rarely queried directly |
| `order_status_history` | Insert-heavy, queried only for specific order |
| `rider_locations` | Insert-heavy (GPS updates), historical data |
| `processed_webhook_events` | Insert-heavy, idempotency check is rare |
| `notifications` | Unused table |

---

## 9. ADMIN ORDER-MANAGEMENT ARCHITECTURE

### Design Principle

Admin order management starts as **read-only visibility** with **carefully controlled mutations**. Any admin mutation must respect the existing order state machine and payment invariants.

### Read-Only Capabilities (MUST IMPLEMENT)

| Capability | Endpoint | Description |
|------------|----------|-------------|
| List orders | `GET /api/admin/orders` | Paginated, filterable by status/customer/date |
| View order detail | `GET /api/admin/orders/[id]` | Full order with events, timeline, payment |
| Search orders | `GET /api/admin/orders?search=...` | By order number, tracking code, customer name |
| Filter by status | `GET /api/admin/orders?status=...` | Multi-status filter |
| Filter by date range | `GET /api/admin/orders?from=...&to=...` | Date range filter |

### Controlled Mutations (SHOULD IMPLEMENT)

| Action | Endpoint | Authorization | Invariants |
|--------|----------|---------------|------------|
| Cancel order | `POST /api/admin/orders/[id]/cancel` | Admin only | Must use existing `cancel_order()` RPC. Respects state machine. |
| Initiate refund | `POST /api/admin/orders/[id]/refund` | Admin only | Must use existing refund flow. Creates REFUND_PROCESS job. |

### What Admin MUST NOT Do

- Modify order amounts
- Modify payment records directly
- Bypass the order state machine
- Access payment card details
- Modify rider earnings
- Override pricing calculations

### Admin Order List UI

Create `apps/web/app/admin/orders/page.tsx` and `apps/web/components/admin/order-table.tsx`:

| Column | Source |
|--------|--------|
| Order number | orders.order_number |
| Status | orders.status (rendered with StatusBadge) |
| Customer | profiles.full_name (via customer_id) |
| Rider | profiles.full_name (via assigned_rider_id) |
| Amount | orders.total_amount |
| Created | orders.created_at |
| Actions | View detail, Cancel (if cancellable) |

### Admin Authorization

- Existing middleware already enforces `/admin` requires `admin` or `super_admin` role
- New admin API routes inherit this protection
- All admin mutations are logged to `order_events` with `actor_type: 'admin'`

---

## 10. RIDER PAYOUT ARCHITECTURE

### Classification: DEFERRED — REQUIRES FOUNDER DECISION

Rider payouts cannot be fully architected without business decisions on:

| Decision | Options | Impact |
|----------|---------|--------|
| Payout provider | Paystack Transfer, bank transfer, mobile money | Determines integration complexity |
| Minimum payout threshold | ₦1,000 / ₦5,000 / ₦10,000 | Determines payout frequency |
| Payout frequency | Daily / Weekly / On-demand | Determines batch vs real-time |
| KYC requirements | BVN, NIN, bank verification | Determines onboarding complexity |
| Currency | NGN only or multi-currency | Determines provider requirements |

### Preliminary Architecture (For Reference Only)

If the founder approves payouts, the architecture would include:

| Component | Description |
|-----------|-------------|
| Payout ledger | Separate from earnings_ledger. Tracks payout batches and individual transfers. |
| Payout states | `pending → processing → completed / failed` |
| Eligibility check | Minimum balance, verified rider, completed KYC |
| Idempotency | Each payout has a unique reference. Paystack transfer API supports idempotent references. |
| Failure handling | Failed payouts remain in `failed` state. Rider balance is NOT debited. Retry mechanism needed. |
| Reconciliation | Batch job compares payout_ledger with Paystack transfer status. |

**This is NOT implemented in Phase 6J.** The earnings_ledger remains the source of truth for rider earnings. Riders can view their earnings but cannot yet withdraw them.

---

## 11. WEBHOOK HARDENING ARCHITECTURE

### Current State (Verified)

The existing webhook handler already implements:
- ✅ HMAC SHA-512 signature verification
- ✅ Event idempotency via `processed_webhook_events` table
- ✅ Server-side payment verification via `verify_payment_and_confirm_order()` RPC
- ✅ Paystack transaction ID storage for refund processing

### Improvements for Phase 6J

| # | Improvement | Description |
|---|-------------|-------------|
| 1 | Log webhook events | Add structured logging for all webhook events (received, processed, duplicate, failed) |
| 2 | Handle `charge.failed` | Currently only handles `charge.success`. Add handling for failed payments. |
| 3 | Handle `refund.success` / `refund.failed` | Update refund status from Paystack webhook callbacks. |

### charge.failed Handling

```typescript
if (payload.event === 'charge.failed') {
  // 1. Log the failure
  // 2. Update payment status to 'failed'
  // 3. Update order status if needed
  // 4. Record order event
  // 5. Record idempotency
}
```

### Refund Webhook Handling

```typescript
if (payload.event === 'refund.success' || payload.event === 'refund.failed') {
  // 1. Find refund by paystack_refund_id
  // 2. Update refund status
  // 3. Record idempotency
}
```

### What NOT to Change

- Signature verification (already correct)
- Idempotency mechanism (already correct)
- Payment confirmation flow (already correct)
- Order creation from payment (already correct)

---

## 12. CACHING STRATEGY

### Classification: DEFERRED

At current scale (100 customers/day), PostgreSQL handles all queries efficiently. Caching introduces complexity (invalidation, consistency, infrastructure) without meaningful benefit.

### Future Consideration

When the application exceeds 500 concurrent users, consider caching:
- `platform_settings` (rarely changes, read frequently)
- `service_zones` (rarely changes, read during quote generation)
- `pricing_rules` (versioned, read during quote generation)

Do NOT cache:
- Order state
- Payment state
- Rider location
- Quote data (authoritative pricing)
- Authorization decisions

---

## 13. TESTING STRATEGY

### Phase 6J Test Requirements

| # | Test Type | Coverage |
|---|-----------|----------|
| 1 | Rate limiter unit test | Window sliding, identity resolution, limit enforcement |
| 2 | Health endpoint test | Returns healthy, handles DB failure |
| 3 | Error boundary test | Renders fallback, logs error |
| 4 | Admin authorization test | Non-admin rejected, admin allowed |
| 5 | Webhook idempotency test | Duplicate event ignored |
| 6 | Webhook charge.failed test | Payment status updated |
| 7 | Admin order list test | Returns paginated results |
| 8 | Admin order cancel test | Respects state machine |

### Existing Tests

407/407 tests pass. Phase 6J adds approximately 20–30 new tests. Expected baseline after Phase 6J: ~430 tests.

---

## 14. EXTERNAL / MANUAL PRODUCTION CONFIGURATION

### Separation of Code vs Configuration

| Item | Location | Owner |
|------|----------|-------|
| Supabase project | Supabase dashboard | Founder |
| Supabase production URL | Environment variable | Founder |
| Supabase anon key | Environment variable | Founder |
| Supabase service role key | Environment variable (SECRET) | Founder |
| Paystack production keys | Environment variable (SECRET) | Founder |
| Paystack webhook URL | Paystack dashboard | Founder |
| Stadia Maps API key | Environment variable (SECRET) | Founder |
| Stadia domain authentication | Stadia dashboard | Founder |
| Vercel project | Vercel dashboard | Founder |
| Cron schedule | Vercel vercel.json or external | Founder |
| CRON_SECRET | Environment variable (SECRET) | Founder |

### .env.example Updates

The current `.env.example` is accurate after Phase 6G updates. No changes needed.

---

## 15. MIGRATION SEQUENCE

### Implementation Order

| Step | Item | Dependencies | Estimated Complexity |
|------|------|--------------|---------------------|
| 1 | Structured logger | None | Low |
| 2 | Rate limiter utility | None | Low |
| 3 | Health check endpoint | Logger | Low |
| 4 | Error boundaries (3 layouts) | None | Low |
| 5 | Database indexes (1 migration) | None | Low |
| 6 | Apply rate limiting to API routes | Rate limiter | Medium |
| 7 | Migrate console.log to logger | Logger | Medium |
| 8 | Admin order list API + UI | Indexes | Medium |
| 9 | Admin order detail API + UI | Order list | Medium |
| 10 | Admin order cancel API | Existing cancel_order() | Low |
| 11 | Webhook charge.failed handler | None | Low |
| 12 | Webhook refund handler | None | Low |
| 13 | API error handler utility | Logger | Low |
| 14 | Tests for all new functionality | All above | Medium |

### Dependency Graph

```
Step 1 (Logger) ──→ Step 3 (Health) ──→ Step 7 (Log migration)
                ──→ Step 13 (API error handler)
                
Step 2 (Rate limiter) ──→ Step 6 (Apply to routes)

Step 5 (Indexes) ──→ Step 8 (Admin order list)
                  ──→ Step 9 (Admin order detail)

Step 8 + 9 ──→ Step 10 (Admin cancel)
```

---

## 16. DEPENDENCIES BETWEEN CHANGES

| Change | Depends On | Blocks |
|--------|------------|--------|
| Structured logger | None | Health, log migration, API error handler |
| Rate limiter | None | Rate limit application |
| Health endpoint | Logger | None |
| Error boundaries | None | None |
| Database indexes | None | Admin order queries |
| Admin order UI | Indexes, existing auth | Admin cancel |
| Webhook handlers | None | None |
| Tests | All implementations | Final verification |

---

## 17. RISK ANALYSIS

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| In-memory rate limiter resets on cold start | High | Low | Auth/RLS remain primary defense |
| New indexes slow down writes | Low | Medium | Only 5 targeted indexes, all on read-heavy tables |
| Admin cancel bypasses state machine | Low | High | Use existing `cancel_order()` RPC |
| Structured logging performance overhead | Low | Low | JSON.stringify is fast; async logging if needed |
| Webhook handler changes break payment flow | Low | High | Existing handlers remain; new handlers are additive |

---

## 18. EXPLICIT DEFER / DO-NOT-IMPLEMENT LIST

| Item | Classification | Reason |
|------|---------------|--------|
| Redis / caching | DEFERRED | Not needed at current scale |
| CSRF tokens | NOT REQUIRED | SameSite cookies sufficient |
| Rider payouts | REQUIRES FOUNDER DECISION | Business decision needed |
| Payment reconciliation | DEFERRED | Not blocking for initial production |
| Integration/E2E tests | DEFERRED | Requires test infrastructure decision |
| External observability (Sentry) | DEFERRED | Requires vendor decision |
| Notification system | DEFERRED | Not blocking for production |
| SEO / metadata | DEFERRED | Marketing concern |
| UI redesign | NOT IN SCOPE | Brand is already applied |
| Mapping changes | NOT IN SCOPE | Already migrated |
| Pricing changes | NOT IN SCOPE | Already unified |
| Business logic changes | NOT IN SCOPE | Presentation hardening only |
| New database tables | NOT IN SCOPE | Indexes only |

---

## 19. DEFINITION OF DONE

Phase 6J is complete when:

| Check | Requirement |
|-------|-------------|
| Rate limiting | All API routes have appropriate rate limits |
| Error boundaries | Customer, rider, and admin routes have error boundaries |
| Logging | All API routes use structured logging |
| Health | `/api/health` returns operational status |
| Indexes | 5 new indexes created and verified |
| Admin | Admin can list, view, and cancel orders |
| Webhooks | charge.failed and refund events handled |
| Tests | All new functionality tested |
| Typecheck | Zero TypeScript errors |
| Tests | 430+ tests passing (baseline 407 + ~23 new) |
| Build | Production build succeeds |
| Security | No secrets exposed, no authorization regression |
| Attribution | ZERO AI attribution |

---

## 20. REQUIRED FOUNDER / BUSINESS DECISIONS

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| 1 | Rider payout provider | Paystack Transfer / Bank / Mobile money | Determines integration |
| 2 | Minimum payout threshold | ₦1,000 / ₦5,000 / ₦10,000 | Determines frequency |
| 3 | Payout frequency | Daily / Weekly / On-demand | Determines batch design |
| 4 | Admin order cancel policy | Always allowed / Only before rider assigned / Time-limited | Determines UI logic |
| 5 | Error reporting vendor | Sentry / Axiom / Custom / None | Determines observability |

None of these decisions block Phase 6J implementation. They affect scope only for:
- Rider payouts (deferred entirely)
- Admin cancel policy (affects Step 10)
- Error reporting (deferred entirely)

---

## 21. VERIFICATION

| Check | Result |
|-------|--------|
| HEAD | `fc8018a` ✅ |
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Git history modified | ✅ NONE |
| Phase 1–6H untouched | ✅ CONFIRMED |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only docs) |
