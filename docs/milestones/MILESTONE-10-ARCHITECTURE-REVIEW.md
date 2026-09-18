# MILESTONE 10 — ARCHITECTURE REVIEW

## Milestone 10 — Launch

**Date:** August 29, 2026
**Status:** ARCHITECTURE REVIEW COMPLETE
**HEAD:** `e24cc40eca83cff7ecf4bc134043facceaa24f33`
**M1–M9:** ALL COMPLETE

---

## 1. Executive Summary

Milestone 10 — Launch — is a **production deployment and configuration milestone**, not an application-code milestone. The application is fully built, tested, and verified through M1–M9. M10 requires only:

1. External service configuration (Vercel, Supabase, Paystack, Resend, DNS)
2. Founder business decisions (launch city, date, monitoring)
3. Documentation (environment setup, launch checklist)

**Key architectural finding:** The application code requires ZERO changes for production deployment. The entire M10 scope is infrastructure configuration and business decisions.

---

## 2. Current Production Readiness

| Area | Status | Classification |
|------|--------|---------------|
| Application code | ✅ COMPLETE | Engineering done |
| Database schema | ✅ COMPLETE | Migrations ready |
| RLS | ✅ COMPLETE | All tables protected |
| Authentication | ✅ COMPLETE | Supabase Auth |
| API endpoints | ✅ COMPLETE | All routes functional |
| Background jobs | ✅ COMPLETE | Cron configured |
| Payment integration | ✅ COMPLETE | Paystack test mode |
| Notification system | ✅ COMPLETE | Provider-abstracted |
| Mapping | ✅ COMPLETE | Mapbox configured |
| Security | ✅ COMPLETE | M9 hardening done |
| Monitoring | ✅ PARTIAL | Internal only |
| Runbooks | ✅ COMPLETE | M9 created |
| **Deployment** | ❌ NOT DONE | External config |
| **Production keys** | ❌ NOT DONE | External config |
| **DNS** | ❌ NOT DONE | External config |

---

## 3. Target Production Architecture

```
User Browser
    ↓
DNS (Truehost)
    ↓ A record / CNAME
Vercel (Next.js application)
    ↓ HTTPS
Supabase (PostgreSQL + Auth + Storage + Realtime)
    ↓
External Services:
    ├── Paystack (payments)
    ├── Resend (transactional email)
    ├── Mapbox/Stadia (mapping)
    └── Truehost (domain/DNS)
```

### Architecture Principles

1. **Vendor-agnostic domain logic** — No Vercel/Resend/Truehost-specific code in business logic
2. **Environment-driven configuration** — All vendor selection via env vars
3. **Provider abstraction** — Email, mapping, and payment providers are swappable
4. **No vendor lock-in** — Switching providers requires config + adapter, not rewrite

---

## 4. Vercel Architecture

### Compatibility Assessment

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Next.js App Router | ✅ Compatible | Standard Next.js 15 |
| API Routes | ✅ Compatible | Standard route handlers |
| Server Actions | ✅ Compatible | Used in existing code |
| Middleware | ✅ Compatible | Auth session refresh |
| Cron jobs | ✅ Compatible | `vercel.json` cron configured |
| Environment variables | ✅ Compatible | Standard `process.env` |
| Static assets | ✅ Compatible | Standard Next.js |
| Image optimization | ✅ Compatible | Next.js Image component |

### Vercel-Specific Considerations

| Concern | Assessment |
|---------|-----------|
| **Background job processing** | Uses API route cron (`/api/cron/process-jobs` every 60s). Compatible with Vercel's cron feature. |
| **In-memory rate limiting** | Resets on cold start. Acceptable as defense-in-depth. Not a security boundary. |
| **Serverless functions** | All API routes are stateless. No long-running processes. |
| **Edge middleware** | Auth middleware runs at edge. Compatible. |
| **Build output** | `.next/` directory standard. Compatible. |

### Vendor Portability

To migrate away from Vercel:
1. Change deployment target (e.g., Railway, Render, self-hosted)
2. Update `vercel.json` cron to equivalent (e.g., system cron)
3. No application code changes required

**Classification: VERCEL-COMPATIBLE, PORTABLE**

---

## 5. Domain / DNS Architecture

### Current State

| Component | Provider | Status |
|-----------|----------|--------|
| Domain registration | Truehost | Active |
| DNS hosting | Truehost/cPanel | Active |
| Business email | Truehost/cPanel | Active |
| Web hosting | Truehost/cPanel | Current (to be replaced) |

### Target State

| Component | Provider | Action |
|-----------|----------|--------|
| Domain registration | Truehost | Keep as-is |
| DNS hosting | Truehost | Add Vercel records |
| Business email | Truehost/cPanel | Preserve MX records |
| Web hosting | Vercel | New deployment target |
| Transactional email | Resend | Add SPF/DKIM |

### Required DNS Changes

| Record Type | Purpose | Risk |
|-------------|---------|------|
| A record or CNAME | Point domain to Vercel | LOW — standard procedure |
| SPF (TXT) | Authorize Resend to send email | MEDIUM — must not break existing SPF |
| DKIM (TXT) | Resend email authentication | LOW — additive |
| DMARC (TXT) | Email policy | LOW — additive |
| MX records | Business email | DO NOT CHANGE |

### Critical Safety Rules

1. **DO NOT replace existing MX records** — business email depends on them
2. **DO NOT create multiple SPF records** — merge into single TXT record
3. **DO NOT modify existing A/CNAME records** until ready to switch hosting
4. **VERIFY existing DNS before any changes**

### Vendor Portability

Domain registrar can be changed later by updating nameservers. No application code changes required.

**Classification: EXTERNAL CONFIGURATION REQUIRED — LOW RISK**

---

## 6. Supabase Production Architecture

### Current State

| Component | Status |
|-----------|--------|
| Development project | Active |
| Migrations in repo | ✅ All present |
| RLS enabled | ✅ All tables |
| Storage configured | ✅ Delivery proofs bucket |
| Auth configured | ✅ Profiles, roles |
| Realtime | ✅ Available |

### Production Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Create/verify production Supabase project | MUST |
| 2 | Run all migrations against production | MUST |
| 3 | Verify RLS is enabled on all tables | MUST |
| 4 | Configure storage bucket (`delivery-proofs`) | MUST |
| 5 | Configure auth redirect URLs | MUST |
| 6 | Set production environment variables | MUST |
| 7 | Verify Realtime is enabled | SHOULD |
| 8 | Configure backups | SHOULD |

### Environment Separation

| Variable | Development | Production |
|----------|------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Dev project URL | Production project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dev anon key | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev service key | Production service key |
| `SUPABASE_JWT_SECRET` | Dev JWT secret | Production JWT secret |
| `DATABASE_URL` | Dev connection string | Production connection string |

### Vendor Portability

Supabase can be replaced by self-hosted PostgreSQL + Gotrue + PostgREST. No application code changes required (uses standard `@supabase/ssr` client).

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 7. Paystack Production Architecture

### Current State

| Component | Status |
|-----------|--------|
| Test mode integration | ✅ Complete |
| Payment initialization | ✅ Server-side |
| Webhook handling | ✅ Idempotent |
| Signature verification | ✅ `crypto.timingSafeEqual` |
| Refund handling | ✅ Implemented |
| Idempotency | ✅ `processed_webhook_events` |

### Production Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Obtain production API keys | MUST |
| 2 | Configure production webhook URL | MUST |
| 3 | Verify webhook signature with production secret | MUST |
| 4 | Test with real (small) transactions | MUST |
| 5 | Configure callback URLs | MUST |

### Environment Separation

| Variable | Development | Production |
|----------|------------|-----------|
| `PAYSTACK_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `PAYSTACK_PUBLIC_KEY` | `pk_test_...` | `pk_live_...` |
| `PAYSTACK_WEBHOOK_SECRET` | Test webhook secret | Production webhook secret |

### Vendor Portability

Paystack integration uses a service abstraction. Switching to another payment provider would require a new adapter but no domain-logic changes.

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 8. Resend Production Architecture

### Current State

| Component | Status |
|-----------|--------|
| Provider abstraction | ✅ `EmailProvider` interface |
| Resend adapter | ✅ `ResendEmailProvider` |
| Email templates | ✅ 6 templates |
| Webhook handler | ✅ Signature verification |
| Provider-neutral fields | ✅ `provider`, `provider_message_id` |
| Domain verified | ✅ `ashfameenafoods.com` |

### Production Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Create Resend API key | MUST |
| 2 | Add `RESEND_API_KEY` to Vercel env | MUST |
| 3 | Add `RESEND_FROM_EMAIL` to Vercel env | MUST |
| 4 | Verify SPF record in DNS | MUST |
| 5 | Verify DKIM record in DNS | MUST |
| 6 | Configure DMARC (optional) | SHOULD |

### Environment Separation

| Variable | Development | Production |
|----------|------------|-----------|
| `EMAIL_PROVIDER` | `resend` | `resend` |
| `RESEND_API_KEY` | Dev key or absent | Production key |
| `RESEND_FROM_EMAIL` | `noreply@embeenexus.com` | Same |
| `RESEND_FROM_NAME` | `Embee Nexus` | Same |

### Vendor Portability

To switch Resend → SendGrid:
1. Create `SendGridEmailProvider` implementing `EmailProvider`
2. Add case in `createEmailProvider()` factory
3. Set `EMAIL_PROVIDER=sendgrid`
4. **Domain logic changes: ZERO**

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 9. Stadia Maps Production Architecture

### Current State

| Component | Status |
|-----------|--------|
| Maps provider | Mapbox (configured) |
| Provider config | `MAPS_PROVIDER` env var |
| Geocoding | ✅ Implemented |
| Routing | ✅ Implemented |
| Map rendering | ✅ Client-side |

### Production Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Verify Mapbox token validity | MUST |
| 2 | Check domain restrictions on API key | MUST |
| 3 | Verify free tier limits | SHOULD |
| 4 | Test geocoding/routing in production | MUST |

### Vendor Portability

Maps provider is selected via `MAPS_PROVIDER` env var. Switching to Stadia Maps or Google Maps requires:
1. Update `MAPS_PROVIDER` env var
2. Add provider-specific API key
3. **Domain logic changes: ZERO**

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 10. Environment Strategy

### Development

| Environment | Purpose | Supabase | Paystack | Resend |
|-------------|---------|----------|----------|--------|
| Local | Active development | Dev project | Test keys | Dev key |

### Production

| Environment | Purpose | Supabase | Paystack | Resend |
|-------------|---------|----------|----------|--------|
| Vercel Production | Real customers | Production project | Live keys | Production key |

### Preview (Optional)

| Environment | Purpose | Supabase | Paystack | Resend |
|-------------|---------|----------|----------|--------|
| Vercel Preview | Pre-deploy testing | Dev project | Test keys | Dev key |

---

## 11. Configuration Matrix

| Variable | Dev Value | Production Value | Secret? | Provider |
|----------|-----------|-----------------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Dev URL | Prod URL | No | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dev key | Prod key | No | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev key | Prod key | **YES** | Supabase |
| `SUPABASE_JWT_SECRET` | Dev secret | Prod secret | **YES** | Supabase |
| `NEXT_PUBLIC_APP_URL` | `localhost:3000` | `https://embeenexus.com` | No | Application |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` | `sk_live_...` | **YES** | Paystack |
| `PAYSTACK_PUBLIC_KEY` | `pk_test_...` | `pk_live_...` | No | Paystack |
| `PAYSTACK_WEBHOOK_SECRET` | Test secret | Live secret | **YES** | Paystack |
| `DATABASE_URL` | Dev connection | Prod connection | **YES** | Supabase |
| `MAPS_PROVIDER` | `mapbox` | `mapbox` | No | Mapbox |
| `MAPBOX_ACCESS_TOKEN` | Dev token | Prod token | No | Mapbox |
| `EMAIL_PROVIDER` | `resend` | `resend` | No | Resend |
| `RESEND_API_KEY` | Dev key | Prod key | **YES** | Resend |
| `RESEND_FROM_EMAIL` | `noreply@embeenexus.com` | Same | No | Resend |

### NOTE: Duplicate Paystack Variables

The current `.env.local` contains duplicate `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, and `PAYSTACK_WEBHOOK_SECRET` entries. These should be cleaned up before production deployment.

---

## 12. Security Gate

| Check | Status | Severity | Notes |
|-------|--------|----------|-------|
| Secrets not in Git | ✅ PASS | CRITICAL | `.env.local` in `.gitignore` |
| Service-role server-side only | ✅ PASS | CRITICAL | Used in API routes only |
| RLS enabled | ✅ PASS | CRITICAL | All tables have RLS |
| Webhook signature verification | ✅ PASS | HIGH | Paystack + Resend |
| Rate limiting | ✅ PASS | HIGH | In-memory sliding window |
| Auth middleware | ✅ PASS | HIGH | Protected routes + admin check |
| Storage policies | ✅ PASS | HIGH | Private bucket, role-based access |
| CORS | ✅ PASS | MEDIUM | Next.js default (same-origin) |
| Logging no secrets | ✅ PASS | MEDIUM | Structured logging |
| Provider abstraction | ✅ PASS | MEDIUM | No vendor lock-in |
| No AI attribution | ✅ PASS | LOW | Clean codebase |
| Duplicate env vars | ⚠️ FINDING | LOW | Paystack vars duplicated |
| `.env.example` stale | ⚠️ FINDING | LOW | References SendGrid/TERMII |

### Findings

| # | Finding | Severity | Resolution |
|---|---------|----------|-----------|
| 1 | Duplicate Paystack env vars in `.env.local` | LOW | Clean up before production |
| 2 | `.env.example` references SendGrid/TERMII | LOW | Update to reflect Resend |
| 3 | No CSP headers configured | INFORMATIONAL | Add via Vercel/Next.js config |
| 4 | No HSTS headers configured | INFORMATIONAL | Add via Vercel/Next.js config |

---

## 13. Cost Architecture

### Required Recurring Cost

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Vercel (Hobby) | $0 | Free tier: 100GB bandwidth |
| Supabase (Free) | $0 | Free tier: 500MB DB, 1GB storage |
| Resend (Free) | $0 | 3,000 emails/month |
| Paystack | % per transaction | Pay-as-you-go |
| Mapbox | $0–$20 | Free tier: 50k loads/month |
| Domain (Truehost) | ~$1/year | Existing |
| **Total Required** | **~$0–$20/month** | Excluding transaction fees |

### Optional Recurring Cost

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Sentry (free tier) | $0 | 5k errors/month |
| UptimeRobot (free) | $0 | 50 monitors |
| Vercel (Pro) | $20 | Only if needed |
| Supabase (Pro) | $25 | Only if needed |
| **Total Optional** | **$0–$45/month** | Only if needed |

### Minimum Viable Production Cost

**$0/month** base + Paystack transaction fees

This is achievable using free tiers of all services.

---

## 14. Provider Portability Analysis

| Provider | Current | Switching Cost | Domain Logic Impact |
|----------|---------|---------------|-------------------|
| Vercel → Railway/Render | N/A | LOW | ZERO |
| Supabase → Self-hosted PG | N/A | MEDIUM | ZERO (uses `@supabase/ssr`) |
| Paystack → Flutterwave | N/A | MEDIUM | Adapter only |
| Resend → SendGrid | N/A | LOW | Adapter only |
| Mapbox → Stadia Maps | N/A | LOW | Config only |
| Truehost → Cloudflare | N/A | LOW | DNS only |

**All vendor switches are infrastructure-only. No domain logic changes required.**

---

## 15. Deployment Sequence

```
1. Founder decision gate
   ├── Launch city/zones
   ├── Launch date
   └── Monitoring vendor (optional)
        ↓
2. Create Vercel project
   ├── Import Git repository
   ├── Configure environment variables
   └── Verify build succeeds
        ↓
3. Configure Supabase production
   ├── Create/verify production project
   ├── Run migrations
   ├── Verify RLS
   ├── Configure storage
   └── Set auth redirect URLs
        ↓
4. Configure Paystack production
   ├── Obtain production API keys
   ├── Configure webhook URL
   └── Test with small transaction
        ↓
5. Configure Resend production
   ├── Create API key
   ├── Add to Vercel env
   └── Verify DNS records
        ↓
6. Configure domain DNS
   ├── Add A/CNAME record for Vercel
   ├── Preserve MX records
   ├── Add SPF/DKIM for Resend
   └── Verify SSL (automatic)
        ↓
7. Deploy to production
   ├── Push to main branch
   ├── Verify Vercel deployment
   └── Verify health endpoint
        ↓
8. Production smoke test
   ├── Customer signup/booking flow
   ├── Payment flow
   ├── Rider workflow
   ├── Admin dashboard
   └── Notification delivery
        ↓
9. Launch approval
```

---

## 16. Rollback Strategy

| Scenario | Rollback Method | Time to Recover |
|----------|----------------|-----------------|
| Bad application deployment | Vercel rollback to previous deployment | < 1 minute |
| Bad database migration | Forward-fix migration (no down migrations) | Varies |
| Bad environment variable | Vercel dashboard edit | < 1 minute |
| Broken DNS | Revert DNS changes at Truehost | < 15 minutes |
| Paystack outage | Display payment unavailable message | N/A |
| Resend outage | Notifications queued, delivered when restored | N/A |
| Supabase outage | Application shows error, no data loss | N/A |
| Compromised credential | Rotate in provider dashboard + Vercel | < 5 minutes |

---

## 17. Launch Acceptance Criteria

### Customer Flow

| Step | Criterion |
|------|-----------|
| Signup | User can create account with email |
| Login | User can authenticate |
| Add address | User can save pickup/destination |
| Get quote | Quote generated with correct pricing |
| Create order | Order created in `pending_payment` |
| Pay | Paystack payment initialized |
| Webhook | Payment verified, order moves to `paid` |
| Tracking | Real-time rider location visible |
| Delivery | Proof of delivery recorded |
| Rating | Post-delivery rating submitted |

### Rider Flow

| Step | Criterion |
|------|-----------|
| Signup | Rider can register |
| Documents | Verification documents uploaded |
| Availability | Toggle available/unavailable |
| Offer | Receive delivery offer |
| Accept | Accept offer, order assigned |
| Pickup | Mark arrived at pickup |
| Delivery | Mark delivered with proof |
| Earnings | Earnings recorded in ledger |

### Admin Flow

| Step | Criterion |
|------|-----------|
| Login | Admin can authenticate |
| Dashboard | Order/rider overview visible |
| Riders | Rider list and verification |
| Orders | Order management |
| Customers | Customer list |

### Notifications

| Step | Criterion |
|------|-----------|
| In-app | Notification appears in UI |
| Unread count | Badge shows correct count |
| Mark read | Notification marked as read |
| Email | Transactional email delivered (if configured) |

### Operations

| Step | Criterion |
|------|-----------|
| Health | `/api/health` returns `healthy` |
| Logs | Structured logs visible in Vercel |
| Cron | Background jobs processing |
| Rollback | Previous deployment accessible |

---

## 18. Business Decisions Required

| # | Decision | Impact | Recommended |
|---|----------|--------|-------------|
| 1 | Launch city | Service availability | Founder |
| 2 | Launch zones | Delivery boundaries | Founder |
| 3 | Launch date | Timing | Founder |
| 4 | Monitoring vendor | Observability | Sentry free tier or defer |
| 5 | Rider payout policy | Financial | Can defer to post-launch |
| 6 | Revenue split | Financial | Can defer to post-launch |
| 7 | Payment reconciliation | Financial | Can defer to post-launch |
| 8 | Customer support process | Operations | Founder |
| 9 | Marketing launch | Growth | Founder |

---

## 19. External Configuration Required

| # | Item | Provider | Action |
|---|------|----------|--------|
| 1 | Vercel project | Vercel | Create + import repo |
| 2 | Vercel env vars | Vercel | Set all production values |
| 3 | Supabase production | Supabase | Create/verify project |
| 4 | Supabase migrations | Supabase | Run against production |
| 5 | Paystack production keys | Paystack | Obtain from dashboard |
| 6 | Paystack webhook URL | Paystack | Configure production URL |
| 7 | Resend API key | Resend | Create + add to Vercel |
| 8 | Domain DNS | Truehost | Add Vercel A/CNAME |
| 9 | Resend DNS | Truehost | Add SPF/DKIM |
| 10 | Mapbox token | Mapbox | Verify domain restrictions |
| 11 | SSL certificate | Vercel | Automatic |
| 12 | Monitoring (optional) | TBD | Select + configure |

---

## 20. Production Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|-----------|
| DNS changes break email | HIGH | LOW | Document before changes |
| Supabase free tier limits | MEDIUM | LOW | Monitor usage |
| Resend free tier limits | LOW | LOW | 3k emails/month sufficient |
| Paystack production issues | MEDIUM | LOW | Test with small amounts |
| Vercel cold starts | LOW | HIGH | Acceptable for MVP |
| In-memory rate limit reset | LOW | HIGH | Defense-in-depth only |
| No external monitoring | MEDIUM | MEDIUM | Use Vercel logs initially |

---

## 21. M10 Implementation Sequence

Since M10 is configuration-only, the "implementation" is:

```
1. Clean up .env.example (update Resend references)
    ↓
2. Clean up duplicate Paystack env vars
    ↓
3. Create M10 implementation report (documentation)
    ↓
4. Verify all documentation is accurate
    ↓
5. Final verification
    ↓
6. Commit and push (documentation only)
```

**No application code changes are required.**

---

## 22. GO / NO-GO Recommendation

**RECOMMENDATION: GO FOR M10 IMPLEMENTATION**

The application is fully production-ready. All remaining M10 work is:
- External configuration (Vercel, Supabase, Paystack, Resend, DNS)
- Business decisions (launch city, date)
- Minor documentation cleanup

**M10 scope should be limited to:**
1. Documentation updates (`.env.example`, environment guide)
2. Launch checklist creation
3. Production verification procedures
4. Commit and push

**M10 should NOT involve:**
1. Application code changes
2. Database schema changes
3. New features
4. Refactoring
5. DNS changes (external)
6. Provider configuration (external)

---

**MILESTONE 10 ARCHITECTURE REVIEW — COMPLETE**
**STATUS: READY FOR IMPLEMENTATION AUTHORIZATION**

---

*Document generated during Milestone 10 Architecture Review. No source code was modified.*
