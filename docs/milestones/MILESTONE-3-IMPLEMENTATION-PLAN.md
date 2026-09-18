# MILESTONE 3 — RIDER MVP: IMPLEMENTATION PLAN

**Document Status:** Implementation-Ready Plan
**Date:** August 23, 2026
**Baseline:** Milestone 2 commit `4e5e633` (master)

---

## A. CURRENT ARCHITECTURE (VERIFIED)

### Database
| Metric | Count |
|--------|-------|
| Application tables | 35 |
| Custom PostgreSQL functions | 16 |
| RLS policies | 103 |
| Indexes | 66 |
| Order states | 17 |
| Storage buckets | 0 |
| Realtime publication tables | 0 |

### Application Code
| Component | Count |
|-----------|-------|
| API routes | 11 |
| Services | 4 (address, order, payment, quote) |
| Pages | 7 |
| Components | 5 (addresses, booking) |
| Maps providers | 2 (Mapbox, Google Maps) |

### Rider-Related Database (Schema Only — No App Code)
| Table | Purpose | App Code |
|-------|---------|----------|
| `rider_profiles` | Identity, verification, availability | None |
| `vehicles` | Vehicle information | None |
| `rider_assignments` | Dispatch offers/acceptances | None |
| `rider_current_locations` | Current GPS position | None |
| `rider_locations` | Historical GPS positions | None |
| `delivery_proofs` | Proof of delivery | None |
| `earnings_ledger` | Earnings transactions | None |
| `payout_recipients` | Paystack transfer recipients | None |
| `payouts` | Payout records | None |
| `ratings` | Customer ratings | None |

### Existing PostgreSQL Functions
| Function | Purpose | Called by App Code |
|----------|---------|-------------------|
| `dispatch_rider_v2()` | Atomic dispatch with offer/accept | **NO** |
| `accept_rider_offer()` | Race-condition-safe acceptance | **NO** |
| `reject_rider_offer()` | Rider rejection with retry | **NO** |
| `find_nearest_riders()` | PostGIS spatial query | **NO** |
| `process_expired_offers()` | Expired offer cleanup | **NO** |
| `consume_quote()` | Atomic quote consumption | Yes (order.service) |
| `verify_payment_and_confirm_order()` | Payment webhook | Yes (webhook route) |
| `generate_order_number()` | Atomic order numbers | Yes (order.service) |
| `is_in_service_zone()` | Zone check | Yes (quote.service) |
| `get_user_role()` | Role resolution | Yes (RLS policies) |

---

## B. VERIFIED GAPS

### Critical Path Gaps
1. **Background job processor** — Webhook creates `DISPATCH_ORDER` jobs but nothing processes them
2. **Rider API routes** — Zero rider-specific routes exist
3. **Rider services** — Zero rider-specific services exist
4. **Rider UI** — Zero rider pages or components exist
5. **Location update API** — Does not exist
6. **Realtime configuration** — Zero tables in publication
7. **Storage buckets** — Zero buckets configured
8. **Proof of delivery** — Table exists, no application logic
9. **Earnings calculation** — Table exists, no business logic
10. **Customer tracking** — No API, no UI, no realtime

### Financial Model Conflict
| Source | Model | Status |
|--------|-------|--------|
| `platform_settings.platform_commission_rate` | 15% of customer payment | Database-set, documented as "internal" |
| Historical discussion | 70% rider / 30% platform | Never implemented |

**These represent different business models.** The 70/30 split was a proposal. The 15% commission is the current database configuration. Neither has been confirmed as the final model.

**Recommendation for approval:** Use the database-configured 15% commission as the default, but make it fully configurable. The exact rider payout formula should be:
```
rider_earning = customer_payment × (1 - platform_commission_rate)
```
Where `platform_commission_rate` defaults to 0.15 but is stored in `platform_settings` and can be changed by admin.

---

## C. TARGET ARCHITECTURE

### Data Flow: Complete Delivery Lifecycle

```
CUSTOMER
    ↓
POST /api/orders/quote (quote.service)
    ↓
POST /api/orders (order.service → consume_quote → create order)
    ↓
POST /api/payments/initialize (payment.service → Paystack)
    ↓
POST /api/webhooks/paystack (verify_payment → DISPATCH_ORDER job)
    ↓
BACKGROUND JOB PROCESSOR
    ↓
dispatch_rider_v2() → find nearest rider → create offer
    ↓
REALTIME BROADCAST → rider channel
    ↓
RIDER receives offer
    ↓
POST /api/riders/jobs/:id/accept → accept_rider_offer()
    ↓
ORDER: rider_assigned
    ↓
RIDER navigates to pickup
    ↓
POST /api/riders/jobs/:id/status (en_route_to_pickup)
    ↓
POST /api/riders/location (GPS updates → realtime broadcast)
    ↓
CUSTOMER SEES RIDER ON MAP (realtime subscription)
    ↓
POST /api/riders/jobs/:id/status (arrived_at_pickup)
    ↓
POST /api/riders/jobs/:id/status (picked_up)
    ↓
POST /api/riders/jobs/:id/status (in_transit)
    ↓
POST /api/riders/jobs/:id/status (arrived_at_destination)
    ↓
POST /api/riders/deliveries/:id/proof (photo + recipient name)
    ↓
ORDER: delivered → earnings_ledger entry
    ↓
DISPUTE WINDOW (configurable, default 24h)
    ↓
ORDER: completed → receipt generated
```

---

## D. RIDER STATE MACHINE

### Rider Lifecycle
```
ANONYMOUS
    ↓ (signup with role=rider)
PENDING_VERIFICATION (verification_status=pending)
    ↓ (submit documents)
UNDER_REVIEW (verification_status=under_review)
    ├──→ APPROVED (verification_status=approved)
    │        ↓
    │    ACTIVE (is_available=true)
    │        ↓ (receives offers)
    │    BUSY (is_available=false, active delivery)
    │        ↓ (delivery complete)
    │    ACTIVE
    │        ↓ (goes offline)
    │    INACTIVE (is_available=false)
    │
    └──→ REJECTED (verification_status=rejected)
             ↓ (can resubmit)
         PENDING_VERIFICATION
        
    SUSPENDED (admin action)
        ↓
    TERMINATED (admin action)
```

### Rider Availability States
| State | `is_available` | `verification_status` | Can Receive Offers |
|-------|---------------|----------------------|-------------------|
| Pending | false | pending | No |
| Under Review | false | under_review | No |
| Rejected | false | rejected | No |
| Approved, Offline | false | approved | No |
| Approved, Online | true | approved | Yes |
| Busy (active delivery) | false (set by dispatch) | approved | No |
| Suspended | false | approved | No |

---

## E. DISPATCH STATE MACHINE

### Current PostgreSQL Functions (Building Blocks)

**`dispatch_rider_v2(p_order_id)`:**
1. Locks order (`FOR UPDATE`)
2. Validates: status IN ('paid', 'searching_rider')
3. Sets status → `searching_rider`
4. Calls `find_nearest_riders(pickup_lat, pickup_lon, 10km, 10)`
5. For each rider: tries to INSERT `rider_assignments` (status='offered', expires_at=now+30s)
6. On `unique_violation` (rider already has active assignment): tries next rider
7. Sets rider as unavailable in `rider_current_locations`
8. Returns after first successful offer
9. If no riders found: sets order status → `failed`

**`accept_rider_offer(p_assignment_id, p_rider_id)`:**
1. Locks assignment (`FOR UPDATE`)
2. Validates: status='offered', expires_at > now()
3. Locks order (`FOR UPDATE`)
4. Validates: status='searching_rider'
5. Sets assignment → `accepted`
6. Sets order → `rider_assigned`, `assigned_rider_id = p_rider_id`
7. Cancels all other offers for this order
8. Re-makes cancelled riders available

**`reject_rider_offer(p_assignment_id, p_rider_id)`:**
1. Locks assignment (`FOR UPDATE`)
2. Validates: status='offered'
3. Sets assignment → `rejected`
4. Re-makes rider available
5. Creates `DISPATCH_RETRY` background job

**`process_expired_offers()`:**
1. Finds assignments: status='offered' AND expires_at < now()
2. Uses `FOR UPDATE SKIP LOCKED`
3. Marks expired, re-makes riders available
4. Creates `DISPATCH_RETRY` jobs

### What the Application Layer Must Add

1. **Job processor** that calls `dispatch_rider_v2()` when processing `DISPATCH_ORDER` jobs
2. **Job processor** that calls `dispatch_rider_v2()` again when processing `DISPATCH_RETRY` jobs
3. **Scheduled job** that calls `process_expired_offers()` periodically
4. **API route** for rider to accept offers → calls `accept_rider_offer()`
5. **API route** for rider to reject offers → calls `reject_rider_offer()`
6. **Realtime broadcast** when new offer is created (rider needs to know immediately)

---

## F. ORDER/RIDER INTERACTION STATE MACHINE

### Order States with Rider Transitions

| Order State | Rider Action | Next State | Function |
|-------------|-------------|------------|----------|
| `paid` | — | `searching_rider` | `dispatch_rider_v2()` |
| `searching_rider` | Accept offer | `rider_assigned` | `accept_rider_offer()` |
| `searching_rider` | Reject offer | `searching_rider` (retry) | `reject_rider_offer()` |
| `searching_rider` | Offer expires | `searching_rider` (retry) | `process_expired_offers()` |
| `rider_assigned` | Depart to pickup | `rider_en_route_to_pickup` | **NEW: update_order_status()** |
| `rider_en_route_to_pickup` | Arrive at pickup | `arrived_at_pickup` | **NEW: update_order_status()** |
| `arrived_at_pickup` | Confirm pickup | `picked_up` | **NEW: update_order_status()** |
| `picked_up` | In transit | `in_transit` | **NEW: update_order_status()** |
| `in_transit` | Arrive at destination | `arrived_at_destination` | **NEW: update_order_status()** |
| `arrived_at_destination` | Submit proof | `delivered` | **NEW: complete_delivery()** |
| `delivered` | Dispute window expires | `completed` | **NEW: auto_complete()** |

---

## G. REALTIME TRACKING ARCHITECTURE

### Update Pipeline
```
Rider GPS → POST /api/riders/location
    ↓
Validate: rider authenticated, coordinates valid
    ↓
Throttle: minimum 5s between writes (configurable)
    ↓
INSERT rider_locations → trigger updates rider_current_locations
    ↓
IF rider has active delivery:
    Broadcast to channel: order:{order_id}
    Payload: { latitude, longitude, heading, timestamp }
    ↓
Customer receives broadcast → updates map marker
```

### Update Frequency
| State | Rider → Backend | Backend → Customer |
|-------|----------------|-------------------|
| Online, no delivery | Every 30s | N/A |
| Active delivery, moving | Every 5-10s | Every 5-10s |
| Active delivery, stationary | Every 30s | Every 30s |
| App backgrounded | Every 30s | On resume |

### Channel Authorization
- Channel name: `order:{order_id}`
- Subscription: customer must own the order (validated server-side)
- RLS on `rider_current_locations` provides data-level protection

---

## H. STORAGE ARCHITECTURE

### Buckets to Create

| Bucket | Purpose | Access |
|--------|---------|--------|
| `rider-documents` | Verification document uploads | Rider: own, Admin: all |
| `delivery-proofs` | Delivery proof photos | Rider: own deliveries, Customer: own orders, Admin: all |

### Path Structure
```
rider-documents/
    {rider_id}/
        government_id/
        vehicle_registration/
        insurance/
        drivers_license/

delivery-proofs/
    {order_id}/
        {timestamp}.{ext}
```

### Policies
- Rider can read/write own documents
- Customer can read proofs for own orders
- Admin can read all
- File size limit: 5MB (rider docs), 10MB (delivery proofs)
- Allowed types: image/jpeg, image/png, application/pdf

---

## I. BACKGROUND JOB ARCHITECTURE

### Existing Infrastructure
- `background_jobs` table with: job_type, payload, status, priority, attempts, max_attempts, scheduled_at, started_at, completed_at, failed_at, error_message
- Status CHECK: pending, processing, completed, failed, retrying
- **No processor exists**

### Job Types
| Job Type | Trigger | Handler | Retry |
|----------|---------|---------|-------|
| `DISPATCH_ORDER` | Payment webhook | `dispatch_rider_v2()` | Yes, max 3 |
| `DISPATCH_RETRY` | Rider rejection/expiry | `dispatch_rider_v2()` | Yes, max 3 |
| `PROCESS_EXPIRED_OFFERS` | Cron (every 30s) | `process_expired_offers()` | No |
| `COMPLETE_DELIVERY` | After dispute window | Update order status | No |

### MVP Processor Architecture
```
Vercel Cron (every 30s)
    → GET /api/cron/process-jobs
    → Query: SELECT * FROM background_jobs WHERE status='pending' AND scheduled_at <= now() ORDER BY priority DESC LIMIT 10 FOR UPDATE SKIP LOCKED
    → For each job:
        UPDATE status='processing', started_at=now()
        → Execute handler
        → On success: UPDATE status='completed', completed_at=now()
        → On failure: UPDATE status='failed' or 'retrying', error_message
```

---

## J. SECURITY MODEL

### Rider Authorization Matrix

| Operation | Rider | Customer | Admin |
|-----------|-------|----------|-------|
| View own profile | ✅ | ❌ | ✅ |
| Update own profile | ✅ | ❌ | ✅ |
| Upload documents | ✅ | ❌ | ❌ |
| Toggle availability | ✅ | ❌ | ❌ |
| Update location | ✅ | ❌ | ❌ |
| View available jobs | ✅ | ❌ | ❌ |
| Accept offer | ✅ (own) | ❌ | ❌ |
| Reject offer | ✅ (own) | ❌ | ❌ |
| Update delivery status | ✅ (own) | ❌ | ❌ |
| Submit proof | ✅ (own) | ❌ | ❌ |
| View own earnings | ✅ | ❌ | ✅ |
| View assigned rider | ❌ | ✅ (own order) | ✅ |
| Approve rider | ❌ | ❌ | ✅ |
| Suspend rider | ❌ | ❌ | ✅ |

### IDOR Prevention
- All rider endpoints validate `rider_id = auth.uid()`
- All customer tracking validates `customer_id = auth.uid()`
- All proof submissions validate rider is assigned to order
- All status updates validate rider is assigned to order
- No client-supplied rider_id accepted for authorization checks

---

## K. API INVENTORY

### Existing APIs (11 routes — no changes needed)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Login |
| `/api/auth/signup` | POST | Signup |
| `/api/addresses` | GET/POST | Address CRUD |
| `/api/addresses/[id]` | GET/PATCH/DELETE | Address CRUD |
| `/api/addresses/[id]/default` | PATCH | Default address |
| `/api/categories` | GET | Categories |
| `/api/orders/quote` | POST | Generate quote |
| `/api/orders` | GET/POST | List/create orders |
| `/api/orders/[id]` | GET | Order details |
| `/api/payments/initialize` | POST | Initialize payment |
| `/api/webhooks/paystack` | POST | Payment webhook |

### New APIs (26 routes)

**Rider Onboarding (9 routes):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/register` | POST | Authenticated | Complete rider registration |
| `/api/riders/profile` | GET | Rider | Get own profile |
| `/api/riders/profile` | PATCH | Rider | Update own profile |
| `/api/riders/vehicles` | POST | Rider | Add vehicle |
| `/api/riders/vehicles` | GET | Rider | List own vehicles |
| `/api/riders/vehicles/[id]` | PATCH | Rider | Update vehicle |
| `/api/riders/documents` | POST | Rider | Upload document |
| `/api/riders/documents` | GET | Rider | List own documents |
| `/api/riders/verification-status` | GET | Rider | Get verification status |

**Rider Operations (7 routes):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/availability` | PATCH | Rider | Toggle online/offline |
| `/api/riders/jobs` | GET | Rider | List available/assigned jobs |
| `/api/riders/jobs/[id]` | GET | Rider | Get job details |
| `/api/riders/jobs/[id]/accept` | POST | Rider | Accept offer |
| `/api/riders/jobs/[id]/reject` | POST | Rider | Reject offer |
| `/api/riders/jobs/[id]/status` | POST | Rider | Update delivery status |
| `/api/riders/location` | POST | Rider | Update location |

**Rider Financial (3 routes):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/earnings` | GET | Rider | Earnings history |
| `/api/riders/earnings/summary` | GET | Rider | Earnings summary |
| `/api/riders/payouts` | GET | Rider | Payout history |

**Proof of Delivery (1 route):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/deliveries/[id]/proof` | POST | Rider | Submit proof |

**Customer Tracking (1 route):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/orders/[id]/tracking` | GET | Customer | Get rider location + status |

**Background Jobs (1 route):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/cron/process-jobs` | GET | Cron key | Process pending jobs |

**Admin (5 routes):**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/riders` | GET | Admin | List all riders |
| `/api/admin/riders/[id]` | GET | Admin | Rider details |
| `/api/admin/riders/[id]/verification` | PATCH | Admin | Approve/reject |
| `/api/admin/riders/[id]/status` | PATCH | Admin | Suspend/reactivate |
| `/api/admin/riders/[id]/documents` | GET | Admin | View documents |

---

## L. SERVICE INVENTORY

### Existing Services (4 — no changes needed)
| Service | Purpose |
|---------|---------|
| `address.service.ts` | Address CRUD |
| `quote.service.ts` | Quote generation |
| `order.service.ts` | Order creation |
| `payment.service.ts` | Paystack initialization |

### New Services (8)
| Service | Purpose |
|---------|---------|
| `rider.service.ts` | Rider profile, registration, verification |
| `rider-location.service.ts` | Location updates, throttling |
| `dispatch.service.ts` | Job processing, offer management |
| `delivery.service.ts` | Status transitions, active delivery |
| `proof.service.ts` | Proof upload, validation |
| `earnings.service.ts` | Earnings calculation, ledger |
| `tracking.service.ts` | Customer tracking, realtime |
| `background-job.service.ts` | Job polling, execution |

---

## M. UI/PAGE INVENTORY

### New Pages (15+)
| Route | Purpose |
|-------|---------|
| `/rider/register` | Rider registration |
| `/rider/onboarding` | Onboarding wizard |
| `/rider/dashboard` | Rider dashboard home |
| `/rider/jobs` | Available/active jobs |
| `/rider/jobs/[id]` | Active delivery details |
| `/rider/earnings` | Earnings history |
| `/rider/payouts` | Payout history |
| `/rider/profile` | Profile management |
| `/rider/verification` | Verification status |
| `/rider/vehicles` | Vehicle management |
| `/rider/documents` | Document uploads |
| `/orders/[id]/tracking` | Customer tracking page |

### New Components
| Component | Purpose |
|-----------|---------|
| `rider/job-card.tsx` | Delivery offer card |
| `rider/availability-toggle.tsx` | Online/offline toggle |
| `rider/active-delivery.tsx` | Active delivery status |
| `rider/earnings-summary.tsx` | Earnings overview |
| `tracking/rider-map.tsx` | Customer tracking map |
| `tracking/status-timeline.tsx` | Delivery status timeline |
| `admin/rider-list.tsx` | Admin rider management |
| `admin/document-review.tsx` | Document verification |

---

## N. DATABASE CHANGES

### New Tables (2)
```sql
-- Rider verification documents
CREATE TABLE rider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'government_id', 'vehicle_registration', 'insurance',
    'drivers_license', 'proof_of_address', 'other'
  )),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected'
  )),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification status audit trail
CREATE TABLE rider_verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New PostgreSQL Functions (2)
```sql
-- Complete delivery with earnings calculation
CREATE OR REPLACE FUNCTION complete_delivery(
  p_order_id UUID,
  p_rider_id UUID
) RETURNS TABLE (success BOOLEAN, earnings DECIMAL, message TEXT);

-- Process expired offers (wrapper for cron)
CREATE OR REPLACE FUNCTION process_expired_offers_cron()
RETURNS VOID;
```

### New Indexes (3)
| Index | Table | Purpose |
|-------|-------|---------|
| `idx_rider_documents_rider` | rider_documents | Rider's documents |
| `idx_rider_documents_status` | rider_documents | Admin review queue |
| `idx_rider_verification_history_rider` | rider_verification_history | Audit trail |

### New RLS Policies (7)
| Table | Policy | Rule |
|-------|--------|------|
| `rider_documents` | `rider_documents_select_own` | `rider_id = auth.uid()` |
| `rider_documents` | `rider_documents_insert_own` | `rider_id = auth.uid()` |
| `rider_documents` | `rider_documents_select_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_documents` | `rider_documents_update_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_verification_history` | `rider_verification_history_select_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_verification_history` | `rider_verification_history_insert_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_verification_history` | `rider_verification_history_select_own` | Via rider_profiles |

### New Storage Buckets (2)
| Bucket | Public | Purpose |
|--------|--------|---------|
| `rider-documents` | No | Verification uploads |
| `delivery-proofs` | No | Proof photos |

---

## O. INDEX CHANGES

### Current: 66 indexes
### After Milestone 3: 69 indexes

The 3 new indexes are justified:
- `idx_rider_documents_rider` — queried on every document list
- `idx_rider_documents_status` — admin review queue
- `idx_rider_verification_history_rider` — audit trail lookup

No other indexes are needed. The existing 66 indexes cover all current query patterns.

---

## P. TESTING STRATEGY

### Unit Tests
| Area | Tests |
|------|-------|
| Earnings calculation | Correct split, minimum values, edge cases |
| Location throttling | Rate limiting, invalid coordinates |
| State transitions | Valid/invalid transitions, authorization |
| Proof validation | Required fields, file types, sizes |

### Integration Tests
| Area | Tests |
|------|-------|
| Rider registration → verification → activation | Full onboarding flow |
| Payment → dispatch → acceptance → delivery | Full delivery lifecycle |
| Location update → realtime broadcast → customer display | Tracking pipeline |
| Proof upload → delivery completion → earnings | Completion flow |
| Duplicate dispatch job handling | Idempotency |
| Simultaneous rider acceptance | Race condition |

### Security Tests
| Area | Tests |
|------|-------|
| Rider cannot accept another rider's offer | Authorization |
| Rider cannot submit proof for wrong order | Ownership |
| Customer cannot track another customer's order | RLS |
| Anonymous user cannot access rider data | Auth |
| Rider cannot modify earnings | Server authority |

---

## Q. OBSERVABILITY STRATEGY

### Events to Log
| Event | Table | Details |
|-------|-------|---------|
| Rider registered | `order_events` (or new `rider_events`) | rider_id, timestamp |
| Document submitted | `rider_verification_history` | rider_id, document_type |
| Verification changed | `rider_verification_history` | old_status, new_status, changed_by |
| Rider online/offline | `audit_logs` | rider_id, is_available |
| Dispatch attempt | `order_events` | order_id, riders_found, rider_offered |
| Offer created | `order_events` | order_id, rider_id, expires_at |
| Offer accepted | `order_events` | order_id, rider_id |
| Offer rejected | `order_events` | order_id, rider_id, reason |
| Offer expired | `order_events` | order_id, rider_id |
| Status transition | `order_status_history` | order_id, from_status, to_status |
| Proof uploaded | `order_events` | order_id, rider_id, proof_type |
| Earnings credited | `earnings_ledger` | rider_id, order_id, amount |
| Background job failed | `background_jobs` | job_type, error_message |

---

## R. PRODUCT DECISIONS REQUIRING APPROVAL

| # | Decision | Current State | Impact | Recommendation |
|---|----------|--------------|--------|----------------|
| 1 | Rider payout model | 15% commission in DB | Earnings calculation | Use DB-configurable rate |
| 2 | Cancellation fees | Not defined | Cancellation flow | Default 0 for MVP |
| 3 | Payout frequency | Not defined | Payout API | Defer to later milestone |
| 4 | Vehicle restrictions | Not defined | Dispatch filtering | Allow all vehicle types |
| 5 | Proof requirements | Not defined | Delivery completion | Photo + recipient name |
| 6 | Offer timeout | 30s in DB | Rider UX | Configurable, test 30s |
| 7 | Dispatch radius | 10km hardcoded | Dispatch filtering | Make configurable |

---

## S. IMPLEMENTATION SEQUENCE

### Phase 1: Background Job Processor + Rider Registration (CRITICAL PATH)
**Why first:** Without job processor, dispatch chain is broken. Without registration, no riders.

**Files:**
- `supabase/migrations/20260823010000_rider_documents.sql` (NEW)
- `apps/web/lib/services/background-job.service.ts` (NEW)
- `apps/web/app/api/cron/process-jobs/route.ts` (NEW)
- `apps/web/lib/services/rider.service.ts` (NEW)
- `apps/web/app/api/riders/register/route.ts` (NEW)
- `apps/web/app/api/riders/profile/route.ts` (NEW)
- `apps/web/app/api/riders/vehicles/route.ts` (NEW)
- `apps/web/app/api/riders/documents/route.ts` (NEW)
- `apps/web/app/rider/register/page.tsx` (NEW)
- `apps/web/app/rider/onboarding/page.tsx` (NEW)
- `packages/shared/validators/rider.ts` (NEW)

**Dependencies:** None
**Tests:** Registration, document upload, RLS, job processing

### Phase 2: Rider Availability & Location
**Files:**
- `apps/web/app/api/riders/availability/route.ts` (NEW)
- `apps/web/app/api/riders/location/route.ts` (NEW)
- `apps/web/lib/services/rider-location.service.ts` (NEW)

**Dependencies:** Phase 1
**Tests:** Availability toggle, location throttle, GPS validation

### Phase 3: Dispatch & Job Management
**Files:**
- `apps/web/lib/services/dispatch.service.ts` (NEW)
- `apps/web/app/api/riders/jobs/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/accept/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/reject/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/status/route.ts` (NEW)

**Dependencies:** Phase 1, Phase 2
**Tests:** Dispatch trigger, offer creation, acceptance concurrency, rejection retry, expiry

### Phase 4: Active Delivery & Proof
**Files:**
- `apps/web/lib/services/delivery.service.ts` (NEW)
- `apps/web/lib/services/proof.service.ts` (NEW)
- `apps/web/lib/services/earnings.service.ts` (NEW)
- `apps/web/app/api/riders/deliveries/[id]/proof/route.ts` (NEW)
- `supabase/migrations/20260823020000_delivery_completion.sql` (NEW)

**Dependencies:** Phase 3
**Tests:** Status transitions, proof validation, earnings calculation

### Phase 5: Customer Tracking
**Files:**
- `apps/web/lib/services/tracking.service.ts` (NEW)
- `apps/web/app/api/orders/[id]/tracking/route.ts` (NEW)
- `apps/web/components/tracking/rider-map.tsx` (NEW)
- `apps/web/app/(dashboard)/orders/[id]/tracking/page.tsx` (NEW)

**Dependencies:** Phase 2
**Tests:** Authorization, realtime subscription, stale detection

### Phase 6: Rider Dashboard UI
**Files:**
- `apps/web/app/(rider)/layout.tsx` (NEW)
- `apps/web/app/(rider)/dashboard/page.tsx` (NEW)
- `apps/web/app/(rider)/jobs/page.tsx` (NEW)
- `apps/web/app/(rider)/jobs/[id]/page.tsx` (NEW)
- `apps/web/app/(rider)/earnings/page.tsx` (NEW)
- `apps/web/app/(rider)/profile/page.tsx` (NEW)
- `apps/web/components/rider/` (NEW — multiple components)

**Dependencies:** Phase 1-5
**Tests:** Page rendering, auth protection, responsive design

### Phase 7: Admin Rider Management
**Files:**
- `apps/web/app/api/admin/riders/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/verification/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/status/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/documents/route.ts` (NEW)

**Dependencies:** Phase 1
**Tests:** Admin authorization, verification workflow

---

## T. ROLLBACK STRATEGY

| Risk | Mitigation |
|------|------------|
| Background job processor has bug | Disable cron, fix, redeploy |
| Dispatch function has edge case | Revert migration, fix function |
| Realtime subscription issue | Disable Realtime publication, fix |
| Storage bucket policy error | Fix policy, test with curl |
| RLS policy too restrictive | Test with service role first |

All new features are additive — no existing functionality is modified. Rollback = revert the commit.

---

## U. SCALE TRIGGERS

| Trigger | Current | Transition Point | Migration |
|---------|---------|-----------------|-----------|
| PostgreSQL connections | ~200 | 1,000+ concurrent | PgBouncer |
| Background jobs/day | 0 | 10,000+ | pg_boss or BullMQ |
| Rider locations/sec | 0 | 100+ concurrent | Redis for current location |
| Realtime connections | 0 | 1,000+ | Dedicated WebSocket |
| Storage size | 0 | 10GB+ | Cloud storage migration |
| Dispatch queries | ~100ms | 500ms+ | Zone partitioning |

---

**IMPLEMENTATION PLAN STATUS: COMPLETE**
**REPOSITORY-VERIFIED**
**AWAITING AUTHORIZATION TO BEGIN IMPLEMENTATION**
