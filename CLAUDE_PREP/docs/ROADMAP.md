# Embee Nexus — Engineering Roadmap V2

**Document Status:** Roadmap V2 — Reconciled
**Date:** August 28, 2026
**Based On:** ARCHITECTURE.md §15 (Original Milestones) + Actual Execution through Phase 6M
**Current HEAD:** `88ec1e1`

---

## 1. Original Milestone Baseline

The technical architecture defines 10 milestones. This is the canonical planning structure.

| # | Milestone | Scope |
|---|-----------|-------|
| **M1** | Project Foundation | Next.js + TypeScript + Tailwind, Supabase configuration, database schema, auth setup, profile creation trigger |
| **M2** | Customer Booking | Address management, quote calculation (atomic locking), order creation, payment initialization |
| **M3** | Payment Integration | Paystack integration, webhook handling (idempotent), payment verification (server-side), background job creation |
| **M4** | Dispatch System | Dispatch PostgreSQL function, rider eligibility, offer timeout background job, race condition prevention |
| **M5** | Rider Experience | Rider registration, verification flow, job management (accept/reject), delivery status updates, proof of delivery, earnings ledger |
| **M6** | Realtime Tracking | Location ingestion (trigger-based current location update), current location table with GIST index, authorized subscriptions, broadcasting, privacy controls |
| **M7** | Admin Dashboard | Order management, rider management, pricing configuration, tax configuration, analytics |
| **M8** | Notifications | Email (SendGrid), SMS (Termii), Push (Firebase), In-app |
| **M9** | Production Hardening | Security audit, performance optimization, load testing, RLS testing |
| **M10** | Launch | Production deployment, domain setup, monitoring, documentation |

**Dependency chain:** `M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10`

---

## 2. Historical Execution Record

### Milestones 1–5 (Backend Foundation)

| Commit | Milestone | Description |
|--------|-----------|-------------|
| `3d20e47` | M1 | Project foundation — Next.js, Supabase, schema, auth |
| `4e5e633` | M2 | Customer booking flow — address, quote, order, payment |
| `ee124d8` | M3 (Phase 2) | Rider availability and location subsystem |
| `3c07103` | M3 (Phase 3) | Dispatch and rider offer workflow |
| `963fbeb` | M4 (Phase 4A) | Active delivery and proof workflow |
| `7514a54` | M4 (Phase 4B) | Rider earnings read APIs and accounting fixes |
| `858f2c6` | M4 (Phase 4C) | Cancellation failure and refund workflow |
| `2c62e83` | M4 (Phase 4D) | Background job reliability hardening |
| `f92f354` | M5 (Phase 5A) | Customer real-time tracking |
| `c70032d` | M5 (Phase 5B) | Rider dashboard |
| `8847035` | M5 (Phase 5C) | Customer cancellation, ratings, delivery proof |
| `729bc86` | M5 (Phase 5D) | Admin rider verification |

### Milestone 6–7 (UI, Brand, Mapping, Production Readiness)

Phase 6 was originally planned as a 6-sub-phase branding/UI effort (6A–6F). It expanded into a 13-sub-phase production-readiness effort.

| Commit | Phase | Description |
|--------|-------|-------------|
| `dc434d1` | 6A | Brand foundation — design tokens, colors, typography |
| `56b0c07` | 6B | Homepage and marketing experience |
| `da572c4` | 6C | Customer experience rebrand |
| `6c6e42b` | 6D | Rider experience rebrand |
| `b1a60db` | 6E | Mapping provider migration to Stadia Maps |
| `8970fac` | 6F | Admin experience rebrand |
| `e54f304` | 6G | Brand compliance and route geometry |
| `fc8018a` | 6H | Unified route pricing lifecycle |
| *(discovery only)* | 6I | Full system discovery audit |
| `54b4e84` | 6J | Production hardening and admin operations |
| `4136fa0` | Security | RLS remediation (prohibited_items, spatial_ref_sys) |
| `ff74660` | 6L | Observability and operational safety |
| `88ec1e1` | 6M | Delivery proof storage and admin customers |

**Phase 6 scope expansion:** What began as brand/UI work (6A–6F) naturally extended into route pricing unification (6H), production hardening (6J), security remediation, observability (6L), and delivery proof infrastructure (6M). This was driven by discovery-identified production-readiness gaps rather than arbitrary scope changes.

---

## 3. Current State (as of Phase 6M)

### Customer Functionality — COMPLETE

| Feature | Status |
|---------|--------|
| Registration/login | ✅ |
| Address management | ✅ |
| Quote generation | ✅ |
| Order creation | ✅ |
| Payment initialization | ✅ |
| Order list | ✅ |
| Order detail + tracking | ✅ |
| Real-time rider tracking | ✅ |
| Order cancellation | ✅ |
| Post-delivery rating | ✅ |
| Delivery proof viewing (text + photo) | ✅ |
| Refund status | ✅ |

### Rider Functionality — COMPLETE

| Feature | Status |
|---------|--------|
| Registration | ✅ |
| Onboarding/documents | ✅ |
| Availability toggle | ✅ |
| GPS location updates | ✅ |
| Offer list | ✅ |
| Offer accept/reject | ✅ |
| Active delivery workflow | ✅ |
| Delivery proof submission (photo + text) | ✅ |
| Earnings history | ✅ |
| Earnings summary | ✅ |
| Vehicle management | ✅ |

### Admin Functionality — COMPLETE

| Feature | Status |
|---------|--------|
| Dashboard stats | ✅ |
| Rider list | ✅ |
| Rider detail | ✅ |
| Rider verification | ✅ |
| Document verification | ✅ |
| Order list | ✅ |
| Order detail | ✅ |
| Order cancellation | ✅ |
| Customer list | ✅ |

### Backend/API — COMPLETE

| Component | Status |
|-----------|--------|
| 46+ API routes | ✅ |
| 13 service modules | ✅ |
| PostgreSQL functions (dispatch, delivery, cancellation, earnings) | ✅ |
| Background job system (FOR UPDATE SKIP LOCKED) | ✅ |
| Webhook processing (Paystack) | ✅ |
| Structured logging with correlation IDs | ✅ |
| Rate limiting (in-memory sliding window) | ✅ |
| Health endpoint | ✅ |
| API error handler | ✅ |
| Request context wrapper | ✅ |

### Database — COMPLETE

| Component | Status |
|-----------|--------|
| 38+ tables | ✅ |
| RLS on all tables | ✅ |
| PostgreSQL functions | ✅ |
| Triggers | ✅ |
| Indexes | ✅ |
| Delivery proof storage bucket | ✅ |
| Security remediation (prohibited_items) | ✅ |

### Payments — COMPLETE

| Component | Status |
|-----------|--------|
| Paystack initialization | ✅ |
| Webhook signature verification | ✅ |
| Payment verification | ✅ |
| Refund processing | ✅ |
| charge.failed handling | ✅ |
| Idempotent webhook processing | ✅ |
| Server-authoritative pricing | ✅ |

### Dispatch — COMPLETE

| Component | Status |
|-----------|--------|
| `dispatch_rider_v2()` | ✅ |
| `find_nearest_riders()` | ✅ |
| `accept_rider_offer()` | ✅ |
| `reject_rider_offer()` | ✅ |
| `process_expired_offers()` | ✅ |
| Offer timeout background job | ✅ |
| Race condition prevention | ✅ |

### Tracking — COMPLETE

| Component | Status |
|-----------|--------|
| Real-time broadcast | ✅ |
| Customer tracking UI | ✅ |
| Route geometry persistence | ✅ |
| Map rendering (Stadia Maps) | ✅ |
| GPS throttling | ✅ |
| Stale location handling | ✅ |

### Mapping — COMPLETE

| Component | Status |
|-----------|--------|
| MapsProvider abstraction | ✅ |
| Stadia Maps integration | ✅ |
| Route calculation (one per quote) | ✅ |
| Route geometry on orders | ✅ |
| Address autocomplete (backend) | ✅ |
| Server-side API key handling | ✅ |

### Pricing — COMPLETE

| Component | Status |
|-----------|--------|
| Route-based pricing | ✅ |
| Atomic quote consumption | ✅ |
| Cross-zone distance pricing | ✅ |
| Minimum fare | ✅ |
| Weight multiplier | ✅ |
| VAT | ✅ |
| Platform commission | ✅ |
| Quote immutability | ✅ |
| Payment amount integrity | ✅ |

### Security — COMPLETE

| Component | Status |
|-----------|--------|
| RLS on all tables | ✅ |
| Server-side authorization | ✅ |
| Rate limiting | ✅ |
| Webhook signature verification | ✅ |
| Cron timing-safe comparison | ✅ |
| No client-trusted pricing | ✅ |
| No client-trusted distance | ✅ |
| No IDOR paths | ✅ |
| Storage bucket security | ✅ |
| Correlation IDs | ✅ |
| Structured logging (no secrets) | ✅ |
| Health endpoint (no secrets) | ✅ |

### Observability — COMPLETE

| Component | Status |
|-----------|--------|
| Structured logger | ✅ |
| Correlation IDs on all API routes | ✅ |
| Request duration logging | ✅ |
| Error logging with context | ✅ |
| Health endpoint | ✅ |
| Error boundaries (customer, rider, admin) | ✅ |
| API error handler | ✅ |
| 0 production console calls | ✅ |

### Delivery Proof — COMPLETE

| Component | Status |
|-----------|--------|
| Supabase Storage bucket (private) | ✅ |
| Photo upload API | ✅ |
| Signed URL generation | ✅ |
| Photo display in ProofDisplay | ✅ |
| Text-only fallback | ✅ |
| Storage RLS policies | ✅ |

### Notifications — NOT STARTED

| Component | Status |
|-----------|--------|
| `notifications` table | ✅ Exists |
| Notification types defined | ✅ Constants exist |
| Background job types defined | ✅ Job types exist |
| Email provider (SendGrid) | ❌ No SDK, no API key, no send logic |
| SMS provider (Termii) | ❌ No integration |
| Push provider (Firebase) | ❌ No integration |
| In-app notification delivery | ❌ Nothing writes to notifications table |
| Notification service | ❌ No service module |
| Notification API | ❌ No endpoints |
| Notification UI | ❌ No display component |
| Templates | ❌ No templates |
| User preferences | ❌ No opt-in/opt-out |

### Payouts — NOT STARTED

| Component | Status |
|-----------|--------|
| `payouts` table | ✅ Exists |
| `payout_recipients` table | ✅ Exists |
| `earnings_ledger` table | ✅ Exists |
| Earnings calculation | ✅ Via `complete_delivery()` |
| Earnings display (rider) | ✅ Earnings service + UI |
| Payout execution service | ❌ No Paystack transfer integration |
| Payout request API | ❌ No endpoint |
| Payout UI | ❌ No rider-facing payout request |
| Revenue split policy | ❌ 15% in platform_settings, not enforced |
| Gross-vs-net decision | ❌ Not defined |

### Reconciliation — NOT STARTED

| Component | Status |
|-----------|--------|
| Payment reconciliation logic | ❌ No implementation |
| Reconciliation policy | ❌ Not defined |
| Financial reporting | ❌ No implementation |

### Production Infrastructure — NOT STARTED

| Component | Status |
|-----------|--------|
| Production Supabase project | ⚠️ External |
| Paystack production keys | ⚠️ External |
| Stadia Maps production keys | ⚠️ External |
| Domain/DNS | ⚠️ External |
| Vercel production env vars | ⚠️ External |
| Monitoring (Sentry or equivalent) | ❌ No vendor selected |
| Alerting | ❌ No implementation |
| Load testing | ❌ No infrastructure |
| Backup verification | ⚠️ Supabase-managed, not verified |
| Operational runbooks | ❌ No documentation |
| Disaster recovery plan | ❌ No plan |
| Rollback strategy | ❌ No documentation |

---

## 4. M8 — Notifications

### Architecture Specification

From ARCHITECTURE.md §15:

> **Milestone 8: Notifications**
> - Email (SendGrid)
> - SMS (Termii)
> - Push (Firebase)
> - In-app

### Engineering Work (Can Proceed After Founder Decisions)

| # | Work Item | Dependencies |
|---|-----------|-------------|
| 1 | Create `notification.service.ts` | Provider selection |
| 2 | Implement in-app notification writes | None (table exists) |
| 3 | Create notification API endpoints | Service module |
| 4 | Create notification UI component | API endpoints |
| 5 | Integrate email provider (SendGrid) | API key, templates |
| 6 | Integrate SMS provider (Termii) | API key, templates |
| 7 | Integrate push provider (Firebase) | Firebase project, config |
| 8 | Create notification templates | Business rules |
| 9 | Implement user preference management | Business rules |
| 10 | Add retry logic for failed sends | Provider integration |

### Founder/Business Decisions Required

| # | Decision | Impact | Can Proceed Without? |
|---|----------|--------|---------------------|
| 1 | Confirm SendGrid as email provider | Blocks email integration | ⚠️ Default: SendGrid |
| 2 | Confirm Termii as SMS provider | Blocks SMS integration | ⚠️ Default: Termii |
| 3 | Confirm Firebase as push provider | Blocks push integration | ⚠️ Default: Firebase |
| 4 | Which events trigger email notifications | Template design | ❌ No |
| 5 | Which events trigger SMS notifications | Template design | ❌ No |
| 6 | Which events trigger push notifications | Template design | ❌ No |
| 7 | Notification frequency limits | Rate limiting | ⚠️ Default: reasonable limits |
| 8 | User opt-in/opt-out policy | Preference UI | ⚠️ Default: opt-in |
| 9 | Transactional vs marketing distinction | Business rules | ❌ No |

### External Configuration Required

| # | Item | Owner |
|---|------|-------|
| 1 | SendGrid API key + verified sender | Founder |
| 2 | Termii API key | Founder |
| 3 | Firebase project + FCM config | Founder |
| 4 | Email templates (design) | Founder/Designer |

---

## 5. M9 — Production Hardening

### Already Completed (via Phase 6J/6L/6M)

| Component | Phase | Status |
|-----------|-------|--------|
| Security audit | 6J | ✅ COMPLETE |
| Rate limiting | 6J | ✅ COMPLETE |
| Error handling (API + boundaries) | 6J | ✅ COMPLETE |
| Health checks | 6J | ✅ COMPLETE |
| Admin order management | 6J | ✅ COMPLETE |
| Database indexes | 6J + 6M | ✅ COMPLETE |
| Structured logging | 6L | ✅ COMPLETE |
| Correlation IDs | 6L | ✅ COMPLETE |
| Console.log cleanup | 6L | ✅ COMPLETE |
| Cron security | 6L | ✅ COMPLETE |
| Webhook idempotency tests | 6M | ✅ COMPLETE |
| Quote concurrency tests | 6M | ✅ COMPLETE |
| Delivery proof storage | 6M | ✅ COMPLETE |
| RLS verification (systematic) | 6J | ✅ COMPLETE |
| Security remediation | Security | ✅ COMPLETE |

### Remaining Work

| # | Item | Status | Classification |
|---|------|--------|---------------|
| 1 | Load testing | ❌ NOT STARTED | Engineering |
| 2 | Performance optimization | ❌ NOT STARTED | Engineering |
| 3 | Monitoring/alerting | ❌ NOT STARTED | External vendor required |
| 4 | Backup verification | ⚠️ UNKNOWN | External (Supabase-managed) |
| 5 | Operational runbooks | ❌ NOT STARTED | Engineering/Operations |
| 6 | Disaster recovery plan | ❌ NOT STARTED | Operations |
| 7 | Sentry or equivalent | ❌ NOT STARTED | External vendor decision |

### M9 Completion Assessment

**M9 is approximately 70% complete.** The core engineering hardening (security, rate limiting, error handling, logging, health checks, indexes) is done. Remaining items are load testing, performance optimization, monitoring, and operational documentation — most of which can be done post-launch or require external vendor decisions.

---

## 6. M10 — Launch

### Launch Prerequisites

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
| 9 | Operational runbooks | Engineering/Operations | ❌ Not created |
| 10 | Rollback strategy | Operations | ❌ Not documented |
| 11 | Production verification checklist | Engineering | ❌ Not created |
| 12 | Load testing results | Engineering | ❌ Not performed |
| 13 | Security penetration testing | External | ❌ Not performed |

### Launch Dependencies

- M8 (Notifications) should be at least partially complete for launch
- M9 (Production Hardening) load testing should be complete
- All external configurations must be in place
- Monitoring must be operational

---

## 7. Deferred Business Decisions

These decisions must be made by the founder/business before the corresponding engineering work can proceed.

| # | Decision | Blocks | Current Default |
|---|----------|--------|-----------------|
| 1 | Notification provider confirmation | M8 | SendGrid/Termii/Firebase (from architecture) |
| 2 | Notification event rules | M8 | Not defined |
| 3 | Rider payout revenue split | Payout execution | 15% platform commission in platform_settings |
| 4 | Payout frequency | Payout execution | Not defined |
| 5 | Minimum payout threshold | Payout execution | Not defined |
| 6 | Gross-vs-net payout basis | Payout execution | Not defined |
| 7 | Payment reconciliation policy | Reconciliation | Not defined |
| 8 | Monitoring vendor selection | M9 completion | Not selected |
| 9 | Production launch timing | M10 | Not determined |
| 10 | Initial launch city/zones | M10 | Not determined |
| 11 | E/N logo asset | Brand completion | Not provided |

---

## 8. Engineering-Ready Queue

Work that can proceed without waiting for business decisions. This is a documentation of available work, not an authorization to implement.

| # | Work Item | Milestone | Dependencies |
|---|-----------|-----------|-------------|
| 1 | Notification service skeleton (in-app only) | M8 | None |
| 2 | Notification UI component | M8 | Service module |
| 3 | Rider payout display UI | M8+ | None |
| 4 | Load testing infrastructure | M9 | None |
| 5 | Systematic RLS test suite | M9 | None |
| 6 | User documentation | M10 | None |
| 7 | Operational runbooks | M10 | None |

---

## 9. Recommended Execution Sequence

```
ROADMAP V2 (this document)
    ↓
Founder Decision Gate (notifications, payouts, monitoring)
    ↓
M8 Architecture Review
    ↓
M8 Implementation (notification service + UI)
    ↓
M8 Final Verification + Commit
    ↓
M9 Remaining Hardening (load testing, performance)
    ↓
M9 Verification
    ↓
M10 Launch Preparation (production config, documentation)
    ↓
M10 Launch
```

**Note:** M8 and M9 remaining work can partially overlap. Load testing and notification implementation are independent.

---

## 10. Roadmap Governance

- **`ARCHITECTURE.md`** remains the technical architecture authority. It defines the system design, database schema, security model, and milestone objectives.
- **`docs/ROADMAP.md`** (this document) becomes the execution roadmap authority. It tracks what has been completed, what remains, and the sequence forward.
- **Individual milestone/phase reports** in `docs/milestones/` provide historical implementation evidence. They are reference documents, not planning authorities.
- **Future phases must be derived from this roadmap and ARCHITECTURE.md**, not invented from filenames, assumptions, or arbitrary lettered extensions.
- **Any substantial roadmap change requires explicit review** and update to this document.

---

## Appendix: Complete Commit History

| Commit | Phase | Description |
|--------|-------|-------------|
| `3d20e47` | M1 | Project foundation |
| `4e5e633` | M2 | Customer booking flow |
| `ee124d8` | M3 (Phase 2) | Rider availability and location |
| `3c07103` | M3 (Phase 3) | Dispatch and rider offer workflow |
| `963fbeb` | M4 (Phase 4A) | Active delivery and proof workflow |
| `7514a54` | M4 (Phase 4B) | Rider earnings and accounting |
| `858f2c6` | M4 (Phase 4C) | Cancellation and refund workflow |
| `2c62e83` | M4 (Phase 4D) | Background job reliability |
| `f92f354` | M5 (Phase 5A) | Customer real-time tracking |
| `c70032d` | M5 (Phase 5B) | Rider dashboard |
| `8847035` | M5 (Phase 5C) | Customer enhancements |
| `729bc86` | M5 (Phase 5D) | Admin rider verification |
| `dc434d1` | 6A | Brand foundation |
| `56b0c07` | 6B | Homepage and marketing |
| `da572c4` | 6C | Customer experience rebrand |
| `6c6e42b` | 6D | Rider experience rebrand |
| `b1a60db` | 6E | Stadia Maps migration |
| `8970fac` | 6F | Admin experience rebrand |
| `e54f304` | 6G | Brand compliance and route geometry |
| `fc8018a` | 6H | Unified route pricing lifecycle |
| `54b4e84` | 6J | Production hardening and admin operations |
| `4136fa0` | Security | RLS remediation |
| `ff74660` | 6L | Observability and operational safety |
| `88ec1e1` | 6M | Delivery proof storage and admin customers |
