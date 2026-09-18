# MILESTONE 3 — RIDER MVP: DISCOVERY & ARCHITECTURE REPORT

**Document Status:** Discovery Phase Complete — Awaiting Authorization
**Date:** August 23, 2026
**Baseline:** Milestone 2 commit `4e5e633` (master)

---

## 1. EXECUTIVE SUMMARY

Milestone 3 adds the rider side of the MBEENEXUS delivery platform. The existing codebase provides a solid foundation: 36 database tables (including rider-specific tables), complete dispatch PostgreSQL functions (`dispatch_rider_v2`, `accept_rider_offer`, `reject_rider_offer`, `find_nearest_riders`, `process_expired_offers`), RLS policies on all rider tables, and a clean API/service architecture that separates business logic from client code.

**Key findings:**

1. The existing schema already covers ~85% of Milestone 3 data requirements. Only 2 new tables are needed (`rider_documents` for verification documents, `rider_verification_history` for audit trail).
2. The dispatch engine (`dispatch_rider_v2`) is already implemented at the PostgreSQL level and is concurrency-safe.
3. RLS policies for rider tables already exist and enforce proper isolation.
4. The order state machine already includes all rider-related states.
5. The earnings ledger (`earnings_ledger`) and payout infrastructure (`payouts`, `payout_recipients`) are already in the database.
6. The main gaps are: rider API routes, rider UI (dashboard/portal), rider onboarding flow, proof-of-delivery API, location update API, and customer tracking API.

**What needs to be built:**

- Rider authentication/registration flow
- Rider onboarding API (profile, vehicle, documents)
- Rider availability toggle API
- Rider job management API (receive offers, accept/reject, status updates)
- Proof-of-delivery API
- Location update API
- Customer tracking API
- Rider dashboard UI
- Admin verification management API
- Earnings/payout display
- Background job processing for dispatch

---

## 2. VERIFIED CURRENT ARCHITECTURE

### 2.1 Technology Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui | ✅ Complete |
| Backend | Next.js API Routes + PostgreSQL functions (RPC) | ✅ Complete |
| Database | PostgreSQL 15 + PostGIS | ✅ Complete |
| Auth | Supabase Auth (auth.users as sole identity) | ✅ Complete |
| RLS | Row Level Security on all 34 application tables | ✅ Complete |
| Maps | Mapbox (MVP) + Google Maps (future) via MapsProvider abstraction | ✅ Complete |
| Payments | Paystack (initialization, webhooks, verification) | ✅ Complete |
| Realtime | Supabase Realtime (not yet implemented for tracking) | ⏳ Pending M3 |
| Deployment | Vercel (web) + Supabase (DB/Auth/Realtime) | ✅ Complete |

### 2.2 Existing Database Tables (36 total)

**Rider-specific tables (already exist):**

| Table | Purpose | Columns | Status |
|-------|---------|---------|--------|
| `rider_profiles` | Rider identity, verification, availability | 11 columns | ✅ Complete |
| `vehicles` | Rider vehicle information | 11 columns | ✅ Complete |
| `rider_assignments` | Order dispatch offers/acceptances | 10 columns | ✅ Complete |
| `rider_current_locations` | Current GPS position | 8 columns + GIST index | ✅ Complete |
| `rider_locations` | Historical GPS positions | 8 columns | ✅ Complete |
| `delivery_proofs` | Proof of delivery records | 13 columns | ✅ Complete |
| `earnings_ledger` | Auditable earnings transactions | 10 columns | ✅ Complete |
| `payout_recipients` | Paystack transfer recipients | 9 columns | ✅ Complete |
| `payouts` | Rider payout records | 12 columns | ✅ Complete |
| `ratings` | Customer ratings for riders | 7 columns | ✅ Complete |

**Order/financial tables (already exist):**

| Table | Purpose | Status |
|-------|---------|--------|
| `orders` | Full order lifecycle with rider fields | ✅ Complete |
| `order_events` | Order event audit trail | ✅ Complete |
| `order_status_history` | Status transition history | ✅ Complete |
| `payments` | Payment records | ✅ Complete |
| `refunds` | Refund records | ✅ Complete |
| `background_jobs` | Async job queue | ✅ Complete |
| `notifications` | User notifications | ✅ Complete |
| `audit_logs` | Audit trail | ✅ Complete |

### 2.3 Existing PostgreSQL Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `dispatch_rider_v2()` | Atomic dispatch with offer/accept lifecycle | ✅ Complete |
| `accept_rider_offer()` | Race-condition-safe rider acceptance | ✅ Complete |
| `reject_rider_offer()` | Rider rejection with retry trigger | ✅ Complete |
| `find_nearest_riders()` | PostGIS spatial query for eligible riders | ✅ Complete |
| `process_expired_offers()` | Background job for expired offer cleanup | ✅ Complete |
| `consume_quote()` | Atomic quote consumption | ✅ Complete |
| `verify_payment_and_confirm_order()` | Payment webhook processing | ✅ Complete |
| `generate_order_number()` | Atomic daily sequence order numbers | ✅ Complete |
| `is_in_service_zone()` | PostGIS zone check | ✅ Complete |
| `get_user_role()` | SECURITY DEFINER role resolution | ✅ Complete |
| `handle_new_user()` | Auto-create profile on signup | ✅ Complete |

### 2.4 Existing RLS Policies (Rider Tables)

| Table | Policies | Coverage |
|-------|----------|----------|
| `rider_profiles` | SELECT own, INSERT own, UPDATE own, SELECT admin, UPDATE admin | ✅ Complete |
| `rider_assignments` | SELECT own, UPDATE own, SELECT admin, SELECT customer | ✅ Complete |
| `rider_locations` | INSERT own, SELECT own | ✅ Complete |
| `rider_current_locations` | INSERT own, UPDATE own, SELECT own, SELECT customer (active delivery), SELECT admin | ✅ Complete |
| `vehicles` | SELECT/INSERT/UPDATE own, SELECT admin | ✅ Complete |
| `delivery_proofs` | INSERT rider, SELECT customer (own order), SELECT admin | ✅ Complete |
| `earnings_ledger` | SELECT own, SELECT admin | ✅ Complete |
| `payout_recipients` | INSERT own, SELECT own, SELECT admin | ✅ Complete |
| `payouts` | SELECT rider, SELECT admin | ✅ Complete |
| `ratings` | INSERT customer, SELECT customer, SELECT rider, SELECT admin | ✅ Complete |

### 2.5 Existing API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/auth/login` | POST | Customer login | Anonymous |
| `/api/auth/signup` | POST | Customer signup | Anonymous |
| `/api/addresses` | GET/POST | List/create addresses | Customer |
| `/api/addresses/[id]` | GET/PATCH/DELETE | Address CRUD | Customer |
| `/api/addresses/[id]/default` | PATCH | Set default address | Customer |
| `/api/orders/quote` | POST | Generate delivery quote | Customer |
| `/api/orders` | GET/POST | List/create orders | Customer |
| `/api/orders/[id]` | GET | Get order details | Customer |
| `/api/payments/initialize` | POST | Initialize Paystack payment | Customer |
| `/api/webhooks/paystack` | POST | Paystack webhook | Signature verified |
| `/api/categories` | GET | List delivery categories | Public |

**Missing for Milestone 3:** All rider-specific API routes.

---

## 3. EXISTING SCHEMA AUDIT

### 3.1 rider_profiles — Field Completeness

| Field | Type | Purpose | Milestone 3 Need | Gap |
|-------|------|---------|-------------------|-----|
| `id` | UUID (FK → profiles) | Identity | ✅ | None |
| `verification_status` | TEXT (pending/under_review/approved/rejected) | Verification | ✅ | None |
| `verification_notes` | TEXT | Admin notes | ✅ | None |
| `is_available` | BOOLEAN | Availability toggle | ✅ | None |
| `current_location` | GEOGRAPHY(POINT) | Current position | ✅ | None |
| `last_location_update` | TIMESTAMPTZ | Location freshness | ✅ | None |
| `rating` | DECIMAL(3,2) | Average rating | ✅ | None |
| `total_deliveries` | INTEGER | Delivery count | ✅ | None |
| `cached_total_earnings` | DECIMAL(12,2) | Cached earnings | ✅ | None |
| `created_at` | TIMESTAMPTZ | Registration date | ✅ | None |
| `updated_at` | TIMESTAMPTZ | Last update | ✅ | None |

**Verdict:** `rider_profiles` is complete for Milestone 3 MVP. No new columns needed.

### 3.2 vehicles — Field Completeness

| Field | Type | Purpose | Milestone 3 Need | Gap |
|-------|------|---------|-------------------|-----|
| `id` | UUID | Vehicle ID | ✅ | None |
| `rider_id` | UUID (FK → rider_profiles) | Owner | ✅ | None |
| `vehicle_type` | TEXT (bicycle/motorcycle/tricycle/car/van) | Type | ✅ | None |
| `make` | TEXT | Manufacturer | ✅ | None |
| `model` | TEXT | Model | ✅ | None |
| `year` | INTEGER | Year | ✅ | None |
| `registration_number` | TEXT | Plate number | ✅ | None |
| `insurance_expiry` | DATE | Insurance | ✅ | None |
| `is_active` | BOOLEAN | Active status | ✅ | None |
| `created_at` | TIMESTAMPTZ | Created | ✅ | None |
| `updated_at` | TIMESTAMPTZ | Updated | ✅ | None |

**Verdict:** `vehicles` is complete for Milestone 3 MVP.

### 3.3 Tables That Need New Columns

**None.** The existing schema covers all Milestone 3 data requirements.

### 3.4 Tables That Need to Be Created

| Table | Purpose | Justification |
|-------|---------|---------------|
| `rider_documents` | Verification document uploads | Riders submit government ID, vehicle registration, etc. for admin review |
| `rider_verification_history` | Audit trail for verification status changes | Track who approved/rejected and when |

**Why these are needed:**
- `rider_profiles.verification_notes` is a single TEXT field — insufficient for tracking multiple document submissions and verification decisions over time.
- The verification workflow requires: document type, file URL, submission timestamp, review status, reviewer, and decision notes.
- `rider_verification_history` provides an auditable trail of who changed verification status and when.

---

## 4. RIDER DOMAIN MODEL

### 4.1 Rider Lifecycle

```
ANONYMOUS USER
    ↓ (signup with role=rider)
SUPABASE AUTH USER
    ↓ (auto-create profile via handle_new_user trigger)
RIDER PROFILE (role=rider, verification_status=pending)
    ↓ (submit profile + vehicle + documents)
VERIFICATION SUBMITTED (verification_status=under_review)
    ↓ (admin reviews)
APPROVED / REJECTED
    ↓ (if approved)
ACTIVE RIDER (is_available=true)
    ↓ (receives dispatch offers)
JOB ASSIGNED → PICKUP → TRANSIT → DELIVERED → EARNINGS
```

### 4.2 Rider Roles & Permissions

| Role | Access | Can Do |
|------|--------|--------|
| `rider` (profile role) | Own profile, own assignments, own locations, own earnings | Update availability, accept/reject jobs, update location, view earnings |
| `admin` | All rider data | Approve/reject riders, view all assignments, manage payouts |
| `operations` | Rider profiles, assignments | Monitor dispatch, assist with issues |

### 4.3 Rider Verification Workflow

```
SUBMITTED
    ↓ (admin reviews documents)
UNDER_REVIEW
    ├──→ APPROVED (rider can go online)
    └──→ REJECTED (with reason, rider can resubmit)
    
SUSPENDED (admin can suspend active rider)
    ↓ (investigation)
REACTIVATED / TERMINATED
```

---

## 5. RIDER AUTHENTICATION & AUTHORIZATION

### 5.1 Authentication Strategy

**One identity system: Supabase Auth.**

- Rider signs up via `/api/auth/signup` with `role: 'rider'` in metadata
- `handle_new_user()` trigger creates profile with `role = 'rider'`
- RLS policies enforce `auth.uid()` ownership
- No separate rider auth system

### 5.2 Authorization Matrix

| Operation | Customer | Rider | Operations | Admin |
|-----------|----------|-------|------------|-------|
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ❌ | ✅ |
| View rider list | ❌ | ❌ | ✅ | ✅ |
| Approve/reject rider | ❌ | ❌ | ❌ | ✅ |
| Suspend rider | ❌ | ❌ | ❌ | ✅ |
| View own assignments | ❌ | ✅ | ✅ | ✅ |
| Accept/reject offer | ❌ | ✅ | ❌ | ❌ |
| Update order status | ❌ | ✅ (own order) | ❌ | ✅ |
| Submit proof of delivery | ❌ | ✅ (own order) | ❌ | ❌ |
| Update location | ❌ | ✅ | ❌ | ❌ |
| View own earnings | ❌ | ✅ | ❌ | ✅ |
| View all earnings | ❌ | ❌ | ❌ | ✅ |
| Initiate payout | ❌ | ✅ (own) | ❌ | ✅ |
| View dispatch metrics | ❌ | ❌ | ✅ | ✅ |

---

## 6. RIDER ONBOARDING ARCHITECTURE

### 6.1 Registration Flow

1. Rider visits `/rider/register` or `/signup` with role selection
2. Creates Supabase Auth account (email/password or Google OAuth)
3. `handle_new_user()` creates profile with `role='rider'`
4. Rider is redirected to onboarding wizard:
   - Step 1: Personal information (name, phone)
   - Step 2: Vehicle information (type, make, model, registration)
   - Step 3: Document upload (government ID, vehicle registration, insurance)
   - Step 4: Review and submit
5. Status changes to `under_review`
6. Admin reviews in admin dashboard
7. Status changes to `approved` or `rejected`

### 6.2 New Tables Required

```sql
-- Verification document uploads
CREATE TABLE rider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'government_id', 'vehicle_registration', 'insurance',
    'drivers_license', 'proof_of_address', 'other'
  )),
  file_url TEXT NOT NULL,  -- Supabase Storage URL
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

-- Verification status change audit trail
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

### 6.3 Storage Architecture

- Rider documents stored in Supabase Storage bucket: `rider-documents`
- Path: `rider-documents/{rider_id}/{document_type}/{filename}`
- RLS: Rider can read own documents, admin can read all
- File size limit: 5MB per document
- Allowed types: image/jpeg, image/png, application/pdf

---

## 7. DISPATCH ARCHITECTURE

### 7.1 Current Implementation (Already Complete)

The dispatch engine is fully implemented at the PostgreSQL level:

**`dispatch_rider_v2(p_order_id)`:**
1. Locks the order row (`FOR UPDATE`)
2. Validates order is in dispatchable state (`paid` or `searching_rider`)
3. Updates order status to `searching_rider`
4. Calls `find_nearest_riders()` — PostGIS spatial query
5. Creates `rider_assignments` record with status `offered`
6. Sets rider as unavailable in `rider_current_locations`
7. Returns immediately (offer-based, not assignment-based)
8. On `unique_violation` (rider already has active assignment): tries next rider

**`accept_rider_offer(p_assignment_id, p_rider_id)`:**
1. Locks the assignment row (`FOR UPDATE`)
2. Validates assignment is in `offered` state
3. Checks offer hasn't expired
4. Locks the order row (`FOR UPDATE`)
5. Validates order is still `searching_rider`
6. Updates assignment to `accepted`
7. Updates order to `rider_assigned` with `assigned_rider_id`
8. Cancels all other offers for this order
9. Re-makes cancelled riders available

**`reject_rider_offer(p_assignment_id, p_rider_id)`:**
1. Locks the assignment row
2. Validates assignment is in `offered` state
3. Updates assignment to `rejected`
4. Re-makes rider available
5. Creates `DISPATCH_RETRY` background job

**`process_expired_offers()`:**
1. Finds all assignments with status `offered` and `expires_at < NOW()`
2. Uses `FOR UPDATE SKIP LOCKED` for concurrency
3. Marks expired, re-makes riders available
4. Creates `DISPATCH_RETRY` background jobs

### 7.2 What Milestone 3 Needs to Add

The PostgreSQL functions are complete. Milestone 3 needs:

1. **API route** to trigger dispatch after payment confirmation
2. **API route** for rider to receive/decline offers
3. **API route** for rider to accept offers
4. **Background job processor** to execute `DISPATCH_ORDER` jobs
5. **Background job processor** to execute `DISPATCH_RETRY` jobs
6. **Supabase Realtime** to notify riders of new offers
7. **Offer timeout** mechanism (already in DB via `expires_at`, needs polling/job)

### 7.3 Dispatch Flow (Milestone 3 Implementation)

```
PAYMENT CONFIRMED
    ↓
INSERT background_job (DISPATCH_ORDER)
    ↓
Background job calls dispatch_rider_v2(order_id)
    ↓
dispatch_rider_v2 finds nearest rider
    ↓
INSERT rider_assignments (status=offered, expires_at=now+30s)
    ↓
SUPABASE REALTIME: broadcast to rider channel
    ↓
RIDER receives offer on mobile/web
    ↓
├── ACCEPT: accept_rider_offer() → order becomes rider_assigned
├── REJECT: reject_rider_offer() → DISPATCH_RETRY → try next rider
└── EXPIRE: process_expired_offers() → DISPATCH_RETRY → try next rider
```

---

## 8. ORDER STATE MACHINE

### 8.1 Complete State Diagram

```
DRAFT
  ↓ (customer confirms)
PENDING_PAYMENT
  ↓ (payment initialized)
PAYMENT_PENDING
  ↓ (webhook confirms payment)
PAID
  ↓ (DISPATCH_ORDER background job)
SEARCHING_RIDER
  ↓ (rider accepts assignment)
RIDER_ASSIGNED
  ↓ (rider confirms departure to pickup)
RIDER_EN_ROUTE_TO_PICKUP
  ↓ (rider arrives at pickup location)
ARRIVED_AT_PICKUP
  ↓ (rider confirms pickup)
PICKED_UP
  ↓ (rider in transit)
IN_TRANSIT
  ↓ (rider arrives at destination)
ARRIVED_AT_DESTINATION
  ↓ (rider confirms delivery with proof)
DELIVERED
  ↓ (dispute window expires, auto-complete)
COMPLETED

ALTERNATIVE TERMINAL STATES:
  CANCELLED (customer/admin can cancel based on policy)
  FAILED (dispatch exhausted, payment failed)
  EXPIRED (quote expired before payment)
  DISPUTED (customer disputes delivery)
  REFUNDED (payment refunded)
```

### 8.2 State Transition Table

| From | To | Actor | Authorization | Preconditions | Side Effects | Event |
|------|-----|-------|---------------|---------------|--------------|-------|
| DRAFT | PENDING_PAYMENT | Customer | Order owner | Order created | None | order_created |
| PENDING_PAYMENT | PAYMENT_PENDING | System | — | Payment initialized | Create payment record | payment_initialized |
| PAYMENT_PENDING | PAID | System | Webhook verified | Paystack confirms | Create DISPATCH_ORDER job | payment_confirmed |
| PAID | SEARCHING_RIDER | System | Background job | DISPATCH_ORDER executed | Find nearest rider | dispatch_started |
| SEARCHING_RIDER | RIDER_ASSIGNED | Rider | Assigned rider | Rider accepts offer | Cancel other offers | rider_accepted |
| RIDER_ASSIGNED | RIDER_EN_ROUTE_TO_PICKUP | Rider | Assigned rider | Rider confirms departure | None | rider_departed_pickup |
| RIDER_EN_ROUTE_TO_PICKUP | ARRIVED_AT_PICKUP | Rider | Assigned rider | Rider at pickup location | None | rider_arrived_pickup |
| ARRIVED_AT_PICKUP | PICKED_UP | Rider | Assigned rider | Rider confirms pickup | None | pickup_confirmed |
| PICKED_UP | IN_TRANSIT | Rider | Assigned rider | Rider departs pickup | None | in_transit |
| IN_TRANSIT | ARRIVED_AT_DESTINATION | Rider | Assigned rider | Rider at destination | None | rider_arrived_destination |
| ARRIVED_AT_DESTINATION | DELIVERED | Rider | Assigned rider | Proof of delivery submitted | Record proof, calculate earnings | delivery_confirmed |
| DELIVERED | COMPLETED | System | Auto (timer) | Dispute window expires | Generate receipt, update analytics | order_completed |
| Any non-terminal | CANCELLED | Customer/Admin | Order owner/Admin | Per cancellation policy | Process refund if applicable | order_cancelled |
| PAID | FAILED | System | — | Dispatch exhausted (no riders) | None | dispatch_failed |

### 8.3 Cancellation Policy (MVP)

| Order State | Customer Can Cancel | Rider Can Cancel | Admin Can Cancel | Refund |
|-------------|--------------------|--------------------|------------------|--------|
| DRAFT | Yes | No | Yes | N/A |
| PENDING_PAYMENT | Yes | No | Yes | N/A |
| PAID | Yes (before rider assigned) | No | Yes | Full refund |
| SEARCHING_RIDER | Yes | No | Yes | Full refund |
| RIDER_ASSIGNED | Yes (with fee) | Yes (with reason) | Yes | Partial refund |
| RIDER_EN_ROUTE_TO_PICKUP | No | Yes (with reason) | Yes | Partial refund |
| ARRIVED_AT_PICKUP | No | No | Yes | Case by case |
| PICKED_UP | No | No | Yes | Case by case |
| IN_TRANSIT | No | No | Yes | Case by case |
| DELIVERED | No (dispute only) | No | Yes | Case by case |
| COMPLETED | No (dispute only) | No | Yes | Case by case |

**Decision required:** Exact cancellation fee amounts and refund percentages.

---

## 9. RIDER LOCATION ARCHITECTURE

### 9.1 Current Implementation

**`rider_current_locations`** (regular table, UPSERT):
- `rider_id` (PK, FK → rider_profiles)
- `latitude`, `longitude` (DECIMAL)
- `location` (GEOGRAPHY POINT, GIST indexed)
- `heading`, `speed`, `accuracy` (DECIMAL)
- `is_available` (BOOLEAN, partial index)
- `updated_at` (TIMESTAMPTZ)

**`rider_locations`** (append-only historical):
- `rider_id` (FK → rider_profiles, indexed)
- `latitude`, `longitude`, `location`
- `heading`, `speed`, `accuracy`
- `recorded_at` (indexed DESC)

**Trigger:** `on_rider_location_insert` — auto-updates `rider_current_locations` on INSERT to `rider_locations`.

### 9.2 Milestone 3 Location API

```
POST /api/riders/location
  - Auth: Rider (authenticated)
  - Body: { latitude, longitude, heading?, speed?, accuracy? }
  - Validates: rider is authenticated, rider profile exists
  - Throttles: minimum 5 seconds between updates (configurable)
  - Writes: rider_locations (INSERT → trigger updates rider_current_locations)
  - Broadcasts: Supabase Realtime to active delivery channel
  - Returns: { success: true }
```

### 9.3 Update Frequency Strategy

| State | Rider → Backend | Backend → Customer | Rationale |
|-------|----------------|-------------------|-----------|
| Online, no active delivery | Every 30s | N/A | Maintain dispatch availability |
| Active delivery, en route | Every 5-10s | Every 5-10s | Customer needs live tracking |
| Active delivery, stationary | Every 30s | Every 30s | Save battery/backend resources |
| App backgrounded | Every 30s | On resume | Battery optimization |

**Backend optimization:**
- Throttle: minimum 5-second interval between writes
- Spatial threshold: only write if moved > 10 meters (configurable)
- Historical sampling: write to `rider_locations` every Nth update (configurable, default every 5th)
- Current location: always update on every valid write

### 9.4 Customer Tracking

```
GET /api/orders/:id/tracking
  - Auth: Customer (order owner) or Admin
  - Returns: rider current location, heading, status, last updated
  - Realtime: subscribes to order:{order_id} channel
  - Stale detection: if last_location_update > 30s, show "Last seen X ago"
```

---

## 10. CUSTOMER LIVE TRACKING ARCHITECTURE

### 10.1 Realtime Subscription Model

```
Customer opens tracking page
    ↓
API: GET /api/orders/:id (validates ownership)
    ↓
Frontend: subscribe to Supabase channel `order:{order_id}`
    ↓
Rider sends location update → POST /api/riders/location
    ↓
Backend: INSERT into rider_locations → trigger updates rider_current_locations
    ↓
Backend: broadcast to channel `order:{order_id}`
    ↓
Customer receives broadcast → updates map marker
```

### 10.2 Channel Authorization

- Channel name: `order:{order_id}`
- Subscription check: server validates `customer_id = auth.uid()` or admin role
- RLS on `rider_current_locations` provides additional data-level protection
- Rider cannot subscribe to another customer's delivery channel

### 10.3 Customer Tracking UI Data

| Field | Source | Visible |
|-------|--------|---------|
| Rider name | profiles.full_name | ✅ |
| Rider rating | rider_profiles.rating | ✅ |
| Rider location | rider_current_locations | ✅ |
| Rider heading | rider_current_locations.heading | ✅ |
| Delivery status | orders.status | ✅ |
| ETA | Calculated from route | ✅ |
| Pickup address | orders.pickup_* | ✅ |
| Destination address | orders.destination_* | ✅ |
| Last updated | rider_current_locations.updated_at | ✅ |
| Rider phone | profiles (masked) | ✅ |
| Rider speed | rider_current_locations.speed | ❌ (internal) |
| Rider accuracy | rider_current_locations.accuracy | ❌ (internal) |

---

## 11. PROOF OF DELIVERY ARCHITECTURE

### 11.1 Proof Types

| Type | Description | Storage |
|------|-------------|---------|
| `photo` | Photo of delivered package | Supabase Storage |
| `signature` | Recipient signature (canvas data) | delivery_proofs.signature_data |
| `pin` | Delivery PIN confirmation | delivery_proofs.pin_code |
| `recipient_confirmation` | Recipient name + confirmation | delivery_proofs.recipient_name |

### 11.2 MVP Proof Strategy

For MVP, support:
1. **Photo** — rider takes photo, uploads to Supabase Storage
2. **Recipient name** — rider enters recipient name
3. **GPS coordinates** — auto-captured at delivery location

Signature and PIN can be added later.

### 11.3 Storage Architecture

```
POST /api/riders/deliveries/:id/proof
  - Auth: Rider (assigned to order)
  - Body: { proof_type, file? (photo), recipient_name?, notes? }
  - Validates: order status is arrived_at_destination or in_transit
  - Uploads photo to Supabase Storage: delivery-proofs/{order_id}/{timestamp}.jpg
  - Creates delivery_proofs record
  - Updates order status to DELIVERED
  - Records earnings in earnings_ledger
  - Returns: { success: true, proof_id }
```

### 11.4 Storage Bucket: `delivery-proofs`

- Path: `delivery-proofs/{order_id}/{timestamp}.{ext}`
- Access: Rider (own deliveries), Customer (own orders), Admin
- File size limit: 10MB
- Allowed types: image/jpeg, image/png

---

## 12. EARNINGS / PAYOUT ARCHITECTURE

### 12.1 Financial Model

**IMPORTANT: The exact rider/platform split is a BUSINESS DECISION that has NOT been finalized.**

Current database has `platform_commission_rate = 0.15` (15%) marked as "Internal rider payout calculation — NOT customer-facing."

**Pending product decisions:**
- Exact rider payout per delivery
- Whether payout is percentage-based or fixed
- Payout frequency (per delivery, daily, weekly)
- Minimum payout threshold
- Payment processing fee handling

### 12.2 Earnings Ledger (Already Implemented)

The `earnings_ledger` table provides an auditable financial record:

| Field | Purpose |
|-------|---------|
| `rider_id` | Rider who earned |
| `order_id` | Delivery that generated the earning |
| `credit` | Amount credited (positive) |
| `debit` | Amount debited (negative, for refunds/adjustments) |
| `balance_after` | Running balance |
| `description` | Human-readable description |
| `reference_type` | 'delivery_earning', 'payout', 'adjustment', 'refund' |
| `reference_id` | Related entity ID |

### 12.3 Payout Flow (Future)

```
Earnings accumulate in earnings_ledger
    ↓
Rider requests payout (or automatic schedule)
    ↓
System checks: available balance ≥ minimum threshold
    ↓
Create payout_recipients record (if not exists) via Paystack Transfer Recipient API
    ↓
Initiate Paystack Transfer
    ↓
Update payouts table with status
    ↓
If success: debit earnings_ledger
    If fail: log error, retry
```

### 12.4 What Milestone 3 Needs

1. **Earnings calculation** — when order completes, calculate rider earning and insert into `earnings_ledger`
2. **Earnings display** — API for rider to view earnings history
3. **Balance query** — API for rider to view current available balance
4. **Payout request** — API for rider to request payout (deferred to later milestone)

---

## 13. NOTIFICATION ARCHITECTURE

### 13.1 MVP Notification Channels

| Channel | MVP | Future |
|---------|-----|--------|
| In-app (Supabase Realtime) | ✅ | ✅ |
| Push notifications | ❌ | ✅ |
| SMS | ❌ | ✅ |
| Email | ❌ | ✅ |
| WhatsApp | ❌ | ✅ |

### 13.2 Rider Notifications (MVP)

| Event | Channel | Content |
|-------|---------|---------|
| New delivery offer | In-app Realtime | "New delivery: ₦X, Ykm away" |
| Offer expired | In-app Realtime | "Delivery offer expired" |
| Assignment cancelled | In-app Realtime | "Delivery reassigned" |
| Order status update | In-app Realtime | "Customer cancelled" / "Status changed" |
| Earnings credited | In-app | "₦X earned from delivery" |

### 13.3 Customer Notifications (MVP)

| Event | Channel | Content |
|-------|---------|---------|
| Rider assigned | In-app Realtime | "Rider {name} is heading to pickup" |
| Rider approaching pickup | In-app Realtime | "Rider is nearby" |
| Package picked up | In-app Realtime | "Package picked up" |
| Delivery in transit | In-app Realtime | "Package is on its way" |
| Delivered | In-app Realtime | "Package delivered" |

---

## 14. MAPS ARCHITECTURE

### 14.1 Current Abstraction

```
MapsProvider (interface)
├── MapboxProvider (MVP default)
└── GoogleMapsProvider (future scaling)
```

**Provider selection:** Global via `MAPS_PROVIDER` env var.

### 14.2 Milestone 3 Maps Usage

| Operation | Who | Maps Provider | Notes |
|-----------|-----|---------------|-------|
| Geocoding (address → coordinates) | Backend | Mapbox/Google | For address search |
| Reverse geocoding (coordinates → address) | Backend | Mapbox/Google | For rider location display |
| Route calculation (distance, duration) | Backend | Mapbox/Google | For dispatch and ETA |
| Address search/autocomplete | Frontend → Backend API | Mapbox/Google | For address input |
| Map display | Frontend | Mapbox GL JS / Google Maps JS | For tracking map |
| Navigation handoff | Frontend | External app (Google Maps/Waze) | For rider navigation |

### 14.3 Navigation Handoff

Rider needs to navigate to pickup and destination. The MVP approach:

1. Backend calculates route and provides destination coordinates
2. Rider frontend provides a "Navigate" button
3. Button opens external navigation app (Google Maps or Waze) via deep link
4. URL format: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`

This avoids embedding a full map SDK in the MVP rider interface.

---

## 15. DUAL PROVIDER STRATEGY

### 15.1 Current State

| Aspect | Status |
|--------|--------|
| MapsProvider interface | ✅ Implemented |
| MapboxProvider | ✅ Implemented |
| GoogleMapsProvider | ✅ Implemented |
| Factory with env selection | ✅ Implemented |
| Business logic uses abstraction | ✅ Verified |
| No direct provider imports in services | ✅ Verified |

### 15.2 Future Extension (Policy-Based Routing)

The current factory selects one provider globally. For future hybrid use:

```typescript
// Future: policy-based provider selection
function getMapsProviderForTask(task: 'geocoding' | 'routing' | 'search'): MapsProvider {
  const config = getMapsConfig();
  
  if (task === 'routing' && config.routing_provider === 'google') {
    return new GoogleMapsProvider(config.google_api_key);
  }
  
  return new MapboxProvider(config.mapbox_token);
}
```

This extension is NOT needed for Milestone 3. The current global selection is sufficient.

---

## 16. API SPECIFICATION — MILESTONE 3 NEW ENDPOINTS

### 16.1 Rider Onboarding

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/riders/register` | Authenticated | Complete rider registration (profile + vehicle) |
| GET | `/api/riders/profile` | Rider | Get own rider profile |
| PATCH | `/api/riders/profile` | Rider | Update rider profile |
| POST | `/api/riders/vehicles` | Rider | Add vehicle |
| GET | `/api/riders/vehicles` | Rider | List own vehicles |
| PATCH | `/api/riders/vehicles/[id]` | Rider | Update vehicle |
| POST | `/api/riders/documents` | Rider | Upload verification document |
| GET | `/api/riders/documents` | Rider | List own documents |
| GET | `/api/riders/verification-status` | Rider | Get verification status |

### 16.2 Rider Operations

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| PATCH | `/api/riders/availability` | Rider | Toggle online/offline |
| GET | `/api/riders/jobs` | Rider | List available/assigned jobs |
| POST | `/api/riders/jobs/[id]/accept` | Rider | Accept delivery offer |
| POST | `/api/riders/jobs/[id]/reject` | Rider | Reject delivery offer |
| GET | `/api/riders/jobs/[id]` | Rider | Get active delivery details |
| POST | `/api/riders/jobs/[id]/status` | Rider | Update delivery status |
| POST | `/api/riders/location` | Rider | Update current location |
| POST | `/api/riders/deliveries/[id]/proof` | Rider | Submit proof of delivery |

### 16.3 Rider Financial

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/riders/earnings` | Rider | List earnings history |
| GET | `/api/riders/earnings/summary` | Rider | Get earnings summary |
| GET | `/api/riders/payouts` | Rider | List payout history |

### 16.4 Customer Tracking

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/orders/[id]/tracking` | Customer (order owner) | Get rider location + status for active delivery |

### 16.5 Admin Rider Management

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/admin/riders` | Admin | List all riders |
| GET | `/api/admin/riders/[id]` | Admin | Get rider details |
| PATCH | `/api/admin/riders/[id]/verification` | Admin | Approve/reject rider |
| PATCH | `/api/admin/riders/[id]/status` | Admin | Suspend/reactivate rider |
| GET | `/api/admin/riders/[id]/documents` | Admin | View rider documents |
| GET | `/api/admin/dispatch/active` | Admin/Operations | View active dispatches |

---

## 17. DATABASE CHANGES PROPOSED

### 17.1 New Tables

| Table | Purpose | Columns |
|-------|---------|---------|
| `rider_documents` | Verification document uploads | 12 columns |
| `rider_verification_history` | Verification audit trail | 7 columns |

### 17.2 No Existing Tables Modified

The existing 36 tables cover all Milestone 3 data requirements. No new columns needed on existing tables.

### 17.3 New Indexes

| Index | Table | Purpose | Justification |
|-------|-------|---------|---------------|
| `idx_rider_documents_rider` | rider_documents | List rider's documents | Query: "show my documents" |
| `idx_rider_documents_status` | rider_documents | Admin review queue | Query: "show pending documents" |
| `idx_rider_verification_history_rider` | rider_verification_history | Audit trail | Query: "show verification history" |

### 17.4 New RLS Policies

| Table | Policy | Rule |
|-------|--------|------|
| `rider_documents` | `rider_documents_select_own` | `rider_id = auth.uid()` |
| `rider_documents` | `rider_documents_insert_own` | `rider_id = auth.uid()` |
| `rider_documents` | `rider_documents_select_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_documents` | `rider_documents_update_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_verification_history` | `rider_verification_history_select_own` | Via rider_profiles lookup |
| `rider_verification_history` | `rider_verification_history_select_admin` | `get_user_role() IN ('admin', 'super_admin')` |
| `rider_verification_history` | `rider_verification_history_insert_admin` | `get_user_role() IN ('admin', 'super_admin')` |

### 17.5 New PostgreSQL Functions

| Function | Purpose |
|----------|---------|
| `complete_delivery(p_order_id, p_rider_id, p_proof_data)` | Atomic delivery completion with earnings calculation |
| `calculate_rider_earning(p_order_id)` | Calculate rider payout for a completed delivery |

---

## 18. INDEX AUDIT

### 18.1 Current Index Count: 66

### 18.2 Existing Indexes Relevant to Milestone 3

| Index | Table | Query Pattern | Status |
|-------|-------|--------------|--------|
| `idx_rider_current_locations_geo` | rider_current_locations | Dispatch spatial query | ✅ Sufficient |
| `idx_rider_current_locations_available` | rider_current_locations | Available rider query | ✅ Sufficient |
| `idx_rider_assignments_one_active` | rider_assignments | One active per order | ✅ Sufficient |
| `idx_rider_assignments_rider_one_active` | rider_assignments | One active per rider | ✅ Sufficient |
| `idx_rider_assignments_order` | rider_assignments | Order's assignments | ✅ Sufficient |
| `idx_rider_assignments_rider` | rider_assignments | Rider's assignments | ✅ Sufficient |
| `idx_rider_assignments_expires` | rider_assignments | Expiry cleanup job | ✅ Sufficient |
| `idx_rider_locations_rider` | rider_locations | Rider history | ✅ Sufficient |
| `idx_rider_locations_recorded` | rider_locations | Time-range queries | ✅ Sufficient |
| `idx_delivery_proofs_order` | delivery_proofs | Order's proofs | ✅ Sufficient |
| `idx_earnings_ledger_rider` | earnings_ledger | Rider earnings | ✅ Sufficient |
| `idx_earnings_ledger_order` | earnings_ledger | Order earnings | ✅ Sufficient |
| `idx_notifications_user` | notifications | User notifications | ✅ Sufficient |
| `idx_orders_rider` | orders | Rider's orders | ✅ Sufficient |
| `idx_payouts_rider` | payouts | Rider payouts | ✅ Sufficient |
| `idx_payout_recipients_rider` | payout_recipients | Rider recipients | ✅ Sufficient |

### 18.3 New Indexes Needed

3 new indexes (see Section 17.3). Total after Milestone 3: **69 indexes**.

---

## 19. RLS/SECURITY MODEL

### 19.1 Rider Security Boundaries

| Boundary | Enforcement | Status |
|----------|-------------|--------|
| Rider can only see own profile | RLS: `id = auth.uid()` | ✅ |
| Rider can only see own assignments | RLS: `rider_id = auth.uid()` | ✅ |
| Rider can only update own location | RLS: `rider_id = auth.uid()` | ✅ |
| Rider can only submit proof for own order | RLS: `rider_id = auth.uid()` + service role check | ✅ |
| Rider cannot access customer personal data | RLS: customer data isolated | ✅ |
| Rider cannot access payment details | No RLS policy exposes payments to rider | ✅ |
| Rider cannot modify order pricing | Orders table has no rider UPDATE on pricing columns | ✅ |
| Customer cannot access rider private data | RLS on rider_profiles: only own + admin | ✅ |
| Customer can only track own active delivery | RLS: `customer_id = auth.uid()` + active status check | ✅ |

### 19.2 IDOR Prevention

| Attack Vector | Mitigation |
|---------------|------------|
| Rider tries to accept another rider's offer | `accept_rider_offer()` validates `rider_id` matches |
| Rider tries to submit proof for wrong order | RLS + service role validates assignment |
| Customer tries to track wrong order | RLS: `customer_id = auth.uid()` on orders |
| Rider tries to view another rider's earnings | RLS: `rider_id = auth.uid()` on earnings_ledger |
| Anonymous user tries to access rider data | RLS blocks unauthenticated access |

---

## 20. IDEMPOTENCY & CONCURRENCY MODEL

### 20.1 Concurrency Controls

| Operation | Mechanism | Status |
|-----------|-----------|--------|
| Quote consumption | `consume_quote()` with `FOR UPDATE` | ✅ |
| Order number generation | Atomic `INSERT ON CONFLICT` sequence | ✅ |
| Rider dispatch | `dispatch_rider_v2()` with `FOR UPDATE` on order + `unique_violation` handling | ✅ |
| Rider acceptance | `accept_rider_offer()` with `FOR UPDATE` on assignment + order | ✅ |
| Offer expiry | `process_expired_offers()` with `FOR UPDATE SKIP LOCKED` | ✅ |
| Payment verification | `verify_payment_and_confirm_order()` with `FOR UPDATE` on payment | ✅ |

### 20.2 Idempotency Requirements for Milestone 3

| Operation | Idempotency Strategy |
|-----------|---------------------|
| Rider location update | Last-write-wins (no idempotency key needed) |
| Rider accept offer | `accept_rider_offer()` is inherently idempotent (checks state) |
| Rider reject offer | `reject_rider_offer()` is inherently idempotent (checks state) |
| Proof of delivery | Order status check prevents duplicate submission |
| Dispatch retry | Background job deduplication via `processed_webhook_events` pattern |

---

## 21. SCALABILITY ANALYSIS

### 21.1 Capacity Tiers

| Tier | Customers | Riders | Orders/Day | Architecture |
|------|-----------|--------|------------|--------------|
| **MVP** | 100-1,000 | 10-50 | 50-500 | Current stack sufficient |
| **Growth** | 1,000-10,000 | 50-500 | 500-5,000 | Current stack with optimization |
| **Scale** | 10,000-100,000 | 500-5,000 | 5,000-50,000 | Redis for location, queue workers |
| **Large** | 100,000-1,000,000 | 5,000-50,000 | 50,000-500,000 | Dedicated services, Redis, partitioning |
| **Enterprise** | 1,000,000-24,000,000 | 50,000+ | 500,000+ | Microservices, distributed systems |

### 21.2 Architectural Transition Points

| Component | Current Limit | Transition At | Migration Path |
|-----------|--------------|---------------|----------------|
| PostgreSQL connections | ~200-500 | 1,000+ concurrent users | Connection pooling (PgBouncer), read replicas |
| Supabase Realtime | ~200 concurrent connections | 1,000+ concurrent tracking | Dedicated WebSocket infrastructure |
| Location writes | ~10,000 writes/sec | 100+ concurrent riders | Redis for current location, batch writes |
| Dispatch queries | ~100ms per query | 1,000+ concurrent dispatches | Zone-based partitioning, Redis geo index |
| Background jobs | Single PostgreSQL table | 10,000+ jobs/day | Dedicated queue (pg_boss, BullMQ) |
| Map API calls | Rate limits per provider | 10,000+ requests/day | Caching, provider routing |

### 21.3 What Does NOT Need to Change for Milestone 3

- PostgreSQL is sufficient for MVP
- Supabase Realtime is sufficient for MVP
- No Redis needed yet
- No microservices needed yet
- No dedicated queue system needed yet

---

## 22. FAILURE-MODE ANALYSIS

### 22.1 Failure Scenarios

| Failure | Detection | Recovery | User Impact |
|---------|-----------|----------|-------------|
| Rider goes offline during delivery | Location timeout (30s) | Auto-reassign after timeout | "Rider disconnected, finding new rider" |
| Customer loses internet | Reconnect + fetch latest | Resume from last known state | Brief tracking interruption |
| Two riders accept simultaneously | `FOR UPDATE` lock + unique constraint | Only one succeeds, other gets error | No impact (one rider assigned) |
| Payment webhook delayed | Order stays `pending_payment` | Retry mechanism, manual admin check | Delayed order processing |
| Payment webhook duplicate | `processed_webhook_events` idempotency | Skip duplicate processing | No impact |
| Rider cancels after acceptance | `reject_rider_offer()` or admin action | DISPATCH_RETRY, try next rider | Brief delay |
| Customer cancels after assignment | Cancellation policy engine | Refund calculation, rider notification | Order cancelled |
| Rider location becomes stale | Customer UI shows "Last seen X ago" | Auto-detection after threshold | Degraded tracking |
| Map provider unavailable | try/catch in MapsProvider | Haversine fallback (distance only) | No geocoding/routing |
| Mapbox quota exceeded | API error response | Switch to Google Maps (if configured) | Provider failover |
| Database temporarily unavailable | Connection error | Retry with backoff | Service degradation |
| Realtime disconnects | WebSocket close event | Auto-reconnect (Supabase handles) | Brief tracking interruption |
| Proof upload fails | Upload error | Retry, save locally | Delayed delivery confirmation |
| Payout fails | Paystack error | Retry, admin notification | Delayed rider payment |

---

## 23. MOBILE-APP COMPATIBILITY ANALYSIS

### 23.1 Current API Compatibility

All existing and proposed APIs use:
- Standard HTTP methods (GET, POST, PATCH, DELETE)
- JSON request/response bodies
- Supabase Auth tokens (Bearer tokens)
- No cookies required for API authentication

**Verdict:** All APIs are mobile-compatible without changes.

### 23.2 Shared Packages

| Package | Mobile Reusable | Notes |
|---------|----------------|-------|
| `@repo/shared` types | ✅ | TypeScript types for all entities |
| `@repo/shared` validators | ✅ | Zod schemas for API validation |
| `@repo/shared` constants | ✅ | Status enums, config values |
| `@repo/shared` quote engine | ✅ | Pricing calculation (if needed client-side for display) |

### 23.3 Mobile-Specific Considerations

| Concern | Web | Mobile | Notes |
|---------|-----|--------|-------|
| Location updates | JavaScript Geolocation API | React Native geolocation | Same backend API |
| Push notifications | Not implemented | Expo Push Notifications | Needs push token registration |
| Camera (proof of delivery) | HTML file input | Expo Camera | Same upload API |
| Offline support | None | AsyncStorage + sync | Future enhancement |
| Deep linking | URL-based | Universal Links | Navigation handoff |

---

## 24. OBSERVABILITY REQUIREMENTS

### 24.1 MVP Observability

| Area | Implementation |
|------|----------------|
| Structured logging | `console.log` with JSON structure (server-side) |
| Error tracking | Sentry DSN (configured but not yet integrated) |
| Request IDs | UUID per request, logged with all operations |
| Payment event logs | `order_events` table |
| Order event logs | `order_events` + `order_status_history` tables |
| Audit logs | `audit_logs` table for admin operations |
| Dispatch metrics | `rider_assignments` status tracking |

### 24.2 Key Metrics to Track (Post-MVP)

| Metric | Source | Purpose |
|--------|--------|---------|
| Dispatch success rate | rider_assignments | Rider availability |
| Average time to rider assignment | order timestamps | Dispatch efficiency |
| Rider acceptance rate | rider_assignments | Offer quality |
| Average delivery time | order timestamps | Service quality |
| Customer satisfaction | ratings | Service quality |
| Cancellation rate | order status | Business health |
| Rider earnings per hour | earnings_ledger | Rider economics |

---

## 25. OPEN PRODUCT DECISIONS

| # | Decision | Impact | Can Proceed Without? |
|---|----------|--------|---------------------|
| 1 | Exact rider payout per delivery (percentage vs fixed) | Earnings calculation | Yes (use configurable default) |
| 2 | Cancellation fee amounts | Customer/rider cancellation | Yes (use 0 for MVP) |
| 3 | Payout frequency (per delivery, daily, weekly) | Payout API | Yes (defer payout to later milestone) |
| 4 | Minimum payout threshold | Payout requests | Yes (defer payout to later milestone) |
| 5 | Delivery categories that require specific vehicle types | Dispatch filtering | Yes (allow all vehicle types for MVP) |
| 6 | Maximum delivery distance | Dispatch eligibility | Yes (use existing 10km default) |
| 7 | Offer timeout duration (currently 30s) | Rider offer UX | Yes (configurable in platform_settings) |
| 8 | Dispatch retry limit | Background job behavior | Yes (use existing max_attempts=3) |
| 9 | Stale location threshold | Tracking UX | Yes (use 30s default) |
| 10 | Rider verification requirements per vehicle type | Onboarding | Yes (require government ID for all) |
| 11 | Whether riders can have multiple active vehicles | Vehicle management | Yes (one active vehicle for MVP) |
| 12 | Proof of delivery requirements per delivery type | Delivery completion | Yes (photo + recipient name for MVP) |

---

## 26. MILESTONE 3 IMPLEMENTATION PLAN

### Phase 3.1: Rider Registration & Onboarding

**Objective:** Rider can sign up, complete profile, upload documents, await verification.

**Files affected:**
- `supabase/migrations/20260823010000_rider_documents.sql` (NEW)
- `apps/web/app/rider/register/page.tsx` (NEW)
- `apps/web/app/api/riders/register/route.ts` (NEW)
- `apps/web/app/api/riders/profile/route.ts` (NEW)
- `apps/web/app/api/riders/vehicles/route.ts` (NEW)
- `apps/web/app/api/riders/documents/route.ts` (NEW)
- `apps/web/lib/services/rider.service.ts` (NEW)
- `packages/shared/validators/rider.ts` (NEW)
- `packages/shared/types/index.ts` (MODIFY — add RiderDocument type)

**Dependencies:** Milestone 2 ✅
**Tests:** Rider registration, profile CRUD, document upload, RLS isolation

### Phase 3.2: Rider Availability & Location

**Objective:** Rider can go online/offline, update location.

**Files affected:**
- `apps/web/app/api/riders/availability/route.ts` (NEW)
- `apps/web/app/api/riders/location/route.ts` (NEW)
- `apps/web/lib/services/rider-location.service.ts` (NEW)

**Dependencies:** Phase 3.1
**Tests:** Availability toggle, location update throttling, RLS

### Phase 3.3: Dispatch & Job Management

**Objective:** Rider receives offers, can accept/reject, views active delivery.

**Files affected:**
- `apps/web/app/api/riders/jobs/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/accept/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/reject/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/route.ts` (NEW)
- `apps/web/app/api/riders/jobs/[id]/status/route.ts` (NEW)
- `apps/web/lib/services/dispatch.service.ts` (NEW)
- `apps/web/app/api/webhooks/dispatch/route.ts` (NEW — internal webhook for dispatch jobs)

**Dependencies:** Phase 3.2
**Tests:** Offer receipt, acceptance concurrency, rejection retry, status transitions

### Phase 3.4: Proof of Delivery

**Objective:** Rider submits proof, delivery completes, earnings calculated.

**Files affected:**
- `apps/web/app/api/riders/deliveries/[id]/proof/route.ts` (NEW)
- `apps/web/lib/services/proof.service.ts` (NEW)
- `apps/web/lib/services/earnings.service.ts` (NEW)
- `supabase/migrations/20260823020000_delivery_completion_functions.sql` (NEW)

**Dependencies:** Phase 3.3
**Tests:** Proof upload, delivery completion, earnings calculation, RLS

### Phase 3.5: Customer Tracking

**Objective:** Customer sees rider location during active delivery.

**Files affected:**
- `apps/web/app/api/orders/[id]/tracking/route.ts` (NEW)
- `apps/web/components/tracking/rider-map.tsx` (NEW)
- `apps/web/app/(dashboard)/orders/[id]/tracking/page.tsx` (NEW)
- `apps/web/lib/services/tracking.service.ts` (NEW)

**Dependencies:** Phase 3.2
**Tests:** Tracking authorization, realtime subscription, stale detection

### Phase 3.6: Rider Dashboard UI

**Objective:** Rider can manage their work through a web dashboard.

**Files affected:**
- `apps/web/app/(rider)/layout.tsx` (NEW)
- `apps/web/app/(rider)/dashboard/page.tsx` (NEW)
- `apps/web/app/(rider)/jobs/page.tsx` (NEW)
- `apps/web/app/(rider)/jobs/[id]/page.tsx` (NEW)
- `apps/web/app/(rider)/earnings/page.tsx` (NEW)
- `apps/web/app/(rider)/profile/page.tsx` (NEW)
- `apps/web/app/(rider)/verification/page.tsx` (NEW)
- `apps/web/components/rider/` (NEW — rider-specific components)

**Dependencies:** Phase 3.1-3.5
**Tests:** Page rendering, auth protection, responsive design

### Phase 3.7: Admin Rider Management

**Objective:** Admin can review riders, approve/reject, view dispatches.

**Files affected:**
- `apps/web/app/api/admin/riders/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/verification/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/status/route.ts` (NEW)
- `apps/web/app/api/admin/riders/[id]/documents/route.ts` (NEW)

**Dependencies:** Phase 3.1
**Tests:** Admin authorization, verification workflow, RLS

---

## 27. RISKS

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Supabase Realtime connection limits at scale | Medium | Monitor usage, plan Redis migration path |
| 2 | Location write volume with many riders | Medium | Throttle + spatial threshold + sampling |
| 3 | Dispatch performance with many concurrent orders | Low | PostgreSQL handles well at MVP scale |
| 4 | Paystack payout API limits | Low | Defer payouts to later milestone |
| 5 | Map API rate limits | Low | caching + fallback provider |
| 6 | Mobile battery drain from location updates | Medium | Configurable frequency + background optimization |
| 7 | Rider document storage costs | Low | Supabase Storage free tier sufficient for MVP |

---

## 28. EXPLICIT "NOT IMPLEMENTED" IN MILESTONE 3

The following are explicitly OUT OF SCOPE for Milestone 3:

| Item | Reason |
|------|--------|
| Native mobile app | Deferred to later milestone |
| Push notifications | Deferred to later milestone |
| SMS notifications | Deferred to later milestone |
| Email notifications | Deferred to later milestone |
| Rider payout processing | Deferred to later milestone |
| Multi-vehicle support | One active vehicle per rider for MVP |
| Surge/dynamic pricing | Not part of MVP pricing model |
| Complex dispatch scoring | Nearest-eligible-rider is sufficient for MVP |
| Redis/caching layer | PostgreSQL sufficient for MVP |
| Microservices | Monolith sufficient for MVP |
| CI/CD pipeline | Manual deployment for MVP |
| E2E automated tests | Unit + integration tests for MVP |
| Accessibility audit | Basic accessibility for MVP |
| Performance load testing | Post-MVP |
| Internationalization | English only for MVP |

---

## 29. ARCHITECTURE DECISION RECORDS REQUIRED

| # | Decision | Status | Impact |
|---|----------|--------|--------|
| ADR-001 | Rider payout model (percentage vs fixed) | PENDING | Earnings calculation |
| ADR-002 | Cancellation fee structure | PENDING | Cancellation flow |
| ADR-003 | Payout frequency and minimum threshold | PENDING | Payout API |
| ADR-004 | Vehicle type restrictions per delivery category | PENDING | Dispatch filtering |
| ADR-005 | Proof of delivery requirements per delivery type | PENDING | Delivery completion |
| ADR-006 | Offer timeout duration | PENDING (default: 30s) | Dispatch behavior |
| ADR-007 | Stale location threshold | PENDING (default: 30s) | Tracking UX |

---

## 30. VERIFICATION SUMMARY

### What Was Verified

- [x] All 36 database tables inspected via live Supabase API
- [x] All RLS policies verified for rider tables (32 policies)
- [x] All PostgreSQL functions verified (11 custom functions)
- [x] All existing API routes verified (11 routes)
- [x] All services verified (4 services)
- [x] Order state machine verified (17 states)
- [x] Rider assignment lifecycle verified (6 states)
- [x] Dispatch functions verified (5 functions)
- [x] Maps provider abstraction verified (2 providers)
- [x] Pricing architecture verified (database-driven)
- [x] 66 database indexes verified
- [x] ARCHITECTURE.md consistency verified
- [x] Git history verified (2 commits: Milestone 1 + Milestone 2)

### What Was Discovered

- Existing schema covers ~85% of Milestone 3 data needs
- Only 2 new tables needed (rider_documents, rider_verification_history)
- Only 3 new indexes needed
- Dispatch engine already fully implemented in PostgreSQL
- RLS policies already comprehensive for rider tables
- Earnings ledger and payout infrastructure already in database
- Main gaps are API routes, UI, and background job processing

### What Should NOT Change

- Existing database schema (no modifications to existing tables)
- Existing RLS policies (only additions, no modifications)
- Existing PostgreSQL functions (only additions)
- Pricing architecture
- Maps provider abstraction
- Order state machine
- Payment architecture
- Authentication architecture

### Unresolved Product Decisions

1. Rider payout model (percentage vs fixed)
2. Cancellation fee amounts
3. Payout frequency and minimum threshold
4. Vehicle type restrictions per delivery category
5. Proof of delivery requirements per delivery type

---

**DISCOVERY STATUS: COMPLETE**
**AWAITING AUTHORIZATION TO BEGIN MILESTONE 3 IMPLEMENTATION**
