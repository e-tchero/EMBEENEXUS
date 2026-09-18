# Incident Response Runbook — Embee Nexus

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P0** | Complete outage, data loss risk | Immediate |
| **P1** | Major feature broken, no workaround | < 1 hour |
| **P2** | Feature degraded, workaround exists | < 4 hours |
| **P3** | Minor issue, low impact | < 24 hours |

## Detection Signals

### Automated
- Health endpoint (`/api/health`) returns non-200
- Error rate exceeds 5% in structured logs
- Background job failure rate exceeds 10%
- Vercel function timeout rate increases

### Manual
- Customer reports
- Admin reports
- Payment failures
- Notification failures

## Investigation Steps

### 1. Identify the Issue

```bash
# Check health endpoint
curl https://your-domain.com/api/health

# Check recent logs (Vercel dashboard or CLI)
vercel logs --follow

# Check for correlation IDs in error logs
grep "correlation_id" logs.json | tail -20
```

### 2. Determine Scope

- Which users affected? (all, specific role, specific user)
- Which features affected? (payments, dispatch, notifications)
- When did it start?
- Any recent deployments?

### 3. Check External Services

| Service | Dashboard | Check |
|---------|-----------|-------|
| Supabase | supabase.com/dashboard | Database status, API status |
| Paystack | dashboard.paystack.com | API status, webhook delivery |
| Resend | resend.com | Email delivery status |
| Vercel | vercel.com | Deployment status, function logs |
| Stadia Maps | stadiamaps.com | API status |

## Common Incidents

### API Outage

**Symptoms:** 500 errors, health check fails
**Investigation:**
1. Check Vercel function logs
2. Check Supabase database status
3. Check for recent deployments
**Resolution:**
- If deployment issue: rollback
- If database issue: check Supabase dashboard
- If external service: wait for recovery

### Payment Webhook Failure

**Symptoms:** Payments not processing, orders stuck
**Investigation:**
1. Check Paystack webhook delivery logs
2. Check processed_webhook_events table
3. Check payment status in database
**Resolution:**
- If webhook not delivered: manual retry via Paystack dashboard
- If webhook processing failed: check correlation_id in logs
- If database issue: check Supabase dashboard

### Notification Failure

**Symptoms:** Customers not receiving emails
**Investigation:**
1. Check Resend dashboard for delivery status
2. Check notification_deliveries table
3. Check notification service logs
**Resolution:**
- If Resend issue: wait for recovery or switch provider
- If delivery record issue: update status manually
- If template issue: fix template and redeploy

### Background Job Failure

**Symptoms:** Jobs stuck in "processing" or "failed"
**Investigation:**
1. Check background_jobs table
2. Check stuck job count
3. Check job handler logs
**Resolution:**
- If stuck: reset job status to "pending"
- If failed: check error_message, fix, retry
- If systematic: check for deployment issues

### Database Incident

**Symptoms:** Query failures, connection errors
**Investigation:**
1. Check Supabase dashboard
2. Check connection pool usage
3. Check for slow queries
**Resolution:**
- If connection pool: check for connection leaks
- If slow query: check indexes, optimize
- If Supabase issue: contact support

### Tracking Failure

**Symptoms:** Real-time location not updating
**Investigation:**
1. Check Supabase Realtime status
2. Check rider_location updates
3. Check frontend connection
**Resolution:**
- If Supabase Realtime: check status page
- If rider location: check GPS throttling
- If frontend: check WebSocket connection

## Escalation

### Internal
1. Investigate available logs
2. Check health endpoints
3. Review recent changes
4. Escalate to founder if unresolved

### External
- **Supabase:** support@supabase.com or dashboard
- **Paystack:** support@paystack.com or dashboard
- **Resend:** support@resend.com or dashboard
- **Vercel:** support@vercel.com or dashboard

## Communication

### Internal
- Document incident in incident log
- Update status page if available
- Notify affected users if major

### External
- Email affected users if data breach
- Update public status page
- Post-mortem for P0/P1 incidents

## Post-Incident

1. **Document timeline**
2. **Root cause analysis**
3. **Fix implementation**
4. **Prevention measures**
5. **Update runbooks if needed**
