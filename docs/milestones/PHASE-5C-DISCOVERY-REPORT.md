# PHASE 5C — DISCOVERY REPORT

## 1. Executive Summary

Phase 5C covers customer-facing enhancements: cancellation UX, ratings, proof-of-delivery retrieval/display, and refund status visibility. Backend infrastructure exists for most features but UI integration is missing.

**Key Finding:** All required database tables, RLS policies, and SECURITY DEFINER functions already exist. Phase 5C requires mostly UI components consuming existing APIs, plus two small backend additions (ratings API, proof retrieval API).

## 2. Repository Baseline

| Field | Value |
|-------|-------|
| HEAD | `c70032d8dcf4e395d472b775dfe7bcc6aaeb7004` |
| Branch | `master` |
| Working tree | Clean |
| Phase 5B commit | `c70032d` (rider dashboard) |

## 3. Current-State Inventory

### 3.1 Customer Cancellation

| Component | Status | Evidence |
|-----------|--------|----------|
| `cancel_order()` function | ✅ EXISTS | `20260823070000_phase4c_cancellation_refund.sql` |
| `/api/orders/[id]/cancel` | ✅ EXISTS | Phase 4C implementation |
| Customer authorization | ✅ ENFORCED | `v_order.customer_id != v_caller_id → REJECT` |
| Cancellable states | ✅ DEFINED | `paid, searching_rider, rider_assigned, rider_en_route_to_pickup, arrived_at_pickup` |
| Post-pickup block | ✅ ENFORCED | `picked_up, in_transit, arrived_at_destination, delivered → REJECT` |
| Refund integration | ✅ EXISTS | Creates refund record + REFUND_PROCESS job |
| **Cancel button in UI** | ❌ MISSING | No cancel button on order detail page |
| **Cancellation confirmation** | ❌ MISSING | No confirmation dialog |
| **Refund status display** | ❌ MISSING | No refund status shown to customer |

### 3.2 Proof of Delivery

| Component | Status | Evidence |
|-----------|--------|----------|
| `delivery_proofs` table | ✅ EXISTS | Schema: id, order_id, rider_id, proof_type, file_url, recipient_name, notes, etc. |
| RLS: customer SELECT | ✅ EXISTS | `delivery_proofs_select_customer`: checks `orders.customer_id = auth.uid()` |
| RLS: rider INSERT | ✅ EXISTS | `delivery_proofs_insert_rider`: checks `rider_id = auth.uid()` |
| RLS: rider SELECT | ✅ EXISTS | `delivery_proofs_select_rider`: checks `rider_id = auth.uid()` |
| `complete_delivery()` inserts proof | ✅ EXISTS | Phase 4A function creates proof record |
| **Proof retrieval API** | ❌ MISSING | No `/api/orders/[id]/proof` endpoint |
| **Proof display in UI** | ❌ MISSING | No proof section on order detail page |
| **Storage bucket** | ⚠️ NOT CREATED | Migration notes say "handled by application" but no code exists |
| **Signed URL generation** | ❌ MISSING | No mechanism to serve private proof images |

### 3.3 Ratings

| Component | Status | Evidence |
|-----------|--------|----------|
| `ratings` table | ✅ EXISTS | Schema: id, order_id, customer_id, rider_id, rating (1-5), comment, UNIQUE(order_id, customer_id) |
| RLS: customer INSERT | ✅ EXISTS | `ratings_insert_customer`: checks `customer_id = auth.uid()` |
| RLS: customer SELECT | ✅ EXISTS | `ratings_select_customer`: checks `customer_id = auth.uid()` |
| RLS: rider SELECT | ✅ EXISTS | `ratings_select_rider`: checks `rider_id = auth.uid()` |
| `rider_profiles.rating` column | ✅ EXISTS | Cached average, default 5.00 |
| **Ratings API** | ❌ MISSING | No POST /api/orders/[id]/rating endpoint |
| **Rating UI** | ❌ MISSING | No rating form on delivered order |
| **Rating update trigger** | ❌ MISSING | No trigger to update `rider_profiles.rating` on new rating |

### 3.4 Refund Status

| Component | Status | Evidence |
|-----------|--------|----------|
| `refunds` table | ✅ EXISTS | Schema with status field |
| `/api/orders/[id]/refund` (GET) | ✅ EXISTS | Returns refund status for customer's order |
| RLS: customer SELECT | ✅ EXISTS | `refunds_select_customer`: checks order ownership |
| **Refund status in UI** | ❌ MISSING | No refund status displayed on order detail |

### 3.5 Customer Order Detail Page

| Component | Status | Evidence |
|-----------|--------|----------|
| Order info display | ✅ EXISTS | Shows order number, status, amounts |
| Real-time tracking | ✅ EXISTS | Phase 5A: map, rider location, timeline |
| Rider info | ✅ EXISTS | Name, rating, vehicle |
| **Cancel button** | ❌ MISSING | No cancellation action |
| **Proof display** | ❌ MISSING | No delivery proof shown for completed orders |
| **Rating form** | ❌ MISSING | No rating submission for delivered orders |
| **Refund status** | ❌ MISSING | No refund information shown |

## 4. Backend API Gap Analysis

### APIs That Exist (No Changes Needed)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/orders/[id]/cancel` | POST | Customer cancellation |
| `/api/orders/[id]/refund` | GET | Refund status |
| `/api/orders/[id]` | GET | Order details |
| `/api/riders/deliveries/[orderId]/complete` | POST | Rider completes with proof |

### APIs That Need Creation

| Endpoint | Method | Purpose | Justification |
|----------|--------|---------|---------------|
| `/api/orders/[id]/proof` | GET | Retrieve delivery proof | Customer needs to see proof for completed orders. RLS already allows customer SELECT on delivery_proofs. |
| `/api/orders/[id]/rating` | POST | Submit rating | Customer rates rider after delivery. RLS allows customer INSERT on ratings. |

### APIs That Need Modification

**NONE.** All existing APIs are complete and correctly authorized.

## 5. Storage Architecture

### Current State
- No `delivery-proofs` storage bucket exists in migrations
- Phase 4A migration notes: "Storage bucket creation is handled by the application"
- No application code creates the bucket
- `complete_delivery()` stores `file_url` as TEXT in `delivery_proofs` table

### Impact
- Rider photo uploads have no actual storage target
- Customer cannot view proof images
- For MVP with `recipient_confirmation` proof type, storage is not required
- For `photo` proof type, storage bucket is required

### Recommendation
- Create `delivery-proofs` bucket as private
- Add storage policies for rider upload and customer read
- OR defer photo proof to a later phase and use recipient_confirmation only for MVP

## 6. IDOR/Security Analysis

### Cancellation
| Risk | Mitigation | Status |
|------|------------|--------|
| Customer cancels another's order | `cancel_order()` checks `customer_id = auth.uid()` | ✅ PROTECTED |
| Cancel after pickup | Function rejects `picked_up` and later states | ✅ PROTECTED |
| Double cancellation | Function is idempotent (checks current state) | ✅ PROTECTED |

### Proof Retrieval
| Risk | Mitigation | Status |
|------|------------|--------|
| Customer views another's proof | RLS: `orders.customer_id = auth.uid()` | ✅ PROTECTED (RLS) |
| Rider views another's proof | RLS: `rider_id = auth.uid()` | ✅ PROTECTED (RLS) |
| No API-level ownership check | RLS is the defense layer | ⚠️ ACCEPTABLE (RLS sufficient) |

### Ratings
| Risk | Mitigation | Status |
|------|------------|--------|
| Customer rates unrelated order | RLS: `customer_id = auth.uid()` + UNIQUE(order_id, customer_id) | ✅ PROTECTED |
| Duplicate rating | UNIQUE constraint on (order_id, customer_id) | ✅ PROTECTED |
| Rating before delivery | API should check order status | ⚠️ NEEDS ENFORCEMENT |
| Rider self-rating | RLS: `customer_id = auth.uid()` prevents rider inserting as customer | ✅ PROTECTED |

### Refund Status
| Risk | Mitigation | Status |
|------|------------|--------|
| Customer views another's refund | `getRefundByOrderId()` checks `customer_id` | ✅ PROTECTED |

## 7. Concurrency/Duplicate Submission Analysis

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Customer taps cancel twice | Low | `cancel_order()` is idempotent |
| Customer submits rating twice | Low | UNIQUE(order_id, customer_id) constraint |
| Proof retrieval during upload | Low | Read-only operation, no conflict |
| Refund status during processing | Low | Read-only operation, no conflict |

## 8. Missing Functionality Summary

### Must Create (Phase 5C Scope)

| # | Feature | Type | Effort |
|---|---------|------|--------|
| 1 | Cancel button + confirmation dialog | UI | Small |
| 2 | Refund status display | UI | Small |
| 3 | Rating submission form | UI + API | Medium |
| 4 | Rating update trigger/function | DB | Small |
| 5 | Proof retrieval API | API | Small |
| 6 | Proof display section | UI | Small |
| 7 | Delivery proof storage bucket | Storage | Medium |

### Deferred (Not Phase 5C)

| # | Feature | Reason |
|---|---------|--------|
| 1 | Photo proof upload from rider | Requires storage bucket setup, rider UI changes |
| 2 | Proof image optimization | Enhancement, not MVP |
| 3 | Rating analytics | Enhancement, not MVP |
| 4 | Rating moderation | Enhancement, not MVP |

## 9. Product Decisions Required

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Photo proof storage | Create bucket now vs defer | Defer to Phase 5D — use recipient_confirmation only for MVP |
| Rating timing | Allow only for `delivered` orders | Enforce in API |
| Rating edit/deletion | Allow vs prevent | Prevent — ratings are immutable |
| Cancel confirmation | Require reason vs optional | Optional reason (API already supports) |
| Proof display format | Image vs text only | Text for MVP (recipient_name, notes) |

## 10. Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Phase 4A (complete_delivery) | ✅ Complete | Proof records exist |
| Phase 4C (cancel_order) | ✅ Complete | Cancellation works |
| Phase 4B (earnings) | ✅ Complete | No impact |
| Phase 5A (tracking) | ✅ Complete | Order detail page exists |
| Storage bucket | ❌ Not created | Blocks photo proof display |

## 11. Proposed Phase 5C Scope

### 5C-1: Customer Cancellation UX
- Add cancel button to order detail page (only for cancellable states)
- Add confirmation dialog with optional reason
- Call existing `/api/orders/[id]/cancel`
- Display refund status after cancellation
- **No backend changes needed**

### 5C-2: Rating System
- Add rating form for `delivered` orders
- Create `/api/orders/[id]/rating` endpoint
- Create PostgreSQL function to update `rider_profiles.rating`
- Enforce: only delivered orders, one rating per order
- **Requires: 1 new API, 1 new function**

### 5C-3: Proof Display
- Create `/api/orders/[id]/proof` endpoint
- Display proof info (recipient_name, notes, timestamp) on order detail
- Defer photo image display (no storage bucket)
- **Requires: 1 new API**

### 5C-4: Refund Status
- Display refund status on order detail page after cancellation
- Use existing `/api/orders/[id]/refund` endpoint
- **No backend changes needed**

## 12. Implementation Sequence

1. **5C-1:** Cancellation UX (UI only, no backend)
2. **5C-2:** Rating system (API + function + UI)
3. **5C-3:** Proof display (API + UI)
4. **5C-4:** Refund status (UI only)

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No storage bucket for photo proofs | MEDIUM | Defer photo proof, use recipient_confirmation |
| Rating function missing | LOW | Create simple function in migration |
| Proof retrieval API missing | LOW | Create simple API with RLS |
| Cancellation UX complexity | LOW | Simple button + dialog |

## 14. Recommendation

**GO — READY FOR ARCHITECTURE REVIEW**

All backend infrastructure exists. Phase 5C requires minimal new code: 2 small APIs, 1 database function, and 4 UI components. No architectural changes needed.

---

*Discovery completed: 2026-08-24*
*Repository verified: HEAD c70032d, working tree clean*
*No code was modified during discovery*
