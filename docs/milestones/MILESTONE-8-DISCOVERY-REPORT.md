# MILESTONE 8 — NOTIFICATIONS: DISCOVERY REPORT

**Date:** August 28, 2026
**HEAD:** `88ec1e1` (unchanged)
**Status:** DISCOVERY COMPLETE — READY FOR ARCHITECTURE REVIEW

---

## 1. Executive Summary

Milestone 8 (Notifications) is the next major milestone after the completed Milestones 1–7. The database foundation exists: the `notifications` table has schema, RLS, grants, and indexes. Notification types and background job types are defined in shared code. However, **zero notification logic exists** — no service, no API, no UI, no provider integrations, no templates, no event hooks.

The architecture specifies SendGrid (email), Termii (SMS), and Firebase (push), but no SDKs are installed, no API keys configured, and no environment variables exist.

**Key finding:** The platform currently has a complete event pipeline (`order_events` table with 15+ event types) but nothing consumes those events to generate notifications. The notification system must be built from scratch, starting with in-app notifications and extending to external providers.

---

## 2. Repository Baseline

| Field | Value |
|-------|-------|
| HEAD | `88ec1e1` |
| Branch | `master` |
| Working tree | Clean (only `docs/ROADMAP.md` untracked from reconciliation) |
| Phase 1–6M | ✅ Untouched |
| Attribution | ✅ ZERO |

---

## 3. Original M8 Requirements

From ARCHITECTURE.md §15:

> **Milestone 8: Notifications**
> - Email (SendGrid)
> - SMS (Termii)
> - Push (Firebase)
> - In-app

From ARCHITECTURE.md §16 (Open Decisions):

> | 9 | Notification Providers | Email/SMS | Notification service | ⚠️ Default: email only |

The architecture provides high-level requirements but does not specify:
- Which events trigger which notification channels
- Template content
- User preference model
- Rate limiting per channel
- Retry behavior
- Provider selection beyond the defaults

---

## 4. Existing Notification Infrastructure

### Database

| Component | Status | Evidence |
|-----------|--------|----------|
| `notifications` table | ✅ EXISTS | Schema: id, user_id, type, title, body, in_app, email, sms, push, sent_at, read_at, reference_type, reference_id, metadata, created_at |
| RLS policies | ✅ EXISTS | `notifications_select_own` (user_id = auth.uid()), `notifications_update_own` |
| Indexes | ✅ EXISTS | idx_notifications_user, idx_notifications_read, idx_notifications_created |
| Grants | ✅ EXISTS | SELECT to anon/authenticated/service_role, INSERT/UPDATE to authenticated/service_role |

### Shared Code

| Component | Status | Evidence |
|-----------|--------|----------|
| `Notification` type | ✅ EXISTS | `packages/shared/types/index.ts:447` |
| `NOTIFICATION_TYPES` constants | ✅ EXISTS | 14 event types defined in `packages/shared/constants/index.ts:81` |
| `NOTIFICATION_EMAIL/SMS/PUSH` job types | ✅ EXISTS | In `JobType` union in `packages/shared/types/index.ts:513-515` |

### Background Jobs

| Component | Status | Evidence |
|-----------|--------|----------|
| Job type definitions | ✅ EXISTS | `NOTIFICATION_EMAIL`, `NOTIFICATION_SMS`, `NOTIFICATION_PUSH` in JobType |
| Job handler registration | ❌ NOT REGISTERED | Cron endpoint registers 4 handlers (DISPATCH_ORDER, DISPATCH_RETRY, OFFER_TIMEOUT, REFUND_PROCESS) — none for notifications |
| Job creation logic | ❌ NOT EXISTS | Nothing creates notification jobs |

### Provider Integration

| Provider | Status | Evidence |
|----------|--------|----------|
| SendGrid (email) | ❌ NOT INSTALLED | No SDK in package.json, no API key in env |
| Termii (SMS) | ❌ NOT INSTALLED | No SDK, no API key |
| Firebase (push) | ❌ NOT INSTALLED | No SDK, no config |
| Provider abstraction | ❌ NOT EXISTS | No notification provider interface |

### Application Code

| Component | Status | Evidence |
|-----------|--------|----------|
| Notification service | ❌ NOT EXISTS | No `notification.service.ts` |
| Notification API | ❌ NOT EXISTS | No notification endpoints |
| Notification UI | ❌ NOT EXISTS | No notification component/display |
| Event hooks | ❌ NOT EXISTS | Nothing writes to `notifications` table |
| Templates | ❌ NOT EXISTS | No email/SMS templates |
| User preferences | ❌ NOT EXISTS | No opt-in/opt-out mechanism |
| Retry mechanism | ❌ NOT EXISTS | No retry logic for failed sends |
| Delivery status tracking | ❌ NOT EXISTS | No provider delivery receipt handling |
| Rate limiting | ❌ NOT EXISTS | No per-channel rate limiting |

---

## 5. Notification Event Inventory

### Events That Already Generate `order_events` Records

These events are already being recorded and could trigger notifications:

| Event | Triggered By | Customers | Riders | Admins |
|-------|-------------|-----------|--------|--------|
| `order_created` | OrderService.createOrder | ✅ | — | — |
| `payment_confirmed` | Paystack webhook | ✅ | — | — |
| `payment_failed` | Paystack webhook | ✅ | — | ✅ |
| `dispatch_started` | dispatch_rider_v2 | — | — | ✅ |
| `rider_accepted` | accept_rider_offer | ✅ | — | — |
| `rider_departed_pickup` | Rider status update | ✅ | — | — |
| `rider_arrived_pickup` | Rider status update | ✅ | — | — |
| `pickup_confirmed` | Rider status update | ✅ | — | — |
| `in_transit` | Rider status update | ✅ | — | — |
| `rider_arrived_destination` | Rider status update | ✅ | — | — |
| `delivery_confirmed` | complete_delivery | ✅ | ✅ | — |
| `order_cancelled` | cancel_order | ✅ | ✅ | — |
| `refund_initiated` | refundService | ✅ | — | ✅ |

### Events That Should Generate Notifications (Recommended)

| Event | Channel | Customer | Rider | Admin |
|-------|---------|----------|-------|-------|
| Order created | In-app + Email | ✅ | — | — |
| Payment successful | In-app + Email | ✅ | — | — |
| Payment failed | In-app + Email | ✅ | — | ✅ |
| Rider assigned | In-app + Push | ✅ | — | — |
| Rider heading to pickup | In-app | ✅ | — | — |
| Rider arrived at pickup | In-app + Push | ✅ | — | — |
| Package picked up | In-app | ✅ | — | — |
| In transit | In-app | ✅ | — | — |
| Rider at destination | In-app + Push | ✅ | — | — |
| Delivery complete | In-app + Email | ✅ | ✅ | — |
| Order cancelled | In-app + Email | ✅ | ✅ | ✅ |
| Refund initiated | In-app + Email | ✅ | — | ✅ |
| New delivery offer | In-app + Push | — | ✅ | — |
| Offer expired | In-app | — | ✅ | — |
| Rider verification approved | In-app + Email | — | ✅ | ✅ |
| Rider verification rejected | In-app + Email | — | ✅ | ✅ |
| No riders available | In-app | ✅ | — | ✅ |

### Events That Do NOT Need Notifications

| Event | Reason |
|-------|--------|
| Location updates | Too frequent, not user-facing |
| Quote generated | User initiated, already visible |
| Address created/updated | User initiated |
| Availability toggle | User initiated |
| Background job processing | Internal |

---

## 6. Security Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | No notification IDOR possible (table not written to) | INFO | N/A |
| 2 | RLS correctly isolates notifications by user_id | LOW | ✅ Verified |
| 3 | No notification creation API exists | INFO | N/A |
| 4 | No provider credentials configured | INFO | N/A |
| 5 | Service-role can bypass RLS for notification creation | LOW | By design |

**No active security vulnerabilities** — the notification system doesn't exist yet.

---

## 7. Concurrency & Reliability Findings

| Scenario | Current Behavior | Required for M8 |
|----------|-----------------|-----------------|
| Same event fires twice | No notification created (nothing writes) | Idempotent notification creation |
| Worker crashes after provider delivery | No notification system | Mark sent only after provider confirms |
| Two workers process same notification | Impossible (no jobs created) | FOR UPDATE SKIP LOCKED |
| Provider times out but delivered | N/A | Mark as sent, log timeout |
| User disables channel while job queued | N/A | Check preferences at send time |
| Same notification retried multiple times | N/A | Idempotency key per event+user+type |

---

## 8. Data-Integrity Findings

The current `notifications` schema is adequate for in-app notifications but lacks fields needed for external provider integration:

| Missing Field | Purpose | Priority |
|---------------|---------|----------|
| `provider` | Which provider sent (sendgrid/termii/firebase) | HIGH |
| `provider_message_id` | Provider's message ID for tracking | HIGH |
| `delivery_status` | Provider delivery status (sent/delivered/failed/bounced) | HIGH |
| `retry_count` | Number of delivery attempts | MEDIUM |
| `last_retry_at` | When last retry occurred | MEDIUM |
| `expires_at` | Notification expiration | LOW |
| `channel` | Primary channel (in_app/email/sms/push) | MEDIUM |

**Schema migration will be required** to add provider tracking fields.

---

## 9. Proposed Notification Architecture

### Event-Driven Model

```
Business Event (order_created, payment_confirmed, etc.)
    ↓
Notification Service
    ↓
    ├── In-app: INSERT INTO notifications (immediate)
    ├── Email: CREATE background_job (NOTIFICATION_EMAIL)
    ├── SMS: CREATE background_job (NOTIFICATION_SMS)
    └── Push: CREATE background_job (NOTIFICATION_PUSH)
    ↓
Background Job Processor (cron)
    ↓
Provider Abstraction Layer
    ├── EmailProvider (SendGrid)
    ├── SMSProvider (Termii)
    └── PushProvider (Firebase)
    ↓
Update notification delivery_status
```

### Key Design Decisions

1. **In-app notifications are synchronous** — written directly to `notifications` table
2. **External notifications are asynchronous** — processed via background jobs
3. **Provider abstraction** — interface with SendGrid/Termii/Firebase implementations
4. **Template abstraction** — separate templates from logic
5. **User preferences** — check before sending each channel

---

## 10. Engineering-Ready Work

| # | Work Item | Dependencies |
|---|-----------|-------------|
| 1 | Create `notification.service.ts` | None |
| 2 | Create notification provider abstraction interface | None |
| 3 | Create in-app notification writes (event hooks) | Service module |
| 4 | Create notification API endpoints | Service module |
| 5 | Create notification UI component | API endpoints |
| 6 | Add provider tracking fields to notifications table | Migration |
| 7 | Register NOTIFICATION_EMAIL/SMS/PUSH job handlers | Provider integration |
| 8 | Create notification templates | Business rules |
| 9 | Implement user preference management | Business rules |
| 10 | Add SendGrid integration | API key |
| 11 | Add Termii integration | API key |
| 12 | Add Firebase integration | Firebase config |

---

## 11. Founder Decisions Required

| # | Decision | Impact | Current Default |
|---|----------|--------|-----------------|
| 1 | Confirm SendGrid as email provider | Blocks email integration | ⚠️ Architecture default |
| 2 | Confirm Termii as SMS provider | Blocks SMS integration | ⚠️ Architecture default |
| 3 | Confirm Firebase as push provider | Blocks push integration | ⚠️ Architecture default |
| 4 | Which events trigger email | Template design | ❌ Not defined |
| 5 | Which events trigger SMS | Template design | ❌ Not defined |
| 6 | Which events trigger push | Template design | ❌ Not defined |
| 7 | User opt-in/opt-out policy | Preference UI | ⚠️ Default: opt-in |
| 8 | Notification frequency limits | Rate limiting | ⚠️ Default: reasonable limits |
| 9 | Quiet hours policy | Scheduling | ⚠️ Default: none |
| 10 | Notification retention period | Cleanup | ⚠️ Default: 90 days |

---

## 12. External Configuration Required

| # | Item | Owner |
|---|------|-------|
| 1 | SendGrid API key + verified sender email | Founder |
| 2 | Termii API key | Founder |
| 3 | Firebase project + FCM server key | Founder |
| 4 | Email sender name/domain verification | Founder |
| 5 | SMS sender ID registration | Founder |

---

## 13. M9 Dependencies

M8 introduces the following items that affect M9 (Production Hardening):

| Item | Impact |
|------|--------|
| New API endpoints (notification CRUD) | Need rate limiting |
| New background jobs (NOTIFICATION_*) | Need monitoring |
| New external providers (SendGrid/Termii/Firebase) | Need failure monitoring |
| New secrets (API keys) | Need secrets management |
| New failure modes (provider timeouts, bounces) | Need alerting |
| New load (notification sends at scale) | Need load testing |

---

## 14. M10 Dependencies

M8 introduces the following launch prerequisites:

| Item | Impact |
|------|--------|
| SendGrid account + verified sender | Required before launch |
| Termii account + sender ID | Required before launch |
| Firebase project | Required before launch |
| Production API keys | Required for deployment |
| Email templates | Required for customer experience |
| Notification preferences UI | Required for compliance |

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Provider selection delays M8 | MEDIUM | HIGH | In-app notifications can proceed without providers |
| Template design delays M8 | MEDIUM | MEDIUM | Start with simple text templates |
| Scope creep into marketing notifications | HIGH | MEDIUM | Strict transactional-only scope for M8 |
| Provider rate limits at scale | LOW | LOW | Implement rate limiting per channel |
| Notification fatigue | MEDIUM | MEDIUM | Implement frequency limits |

---

## 16. Recommended M8 Scope

### MUST IMPLEMENT

| # | Item | Why |
|---|------|-----|
| 1 | Notification service with event hooks | Core infrastructure |
| 2 | In-app notification writes | Immediate value, no provider needed |
| 3 | Notification API (list, read, unread count) | Customer/rider need to see notifications |
| 4 | Notification UI component (bell/dropdown) | User-facing display |
| 5 | Schema migration for provider tracking | Required for external providers |
| 6 | Provider abstraction interface | Extensibility |

### SHOULD IMPLEMENT (if providers are available)

| # | Item | Why |
|---|------|-----|
| 7 | SendGrid email integration | Customer/rider transactional email |
| 8 | Email templates (transactional) | Professional customer experience |
| 9 | Background job handlers for NOTIFICATION_* | Async provider delivery |

### DEFER

| # | Item | Why |
|---|------|-----|
| 10 | Termii SMS integration | Can follow email |
| 11 | Firebase push integration | Can follow email |
| 12 | Marketing notifications | Post-launch |
| 13 | Notification preferences UI | Post-MVP |

---

## 17. Proposed Implementation Sequence

```
M8 Discovery (this document)
    ↓
M8 Architecture Review
    ↓
Founder Decision Gate (provider selection, event rules)
    ↓
M8 Implementation
    ├── Schema migration (provider fields)
    ├── Notification service
    ├── Event hooks (in-app writes)
    ├── Notification API
    ├── Notification UI
    ├── Provider abstraction
    └── Provider integration (if keys available)
    ↓
M8 Final Verification
    ↓
M8 Commit/Push
```

---

## 18. Critical Blockers

| # | Blocker | Impact |
|---|---------|--------|
| 1 | No notification provider API keys | External email/SMS/push cannot be tested |
| 2 | No founder decision on event rules | Cannot determine which events generate which channels |
| 3 | No notification templates | Cannot send formatted notifications |

**Mitigation:** In-app notifications can be fully implemented without any external dependencies. The provider integration can be added incrementally once credentials are available.

---

## 19. GO / NO-GO

**GO — Architecture review is recommended.**

The notification infrastructure is well-defined in the architecture. The database foundation exists. The event pipeline exists. The gap is entirely in application logic — no provider decisions are needed for in-app notifications, and the provider integration can be designed to be added incrementally.

---

**MILESTONE 8 DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**
