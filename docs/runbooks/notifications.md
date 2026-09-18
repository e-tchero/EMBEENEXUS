# Notification System Runbook — Embee Nexus

## Overview

Embee Nexus uses a provider-agnostic notification system with:
- In-app notifications (synchronous)
- Email notifications via Resend (asynchronous)
- Provider abstraction layer (switchable)

## Architecture

```
Domain Event → NotificationService → EmailProvider → Resend → Recipient
                    ↓
              notifications table (durable)
                    ↓
              notification_deliveries table (provider tracking)
```

## Common Issues

### Emails Not Delivering

**Symptoms:**
- Customers report not receiving emails
- notification_deliveries shows "pending" or "failed"

**Investigation:**
1. Check Resend dashboard for delivery status
2. Check notification_deliveries table:
   ```sql
   SELECT * FROM notification_deliveries
   WHERE provider = 'resend'
   AND delivery_status IN ('pending', 'failed')
   ORDER BY created_at DESC
   LIMIT 10;
   ```
3. Check Resend API logs
4. Check email templates for errors

**Resolution:**
- If Resend issue: wait for recovery
- If template issue: fix template, redeploy
- If delivery record stuck: update status manually

### High Email Failure Rate

**Symptoms:**
- Many notifications showing "failed" or "permanent_failure"

**Investigation:**
1. Check failure reasons in last_error field
2. Check Resend bounces/complaints dashboard
3. Check email list quality

**Resolution:**
- If bounce rate high: clean email list
- If complaint rate high: review email content
- If provider issue: consider switching providers

### Duplicate Notifications

**Symptoms:**
- Users receiving same notification multiple times

**Investigation:**
1. Check notification idempotency:
   ```sql
   SELECT user_id, type, reference_type, reference_id, COUNT(*)
   FROM notifications
   GROUP BY user_id, type, reference_type, reference_id
   HAVING COUNT(*) > 1;
   ```
2. Check event hooks for duplicate triggers
3. Check background job retries

**Resolution:**
- If duplicate events: fix event hook
- If duplicate jobs: check idempotency mechanism
- If provider retry: check delivery status

### Notification Delay

**Symptoms:**
- Notifications arriving late

**Investigation:**
1. Check notification creation timestamp vs sent timestamp
2. Check background job queue
3. Check Resend delivery logs

**Resolution:**
- If queue backlog: check job processing
- If Resend delay: normal for free tier
- If creation delay: check event hook performance

## Provider Switching

### Current Provider: Resend

To switch to another provider:

1. **Create new adapter**
   ```typescript
   // apps/web/lib/notifications/providers/sendgrid-email-provider.ts
   export class SendGridEmailProvider implements EmailProvider {
     readonly name = 'sendgrid';
     async send(message: EmailMessage): Promise<EmailSendResult> {
       // Implement SendGrid API call
     }
     async verify(): Promise<boolean> {
       // Implement SendGrid verification
     }
   }
   ```

2. **Register in provider factory**
   ```typescript
   // apps/web/lib/notifications/providers/index.ts
   switch (providerName) {
     case 'resend':
       return new ResendEmailProvider();
     case 'sendgrid':
       return new SendGridEmailProvider();
   }
   ```

3. **Update environment variables**
   ```
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=...
   SENDGRID_FROM_EMAIL=...
   ```

4. **Deploy and verify**

### No Domain Logic Changes Required

The provider abstraction ensures:
- Notification service: UNCHANGED
- Event hooks: UNCHANGED
- Templates: UNCHANGED
- API endpoints: UNCHANGED
- Database schema: UNCHANGED

## Webhook Handling

### Resend Webhooks

Resend sends delivery status webhooks to:
```
POST /api/webhooks/resend
```

**Events handled:**
- `email.sent` → delivery_status = 'sent'
- `email.delivered` → delivery_status = 'delivered'
- `email.bounced` → delivery_status = 'permanent_failure'
- `email.complained` → delivery_status = 'failed'

**Security:**
- Signature verification using svix
- Raw body verification
- Idempotent processing

### Webhook Failure

If Resend webhooks stop working:

1. Check Resend webhook configuration
2. Check webhook endpoint accessibility
3. Check signature verification
4. Manual status update if needed

## Monitoring

### Key Metrics

- Notifications created per hour
- Delivery success rate
- Average delivery time
- Bounce rate
- Complaint rate

### Log Queries

```bash
# Find failed notifications
grep "notification.create_failed" logs.json

# Find delivery failures
grep "resend.send_failed" logs.json

# Find webhook events
grep "resend.webhook.received" logs.json
```

## Backup/Recovery

### Notification Data

- Notifications table: backed up with database
- notification_deliveries: backed up with database
- No special recovery needed

### Provider Recovery

If Resend is unavailable:
1. Notifications queue in database
2. Retry when provider recovers
3. No data loss

## Cost Management

### Resend Free Tier Limits
- 3,000 emails/month
- 100 emails/day
- 3 verified domains

### Monitoring Usage
Check Resend dashboard for current usage.
If approaching limits:
1. Review notification frequency
2. Consider paid tier
3. Or switch to alternative provider
