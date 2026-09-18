# PHASE 5C — ARCHITECTURE REVIEW

## 1. Executive Summary

Phase 5C adds customer-facing enhancements to the order detail page: cancellation, ratings, proof display, and refund status. The backend infrastructure is 90% complete — all database tables, RLS policies, and SECURITY DEFINER functions exist. Phase 5C requires 2 new API endpoints, 1 database function, and 4 UI components.

## 2. Current Architecture

### 2.1 Order Detail Page Structure

```
/(dashboard)/orders/[id]/page.tsx (Server Component)
├── Auth check (createClient → getUser)
├── Order fetch (eq('customer_id', user.id) — IDOR protection)
├── Events fetch
├── Rider info fetch
└── OrderTracking (Client Component)
    ├── StatusBadge
    ├── TrackingMap (when tracking)
    ├── RiderCard (when tracking)
    ├── Searching animation (when searching_rider)
    ├── Terminal state banners (delivered/cancelled/failed)
    ├── Delivery Details card
    └── OrderTimeline
```

### 2.2 Existing Backend Endpoints

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `/api/orders/[id]` | GET | ✅ EXISTS | Order details |
| `/api/orders/[id]/cancel` | POST | ✅ EXISTS | Customer cancellation |
| `/api/orders/[id]/refund` | GET | ✅ EXISTS | Refund status |
| `/api/orders/[id]/proof` | GET | ❌ MISSING | Proof retrieval |
| `/api/orders/[id]/rating` | POST | ❌ MISSING | Rating submission |

### 2.3 Existing Database Objects

| Object | Status | Evidence |
|--------|--------|----------|
| `cancel_order()` | ✅ EXISTS | SECURITY DEFINER, auth.uid() authorization |
| `complete_delivery()` | ✅ EXISTS | Creates delivery_proofs record |
| `delivery_proofs` table | ✅ EXISTS | RLS: customer SELECT, rider INSERT |
| `ratings` table | ✅ EXISTS | UNIQUE(order_id, customer_id), CHECK(1-5) |
| `rider_profiles.rating` | ✅ EXISTS | DECIMAL(3,2), default 5.00 |
| Rating update trigger | ❌ MISSING | No trigger to aggregate ratings |

## 3. Cancellation UX Architecture

### 3.1 Cancellable States

From `cancel_order()` function, customer cancellation is allowed when order status is:

| Status | Cancellable | Refund Initiated |
|--------|-------------|------------------|
| `paid` | ✅ YES | ✅ YES (if payment exists) |
| `searching_rider` | ✅ YES | ✅ YES |
| `rider_assigned` | ✅ YES | ✅ YES |
| `rider_en_route_to_pickup` | ✅ YES | ✅ YES |
| `arrived_at_pickup` | ✅ YES | ✅ YES |
| `picked_up` | ❌ NO | — |
| `in_transit` | ❌ NO | — |
| `arrived_at_destination` | ❌ NO | — |
| `delivered` | ❌ NO | — |
| `cancelled` | ❌ NO | — |
| `failed` | ❌ NO | — |

### 3.2 Cancellation UI Design

**Location:** Below the status header in `OrderTracking`, only when `CANCELLABLE_STATUSES.has(order.status)`

**Component:** `CancelOrderButton` (new client component)

**States:**
1. **Idle** — "Cancel Order" button visible
2. **Confirming** — Modal/dialog with optional reason input
3. **Loading** — Button disabled, spinner
4. **Success** — Refund status displayed, order status updated
5. **Error** — Error message displayed, retry possible

**Duplicate prevention:**
- Button disabled during loading state
- API returns success for duplicate cancellation (idempotent)
- UI updates order status on success, removing cancel button

### 3.3 Cancellation Flow

```
Customer taps "Cancel Order"
→ Confirmation dialog appears
→ Customer confirms (optional reason)
→ POST /api/orders/[id]/cancel { reason }
→ cancel_order() executes:
  → Validates state (cancellable)
  → Validates customer ownership
  → Sets status = 'cancelled'
  → Creates refund record (if paid)
  → Creates REFUND_PROCESS job
  → Returns { success, message, refund_initiated }
→ UI updates:
  → Order status → 'cancelled'
  → Cancel button disappears
  → Refund status section appears (if refund_initiated)
```

### 3.4 Cancel Button Visibility Logic

```typescript
const CANCELLABLE_STATUSES = new Set([
  'paid', 'searching_rider', 'rider_assigned',
  'rider_en_route_to_pickup', 'arrived_at_pickup'
]);

const showCancelButton = CANCELLABLE_STATUSES.has(order.status);
```

## 4. Rating System Architecture

### 4.1 Database Schema (Existing)

```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, customer_id)  -- One rating per order per customer
);
```

### 4.2 API Contract

**Endpoint:** `POST /api/orders/[id]/rating`

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Great delivery!"
}
```

**Validation:**
- `rating`: integer, required, 1-5
- `comment`: string, optional, max 500 chars

**Authorization:**
- `auth.uid()` must equal `orders.customer_id`
- Order status must be `delivered` or `completed`
- No existing rating for this order/customer (UNIQUE constraint)

**Response (success):**
```json
{
  "data": {
    "success": true,
    "message": "Rating submitted",
    "rating_id": "uuid"
  }
}
```

**Response (error):**
```json
{
  "error": "Order not eligible for rating"
}
```

### 4.3 Rating Aggregation

**Problem:** `rider_profiles.rating` is a cached average but no trigger exists to update it.

**Solution:** Create a PostgreSQL function `update_rider_rating()` that:
1. Calculates the average rating for the rider from the `ratings` table
2. Updates `rider_profiles.rating`
3. Is called after each new rating insertion

**Implementation options:**
- **Option A:** PostgreSQL trigger on `ratings` table (automatic, always consistent)
- **Option B:** Application-layer call after rating insertion (simpler, requires explicit call)

**Recommendation:** Option A (trigger) for consistency. The trigger fires on INSERT and updates the cached average.

### 4.4 Rating UI Design

**Location:** Below the delivery details, only when `order.status === 'delivered' || order.status === 'completed'`

**Component:** `RatingForm` (new client component)

**States:**
1. **No rating yet** — Show star rating input + optional comment
2. **Rating submitted** — Show thank you message with rating display
3. **Already rated** — Show existing rating (fetched from server)

**Flow:**
```
Order delivered/completed
→ Check if rating exists (GET /api/orders/[id]/rating)
→ If no rating: show RatingForm
→ Customer selects stars (1-5)
→ Customer optionally adds comment
→ Submit → POST /api/orders/[id]/rating
→ trigger() fires → updates rider_profiles.rating
→ UI shows "Thank you" message
```

### 4.5 Rating API Implementation

```typescript
// POST /api/orders/[id]/rating
// 1. Authenticate (auth.uid())
// 2. Verify order exists and customer_id matches
// 3. Verify order status is 'delivered' or 'completed'
// 4. Get rider_id from order
// 5. Insert rating (UNIQUE constraint prevents duplicates)
// 6. Return success
```

**Note:** The rating aggregation trigger handles updating `rider_profiles.rating` automatically.

## 5. Proof-of-Delivery Architecture

### 5.1 Existing Schema

```sql
CREATE TABLE delivery_proofs (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  proof_type TEXT NOT NULL CHECK (proof_type IN ('photo', 'signature', 'pin', 'recipient_confirmation')),
  file_url TEXT,
  recipient_name TEXT,
  notes TEXT,
  proof_latitude DECIMAL(10,8),
  proof_longitude DECIMAL(11,8),
  recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

### 5.2 API Contract

**Endpoint:** `GET /api/orders/[id]/proof`

**Authorization:**
- `auth.uid()` must equal `orders.customer_id` (verified via service role)
- RLS also enforces: `delivery_proofs_select_customer` checks `orders.customer_id = auth.uid()`

**Response (success):**
```json
{
  "data": {
    "proof_id": "uuid",
    "proof_type": "recipient_confirmation",
    "recipient_name": "John Doe",
    "notes": "Left at front door",
    "recorded_at": "2026-08-24T10:30:00Z"
  }
}
```

**Response (no proof):**
```json
{
  "error": "No delivery proof found"
}
```

**Response (unauthorized):**
```json
{
  "error": "Order not found"
}
```

### 5.3 Proof Display Design

**Location:** Below the terminal state banner (delivered/completed), only when proof exists

**Component:** `ProofDisplay` (new client component)

**For `recipient_confirmation`:**
- Show recipient name
- Show notes (if any)
- Show timestamp

**For `photo` (deferred to Phase 5D):**
- Show placeholder: "Photo proof available"
- No image display (storage bucket not created)

### 5.4 Storage Decision

**MVP:** Use `recipient_confirmation` proof type only. No storage bucket required.

**Phase 5D:** Create `delivery-proofs` bucket for photo proof storage.

**Rationale:** The rider dashboard already submits `proof_type: 'photo'` with `file_url` parameter. For MVP, we display text-based proof info only. Photo image display deferred.

## 6. Refund Status Architecture

### 6.1 Existing API

**Endpoint:** `GET /api/orders/[id]/refund`

**Returns:**
```json
{
  "data": {
    "refund_id": "uuid",
    "order_id": "uuid",
    "amount": 2500,
    "status": "pending",
    "reason": "Order cancelled",
    "created_at": "2026-08-24T10:30:00Z",
    "updated_at": "2026-08-24T10:30:00Z"
  }
}
```

### 6.2 Refund Status Values

| Status | Display | Description |
|--------|---------|-------------|
| `pending` | "Refund Pending" | Refund created, awaiting processing |
| `processing` | "Processing Refund" | Paystack refund initiated |
| `completed` | "Refund Completed" | Money returned to customer |
| `failed` | "Refund Failed" | Refund failed, contact support |
| No refund | — | No refund record exists |

### 6.3 Refund Status UI Design

**Location:** Below the cancellation banner, only when refund exists

**Component:** `RefundStatus` (new client component)

**Behavior:**
- Fetch refund status on mount (GET /api/orders/[id]/refund)
- If 404 → no refund exists, hide component
- If 200 → display refund status with appropriate styling
- No polling — refund status is fetched once (changes are slow)

### 6.4 Refund Status Display Logic

```typescript
// In OrderTracking or a wrapper component
const [refund, setRefund] = useState(null);

useEffect(() => {
  if (order.status === 'cancelled' || order.status === 'failed') {
    fetch(`/api/orders/${order.id}/refund`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setRefund(data?.data || null));
  }
}, [order.id, order.status]);
```

## 7. Order-Detail Component Architecture

### 7.1 Current Structure

```
OrderTracking (client component)
├── StatusBadge
├── TrackingMap
├── RiderCard
├── Searching animation
├── Terminal state banners
├── Delivery Details
└── OrderTimeline
```

### 7.2 Proposed Structure

```
OrderTracking (client component)
├── StatusBadge
├── TrackingMap
├── RiderCard
├── Searching animation
├── Terminal state banners
├── [NEW] CancelOrderButton (when cancellable)
├── [NEW] RefundStatus (when cancelled/failed + refund exists)
├── [NEW] ProofDisplay (when delivered/completed + proof exists)
├── [NEW] RatingForm (when delivered/completed + no rating)
├── Delivery Details
└── OrderTimeline
```

### 7.3 Component Design Principles

1. **Additive only** — No existing components are modified
2. **Conditional rendering** — Each new component renders only when relevant
3. **Independent data fetching** — Each component fetches its own data
4. **Preserve Phase 5A** — Real-time tracking, map, timeline unchanged

### 7.4 New Components

| Component | File | Purpose |
|-----------|------|---------|
| `CancelOrderButton` | `components/order/cancel-order-button.tsx` | Cancel confirmation + API call |
| `RefundStatus` | `components/order/refund-status.tsx` | Display refund status |
| `ProofDisplay` | `components/order/proof-display.tsx` | Display delivery proof info |
| `RatingForm` | `components/order/rating-form.tsx` | Submit rating for delivered order |

### 7.5 Integration Point

All new components are added to `OrderTracking` as conditional sections between the terminal state banners and the Delivery Details card.

## 8. Security Model

### 8.1 Cancellation Security

| Risk | Mitigation | Layer |
|------|------------|-------|
| Customer cancels another's order | `cancel_order()` checks `customer_id = auth.uid()` | Database function |
| Cancel after pickup | Function rejects `picked_up` and later states | Database function |
| Double cancellation | Idempotent — returns success if already cancelled | Database function |
| Client-side state manipulation | Server validates state, returns error | API + function |

### 8.2 Rating Security

| Risk | Mitigation | Layer |
|------|------------|-------|
| Customer rates another's order | RLS: `customer_id = auth.uid()` + API verification | RLS + API |
| Duplicate rating | UNIQUE(order_id, customer_id) constraint | Database |
| Rating before delivery | API checks `order.status IN ('delivered', 'completed')` | API |
| Rider self-rating | RLS: `customer_id = auth.uid()` prevents rider inserting as customer | RLS |
| Manipulate `rider_profiles.rating` | Only trigger/function can update it | Database trigger |
| Invalid rating value | CHECK(rating >= 1 AND rating <= 5) | Database |

### 8.3 Proof Security

| Risk | Mitigation | Layer |
|------|------------|-------|
| Customer views another's proof | RLS: `orders.customer_id = auth.uid()` | RLS |
| Rider views another's proof | RLS: `rider_id = auth.uid()` | RLS |
| No API-level check needed | RLS is sufficient defense | RLS |
| Proof data leakage | Only text fields returned (no file_url for MVP) | API design |

### 8.4 Refund Security

| Risk | Mitigation | Layer |
|------|------------|-------|
| Customer views another's refund | Service verifies `customer_id` | API service |
| Refund status fabrication | Data comes from database, not client | Server-authoritative |
| No refund shown when none exists | 404 response → component hides | API + UI |

### 8.5 IDOR Protection Summary

| Endpoint | Authorization | Layer |
|----------|---------------|-------|
| `POST /api/orders/[id]/cancel` | `cancel_order()` checks `customer_id = auth.uid()` | Database function |
| `POST /api/orders/[id]/rating` | API verifies `customer_id = auth.uid()` + RLS | API + RLS |
| `GET /api/orders/[id]/proof` | Service verifies `customer_id` + RLS | Service + RLS |
| `GET /api/orders/[id]/refund` | Service verifies `customer_id` | Service |

## 9. Concurrency / Race Conditions

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Customer taps cancel twice | Low | Button disabled during loading; API idempotent |
| Customer submits rating twice | Low | UNIQUE constraint; API returns existing rating |
| Rating submission during cancellation | Low | Different endpoints, no conflict |
| Proof fetch during upload | Low | Read-only, no conflict |
| Refund status during processing | Low | Read-only, no conflict |

## 10. Database Changes Required

### 10.1 New Function: `update_rider_rating()`

```sql
CREATE OR REPLACE FUNCTION update_rider_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_avg_rating DECIMAL(3,2);
BEGIN
  SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 5.00)
  INTO v_avg_rating
  FROM ratings
  WHERE rider_id = NEW.rider_id;

  UPDATE rider_profiles
  SET rating = v_avg_rating, updated_at = NOW()
  WHERE id = NEW.rider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;
```

### 10.2 New Trigger

```sql
CREATE TRIGGER trigger_update_rider_rating
  AFTER INSERT ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_rider_rating();
```

### 10.3 Migration Scope

| Change | Type | Risk |
|--------|------|------|
| `update_rider_rating()` function | NEW | Low — additive |
| `trigger_update_rider_rating` trigger | NEW | Low — additive |

**No existing objects are modified.**

## 11. API Changes Required

### 11.1 New: `POST /api/orders/[id]/rating`

| Field | Value |
|-------|-------|
| Method | POST |
| Route | `/api/orders/[id]/rating` |
| Auth | Required (customer session) |
| Authorization | `auth.uid()` must equal `orders.customer_id` |
| Request body | `{ rating: number, comment?: string } |
| Validation | rating: 1-5 integer; comment: optional, max 500 |
| Response | `{ data: { success, message, rating_id } }` |
| Idempotency | UNIQUE constraint prevents duplicates |

### 11.2 New: `GET /api/orders/[id]/proof`

| Field | Value |
|-------|-------|
| Method | GET |
| Route | `/api/orders/[id]/proof` |
| Auth | Required (customer session) |
| Authorization | RLS: `orders.customer_id = auth.uid()` |
| Response | `{ data: { proof_type, recipient_name, notes, recorded_at } }` |
| No proof | `{ error: "No delivery proof found" }` (404) |

### 11.3 No Modifications to Existing APIs

All existing endpoints remain unchanged.

## 12. UI/Component Changes Required

### 12.1 Modified: `OrderTracking` component

**Change:** Add 4 new conditional sections after terminal state banners.

**Impact:** Additive only — no existing logic changed.

### 12.2 New Components

| Component | Dependencies | Purpose |
|-----------|-------------|---------|
| `CancelOrderButton` | None | Cancel confirmation + API |
| `RefundStatus` | None | Refund status display |
| `ProofDisplay` | None | Proof info display |
| `RatingForm` | None | Rating submission |

### 12.3 No New Dependencies

All components use existing React patterns and Tailwind CSS.

## 13. Test Strategy

### 13.1 Unit Tests

| Test | Component | Type |
|------|-----------|------|
| Cancellable status detection | CancelOrderButton | Logic |
| Rating validation (1-5) | RatingForm | Validation |
| Rating already exists handling | RatingForm | State |
| Proof display formatting | ProofDisplay | Display |
| Refund status mapping | RefundStatus | Display |

### 13.2 API/Integration Tests

| Test | Endpoint | Type |
|------|----------|------|
| Unauthorized rating rejected | POST /rating | Security |
| Rating before delivery rejected | POST /rating | Validation |
| Duplicate rating rejected | POST /rating | Idempotency |
| Valid rating succeeds | POST /rating | Happy path |
| Unauthorized proof access rejected | GET /proof | Security |
| Proof for own order succeeds | GET /proof | Happy path |
| No proof returns 404 | GET /proof | Edge case |
| Cancel unauthorized order rejected | POST /cancel | Security |
| Cancel after pickup rejected | POST /cancel | State machine |
| Valid cancel succeeds | POST /cancel | Happy path |
| Refund status for own order | GET /refund | Happy path |
| Refund status for other order rejected | GET /refund | Security |

### 13.3 State-Transition Tests

| Test | From State | Action | Expected |
|------|-----------|--------|----------|
| Cancel from paid | paid | cancel | success, refund_initiated |
| Cancel from searching_rider | searching_rider | cancel | success |
| Cancel from rider_assigned | rider_assigned | cancel | success |
| Cancel from picked_up | picked_up | cancel | REJECTED |
| Cancel from delivered | delivered | cancel | REJECTED |
| Rate delivered order | delivered | rating | success |
| Rate paid order | paid | rating | REJECTED |
| Rate already rated order | delivered | rating | REJECTED (duplicate) |

### 13.4 Regression Tests

| Test | Type |
|------|------|
| Existing 305 tests still pass | Regression |
| Phase 1-5B functionality unaffected | Regression |
| No new secrets/credentials | Security |
| No AI attribution | Attribution |

## 14. Migration Requirements

| Migration | Contents | Risk |
|-----------|----------|------|
| `20260824010000_phase5c_ratings.sql` | `update_rider_rating()` function + trigger | Low |

**Both locations must be byte-for-byte identical:**
- `supabase/migrations/20260824010000_phase5c_ratings.sql`
- `packages/database/migrations/20260824010000_phase5c_ratings.sql`

## 15. Implementation Sequence

### Step 1: Database Migration
- Create `update_rider_rating()` function
- Create trigger on `ratings` table
- Sync migration files

### Step 2: Rating API
- Create `POST /api/orders/[id]/rating`
- Validate rating, authorization, order status
- Insert rating (trigger handles aggregation)
- Write tests

### Step 3: Proof API
- Create `GET /api/orders/[id]/proof`
- Query delivery_proofs for order
- Return text-based proof info
- Write tests

### Step 4: UI Components
- Create `CancelOrderButton`
- Create `RefundStatus`
- Create `ProofDisplay`
- Create `RatingForm`
- Integrate into `OrderTracking`

### Step 5: Verification
- Typecheck
- Tests (305+ new)
- Build
- Security scan
- Attribution scan

## 16. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Rating trigger not firing | LOW | Test trigger manually after migration |
| Proof query slow | LOW | Index on delivery_proofs.order_id exists |
| Cancel button race condition | LOW | Idempotent API, disabled during loading |
| Refund status stale | LOW | Single fetch, no polling needed |
| Storage bucket missing | DEFERRED | Use recipient_confirmation only for MVP |

## 17. Scope Discipline

### In Phase 5C
- Customer cancellation UX
- Rating submission
- Proof info display (text only)
- Refund status display
- Rating aggregation trigger

### Explicitly Deferred
- Photo proof storage bucket
- Photo proof image display
- Rating editing/deletion
- Rating moderation
- Rating analytics
- Notifications
- Payout execution
- Admin dashboard

## 18. Product Decisions Confirmed

| Decision | Value | Source |
|----------|-------|--------|
| Rating range | 1-5 stars | Existing schema CHECK constraint |
| One rating per order | Yes | Existing UNIQUE(order_id, customer_id) |
| Rating immutability | Ratings cannot be edited | Architecture decision |
| Photo proof display | Deferred to Phase 5D | Discovery finding |
| Cancellable states | paid through arrived_at_pickup | Existing cancel_order() function |
| Refund on cancellation | Automatic if payment exists | Existing cancel_order() function |

## 19. GO / NO-GO Recommendation

**GO — READY FOR IMPLEMENTATION**

All backend infrastructure exists. Phase 5C requires minimal new code: 1 migration, 2 APIs, 4 UI components. No architectural changes. Security is enforced at database/RLS level. Scope is well-bounded.

---

*Architecture review completed: 2026-08-24*
*Repository verified: HEAD c70032d, 305/305 tests pass*
*No code was modified during architecture review*
