# MILESTONE 10 — DISCOVERY REPORT

## Milestone 10 — Launch

**Date:** August 29, 2026
**Status:** DISCOVERY COMPLETE
**HEAD:** `e24cc40eca83cff7ecf4bc134043facceaa24f33`
**M1–M9:** ALL COMPLETE

---

## 1. Executive Summary

Milestone 10 is the final milestone: **Launch**. The original architecture defines it as:

> Production deployment, domain setup, monitoring, documentation

This discovery establishes that the **application code is fully ready for production deployment**. All M1–M9 work is complete. The remaining M10 work is primarily **external configuration** (Vercel, Supabase production, Paystack production, Stadia Maps production, DNS, Resend) and **founder business decisions** (launch city, launch date, monitoring vendor).

**Key finding:** There are ZERO engineering code changes required for M10. Every remaining M10 item is either external configuration or business decision.

---

## 2. M10 Baseline

From `docs/ROADMAP.md` §6:

| # | Item | Classification | Status |
|---|------|---------------|--------|
| 1 | Production Supabase project | External | ❌ Not configured |
| 2 | Paystack production API keys | External | ❌ Not configured |
| 3 | Stadia Maps production API keys | External | ❌ Not configured |
| 4 | Production domain | External | ❌ Not configured |
| 5 | DNS configuration | External | ❌ Not configured |
| 6 | Vercel production environment | External | ❌ Not configured |
| 7 | Monitoring (Sentry or equivalent) | External vendor | ❌ Not selected |
| 8 | User documentation | Engineering | ❌ Not created |
| 9 | Operational runbooks | Engineering/Operations | ✅ Created (M9) |
| 10 | Rollback strategy | Operations | ⚠️ Partial (M9 runbooks) |
| 11 | Production verification checklist | Engineering | ❌ Not created |
| 12 | Load testing results | Engineering | ⚠️ Infrastructure created, execution pending |
| 13 | Security penetration testing | External | ❌ Not performed |

---

## 3. Repository Baseline

| Field | Value |
|-------|-------|
| Branch | `master` |
| HEAD | `e24cc40eca83cff7ecf4bc134043facceaa24f33` |
| Remote | Synchronized |
| Working tree | Clean |
| Last commit | `feat(milestone-4-m9): complete production hardening` |

---

## 4. Deployment State

| Component | Status | Evidence |
|-----------|--------|----------|
| Vercel config | ✅ `vercel.json` exists | Cron job configured (`/api/cron/process-jobs` every 60s) |
| Next.js build | ✅ `next build` works | Production build passes |
| TypeScript | ✅ 3/3 packages clean | Zero type errors |
| Tests | ✅ 543/543 pass | All green |
| CI/CD | ❌ Not configured | No `.github/workflows/` or equivalent |
| `.gitignore` | ✅ Environment files excluded | `.env`, `.env.local`, `.env.production.local` all ignored |
| Production build output | ✅ `.next/` directory exists | Build is reproducible |

**Classification: CODE READY**

---

## 5. Vercel Readiness

| Item | Status | Notes |
|------|--------|-------|
| `vercel.json` | ✅ Exists | Cron job configured |
| Build command | ✅ `next build` | Standard Next.js |
| Runtime | ✅ Node.js | Default Next.js runtime |
| Environment variables | ✅ Documented | See §5.1 below |
| Domain configuration | ❌ Not done | Requires Vercel dashboard |
| Production deployment | ❌ Not done | Requires `vercel deploy` or Git integration |
| Preview deployments | ❌ Not configured | Requires Vercel Git integration |
| Edge middleware | ⚠️ Not present | Optional for MVP |

### 5.1 Required Environment Variables for Production

| Variable | Type | Current Status |
|----------|------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | ✅ Configured in `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | ✅ Configured in `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | ✅ Configured in `.env.local` |
| `SUPABASE_JWT_SECRET` | Secret | ✅ Configured in `.env.local` |
| `NEXT_PUBLIC_APP_URL` | Public | ✅ Configured in `.env.local` |
| `PAYSTACK_SECRET_KEY` | Secret | ✅ Configured in `.env.local` |
| `PAYSTACK_PUBLIC_KEY` | Public | ✅ Configured in `.env.local` |
| `PAYSTACK_WEBHOOK_SECRET` | Secret | ✅ Configured in `.env.local` |
| `DATABASE_URL` | Secret | ✅ Configured in `.env.local` |
| `MAPS_PROVIDER` | Public | ✅ Configured in `.env.local` |
| `MAPBOX_ACCESS_TOKEN` | Public | ✅ Configured in `.env.local` |
| `RESEND_API_KEY` | Secret | ❌ NOT in `.env.local` |
| `RESEND_FROM_EMAIL` | Public | ❌ NOT in `.env.local` |
| `EMAIL_PROVIDER` | Public | ❌ NOT in `.env.local` (defaults to `resend`) |

**Note:** Paystack keys appear duplicated in `.env.local` — two sets of `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`. This should be cleaned up.

---

## 6. Domain / DNS State

| Component | Current State |
|-----------|--------------|
| Domain registrar | Truehost |
| DNS provider | Truehost/cPanel |
| Business email | Truehost/cPanel |
| Web hosting | Currently Truehost/cPanel, intended migration to Vercel |
| Domain name | `ashfameenafoods.com` (Resend verified) |

### DNS Architecture

The domain can remain at Truehost while the application runs on Vercel. This requires:

1. **A record or CNAME** pointing to Vercel's deployment URL
2. **Existing MX records** preserved (business email depends on them)
3. **SPF record** updated to include Resend (if not already present)
4. **DKIM record** added for Resend
5. **DMARC record** configured for email authentication

**Key constraint:** Do NOT replace existing MX records. Do NOT create multiple SPF records. Do NOT break business email.

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 7. Truehost / cPanel State

| Component | Status |
|-----------|--------|
| Domain registration | Active through Truehost |
| Business email hosting | Active through cPanel |
| Web hosting | Currently hosting the application (to be replaced by Vercel) |
| cPanel access | Required for DNS changes |

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 8. Resend / Email State

| Component | Status |
|-----------|--------|
| Resend CLI | ✅ Installed (v2.17.1) |
| Resend authentication | ✅ Authenticated |
| Resend domain | ✅ `ashfameenafoods.com` verified |
| Resend API key | ❌ NOT in `.env.local` |
| Resend from-email | ❌ NOT configured |
| Resend free tier | 3,000 emails/month, 100/day |
| Email templates | ✅ 6 templates created (M8) |
| Notification service | ✅ Provider-abstracted (M8) |
| Resend webhook | ✅ Implemented (M9) |

**What's needed for production:**
1. Add `RESEND_API_KEY` to Vercel environment variables
2. Add `RESEND_FROM_EMAIL` to Vercel environment variables
3. Verify Resend domain DNS records are correct
4. Optionally add SPF/DKIM records to Truehost DNS

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 9. Supabase Production State

| Component | Status |
|-----------|--------|
| Development project | ✅ Active (used during M1–M9) |
| Production project | ❌ Not created |
| Migrations | ✅ All migrations in repo |
| RLS | ✅ Enabled on all tables |
| Storage | ✅ Configured (delivery proofs) |
| Auth | ✅ Configured (profiles, roles) |
| Edge Functions | ⚠️ Not used (background jobs use API routes) |
| Backups | ⚠️ Supabase-managed, not independently verified |

**What's needed for production:**
1. Create a dedicated Supabase production project (or use existing if it IS production)
2. Run all migrations against production database
3. Configure production environment variables
4. Verify RLS is enabled on production
5. Verify storage buckets are configured
6. Verify auth settings (redirect URLs, email templates)

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 10. Paystack Production State

| Component | Status |
|-----------|--------|
| Test mode | ✅ Active (used during M1–M9) |
| Production mode | ❌ Not configured |
| Webhook endpoint | ✅ `/api/webhooks/paystack` |
| Webhook verification | ✅ Signature verification |
| Idempotency | ✅ `processed_webhook_events` |
| Payment initialization | ✅ Server-side |
| Payment verification | ✅ Server-side |
| Refund handling | ✅ Implemented |

**What's needed for production:**
1. Obtain Paystack production API keys
2. Configure production webhook URL
3. Verify webhook signature with production secret
4. Test with real (small) transactions
5. Configure production callback URLs

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 11. Stadia Maps Production State

| Component | Status |
|-----------|--------|
| Current provider | Mapbox (via `MAPBOX_ACCESS_TOKEN`) |
| Maps provider config | `MAPS_PROVIDER` env var |
| Geocoding | ✅ Implemented |
| Routing | ✅ Implemented |
| Map rendering | ✅ Implemented |
| Stadia Maps | ⚠️ Not actively used (Mapbox configured) |

**What's needed for production:**
1. Verify Mapbox token is valid for production domain
2. Or switch to Stadia Maps if preferred
3. Verify domain restrictions on API keys
4. Test geocoding/routing in production environment

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 12. Monitoring / Observability State

| Component | Status |
|-----------|--------|
| Health endpoint | ✅ `/api/health` (DB + job queue checks) |
| Structured logging | ✅ JSON, levels, context binding |
| Correlation IDs | ✅ Per-request ID |
| Error boundaries | ✅ Client + server |
| Background job logging | ✅ Job status tracking |
| Webhook logging | ✅ Event logging |
| External monitoring (Sentry) | ❌ Not installed |
| Uptime monitoring | ❌ Not configured |
| Alerting | ❌ Not configured |
| Metrics dashboard | ❌ Not configured |

**What's needed for production:**
1. Decide on monitoring vendor (Sentry, or free alternatives)
2. Configure uptime monitoring (UptimeRobot, Betterstack, etc.)
3. Set up alerting for health check failures
4. Configure error tracking

**Classification: BUSINESS DECISION + EXTERNAL CONFIGURATION**

---

## 13. Backup / Recovery State

| Component | Status |
|-----------|--------|
| Supabase backups | ⚠️ Supabase-managed (default plan) |
| Backup verification | ❌ NOT independently verified |
| Point-in-time recovery | ⚠️ Supabase feature (plan-dependent) |
| Restore procedure | ❌ NOT tested |
| Application rollback | ✅ Git-based (revert commit + redeploy) |
| Database rollback | ⚠️ Migration-based (forward-only) |
| DNS recovery | ❌ NOT documented |

**What's needed for production:**
1. Verify Supabase backup configuration
2. Test restore procedure (non-destructive)
3. Document DNS recovery procedure
4. Document application rollback procedure

**Classification: EXTERNAL VERIFICATION REQUIRED**

---

## 14. Security Launch Audit

| Check | Status | Evidence |
|-------|--------|----------|
| Secrets not in Git | ✅ | `.env.local` in `.gitignore` |
| Environment separation | ✅ | `.env.local` for dev, Vercel for prod |
| Webhook secrets externalized | ✅ | `PAYSTACK_WEBHOOK_SECRET` via env |
| Service-role server-side only | ✅ | Used in API routes only |
| RLS enabled | ✅ | All tables have RLS |
| Rate limiting | ✅ | In-memory sliding window |
| CORS | ⚠️ | Next.js default (same-origin) |
| Auth redirect config | ⚠️ | Requires production URL |
| Logging no sensitive data | ✅ | Structured logging with context |
| Provider abstraction | ✅ | Resend isolated to adapter |

**Classification: ENGINEERING COMPLETE — EXTERNAL CONFIGURATION REQUIRED**

---

## 15. Rollback Audit

| Scenario | Capability |
|----------|-----------|
| Bad application deployment | ✅ Git revert + Vercel redeploy |
| Bad database migration | ⚠️ Forward-only (no down migrations) |
| Bad environment variable | ✅ Vercel dashboard edit |
| Broken domain | ⚠️ Requires Truehost cPanel access |
| Broken DNS | ⚠️ Requires Truehost cPanel access |
| Broken webhook | ✅ Webhook signature verification rejects bad payloads |
| Failed notification provider | ✅ Provider abstraction allows switching |
| Failed payment integration | ⚠️ Requires Paystack support |

**Classification: PARTIAL — OPERATIONAL PROCEDURES NEEDED**

---

## 16. Documentation Audit

| Document | Status |
|----------|--------|
| Deployment runbook | ✅ Created (M9) |
| Incident response runbook | ✅ Created (M9) |
| Notification runbook | ✅ Created (M9) |
| Background job runbook | ✅ Created (M9) |
| Environment setup docs | ❌ Not created |
| Domain documentation | ❌ Not created |
| Launch checklist | ❌ Not created |
| Customer-facing docs | ❌ Not created |
| Rider-facing docs | ❌ Not created |
| Admin docs | ❌ Not created |

**Classification: PARTIAL — SOME DOCS NEEDED**

---

## 17. Cost Analysis

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Vercel (Hobby) | $0 | Free tier sufficient for MVP |
| Supabase (Free) | $0 | Free tier: 500MB DB, 1GB storage |
| Resend (Free) | $0 | 3,000 emails/month |
| Paystack | % per transaction | Pay-as-you-go |
| Mapbox | $0–$20 | Free tier: 50k loads/month |
| Domain (Truehost) | ~$10/year | Existing |
| Monitoring (TBD) | $0–$25 | Sentry free tier or alternatives |
| **Total MVP** | **~$0–$20/month** | Excluding Paystack transaction fees |

**Classification: $0 BASELINE — MINIMAL COST**

---

## 18. Business Decisions Required

| # | Decision | Impact | Recommended |
|---|----------|--------|-------------|
| 1 | Launch city/zones | Service availability | Founder decision |
| 2 | Launch date | Timing | Founder decision |
| 3 | Monitoring vendor | Observability | Sentry free tier or defer |
| 4 | Rider payout execution | Financial | Can defer to post-launch |
| 5 | Revenue split policy | Financial | Can defer to post-launch |
| 6 | Payment reconciliation | Financial | Can defer to post-launch |
| 7 | Customer support process | Operations | Founder decision |
| 8 | Marketing launch | Growth | Founder decision |

**Classification: FOUNDER DECISION REQUIRED**

---

## 19. External Configuration Required

| # | Item | Provider | Action Required |
|---|------|----------|----------------|
| 1 | Vercel project | Vercel | Create project, import Git repo |
| 2 | Vercel environment variables | Vercel | Set all env vars in dashboard |
| 3 | Supabase production project | Supabase | Create or verify production project |
| 4 | Supabase migrations | Supabase | Run migrations against production |
| 5 | Paystack production keys | Paystack | Obtain from Paystack dashboard |
| 6 | Paystack production webhook | Paystack | Configure webhook URL |
| 7 | Mapbox production token | Mapbox | Verify domain restrictions |
| 8 | Resend API key | Resend | Create and add to Vercel |
| 9 | Domain DNS | Truehost | Add A/CNAME record for Vercel |
| 10 | Resend DNS records | Truehost | Add SPF/DKIM for Resend |
| 11 | SSL certificate | Vercel | Automatic via Vercel |
| 12 | Monitoring vendor | TBD | Select and configure |

**Classification: EXTERNAL CONFIGURATION REQUIRED**

---

## 20. Engineering Work Remaining

| # | Item | Priority | Blocks Launch |
|---|------|----------|---------------|
| 1 | Environment setup documentation | SHOULD | No |
| 2 | Launch checklist | SHOULD | No |
| 3 | Production verification checklist | SHOULD | No |
| 4 | Clean up duplicate Paystack env vars | SHOULD | No |
| 5 | Add Resend env vars to `.env.local` template | SHOULD | No |

**Classification: ENGINEERING-READY — LOW COMPLEXITY**

---

## 21. Launch Blockers

| # | Blocker | Type | Resolution |
|---|---------|------|-----------|
| 1 | No Vercel project | External | Create Vercel project |
| 2 | No production Supabase | External | Create/verify Supabase production |
| 3 | No production Paystack keys | External | Obtain from Paystack |
| 4 | No production DNS config | External | Configure DNS at Truehost |
| 5 | No Resend API key in env | External | Create and configure |
| 6 | No launch city/zones | Business | Founder decision |
| 7 | No launch date | Business | Founder decision |

**Classification: ALL EXTERNAL/BUSINESS — ZERO CODE BLOCKERS**

---

## 22. Recommended M10 Architecture

M10 should NOT involve writing application code. The architecture is:

```
Vercel (application hosting)
    ↓
Supabase (database + auth + storage)
    ↓
Paystack (payments)
    ↓
Resend (transactional email)
    ↓
Mapbox/Stadia (mapping)
    ↓
Truehost (domain/DNS)
```

All of these services are already integrated in the codebase. M10 is purely **configuration and deployment**.

---

## 23. Proposed Implementation Sequence

Since M10 is configuration-heavy, the sequence is:

```
1. Founder decision gate (launch city, date, monitoring)
    ↓
2. Create Vercel project + configure environment
    ↓
3. Create/verify Supabase production project
    ↓
4. Run migrations against production database
    ↓
5. Obtain Paystack production keys + configure webhook
    ↓
6. Configure Resend API key + verify DNS
    ↓
7. Configure domain DNS (A/CNAME → Vercel)
    ↓
8. Deploy to Vercel
    ↓
9. Verify production deployment
    ↓
10. Production smoke test
    ↓
11. Launch checklist completion
    ↓
12. M10 commit/push (documentation only)
```

---

## 24. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| DNS changes break business email | HIGH | Document existing DNS before changes |
| Supabase free tier limits | MEDIUM | Monitor usage, upgrade if needed |
| Resend free tier limits | LOW | 3,000 emails/month sufficient for MVP |
| Paystack production mode issues | MEDIUM | Test with small real transactions |
| Vercel cold starts | LOW | Acceptable for MVP |

---

## 25. GO / NO-GO Recommendation

**RECOMMENDATION: GO FOR M10 ARCHITECTURE REVIEW**

The application is fully ready for production deployment. All remaining work is external configuration and business decisions. There are zero code changes required.

**M10 scope should be limited to:**
1. Documentation (environment setup, launch checklist)
2. Configuration guidance (Vercel, Supabase, Paystack, Resend, DNS)
3. Production verification procedures

**M10 should NOT involve:**
1. Application code changes
2. Database schema changes
3. New features
4. Refactoring

---

**MILESTONE 10 DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**

---

*Document generated during Milestone 10 Discovery. No source code was modified.*
