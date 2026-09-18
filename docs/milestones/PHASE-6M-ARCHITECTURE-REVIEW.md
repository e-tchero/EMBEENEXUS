# PHASE 6M — ARCHITECTURE REVIEW

**Date:** August 28, 2026
**HEAD:** `ff74660` (unchanged)
**Baseline:** Phase 6L complete, security remediation committed

---

## 1. Executive Summary

Phase 6M Discovery identified three "CRITICAL" gaps: delivery proof photo storage, customer cancellation UI, and customer rating UI. **Architecture review found that two of these are false positives.** The codebase already contains fully implemented `CancelOrderButton`, `RatingForm`, and `ProofDisplay` components, all imported and rendered in `order-tracking.tsx`. The only genuinely critical gap is **delivery proof photo storage** — no Supabase Storage bucket exists, and riders have no mechanism to upload delivery photos.

**Approved Phase 6M scope:**
1. Delivery proof photo storage (Supabase Storage bucket + upload API + signed URLs)
2. Proof display photo rendering (extend existing ProofDisplay to show photos)
3. Admin customer list (API + UI)
4. Webhook idempotency test
5. Quote consumption concurrency test

---

## 2. Discovery Validation — CRITICAL CORRECTIONS

The discovery report classified these as CRITICAL:

| Discovery Claim | Actual State | Correction |
|----------------|-------------|------------|
| No customer cancellation UI | **ALREADY EXISTS** — `CancelOrderButton` component at `components/order/cancel-order-button.tsx`, imported and rendered in `order-tracking.tsx` when status is in CANCELLABLE_STATUSES | FALSE POSITIVE — no work needed |
| No customer rating UI | **ALREADY EXISTS** — `RatingForm` component at `components/order/rating-form.tsx`, imported and rendered in `order-tracking.tsx` when status is delivered/completed | FALSE POSITIVE — no work needed |
| No delivery proof display | **PARTIALLY EXISTS** — `ProofDisplay` component at `components/order/proof-display.tsx` renders text proof (recipient_name, notes, timestamp). **No photo rendering.** | PARTIAL — needs photo extension |

**Verified existing UI components:**

| Component | File | Status |
|-----------|------|--------|
| `CancelOrderButton` | `components/order/cancel-order-button.tsx` | Complete — confirmation modal, reason input, API integration |
| `RatingForm` | `components/order/rating-form.tsx` | Complete — 5-star rating, comments, existing-rating display, success state |
| `ProofDisplay` | `components/order/proof-display.tsx` | Partial — text proof only, no photo |
| `RefundStatus` | `components/order/refund-status.tsx` | Complete — refund status display |
| `OrderTracking` | `components/tracking/order-tracking.tsx` | Complete — orchestrates all above components |

**The `OrderTracking` component already handles:**
- Cancel button visibility (cancellable statuses: paid, searching_rider, rider_assigned, rider_en_route_to_pickup, arrived_at_pickup)
- Rating form visibility (delivered/completed statuses)
- Proof display visibility (delivered/completed statuses)
- Refund status visibility (cancelled/failed statuses)

**No new UI components are needed for cancellation or rating.**

---

## 3. Current Architecture — Delivery Proof

### Database Schema

```sql
CREATE TABLE delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  rider_id UUID NOT NULL REFERENCES auth.users(id),
  proof_type TEXT NOT NULL,  -- 'photo', 'signature', 'text'
  file_url TEXT,             -- Currently accepts URL but no upload mechanism exists
  recipient_name TEXT,
  notes TEXT,
  proof_latitude DECIMAL,
  proof_longitude DECIMAL,
  recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Existing Backend Flow

1. Rider calls `POST /api/riders/deliveries/[orderId]/complete`
2. Request body includes `proof_type`, `file_url` (for photo), `recipient_name`, `notes`
3. API calls `complete_delivery()` PostgreSQL function
4. Function validates: photo proof requires `file_url`
5. Function inserts into `delivery_proofs` table
6. **BLOCKER:** Rider has no way to obtain a `file_url` — no Storage bucket exists

### Existing Customer View

1. Customer views order detail → `OrderTracking` component
2. If delivered/completed → `ProofDisplay` renders
3. `ProofDisplay` fetches `GET /api/orders/[id]/proof`
4. API returns: `proof_type`, `recipient_name`, `notes`, `recorded_at`
5. **Does NOT return `file_url`** — photo display not implemented

### RLS Policies (Already Exist)

```sql
-- Rider can insert their own proof
CREATE POLICY "delivery_proofs_insert_rider" ON delivery_proofs
  FOR INSERT WITH CHECK (rider_id = auth.uid());

-- Customer can read proof for their order
CREATE POLICY "delivery_proofs_select_customer" ON delivery_proofs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = delivery_proofs.order_id
            AND orders.customer_id = auth.uid())
  );

-- Admin can read all proofs
CREATE POLICY "delivery_proofs_select_admin" ON delivery_proofs
  FOR SELECT USING (get_user_role() IN ('admin', 'super_admin'));
```

### Grants (Already Exist)

```sql
GRANT SELECT ON delivery_proofs TO anon, authenticated, service_role;
GRANT INSERT ON delivery_proofs TO authenticated, service_role;
```

---

## 4. Delivery Proof Architecture — STORAGE

### 4.1 Storage Bucket Design

**Bucket name:** `delivery-proofs`

**Access:** Private (not public). Signed URLs for time-limited access.

**Rationale:** Delivery proof photos contain location data and are tied to specific orders. Public access would expose customer delivery locations. Private bucket with signed URLs provides time-limited, authorized access.

### 4.2 Storage Policies

```sql
-- Rider can upload to path: {order_id}/{rider_id}/{filename}
CREATE POLICY "delivery_proofs_upload_rider"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-proofs'
  AND (storage.foldername(name))[1] = (SELECT id::text FROM orders WHERE id = (storage.foldername(name))[1])
  AND auth.uid() = (SELECT assigned_rider_id FROM orders WHERE id = (storage.foldername(name))[1])
);

-- Customer can read their order's proofs
CREATE POLICY "delivery_proofs_read_customer"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = (storage.foldername(name))[1]
    AND orders.customer_id = auth.uid()
  )
);

-- Admin can read all delivery proofs
CREATE POLICY "delivery_proofs_read_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND get_user_role() IN ('admin', 'super_admin')
);

-- Rider can read their own uploaded proofs
CREATE POLICY "delivery_proofs_read_rider"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND auth.uid() = (storage.foldername(name))[2]::uuid
);
```

### 4.3 Path Convention

```
delivery-proofs/{order_id}/{rider_id}/{timestamp}-{uuid}.{ext}
```

Example: `delivery-proofs/a1b2c3d4-.../e5f6g7h8-.../1693200000-abc123.jpg`

**Why this structure:**
- First folder: order_id — enables per-order access control
- Second folder: rider_id — enables per-rider ownership
- Filename: timestamp + random UUID — prevents collision, enables ordering
- Extension: preserved from upload — enables MIME type display

### 4.4 Upload API

**New endpoint:** `POST /api/riders/deliveries/[orderId]/proof-upload`

**Flow:**
1. Rider selects photo on device
2. Client sends `FormData` with file to upload API
3. API validates:
   - Authentication (rider session)
   - Order exists and is assigned to this rider
   - Order status allows delivery completion (in_transit, arrived_at_destination)
   - File type is image (JPEG, PNG, WebP)
   - File size ≤ 10MB
4. API generates storage path: `{order_id}/{rider_id}/{timestamp}-{uuid}.{ext}`
5. API uploads to Supabase Storage bucket `delivery-proofs`
6. API returns signed URL (1-hour expiry) for immediate use
7. Rider then calls existing `complete_delivery` with the signed URL as `file_url`

**Why a separate upload endpoint (not direct client upload):**
- Server validates order assignment and status before accepting upload
- Server generates the storage path (prevents path traversal)
- Server controls file type and size validation
- Signed URL is short-lived (1 hour)
- Prevents unauthorized uploads to arbitrary paths

### 4.5 File Validation

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| Allowed types | `image/jpeg`, `image/png`, `image/webP` | Common photo formats |
| Max size | 10MB | Sufficient for high-quality photos, prevents abuse |
| Max per order | 1 (replacement allowed) | One proof per delivery |
| Signed URL expiry | 1 hour | Time-limited access |

### 4.6 Proof Display — Photo Extension

Extend existing `ProofDisplay` component to:
1. Fetch `file_url` from the proof API (currently omitted)
2. Request a signed URL from a new customer-facing signed-URL endpoint
3. Display the photo with `<img>` tag
4. Handle loading/error states for photo

**New endpoint:** `GET /api/orders/[id]/proof/photo-url`
- Returns a signed URL for the customer to view the proof photo
- Validates order ownership
- 30-minute expiry

---

## 5. Storage Security Model

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Path traversal | Server generates storage path, not client |
| Cross-order access | Storage policy checks order ownership |
| Cross-rider access | Storage policy checks rider assignment |
| Unauthorized upload | Auth + order assignment check |
| Overwriting another rider's proof | UUID in filename prevents collision |
| Malicious file upload | MIME type validation, size limit |
| Public photo exposure | Private bucket, signed URLs only |
| Long-lived access | Signed URLs expire in 30min–1hr |
| Arbitrary file type | Server-side MIME validation before upload |

### Signed URL Architecture

```
Rider uploads photo
    ↓
POST /api/riders/deliveries/[orderId]/proof-upload
    ↓
Server validates auth + order + file
    ↓
Upload to Supabase Storage (private bucket)
    ↓
Return signed URL (1hr expiry) to rider
    ↓
Rider calls complete_delivery with signed URL as file_url
    ↓
Customer views order → ProofDisplay
    ↓
GET /api/orders/[id]/proof/photo-url
    ↓
Server generates signed URL (30min expiry)
    ↓
Customer views photo
```

---

## 6. Admin Customer List Architecture

### Decision: INCLUDE in Phase 6M

The admin currently has orders, riders, dashboard — but cannot see the customer list. This is an operational gap for customer support.

### API Design

**Endpoint:** `GET /api/admin/customers`

**Authorization:** Server-side admin role check (same pattern as admin orders)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "customer@example.com",
      "full_name": "John Doe",
      "created_at": "2026-01-01T00:00:00Z",
      "order_count": 5,
      "total_spent": 25000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

**Fields:** id, email, full_name, created_at, order_count, total_spent
**Excluded:** phone, addresses, payment details (privacy)

### UI Design

**Location:** `apps/web/app/admin/customers/page.tsx`

**Components:**
- Table with sortable columns
- Pagination (cursor-based if feasible, offset otherwise)
- Basic search (name/email)
- Click-through to order list filtered by customer

### Sidebar Navigation

Add "Customers" link to admin sidebar with existing navigation pattern.

---

## 7. Webhook Idempotency Test Architecture

### What to Test

| Scenario | Expected Behavior |
|----------|-------------------|
| First delivery of `charge.success` | Payment processed, order updated, webhook recorded |
| Duplicate delivery of same event | Idempotent — no duplicate state change |
| Replay of previously processed event | Safely ignored |
| `charge.failed` first delivery | Order marked failed, webhook recorded |
| `charge.failed` duplicate | No duplicate state change |
| Refund webhook first delivery | Refund processed, webhook recorded |
| Refund webhook duplicate | No duplicate refund |

### Test Approach

- Mock Paystack webhook signature verification
- Use `processed_webhook_events` table for idempotency
- Verify order state transitions are correct and non-duplicated
- Verify payment records are not duplicated

---

## 8. Quote Consumption Concurrency Test Architecture

### What to Test

Two concurrent requests attempt to consume the same valid quote:

```
Request A → consume quote X → should succeed (one order created)
Request B → consume quote X → should fail (quote already consumed)
```

### Expected Invariants

- Exactly one order created
- Quote `is_consumed = true` after both requests complete
- No corrupted quote state
- No duplicate payment records

### Test Approach

- Simulate concurrent consumption with parallel async calls
- Verify only one succeeds
- Verify quote state is consistent
- Verify only one order exists

---

## 9. Notification Architecture Decision

**DEFER — REQUIRES FOUNDER DECISION**

The notifications table exists but nothing writes to it. Implementing notifications requires:
- Provider selection (email/SMS/push)
- Business rules (which events trigger notifications)
- Template design
- Opt-in/opt-out policy

This is a business decision, not a technical one. Do not implement in Phase 6M.

---

## 10. Rider Payout Architecture Decision

**DEFER — REQUIRES FOUNDER DECISION**

Earnings calculation exists but no Paystack transfer execution. Implementing payouts requires:
- Revenue split policy (70/30 mentioned but not confirmed)
- Payout timing (weekly? on-demand?)
- Minimum payout threshold
- Failed payout handling
- Paystack transfer API configuration
- Tax implications

This is a business decision. Do not implement in Phase 6M.

---

## 11. Pagination Architecture

**DEFER from Phase 6M**

Order list pagination is a UX improvement, not a production blocker. The admin customer list (new in 6M) will include pagination from the start. Customer order list pagination can follow in a subsequent phase.

---

## 12. Security Considerations

| Area | Risk | Mitigation |
|------|------|-----------|
| Storage upload | Path traversal | Server-generated path |
| Storage access | Cross-order data leak | RLS policies + signed URLs |
| File type | Malicious upload | MIME validation, size limit |
| Admin customer list | Data exposure | Minimal fields, no PII beyond name/email |
| Signed URLs | Long-lived access | Short expiry (30min–1hr) |
| Cancellation UI | Already exists | No new risk |
| Rating UI | Already exists | No new risk |

---

## 13. Database Changes

### Migration: Delivery Proof Storage

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-proofs',
  'delivery-proofs',
  false,           -- Private
  10485760,        -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Storage policies (4 policies as defined in Section 4.2)
-- ... (see Section 4.2 for exact SQL)
```

**Classification:** Additive only. No existing data modified. No existing tables altered.

### Migration: Admin Customer Index

```sql
-- Index for admin customer list query
CREATE INDEX idx_profiles_role_created ON profiles(role, created_at DESC)
  WHERE role = 'customer';
```

**Classification:** Additive. Partial index for admin query performance.

---

## 14. API Changes

| Endpoint | Method | Change | Auth |
|----------|--------|--------|------|
| `/api/riders/deliveries/[orderId]/proof-upload` | POST | **NEW** — photo upload | Rider |
| `/api/orders/[id]/proof/photo-url` | GET | **NEW** — signed URL for customer | Customer |
| `/api/orders/[id]/proof` | GET | **MODIFY** — include file_url in response | Customer |
| `/api/admin/customers` | GET | **NEW** — customer list | Admin |

---

## 15. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `apps/web/app/api/riders/deliveries/[orderId]/proof-upload/route.ts` | Photo upload endpoint |
| `apps/web/app/api/orders/[id]/proof/photo-url/route.ts` | Customer signed URL endpoint |
| `apps/web/app/api/admin/customers/route.ts` | Admin customer list API |
| `apps/web/app/admin/customers/page.tsx` | Admin customer list UI |
| `supabase/migrations/20260828030000_phase6m_storage.sql` | Storage bucket + policies + index |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/app/api/orders/[id]/proof/route.ts` | Include `file_url` in response |
| `apps/web/components/order/proof-display.tsx` | Add photo rendering |
| `apps/web/components/admin/admin-sidebar.tsx` | Add Customers nav link |
| `packages/shared/validators/phase6m.test.ts` | New tests |

### NOT Modified

| Area | Reason |
|------|--------|
| QuoteService | Untouched |
| OrderService | Untouched |
| PaymentService | Untouched |
| Pricing | Untouched |
| Mapping | Untouched |
| Dispatch | Untouched |
| CancelOrderButton | Already complete |
| RatingForm | Already complete |
| Phase 1–6L | Untouched |

---

## 16. Implementation Sequence

| Step | Item | Dependencies |
|------|------|-------------|
| 1 | Storage bucket migration | None |
| 2 | Upload API (`/proof-upload`) | Step 1 |
| 3 | Signed URL API (`/proof/photo-url`) | Step 1 |
| 4 | Modify proof API to include `file_url` | None |
| 5 | Extend `ProofDisplay` with photo | Steps 3–4 |
| 6 | Admin customer list API | None |
| 7 | Admin customer list UI + sidebar | Step 6 |
| 8 | Tests (upload, signed URL, idempotency, concurrency) | Steps 1–7 |
| 9 | Full verification | Step 8 |

---

## 17. Backward Compatibility

| Check | Status |
|-------|--------|
| Existing orders valid | ✅ No schema changes to orders |
| Existing delivery proofs valid | ✅ file_url is nullable, existing text proofs unaffected |
| Existing cancellation flow | ✅ Already complete, no changes |
| Existing rating flow | ✅ Already complete, no changes |
| Existing APIs | ✅ Only additions, no breaking changes |
| Previous migrations | ✅ Untouched |
| Phase 1–6L | ✅ Untouched |

---

## 18. Final Phase 6M Scope

### MUST IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 1 | Supabase Storage bucket for delivery proofs | Riders cannot upload photos without it |
| 2 | Photo upload API | Riders need a server-validated upload path |
| 3 | Signed URL API for customers | Customers need authorized photo access |
| 4 | Proof display photo rendering | Customers should see delivery photos |

### SHOULD IMPLEMENT

| # | Item | Reason |
|---|------|--------|
| 5 | Admin customer list (API + UI) | Operational necessity for support |
| 6 | Webhook idempotency test | Critical path test coverage |
| 7 | Quote consumption concurrency test | Critical path test coverage |

### DEFER

| # | Item | Reason |
|---|------|--------|
| 8 | Notification service | Requires founder decision on provider |
| 9 | Rider payout execution | Requires founder decision on business rules |
| 10 | Customer order list pagination | UX improvement, not production blocker |
| 11 | Autocomplete UI | Nice-to-have |
| 12 | Platform settings UI | Low priority |
| 13 | Sentry/external monitoring | External vendor decision |

---

## 19. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Storage bucket misconfiguration | LOW | MEDIUM | Follow Supabase Storage best practices, test policies |
| Photo upload abuse (large files) | LOW | LOW | 10MB limit, MIME validation |
| Signed URL leakage | LOW | LOW | Short expiry, one-time use pattern |
| Admin customer data exposure | LOW | MEDIUM | Minimal fields, server-side auth |

---

## 20. Founder Decisions Required

| # | Decision | Impact |
|---|----------|--------|
| F1 | Rider payout architecture | Blocks payout execution (deferred) |
| F2 | Notification provider | Blocks notifications (deferred) |
| F3 | Payment reconciliation policy | Blocks financial auditing (deferred) |

---

## 21. Verification

| Check | Result |
|-------|--------|
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Database modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only this report + discovery report) |

---

## 22. GO / NO-GO

**GO — Implementation is recommended.**

The scope is focused on the single genuinely critical gap (delivery proof photo storage) plus high-value operational improvements (admin customer list, critical-path tests). The false-positive corrections reduce scope rather than increase it, which is the right direction for milestone discipline.

---

**PHASE 6M ARCHITECTURE REVIEW — COMPLETE**
**STATUS: READY FOR IMPLEMENTATION AUTHORIZATION**
