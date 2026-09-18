# MILESTONE 9 — ARCHITECTURE REVIEW

## Milestone 9 — Production Hardening

**Date:** August 29, 2026
**Status:** COMPLETE
**HEAD:** `dcd42b847c6859afaf9757fb0894e915a1ae7ac7`

---

## 1. Executive Summary

Milestone 9 — Production Hardening — has its core engineering hardening already complete through Phases 6J, 6L, 6M, and M8. This architecture review determines the remaining M9 scope: load testing, performance optimization, operational runbooks, and monitoring.

**Architecture decision:** M9 should focus on **evidence-based hardening** — measure first, optimize only where evidence supports it. The platform is functionally complete and production-ready for MVP deployment. The remaining M9 items are operational improvements that establish production confidence.

---

## 2. M9 Objective

From `docs/ROADMAP.md` §5:

> **M9 — Production Hardening:** Security audit, performance optimization, load testing, RLS testing

**Reconciled objective:**

M9 establishes production confidence through:
1. Performance baselines via load testing
2. Evidence-based optimization (only where measured)
3. Systematic RLS verification
4. Operational runbooks for launch
5. Resend webhook delivery tracking

---

## 3. Current Architecture

### What Already Exists

| Component | Implementation | Evidence |
|-----------|---------------|----------|
| Rate limiting | Sliding window, tier-based | `lib/rate-limit.ts` |
| Error handling | API error handler + error boundaries | `lib/api-error.ts`, `components/shared/error-boundary.tsx` |
| Health checks | DB + job queue health | `app/api/health/route.ts` |
| Structured logging | JSON, levels, context binding | `lib/logger.ts` |
| Correlation IDs | Per-request ID, child logger | `lib/request-context.ts` |
| Cron security | `crypto.timingSafeEqual()` | `app/api/cron/process-jobs/route.ts` |
| Webhook idempotency | `processed_webhook_events` dedup | `app/api/webhooks/paystack/route.ts` |
| Background jobs | `FOR UPDATE SKIP LOCKED`, retry | `lib/services/background-job.service.ts` |
| Quote concurrency | Atomic `is_consumed` check | `lib/services/order.service.ts` |
| Notification idempotency | Unique constraint + service check | `lib/notifications/notification-service.ts` |
| Storage security | Private bucket, RLS, signed URLs | `app/api/riders/deliveries/[orderId]/proof-upload/` |
| Database indexes | 20+ performance indexes | Migrations |
| RLS | 90+ policies across all tables | Initial schema + migrations |

### What Does NOT Exist

| Component | Status |
|-----------|--------|
| Load testing framework | ❌ Not installed |
| Performance baselines | ❌ Not established |
| Systematic RLS tests | ❌ Not implemented |
| Operational runbooks | ❌ Not created |
| Monitoring vendor | ❌ Not selected |
| Resend webhooks | ❌ Not implemented |
| Backup verification | ❌ Not verified |

---

## 4. Production-Readiness Gate

### Minimum Acceptable M9 Gate

For MVP launch, the minimum production-hardening gate is:

| Requirement | Status | Gate? |
|-------------|--------|-------|
| Functional correctness | ✅ Complete | ✅ PASS |
| Security hardening | ✅ Complete | ✅ PASS |
| Rate limiting | ✅ Complete | ✅ PASS |
| Error handling | ✅ Complete | ✅ PASS |
| Health checks | ✅ Complete | ✅ PASS |
| Structured logging | ✅ Complete | ✅ PASS |
| Correlation IDs | ✅ Complete | ✅ PASS |
| Database indexes | ✅ Complete | ✅ PASS |
| RLS coverage | ✅ Complete | ✅ PASS |
| Webhook idempotency | ✅ Complete | ✅ PASS |
| Background job reliability | ✅ Complete | ✅ PASS |
| Load testing | ❌ Not done | ⚠️ RECOMMENDED |
| Performance baselines | ❌ Not done | ⚠️ RECOMMENDED |
| Operational runbooks | ❌ Not done | ⚠️ RECOMMENDED |
| Monitoring vendor | ❌ Not selected | ⚠️ DEFERRED |

**Architecture decision:** The core hardening gate is PASS. Load testing and runbooks are recommended but not blocking for MVP launch. Monitoring vendor selection is deferred to post-launch.

---

## 5. Load-Testing Architecture

### Tool Selection: k6

**Recommendation: k6**

| Criterion | k6 | Artillery | Locust |
|-----------|-----|-----------|--------|
| Protocol-level testing | ✅ Excellent | ✅ Good | ⚠️ Possible |
| Script language | JavaScript | YAML/JS | Python |
| Performance | ✅ Go-based, fast | ⚠️ Node-based | ⚠️ Python-based |
| Cloud option | ✅ k6 Cloud (free tier) | ✅ Cloud | ❌ Self-hosted |
| Supabase compatibility | ✅ HTTP/REST | ✅ HTTP/REST | ✅ HTTP/REST |
| Learning curve | LOW | LOW | MEDIUM |
| Community | ✅ Large | ✅ Medium | ✅ Medium |

k6 is the appropriate tool because:
- Embee Nexus is an API-heavy Next.js + Supabase application
- Protocol-level HTTP testing is more efficient than browser-based
- k6's Go-based runtime handles high concurrency efficiently
- Free tier supports basic cloud execution

### Test Environment

| Consideration | Recommendation |
|---------------|---------------|
| Target | Vercel preview deployment OR local `next start` |
| Database | Supabase staging project (separate from production) |
| Test data | Scripted setup via Supabase client |
| Isolation | Test database must not affect production |
| Cleanup | Test data removed after each run |

### API Test Scenarios

| Scenario | Priority | Realistic Load | Notes |
|----------|----------|---------------|-------|
| Quote generation | HIGH | 10-50 concurrent | Database-intensive, route calculation |
| Order creation | HIGH | 5-20 concurrent | Atomic quote consumption, payment init |
| Payment webhook | HIGH | 10-30 concurrent | Idempotent, signature verification |
| Order listing | MEDIUM | 20-100 concurrent | Paginated, indexed |
| Rider location update | MEDIUM | 50-200 concurrent | Throttled, GPS writes |
| Dispatch query | HIGH | 5-15 concurrent | PostgreSQL function, rider search |
| Notification creation | LOW | 10-50 concurrent | Idempotent, async delivery |
| Health endpoint | LOW | 100-500 concurrent | Lightweight, unauthenticated |

### Concurrency Model

```
Ramp-up: 0 → target over 30s
Sustained: target load for 60s
Ramp-down: target → 0 over 10s
Cool-down: 30s between scenarios
```

### Measurable Thresholds

| Metric | Target | Action if exceeded |
|--------|--------|-------------------|
| Error rate | < 1% | Investigate failure paths |
| p50 latency | < 200ms | Acceptable for MVP |
| p95 latency | < 500ms | Investigate slow queries |
| p99 latency | < 1000ms | Acceptable for MVP |
| Throughput | > 50 req/s | Sufficient for Abuja MVP |
| Database connections | < 80% of pool | Monitor connection usage |

### Load-Test Script Structure

```
tests/
  load/
    k6.config.js          # Global configuration
    scenarios/
      quote-generation.js  # Quote API load test
      order-creation.js    # Order creation flow
      payment-webhook.js   # Paystack webhook processing
      rider-location.js    # GPS location updates
      dispatch.js          # Dispatch function load
    helpers/
      auth.js              # Authentication helpers
      data-setup.js        # Test data creation
      supabase.js          # Supabase client helpers
```

---

## 6. Performance Strategy

### Principle: Measure First, Optimize Second

Performance optimization should happen **AFTER** baseline load testing, not before.

**Why:**
- Optimizing without measurements is guesswork
- Load testing reveals actual bottlenecks
- Premature optimization wastes engineering time
- The architecture already uses indexed queries, pagination, and atomic operations

### What to Measure (During Load Testing)

| Area | Metric | Tool |
|------|--------|------|
| API latency | p50, p95, p99 per endpoint | k6 |
| Database query latency | Slow query log | Supabase dashboard |
| Supabase connection pool | Active connections | Supabase dashboard |
| Background job throughput | Jobs/minute | Structured logs |
| Memory usage | Peak RSS | k6 / Vercel metrics |
| Cold start latency | First request after idle | k6 |

### Optimization Triggers

| Trigger | Action |
|---------|--------|
| p95 > 500ms on critical path | Investigate query plans, add indexes |
| Error rate > 1% under load | Investigate failure modes |
| Database connections > 80% | Optimize connection pooling |
| Background jobs falling behind | Increase concurrency or optimize |
| Memory usage > 512MB | Investigate memory leaks |

### What NOT to Optimize

- Quote generation route calculation — already one call per quote
- GPS location updates — already throttled to 5s
- Order listing — already paginated and indexed
- Webhook processing — already idempotent

---

## 7. RLS Testing Strategy

### Should Systematic RLS Testing Be in M9?

**Classification: SHOULD**

**Rationale:**
- RLS is the primary data-isolation mechanism
- 90+ policies exist but are not systematically tested
- A single RLS gap could expose customer data
- RLS tests are relatively cheap to implement
- Tests provide ongoing regression protection

### Test Matrix

| Role | Tables | Operations |
|------|--------|------------|
| Customer | orders, payments, addresses, notifications, ratings | SELECT, INSERT, UPDATE, DELETE |
| Rider | rider_profiles, rider_assignments, rider_locations, notifications | SELECT, INSERT, UPDATE |
| Business | business_members, orders (business) | SELECT |
| Admin | all tables (via service-role) | SELECT, UPDATE |
| Super Admin | all tables | SELECT, UPDATE, DELETE |
| Anonymous | prohibited_items (blocked), spatial_ref_sys (blocked) | SELECT only |
| Service Role | all tables | ALL |

### Test Approach

```
For each role:
  Create Supabase client with role's JWT
  For each table:
    Attempt SELECT → expect success or 403
    Attempt INSERT → expect success or 403
    Attempt UPDATE → expect success or 403
    Attempt DELETE → expect success or 403
    Verify: cross-user access blocked
    Verify: cross-role access blocked
```

### Test File Structure

```
packages/shared/validators/
  rls-coverage.test.ts     # RLS policy verification matrix
```

---

## 8. Resend Webhook Decision

### Classification: SHOULD

**Rationale:**
- Application-level delivery tracking (pending → sent → delivered) is sufficient for MVP
- Webhook-based tracking improves production observability
- Bounce/complaint handling requires webhooks
- Low complexity (follows existing Paystack webhook pattern)
- Not blocking for launch, but valuable for production operations

### Architecture

```
Resend → POST /api/webhooks/resend
    ↓
Signature verification (svix)
    ↓
Event deduplication (svix-id)
    ↓
Delivery status sync
    ↓
notification_deliveries table update
```

### Events to Handle

| Event | Action |
|-------|--------|
| `email.sent` | Update delivery_status to 'sent' |
| `email.delivered` | Update delivery_status to 'delivered' |
| `email.bounced` | Update delivery_status to 'permanent_failure' |
| `email.complained` | Log complaint, update status |
| `email.opened` | Optional: track opens |
| `email.clicked` | Optional: track clicks |

### Security Requirements

- Signature verification using svix
- Idempotent processing (svix-id dedup)
- Raw body verification
- No secret leakage in logs

---

## 9. Monitoring Strategy

### What Internal Observability Already Provides

| Capability | Status |
|------------|--------|
| Request logging | ✅ Structured JSON with correlation IDs |
| Error logging | ✅ With context and stack traces |
| Duration tracking | ✅ Per-request duration_ms |
| Health endpoint | ✅ DB + job queue status |
| Error boundaries | ✅ Client-side error isolation |
| API error handler | ✅ Consistent error responses |

### What Is Missing

| Capability | Impact | Recommendation |
|------------|--------|----------------|
| Uptime monitoring | MEDIUM | Use Vercel Analytics (free) |
| Error tracking (Sentry) | MEDIUM | DEFERRED — use structured logs initially |
| Alerting | LOW | Use Supabase dashboard + Vercel alerts |
| Metrics (APM) | LOW | DEFERRED — use logs + health endpoint |

### Architecture Decision

**Do NOT select a monitoring vendor during M9.**

**Rationale:**
- Internal observability is sufficient for MVP
- Structured logs + correlation IDs provide request tracing
- Health endpoint provides basic uptime checking
- Vercel provides built-in analytics and alerts
- Supabase provides database monitoring
- Sentry/external vendor can be added post-launch without code changes

### Minimum Monitoring for Launch

| Layer | Tool | Cost |
|-------|------|------|
| Application logs | Vercel Logs (structured JSON) | Free tier |
| Uptime | Vercel Analytics | Free tier |
| Database | Supabase Dashboard | Free tier |
| Errors | Structured logs + error boundaries | $0 |
| Health | `GET /api/health` | $0 |

---

## 10. Backup/Recovery Strategy

### Classification: DEFER to M10

**Rationale:**
- Backup/recovery is externally managed by Supabase
- Cannot verify capabilities without production access
- Verification should happen during M10 production setup
- Disaster recovery documentation belongs in M10 launch preparation

### What to Verify (During M10)

| Item | Verification |
|------|-------------|
| Supabase backup schedule | Check Supabase dashboard |
| Point-in-time recovery | Check Supabase plan capabilities |
| Backup retention | Check Supabase settings |
| Restore procedure | Test restore on staging |
| Storage backup | Check Supabase storage settings |

---

## 11. Operational Readiness

### Minimum Runbooks for Launch

| Runbook | Priority | Contents |
|---------|----------|----------|
| Deployment | HIGH | Vercel deploy process, env vars, rollback |
| Incident Response | HIGH | Who to contact, severity levels, escalation |
| Database Incident | MEDIUM | Supabase dashboard, query investigation, recovery |
| Payment Incident | MEDIUM | Paystack dashboard, webhook investigation, refund process |
| Background Job Failure | MEDIUM | Job queue investigation, stuck job recovery |
| Rollback | HIGH | Vercel rollback, database migration rollback |

### Architecture Decision

Runbooks should be created during M9 implementation, not deferred to M10.

**Why:**
- Runbooks are engineering artifacts, not just documentation
- They require understanding of the actual system
- Creating them during M9 ensures they're accurate
- Launch without runbooks is risky

### Runbook Template

```markdown
# [Incident Type] Runbook

## Detection
- How to detect this issue
- Alert/monitoring signals

## Impact
- What is affected
- User impact severity

## Investigation
- Steps to diagnose
- Key logs/metrics to check
- Dashboard links

## Resolution
- Step-by-step fix
- Verification steps

## Prevention
- How to prevent recurrence
```

---

## 12. M9 Scope Matrix

| Item | Priority | M9 Required? | Launch Block? | Rationale |
|------|----------|-------------|---------------|-----------|
| **Load testing** | SHOULD | YES | NO | Establishes performance baselines, identifies bottlenecks |
| **Performance optimization** | COULD | NO | NO | Only if load testing reveals issues |
| **RLS testing** | SHOULD | YES | NO | Systematic verification of 90+ policies |
| **Operational runbooks** | SHOULD | YES | NO | Required for incident response |
| **Resend webhooks** | SHOULD | YES | NO | Improves delivery observability |
| **Monitoring vendor** | DEFER | NO | NO | Internal observability sufficient for MVP |
| **Backup verification** | DEFER | NO | NO | Supabase-managed, verify during M10 |
| **Disaster recovery** | DEFER | NO | NO | Create during M10 launch preparation |

---

## 13. M9 → M10 Dependency

```
M9 Production Hardening
    ↓
    ├── Load testing (can run in parallel with M10 prep)
    ├── RLS testing (independent)
    ├── Runbooks (independent)
    ├── Resend webhooks (independent)
    └── Performance optimization (only if needed)
    ↓
M10 Launch Preparation
    ├── Production environment setup
    ├── Domain/DNS configuration
    ├── Monitoring vendor selection
    ├── Backup verification
    ├── Disaster recovery plan
    └── Launch verification
    ↓
M10 Launch
```

### What M10 Can Begin Before M9 Completion

| M10 Item | Can Start Before M9? | Notes |
|----------|---------------------|-------|
| Production Supabase setup | ✅ YES | Independent of load testing |
| Paystack production keys | ✅ YES | External configuration |
| Vercel production env | ✅ YES | Independent |
| Domain/DNS | ✅ YES | Independent |
| Load testing results | ❌ NO | Must wait for M9 |
| Runbooks | ❌ NO | Must wait for M9 |
| Monitoring vendor | ✅ YES | Can be decided anytime |

---

## 14. Implementation Sequence

```
1. Load-testing infrastructure setup
        ↓
2. API performance benchmarks (k6 scripts)
        ↓
3. Load test execution + baseline measurement
        ↓
4. Evidence-based optimization (only if needed)
        ↓
5. Systematic RLS test suite
        ↓
6. Resend webhook implementation
        ↓
7. Operational runbooks
        ↓
8. M9 final verification
        ↓
9. M9 commit/push
        ↓
10. M10 launch preparation
```

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Load testing reveals critical performance issue | LOW | MEDIUM | Performance optimization phase |
| RLS tests reveal policy gap | LOW | HIGH | Fix immediately, security priority |
| Runbooks become stale | MEDIUM | LOW | Keep simple, update during incidents |
| Resend webhook adds complexity | LOW | LOW | Follow existing Paystack pattern |
| k6 setup takes longer than expected | LOW | LOW | Use simple HTTP scripts |

---

## 16. Required Business Decisions

| # | Decision | Recommendation | Can Proceed Without? |
|---|----------|---------------|---------------------|
| 1 | Monitoring vendor | DEFERRED — use Vercel/Supabase built-in | ✅ YES |
| 2 | Load testing scope | MVP-level API testing only | ✅ YES |
| 3 | Resend webhook events | All delivery events (sent, delivered, bounced) | ✅ YES |

---

## 17. Required External Configuration

| # | Item | Owner | Blocks M9? |
|---|------|-------|------------|
| 1 | Supabase staging project | Founder | ❌ NO (use dev project) |
| 2 | Vercel preview deployment | Founder | ❌ NO (use local) |

---

## 18. GO / NO-GO

**GO.**

M9 scope is well-defined, architecturally sound, and does not introduce unnecessary complexity. The platform is production-ready for MVP. M9 establishes production confidence through evidence-based hardening.

---

**MILESTONE 9 ARCHITECTURE REVIEW — COMPLETE**
**STATUS: READY FOR IMPLEMENTATION AUTHORIZATION**
