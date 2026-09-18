# MILESTONE 8 — NOTIFICATIONS: ARCHITECTURE REVIEW

**Date:** August 28, 2026
**HEAD:** `88ec1e1` (unchanged)
**Status:** ARCHITECTURE REVIEW COMPLETE — READY FOR IMPLEMENTATION AUTHORIZATION

---

## 1. Executive Summary

Milestone 8 adds a complete notification system to Embee Nexus. The database foundation exists (`notifications` table with RLS, indexes, grants), and the event pipeline exists (`order_events` with 15+ event types). The gap is entirely in application logic.

**The most important architectural principle:**

> EMBEE NEXUS MUST NOT BE ARCHITECTURALLY LOCKED TO ANY NOTIFICATION PROVIDER.

The notification system belongs to Embee Nexus. Resend does not. Resend is simply the cheapest practical initial email transport. The architecture must make provider switching cheap and low-risk.

**Key architectural decisions:**

1. **Provider-agnostic abstraction** — interface-based design where providers are adapters, not dependencies. Domain logic never references Resend, SendGrid, or any vendor.
2. **In-app as foundation** — the notification system works with zero external providers. In-app notifications are the MVP, with email/SMS/push added incrementally.
3. **Resend as initial email provider** — free tier (3,000 emails/month, 100/day) is sufficient for early-stage transactional email. Architecture allows switching to SendGrid, SES, or any other provider without rewriting domain logic.
4. **Separation of concerns** — WHAT happened (event) is separate from HOW we deliver it (channel) is separate from WHICH provider delivers it (adapter).
5. **Cost-conscious** — leverage existing infrastructure (background jobs, Supabase, Vercel) before introducing new paid services.

---

## 2. Existing Notification Architecture

### What Exists (Verified)

| Component | Location | Status |
|-----------|----------|--------|
| `notifications` table | `initial_schema.sql:669` | ✅ 15 columns, RLS, 3 indexes |
| `Notification` type | `packages/shared/types/index.ts:447` | ✅ |
| `NOTIFICATION_TYPES` constants | `packages/shared/constants/index.ts:81` | ✅ 14 types |
| `NOTIFICATION_EMAIL/SMS/PUSH` job types | `packages/shared/types/index.ts:513-515` | ✅ |
| Background job infrastructure | `lib/services/background-job.service.ts` | ✅ FOR UPDATE SKIP LOCKED |
| Cron endpoint | `app/api/cron/process-jobs/route.ts` | ✅ Timing-safe auth |
| Structured logger | `lib/logger.ts` | ✅ |
| Correlation IDs | `lib/request-context.ts` | ✅ |
| Rate limiting | `lib/rate-limit.ts` | ✅ |

### What Does NOT Exist (Verified)

| Component | Status |
|-----------|--------|
| Notification service | ❌ |
| Notification API | ❌ |
| Notification UI | ❌ |
| Event hooks writing notifications | ❌ |
| Provider adapters | ❌ |
| Email SDK (Resend/SendGrid/etc.) | ❌ Not installed |
| Templates | ❌ |
| Preferences | ❌ |
| `notification_deliveries` table | ❌ |

### Gap Summary

The notification system must be built from scratch. The database and infrastructure exist, but zero application logic connects business events to notification delivery.

---

## 3. Provider Abstraction Architecture

### Core Principle

```
Domain Event → Notification Service → Channel Router → Provider Adapter → External Service
```

The application knows about **notification capabilities**, not vendor-specific APIs.

### Interface Design

```typescript
// Channel providers — the abstraction boundary
interface EmailProvider {
  name: string;
  send(request: EmailRequest): Promise<ProviderResponse>;
}

interface SmsProvider {
  name: string;
  send(request: SmsRequest): Promise<ProviderResponse>;
}

interface PushProvider {
  name: string;
  send(request: PushRequest): Promise<ProviderResponse>;
}

// Provider-neutral request/response
interface EmailRequest {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

interface SmsRequest {
  to: string;
  body: string;
  from?: string;
}

interface PushRequest {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface ProviderResponse {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  retryable: boolean;
}
```

### Provider Implementations

| Provider | Channel | Package | Initial | Cost |
|----------|---------|---------|---------|------|
| `ResendEmailProvider` | email | `resend` | ✅ | Free tier: 3,000/mo, 100/day |
| `InternalInAppProvider` | in_app | N/A | ✅ | $0 |
| `TermiiSmsProvider` | sms | HTTP API | ❌ Deferred | Pay-as-you-go |
| `FirebasePushProvider` | push | `firebase-admin` | ❌ Deferred | Free tier |

### Provider Selection

Provider selection is determined by configuration, not code:

```typescript
// Environment variable drives provider selection
const emailProvider = process.env.EMAIL_PROVIDER || 'resend';

switch (emailProvider) {
  case 'resend': return new ResendEmailProvider(process.env.RESEND_API_KEY);
  case 'sendgrid': return new SendGridEmailProvider(process.env.SENDGRID_API_KEY);
  case 'ses': return new SesEmailProvider(/* config */);
  default: throw new Error(`Unknown email provider: ${emailProvider}`);
}
```

Or better — use a factory/registry pattern that avoids switch statements:

```typescript
const emailProviders: Record<string, () => EmailProvider> = {
  resend: () => new ResendEmailProvider(process.env.RESEND_API_KEY),
  sendgrid: () => new SendGridEmailProvider(process.env.SENDGRID_API_KEY),
};

function getEmailProvider(): EmailProvider {
  const name = process.env.EMAIL_PROVIDER || 'resend';
  const factory = emailProviders[name];
  if (!factory) throw new Error(`Unknown email provider: ${name}`);
  return factory();
}
```

### Provider Switching Procedure

To switch from Resend to another provider:

1. Add new provider adapter (e.g., `SendGridEmailProvider`)
2. Add provider SDK to `package.json`
3. Add provider credentials to environment variables
4. Add provider to the registry
5. Run provider adapter tests
6. Verify DNS/domain authentication for new provider
7. Perform controlled test sends
8. Update `EMAIL_PROVIDER` environment variable
9. Monitor delivery rates
10. Remove old provider adapter after verification

**Domain logic, notification service, API, UI, and database schema remain untouched.**

---

## 4. Resend Evaluation

### Pricing (Current as of August 2026)

| Plan | Price | Emails/month | Daily Limit | Domains |
|------|-------|-------------|-------------|---------|
| Free | $0 | 3,000 | 100 | 3 |
| Pro | $20/mo | 50,000 | No limit | 10 |
| Scale | $90/mo | 100,000 | No limit | 1,000 |

### Why Resend for Initial Provider

| Factor | Assessment |
|--------|-----------|
| Free tier | ✅ 3,000 emails/month sufficient for early stage |
| Daily limit | ✅ 100/day adequate for transactional email |
| API quality | ✅ Clean, TypeScript-first, well-documented |
| SDK | ✅ Official `resend` package for Node.js |
| React Email | ✅ Supports React Email templates |
| Webhooks | ✅ Delivery status webhooks available |
| Nigerian availability | ✅ Global API, no geo-restrictions |
| Migration difficulty | ✅ Simple REST API, easy to replace |
| Vendor lock-in | ✅ Minimal — thin adapter layer |

### Cost Projection

| Scale | Emails/month | Monthly Cost |
|-------|-------------|-------------|
| Pre-launch | <100 | $0 (free tier) |
| Early stage | 100–3,000 | $0 (free tier) |
| Growth | 3,000–50,000 | $20 (Pro) |
| Scale | 50,000–100,000 | $90 (Scale) |

### Risks

| Risk | Mitigation |
|------|-----------|
| Free tier daily limit (100/day) | Acceptable for transactional email; marketing deferred |
| Provider outage | In-app notifications unaffected; retry mechanism handles temporary failures |
| Deliverability issues | Resend maintains shared IPs; can upgrade to dedicated IP |
| Pricing changes | Provider abstraction allows switching |

---

## 5. Provider-Switching Strategy

### Today: Resend

```
EmailProvider
    ↓
ResendEmailProvider
    ↓
Resend API (free tier)
```

### Future: Switch to SendGrid/SES/Any Provider

```
EmailProvider
    ↓
SendGridEmailProvider  (or SesEmailProvider, etc.)
    ↓
SendGrid API (or AWS SES, etc.)
```

### What Changes During Provider Switch

| Layer | Changes Required? |
|-------|------------------|
| Domain events | ❌ No |
| Notification service | ❌ No |
| Notification API | ❌ No |
| Notification UI | ❌ No |
| Database schema | ❌ No |
| Business logic | ❌ No |
| Provider adapter | ✅ Add new, remove old |
| Environment config | ✅ Update `EMAIL_PROVIDER` + API key |
| DNS/SPF/DKIM | ✅ Update for new provider |

**The notification domain must remain vendor-neutral.** No `resend_email_id`, no `sendgrid_message_id` in the database — only generic `provider_message_id`.

---

## 6. Notification Domain Model

### Separation of Concerns

| Concept | Examples | Location |
|---------|----------|----------|
| **What happened** | ORDER_CREATED, PAYMENT_SUCCESS, RIDER_ASSIGNED, DELIVERY_COMPLETED | Notification type |
| **How we deliver** | IN_APP, EMAIL, SMS, PUSH | Channel |
| **Which provider** | resend, termii, firebase, future_provider | Provider field |

Do not mix these concepts.

### Domain Model (No Vendor Specifics)

```
notifications (business notification)
    ├── id: UUID
    ├── user_id: UUID (recipient)
    ├── type: TEXT (e.g., 'order_created')
    ├── title: TEXT
    ├── body: TEXT
    ├── reference_type: TEXT (e.g., 'order')
    ├── reference_id: UUID
    ├── metadata: JSONB (template data)
    ├── read_at: TIMESTAMPTZ (null = unread)
    └── created_at: TIMESTAMPTZ

notification_deliveries (per-channel delivery)
    ├── id: UUID
    ├── notification_id: UUID (FK → notifications)
    ├── channel: TEXT ('in_app' | 'email' | 'sms' | 'push')
    ├── provider: TEXT ('internal' | 'resend' | 'sendgrid' | ...)
    ├── status: TEXT ('pending' | 'processing' | 'sent' | 'delivered' | 'failed' | ...)
    ├── provider_message_id: TEXT (generic, not vendor-specific)
    ├── retry_count: INTEGER
    ├── max_retries: INTEGER
    ├── last_error: TEXT
    └── timestamps: created_at, updated_at, sent_at, delivered_at, failed_at
```

---

## 7. Email Architecture

### Initial: Resend

```
NotificationService.notify()
    ↓
INSERT INTO notifications + notification_deliveries (email channel, provider='resend')
    ↓
Background job picks up pending delivery
    ↓
ResendEmailProvider.send()
    ↓
Resend API
    ↓
Update delivery status
```

### In-App (Always Available)

```
NotificationService.notify()
    ↓
INSERT INTO notifications + notification_deliveries (in_app channel, provider='internal')
    ↓
In-app delivery is immediate (no background job needed)
    ↓
Broadcast via Supabase Realtime
```

### SMS (Deferred)

Architecture is ready but implementation deferred until Termii (or other provider) is selected and API key obtained.

### Push (Deferred)

Architecture is ready but implementation deferred until Firebase project is configured.

---

## 8. Cost Analysis

### Current Monthly Cost (Zero Notifications)

| Service | Monthly Cost |
|---------|-------------|
| Vercel | $0 (hobby) / $20 (pro) |
| Supabase | $0 (free tier) |
| Stadia Maps | Usage-based |
| Paystack | Per-transaction |
| Notifications | $0 (not implemented) |

### M8 Core Cost (In-App Only)

| Service | Monthly Cost |
|---------|-------------|
| Notifications | $0 (uses existing Supabase + background jobs) |
| **Total additional** | **$0** |

### M8 + Email (Resend Free Tier)

| Service | Monthly Cost |
|---------|-------------|
| Resend | $0 (3,000 emails/month free) |
| **Total additional** | **$0** |

### M8 + Email (Resend Pro, when needed)

| Service | Monthly Cost |
|---------|-------------|
| Resend Pro | $20/month (50,000 emails) |
| **Total additional** | **$20/month** |

### Cost-Conscious Principles Applied

1. ✅ In-app notifications use existing Supabase infrastructure — $0
2. ✅ Background jobs use existing cron infrastructure — $0
3. ✅ Resend free tier covers early-stage email — $0
4. ✅ No new SaaS platforms introduced
5. ✅ No unnecessary SDKs beyond the Resend adapter
6. ✅ Provider switching doesn't require infrastructure changes

---

## 9. Event Architecture

### Transaction Boundary Model

```
Business Service (order.service.ts, payment.service.ts, etc.)
    │
    ├── BEGIN TRANSACTION
    │   ├── Mutate business state
    │   ├── INSERT INTO notifications
    │   └── INSERT INTO notification_deliveries
    ├── COMMIT
    │
    ├── (Post-commit) Broadcast via Supabase Realtime (best-effort)
    │
    └── (Async) Background job processes pending deliveries
```

### What Happens Atomically

Inside a single database transaction:
1. Business state is mutated
2. One `notifications` row is inserted
3. One or more `notification_deliveries` rows are inserted
4. All commit together or all roll back

**No external API calls occur inside the transaction.**

### Authoritative Event Path

One authoritative service function per event type:

| Event | Authoritative Function |
|-------|----------------------|
| Order created | `OrderService.createOrder` |
| Payment confirmed | `PaymentService` (webhook handler) |
| Payment failed | `PaymentService` (webhook handler) |
| Rider assigned | `RiderOfferService` |
| New delivery offer | `RiderOfferService` |
| Delivery complete | `ActiveDeliveryService.completeDelivery` |
| Order cancelled | `cancel_order()` PostgreSQL function |
| Refund initiated | `RefundService` |
| Rider verified | `AdminService` |

### Why Service-Layer (Not Triggers)

- Triggers cannot call external providers
- Triggers cannot make business decisions about channel selection
- Triggers cannot use structured logging with correlation IDs
- Service layer has the context (user, order, rider) needed for notification content

---

## 10. Idempotency Strategy

### Business Idempotency (Notification Creation)

Unique constraint prevents duplicate notifications:

```sql
CREATE UNIQUE INDEX idx_notifications_business_key
ON notifications (user_id, type, reference_type, reference_id)
WHERE reference_id IS NOT NULL;
```

Same business event → same (user_id, type, reference) → unique constraint catches duplicate.

### Worker Idempotency (Delivery Processing)

`FOR UPDATE SKIP LOCKED` via `claim_next_pending_job()` prevents concurrent processing.

### Provider Submission Idempotency

Resend supports idempotency via the `Idempotency-Key` header. On retry, pass the same key to prevent duplicate sends.

### Webhook/Callback Idempotency

Provider delivery status updates are idempotent: if status is already `delivered`, ignore the callback.

---

## 11. Retry Strategy

### Retry Policy

| Parameter | Value |
|-----------|-------|
| Max retries | 3 |
| Backoff | Exponential: 5s, 10s, 20s |
| Retryable errors | 429, 5xx, timeout, network |
| Permanent errors | 400, 401, 403, bounce |

### Delivery State Machine

```
pending → processing → sent → delivered (terminal)
                    → failed → pending (retry) or permanently_failed (terminal)
                    → bounced (terminal)
```

### Failure Matrix

| Failure | Result |
|---------|--------|
| Business transaction rolls back | No notification |
| Business transaction commits | Notification durable |
| App crashes after commit | Notification persists, processed by next cron |
| Realtime unavailable | Notification in DB, client polls |
| Worker crashes before processing | recover_stuck_jobs() returns to pending |
| Provider timeout | Retry with backoff |
| Provider 4xx permanent | permanently_failed |
| Provider 5xx | Retry with backoff |
| Provider rate limit (429) | Backoff and retry |
| Duplicate provider callback | Ignored (idempotent) |
| Two workers race | Exactly one claims (FOR UPDATE SKIP LOCKED) |

---

## 12. In-App Architecture

### Zero-Dependency MVP

The notification system works with **zero external providers configured**:

```
Order event
    ↓
NotificationService
    ↓
notifications table
    ↓
Customer UI (polls unread count or receives Realtime broadcast)
```

### Realtime Delivery

After notification transaction commits:
```
Broadcast to private:user:{user_id}:notifications
```

Supabase Realtime's private channel mode requires valid JWT. User A cannot receive User B's notifications.

### Client Behavior

```
User opens app
    ↓
Subscribe to private:user:{user_id}:notifications
    ↓
On broadcast → update unread badge, show toast
    ↓
On reconnect → fetch unread count from API (recovers missed notifications)
```

---

## 13. Security Architecture

| Threat | Mitigation |
|--------|-----------|
| Cross-user notification access | RLS: `user_id = auth.uid()` |
| IDOR on notification ID | RLS enforces ownership |
| Provider credential exposure | Environment variables only, never in source |
| Recipient manipulation | Derived from user profile, not client input |
| Template injection | Escaped variables, no raw HTML |
| Log leakage | Logger redacts sensitive fields |
| Realtime channel hijacking | Private channel with JWT auth |
| Duplicate sends | Idempotent job processing + provider idempotency keys |
| Rate limiting | Existing rate limiter applied to notification API |

### Database Access Model

| Table | Client Read | Client Write | Server Write |
|-------|------------|-------------|-------------|
| `notifications` | Own only (RLS) | Mark read only (RLS) | CREATE (service-role) |
| `notification_deliveries` | Own only (RLS) | None | CREATE + UPDATE (service-role) |

---

## 14. Domain/DNS/Email Infrastructure

### Current Infrastructure

| Concern | Current Provider | Notes |
|---------|-----------------|-------|
| Domain registration | Truehost | May migrate to Vercel later |
| DNS | Truehost/cPanel | May migrate to Vercel DNS |
| Web hosting | Truehost/cPanel | Moving to Vercel |
| Transactional email | Not implemented | Resend recommended |
| Business mailboxes | Truehost/cPanel | Keep as-is unless deliberately changed |
| Application hosting | Vercel | Deployed |
| Database/Auth | Supabase | Deployed |

### Important Distinctions

```
Domain registration ≠ DNS management ≠ Email hosting ≠ Application hosting
```

- **Vercel hosting ≠ Vercel email** — Vercel hosts the application, not email
- **Resend ≠ business mailbox** — Resend sends transactional email, not business inboxes
- **Truehost/cPanel ≠ application hosting** — Moving to Vercel for hosting doesn't affect Truehost email

### Resend DNS Requirements

To send email from Resend, the domain needs:

| Record | Purpose | Notes |
|--------|---------|-------|
| SPF | Sender authentication | `v=spf1 include:resend.com ~all` |
| DKIM | Message signing | Resend provides the DNS records |
| DMARC | Policy | `_dmarc.yourdomain.com` |
| MX | Mail exchange | Only if receiving email through Resend (not needed for transactional) |

### Domain Migration Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking website during DNS migration | HIGH | Migrate DNS during low-traffic window |
| Breaking business email | HIGH | Keep MX records pointing to Truehost |
| Breaking Supabase auth | MEDIUM | Supabase uses its own domain, not affected |
| Breaking Resend delivery | LOW | SPF/DKIM records added to existing domain |

### Recommendation

**Do NOT migrate domain/DNS during M8.** Add Resend DNS records to the existing Truehost-managed domain. Domain migration is a separate future concern.

---

## 15. User Preference Strategy

### MVP: Event-Level Defaults

| Channel | Default | Override |
|---------|---------|---------|
| In-app | Always ON | Cannot be disabled |
| Email | ON for critical events | Deferred to post-M8 |
| SMS | OFF | Deferred |
| Push | Deferred | Deferred |

### Transactional vs Marketing

- **Transactional** (order confirmations, payment receipts, delivery updates) — cannot be disabled, no opt-out
- **Marketing** (promotions, newsletters) — not implemented in M8, deferred to post-launch

### Post-M8: User Preferences Table

```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 16. Testing Strategy

### Test Architecture

Tests must work without external provider credentials:

```
NotificationService
    ↓
MockEmailProvider (for unit/integration tests)
```

Then separately:

```
ResendEmailProvider
    ↓
Resend API (integration test with real credentials)
```

### Required Tests

| Category | Tests |
|----------|-------|
| Authorization | Customer reads own, rider reads own, cross-user denied |
| Event creation | Order created → notification exists, idempotent |
| Delivery | In-app immediate, email via background job |
| Idempotency | Duplicate event → one notification |
| Concurrency | Two workers → one processes |
| Provider | Resend adapter sends correctly, handles errors |
| API | List, unread count, mark read, mark all read |
| Realtime | Broadcast received by correct user |
| Regression | 487+ existing tests pass |

---

## 17. Implementation Sequence

### M8 Core (Zero External Dependencies)

```
1. Database migration (notification_deliveries table + indexes + RLS)
    ↓
2. Notification service (lib/services/notification.service.ts)
    ↓
3. Event hooks in existing services (order, payment, dispatch, rider, admin)
    ↓
4. Notification API (4 endpoints)
    ↓
5. Realtime broadcast (private:user:{user_id}:notifications)
    ↓
6. Notification UI component (bell/dropdown)
    ↓
7. Tests (authorization, idempotency, API, regression)
    ↓
8. Security verification
    ↓
9. Typecheck + build verification
```

### M8 Email (Requires Resend API Key)

```
10. Provider abstraction interface
    ↓
11. ResendEmailProvider adapter
    ↓
12. Register NOTIFICATION_EMAIL job handler
    ↓
13. Email templates (transactional)
    ↓
14. Email delivery tests
```

### Deferred (Post-M8)

- SMS provider (Termii)
- Push provider (Firebase)
- User preference management
- Notification preferences UI
- Marketing notifications

---

## 18. Notification Event Matrix

| Business Event | Customer | Rider | Admin | In-App | Email | SMS | Push |
|---------------|----------|-------|-------|--------|-------|-----|------|
| Order created | ✅ | — | — | ✅ | ✅ | — | — |
| Payment successful | ✅ | — | — | ✅ | ✅ | — | — |
| Payment failed | ✅ | — | ✅ | ✅ | ✅ | — | — |
| Rider assigned | ✅ | — | — | ✅ | — | — | ✅ |
| Rider arriving | ✅ | — | — | ✅ | — | — | — |
| Rider arrived | ✅ | — | — | ✅ | — | — | ✅ |
| Package picked up | ✅ | — | — | ✅ | — | — | — |
| In transit | ✅ | — | — | ✅ | — | — | — |
| Rider at destination | ✅ | — | — | ✅ | — | — | ✅ |
| Delivery complete | ✅ | ✅ | — | ✅ | ✅ | — | — |
| Order cancelled | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Refund initiated | ✅ | — | ✅ | ✅ | ✅ | — | — |
| New delivery offer | — | ✅ | — | ✅ | — | — | ✅ |
| Offer expired | — | ✅ | — | ✅ | — | — | — |
| Rider verified | — | ✅ | ✅ | ✅ | ✅ | — | — |
| Rider rejected | — | ✅ | ✅ | ✅ | ✅ | — | — |
| No riders available | ✅ | — | ✅ | ✅ | — | — | — |

**Note:** Email channel requires Resend API key. Push channel requires Firebase config. Both deferred if not available.

---

## 19. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Resend free tier daily limit (100/day) | MEDIUM | LOW | Acceptable for transactional email |
| Resend outage | LOW | MEDIUM | In-app unaffected; retry handles temporary |
| Domain DNS issues | MEDIUM | HIGH | Test DNS records before going live |
| Scope creep into marketing | HIGH | MEDIUM | Strict transactional-only for M8 |
| Provider lock-in | LOW | LOW | Provider abstraction prevents lock-in |
| Template design delays | MEDIUM | MEDIUM | Start with plain-text templates |

---

## 20. Decisions Requiring Founder Approval

| # | Decision | Recommended | Consequence |
|---|----------|-------------|-------------|
| 1 | Confirm Resend as initial email provider | ✅ Resend (free tier) | Need API key before email works |
| 2 | Which events trigger email | Critical events only | Over-emailing causes fatigue |
| 3 | SMS provider selection | Defer | SMS not in M8 scope |
| 4 | Push provider selection | Defer | Push not in M8 scope |
| 5 | User opt-in/opt-out policy | Defer to post-M8 | MVP uses event-level defaults |
| 6 | Email sender name/domain | "Embee Nexus" | Needs domain verification with Resend |

---

## 21. GO / NO-GO

**GO — Implementation is recommended.**

The notification architecture is provider-agnostic, cost-conscious, and leverages existing infrastructure. In-app notifications can be implemented with zero additional cost. Resend provides a free-tier email solution that can be replaced without rewriting domain logic.

The recommended scope:
1. **M8 Core:** In-app notifications (service, API, UI, event hooks, Realtime) — $0 additional cost
2. **M8 Email:** Resend email provider (if API key available) — $0 additional cost (free tier)

---

**MILESTONE 8 ARCHITECTURE REVIEW — COMPLETE**
**STATUS: READY FOR IMPLEMENTATION AUTHORIZATION**
