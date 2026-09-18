# PHASE 5 ARCHITECTURE REVIEW

**Date:** August 24, 2026
**Status:** ARCHITECTURE REVIEW COMPLETE
**Recommendation:** GO — READY FOR IMPLEMENTATION AUTHORIZATION

---

## 1. EXECUTIVE SUMMARY

Phase 5 is UI/frontend work consuming existing backend APIs. The backend is comprehensive through Phase 4D. No new database tables, PostgreSQL functions, or API routes are required for the core scope.

**Key architecture decisions:**
- Customer tracking uses Supabase Realtime Broadcast (already implemented in rider-location.service.ts)
- Rider dashboard consumes existing offer/delivery/earnings APIs
- Maps rendering uses Mapbox GL JS (client-side, separate from server-side MapsProvider)
- All state is server-authoritative; UI reflects backend state

---

## 2. EXISTING UI ARCHITECTURE

### Application Routes

| Route | Type | Auth | Description |
|-------|------|------|-------------|
| `/` | Page | No | Landing page with links |
| `/login` | Page | No | Customer/rider login |
| `/signup` | Page | No | Customer signup |
| `/dashboard` | Page | Yes (layout) | Customer dashboard with booking |
| `/dashboard/orders` | Page | Yes (layout) | Customer order list |
| `/dashboard/orders/[id]` | Page | Yes (server) | Order detail (basic) |
| `/dashboard/addresses` | Page | Yes (layout) | Address management |
| `/rider/register` | Page | No | Rider registration |
| `/rider/onboarding` | Page | Client auth | Rider document upload |

### Layout Structure

```
RootLayout (no auth)
├── / (landing)
├── /login, /signup
├── /rider/register, /rider/onboarding
└── (dashboard) — requires auth via layout
    ├── /dashboard
    ├── /dashboard/orders
    ├── /dashboard/orders/[id]
    └── /dashboard/addresses
```

### Existing Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BookingForm` | `components/booking/booking-form.tsx` | Order creation form |
| `QuoteDisplay` | `components/booking/quote-display.tsx` | Quote result display |
| `AddressList` | `components/addresses/address-list.tsx` | Address management |
| `CreateAddressButton` | `components/addresses/create-address-button.tsx` | Add address |
| `CreateAddressForm` | `components/addresses/create-address-form.tsx` | Address form |

### Design System

- **Framework:** Tailwind CSS
- **Components:** Custom (no shadcn/ui installed despite being mentioned)
- **Colors:** Primary blue (`text-primary`, `bg-primary-500`)
- **Patterns:** Card-based layouts, rounded shadows, responsive grid
- **Mobile:** Basic responsive (sm: breakpoints)

### Supabase Client

- **Server:** `createClient()` from `@/lib/supabase/server` (uses cookies)
- **Browser:** `createBrowserClient()` from `@/lib/supabase/client`
- **Service Role:** `createServiceRoleClient()` for privileged operations

---

## 3. BACKEND → FRONTEND CONTRACT MAP

### Phase 5A: Customer Tracking

```
Customer Tracking UI
→ GET /api/orders/[id] (existing) — order details, status, rider info
→ Supabase Realtime channel: delivery:{order_id} (existing broadcast)
→ rider-current-locations table (RLS-protected)
```

| Contract | Details |
|----------|---------|
| **Order data** | `GET /api/orders/[id]` → order with status, timestamps, rider info |
| **Rider location** | Realtime broadcast `rider-location` event on `delivery:{order_id}` |
| **Broadcast payload** | `{ rider_id, latitude, longitude, heading, speed, accuracy, recorded_at }` |
| **RLS** | Customer can read orders where `customer_id = auth.uid()` |
| **Realtime auth** | Supabase channel authorization via `auth.uid()` |

**Backend gaps: NONE** — broadcast already works. Customer just subscribes.

### Phase 5B: Rider Dashboard

```
Rider Dashboard
→ GET /api/riders/offers (existing) — list offers
→ POST /api/riders/offers/[id]/accept (existing) — accept offer
→ POST /api/riders/offers/[id]/reject (existing) — reject offer
→ GET /api/riders/assignments/active (existing) — active assignment
→ GET /api/riders/deliveries/[orderId] (existing) — delivery details
→ POST /api/riders/deliveries/[orderId]/start (existing)
→ POST /api/riders/deliveries/[orderId]/arrive-pickup (existing)
→ POST /api/riders/deliveries/[orderId]/confirm-pickup (existing)
→ POST /api/riders/deliveries/[orderId]/arrive-destination (existing)
→ POST /api/riders/deliveries/[orderId]/complete (existing)
→ POST /api/riders/deliveries/[orderId]/cancel (existing)
→ POST /api/riders/deliveries/[orderId]/fail (existing)
→ GET /api/riders/earnings (existing) — earnings history
→ GET /api/riders/earnings/summary (existing) — earnings totals
→ PUT /api/riders/availability (existing) — toggle availability
→ PUT /api/riders/location (existing) — GPS updates
→ GET /api/riders/profile (existing) — rider profile
```

**Backend gaps: NONE** — all APIs exist.

### Phase 5C: Customer Enhancements

```
Cancel Order
→ POST /api/orders/[id]/cancel (existing)

Rating
→ ratings table exists (DB)
→ NO API exists for creating ratings
→ NEEDS: POST /api/orders/[id]/rating (NEW — backend gap)

Proof Viewing
→ delivery_proofs table exists (DB)
→ customer delivery proof access via RLS
→ NEEDS: API to fetch proofs for an order (NEW — backend gap)
```

**Backend gaps: 2**
1. **Rating API** — `POST /api/orders/[id]/rating` (create rating after delivery)
2. **Proof retrieval** — `GET /api/orders/[id]/proofs` (fetch delivery proofs for customer)

### Phase 5D: Admin Verification

```
Admin Verification
→ GET /api/riders/verification-status (existing, rider-facing)
→ riders_documents table exists (DB)
→ rider_verification_history table exists (DB)
→ NEEDS: Admin API to list pending riders (NEW — backend gap)
→ NEEDS: Admin API to approve/reject documents (NEW — backend gap)
```

**Backend gaps: 2**
1. **Admin rider list** — `GET /api/admin/riders` (list riders with verification status)
2. **Admin verification action** — `POST /api/admin/riders/[id]/verify` (approve/reject)

---

## 4. PHASE 5A ARCHITECTURE — CUSTOMER TRACKING

### Screen Design

```
┌─────────────────────────────────────────┐
│ ← Order ORD-20260824-0001              │
│ Status: In Transit                      │
├─────────────────────────────────────────┤
│                                         │
│         ┌───────────────────┐           │
│         │                   │           │
│         │    MAP BOX        │           │
│         │   (rider icon)    │           │
│         │                   │           │
│         │         📍        │           │
│         │      (pickup)     │           │
│         │                   │           │
│         │              🏁   │           │
│         │         (dest)    │           │
│         │                   │           │
│         └───────────────────┘           │
│                                         │
├─────────────────────────────────────────┤
│ Rider: Adebayo K.  ★ 4.8              │
│ Motorcycle • ABC-123-DE                 │
│ ETA: 12 minutes                         │
├─────────────────────────────────────────┤
│ ● Order placed           10:30 AM      │
│ ● Rider assigned         10:32 AM      │
│ ● Rider heading to pickup 10:33 AM     │
│ ○ Arrived at pickup                     │
│ ○ Picked up                             │
│ ○ In transit                            │
│ ○ Delivered                             │
├─────────────────────────────────────────┤
│ [Cancel Order]                          │
└─────────────────────────────────────────┘
```

### Realtime Architecture

1. Customer opens order detail page for active order
2. Client creates Supabase browser client
3. Client subscribes to `delivery:{order_id}` channel
4. Channel listens for `rider-location` broadcast events
5. On event: update rider marker position on Mapbox GL JS map
6. On disconnect: show "Reconnecting..." banner, attempt reconnection
7. On page leave: unsubscribe from channel

### Map Integration

- **Server-side MapsProvider:** Geocoding/routing only (existing)
- **Client-side Mapbox GL JS:** Map rendering, markers, routes
- **Token:** Mapbox public token from env vars
- **Marker:** Custom rider icon at broadcast coordinates
- **Route:** Polyline from pickup to destination (from order coordinates)
- **Fallback:** If Mapbox GL JS fails to load, show text-based status

### Data Flow

```
1. Page loads → GET /api/orders/[id] → render order details
2. If order status is tracking-active:
   a. Subscribe to delivery:{order_id}
   b. Render Mapbox map centered on pickup coordinates
   c. Show pickup/destination markers
3. On rider-location broadcast:
   a. Update rider marker position
   b. Recalculate ETA (simple: distance / average_speed)
   c. Update status if event indicates state change
4. On order status change (poll or separate subscription):
   a. Update status badge
   b. Update timeline
   c. If delivered: show proof, rating prompt
```

### State Handling

| Order Status | UI State |
|-------------|----------|
| `searching_rider` | "Finding a rider..." animation |
| `rider_assigned` | "Rider is on the way" + ETA |
| `rider_en_route_to_pickup` | Map with rider moving toward pickup |
| `arrived_at_pickup` | "Rider has arrived at pickup" |
| `picked_up` | "Package picked up" + route to destination |
| `in_transit` | Map with rider moving toward destination |
| `arrived_at_destination` | "Rider has arrived" |
| `delivered` | "Delivered" + proof + rating prompt |
| `completed` | "Completed" + rating |
| `cancelled` | "Cancelled" + refund info |
| `failed` | "Delivery failed" + support link |

---

## 5. PHASE 5B ARCHITECTURE — RIDER DASHBOARD

### Screen Design

```
┌─────────────────────────────────────────┐
│ MBEENEXUS Rider              [Online ●] │
├─────────────────────────────────────────┤
│                                         │
│ ┌─ Active Delivery ──────────────────┐  │
│ │ Order #ORD-20260824-0001          │  │
│ │ Status: Heading to pickup          │  │
│ │ ETA: 8 min                         │  │
│ │                                    │  │
│ │ [Start] [Arrive] [Pickup]         │  │
│ │ [Arrive Dest] [Complete]          │  │
│ │ [Fail] [Cancel]                   │  │
│ └────────────────────────────────────┘  │
│                                         │
│ ┌─ Incoming Offers ─────────────────┐  │
│ │ Order #ORD-20260824-0002          │  │
│ │ 2.3 km • ₦2,500 • 15 min        │  │
│ │ [Accept] [Reject]                 │  │
│ │ ⏱ 0:25 remaining                  │  │
│ └────────────────────────────────────┘  │
│                                         │
│ ┌─ Today's Earnings ────────────────┐  │
│ │ ₦12,500  •  3 deliveries         │  │
│ │ [View History]                     │  │
│ └────────────────────────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│ [Dashboard] [History] [Earnings] [Profile]│
└─────────────────────────────────────────┘
```

### Tab Structure

| Tab | Content | APIs |
|-----|---------|------|
| Dashboard | Active delivery + offers + earnings summary | offers, assignments, earnings/summary |
| History | Past deliveries | orders (filtered) |
| Earnings | Earnings history + totals | earnings, earnings/summary |
| Profile | Vehicle, documents, verification | profile, vehicles, documents, verification-status |

### Offer Countdown

- Offer has `expires_at` timestamp
- Client displays countdown timer
- On expiry: offer disappears from list (server handles via OFFER_TIMEOUT job)
- Client does NOT need to poll — just shows countdown

### Delivery Workflow Buttons

Buttons change based on current status:

| Status | Available Actions |
|--------|-------------------|
| `rider_assigned` | Start, Cancel |
| `rider_en_route_to_pickup` | Arrive Pickup, Cancel |
| `arrived_at_pickup` | Confirm Pickup, Cancel |
| `picked_up` | Arrive Destination, Fail |
| `in_transit` | Arrive Destination, Fail |
| `arrived_at_destination` | Complete |

### Location Sharing

- Rider dashboard periodically calls `PUT /api/riders/location` with GPS coordinates
- Existing throttling in rider-location.service.ts handles frequency
- Existing broadcast mechanism sends to customer tracking channel

---

## 6. PHASE 5C ARCHITECTURE — CUSTOMER ENHANCEMENTS

### Cancel Button

- Show on order detail page when status allows cancellation
- Valid states: `paid`, `searching_rider`, `rider_assigned`, `rider_en_route_to_pickup`, `arrived_at_pickup`
- Calls existing `POST /api/orders/[id]/cancel`
- Confirmation dialog before cancel
- Show refund status after cancellation

### Rating System (Requires Backend)

**Gap:** No rating API exists.

**Required new API:**
```
POST /api/orders/[id]/rating
Body: { rating: 1-5, comment?: string }
Auth: customer who owns the order
Validation: order must be 'completed' or 'delivered'
Idempotency: UNIQUE(order_id, customer_id) already exists
```

**Required new service:** None — simple insert with authorization check.

### Proof Viewing (Requires Backend)

**Gap:** No API to fetch proofs for a customer's order.

**Required new API:**
```
GET /api/orders/[id]/proofs
Auth: customer who owns the order
Response: delivery_proofs records for this order
RLS: delivery_proofs_select_customer already enforces this
```

---

## 7. PHASE 5D ARCHITECTURE — ADMIN VERIFICATION

### Admin Authorization

- Admin role checked via `get_user_role()` SECURITY DEFINER function
- Admin pages must verify role server-side before rendering
- No client-side role checks as authorization

### Verification Queue

```
GET /api/admin/riders?status=pending
→ List riders with pending verification
→ Include document references
→ Pagination

POST /api/admin/riders/[id]/verify
Body: { action: 'approve' | 'reject', reason?: string }
→ Updates rider_profiles.verification_status
→ Records in rider_verification_history
→ Idempotent
```

**Backend gaps: 2 new APIs required.**

---

## 8. REALTIME ARCHITECTURE

### Existing Broadcast (Already Working)

```
rider-location.service.ts
→ Checks if rider has active order
→ Broadcasts to channel: delivery:{order_id}
→ Event: rider-location
→ Payload: { rider_id, latitude, longitude, heading, speed, accuracy, recorded_at }
```

### Customer Subscription (New UI, No Backend Change)

```typescript
const supabase = createBrowserClient();
const channel = supabase.channel(`delivery:${orderId}`);

channel.on('broadcast', { event: 'rider-location' }, (payload) => {
  // Update map marker position
  updateRiderMarker(payload.payload.latitude, payload.payload.longitude);
});

channel.subscribe();
```

### Authorization

- Supabase Realtime channels use the authenticated user's JWT
- RLS on `rider_current_locations` ensures customer can only see their order's rider
- Channel name `delivery:{order_id}` is predictable but RLS protects the data

### Fallback

- If Realtime connection fails: poll `GET /api/orders/[id]` every 10 seconds
- Show "Reconnecting..." banner during disconnection
- Graceful degradation to text-based status

---

## 9. AUTHENTICATION/AUTHORIZATION MODEL

### Customer

| Action | Auth Method | Enforcement |
|--------|-------------|-------------|
| View own orders | `supabase.auth.getUser()` + RLS | API + DB |
| Track own order | Realtime channel + RLS | Supabase |
| Cancel own order | `getUser()` + order ownership check | API |
| Rate own order | `getUser()` + order ownership check | API |
| View own proofs | RLS `delivery_proofs_select_customer` | DB |

### Rider

| Action | Auth Method | Enforcement |
|--------|-------------|-------------|
| View offers | `getUser()` + RLS `rider_assignments_select_own` | API + DB |
| Accept/reject | `getUser()` + assignment ownership | API |
| Manage delivery | `getUser()` + `assigned_rider_id` check | API |
| View earnings | `getUser()` + RLS | API + DB |
| Update location | `getUser()` + RLS | API + DB |

### Admin

| Action | Auth Method | Enforcement |
|--------|-------------|-------------|
| View riders | `getUser()` + `has_role('admin')` | API |
| Verify rider | `getUser()` + `has_role('admin')` | API |

---

## 10. RESPONSIVE/UI ARCHITECTURE

### Breakpoints

- Mobile: < 640px (primary for rider dashboard)
- Tablet: 640px - 1024px
- Desktop: > 1024px (primary for customer dashboard, admin)

### Component Reuse

| Existing | Reuse In |
|----------|----------|
| `BookingForm` | Customer dashboard (no change) |
| `QuoteDisplay` | Customer dashboard (no change) |
| `AddressList` | Customer dashboard (no change) |
| Status badge pattern | All new pages |
| Card-based layout | All new pages |

### New Components Required

| Component | Phase | Purpose |
|-----------|-------|---------|
| `TrackingMap` | 5A | Mapbox GL JS map with rider marker |
| `OrderTimeline` | 5A/5C | Status timeline with events |
| `StatusBadge` | All | Reusable status indicator |
| `RiderCard` | 5A | Rider info display |
| `OfferCard` | 5B | Incoming offer with countdown |
| `DeliveryWorkflow` | 5B | Action buttons for active delivery |
| `EarningsSummary` | 5B | Earnings display |
| `RatingForm` | 5C | Post-delivery rating |
| `CancelDialog` | 5C | Cancellation confirmation |
| `VerificationQueue` | 5D | Admin rider list |
| `DocumentViewer` | 5D | Admin document review |

---

## 11. SECURITY REVIEW

### Customer

| Risk | Mitigation | Status |
|------|-----------|--------|
| View another customer's order | RLS `customer_id = auth.uid()` | ✅ Protected |
| Access another rider's location | RLS + channel auth | ✅ Protected |
| Access unauthorized proofs | RLS `delivery_proofs_select_customer` | ✅ Protected |
| Manipulate order status | SECURITY DEFINER functions | ✅ Protected |

### Rider

| Risk | Mitigation | Status |
|------|-----------|--------|
| View another rider's earnings | RLS `rider_id = auth.uid()` | ✅ Protected |
| Accept another rider's offer | `accept_rider_offer()` ownership check | ✅ Protected |
| Access unauthorized customer data | RLS + API ownership checks | ✅ Protected |
| Bypass delivery transitions | `transition_order_status()` enforcement | ✅ Protected |

### Admin

| Risk | Mitigation | Status |
|------|-----------|--------|
| Non-admin access | `has_role('admin')` check | ✅ Protected |
| Client-side role check bypass | Server-side role verification | ✅ Protected |

### No New Security Risks Identified

Phase 5 consumes existing secured APIs. No new attack surface.

---

## 12. BACKEND DEPENDENCY REVIEW

| Feature | Existing API | Existing DB | Existing Realtime | Backend Gap |
|---------|-------------|-------------|-------------------|-------------|
| Customer tracking | ✅ | ✅ | ✅ Broadcast works | NONE |
| Rider dashboard | ✅ All 15+ APIs | ✅ | N/A | NONE |
| Cancel order | ✅ | ✅ | N/A | NONE |
| Rating | ❌ No API | ✅ Table exists | N/A | **POST /api/orders/[id]/rating** |
| Proof viewing | ❌ No API | ✅ Table exists | N/A | **GET /api/orders/[id]/proofs** |
| Admin verification | ❌ No API | ✅ Tables exist | N/A | **GET/POST /api/admin/riders** |

**Summary:** 3 new API routes required (rating, proof retrieval, admin verification). All are simple CRUD with existing database support.

---

## 13. COMPONENT ARCHITECTURE

```
apps/web/
├── app/
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx          (modify — add active order card)
│   │   ├── orders/
│   │   │   ├── page.tsx                (modify — add tracking link)
│   │   │   └── [id]/page.tsx           (modify — add tracking map, cancel, rating)
│   │   └── addresses/page.tsx          (no change)
│   ├── rider/
│   │   ├── dashboard/page.tsx          (NEW — rider main dashboard)
│   │   ├── dashboard/offers/page.tsx   (NEW — offers list)
│   │   ├── dashboard/deliveries/[id]/page.tsx (NEW — active delivery)
│   │   ├── dashboard/earnings/page.tsx (NEW — earnings history)
│   │   ├── dashboard/profile/page.tsx  (NEW — profile management)
│   │   ├── register/page.tsx           (no change)
│   │   └── onboarding/page.tsx         (no change)
│   └── admin/
│       ├── layout.tsx                  (NEW — admin layout with role check)
│       └── riders/page.tsx             (NEW — verification queue)
├── components/
│   ├── tracking/
│   │   ├── tracking-map.tsx            (NEW — Mapbox GL JS)
│   │   ├── rider-card.tsx              (NEW — rider info)
│   │   └── order-timeline.tsx          (NEW — status timeline)
│   ├── rider/
│   │   ├── offer-card.tsx              (NEW — offer with countdown)
│   │   ├── delivery-workflow.tsx       (NEW — action buttons)
│   │   └── earnings-summary.tsx        (NEW — earnings display)
│   ├── customer/
│   │   ├── cancel-dialog.tsx           (NEW — cancel confirmation)
│   │   ├── rating-form.tsx             (NEW — post-delivery rating)
│   │   └── proof-viewer.tsx            (NEW — delivery proof display)
│   └── admin/
│       ├── verification-queue.tsx      (NEW — rider list)
│       └── document-viewer.tsx         (NEW — document review)
└── lib/
    ├── maps/                           (no change — server-side only)
    ├── supabase/                       (no change)
    └── services/                       (no change)
```

---

## 14. DATA-FETCHING STRATEGY

| Pattern | Use Case |
|---------|----------|
| Server Component | Initial page data (order details, earnings summary) |
| Client `fetch()` | Real-time updates, mutations (accept/reject/complete) |
| Supabase Realtime | Rider location broadcast |
| SWR/React Query | Not installed — use plain `fetch` + `useState` |

**Decision:** Keep data-fetching simple with `fetch` + `useState`/`useEffect`. No new dependencies.

---

## 15. ERROR/LOADING STRATEGY

| State | Customer | Rider |
|-------|----------|-------|
| Loading | Skeleton/spinner | Skeleton/spinner |
| Empty | "No active orders" | "No offers available" |
| Error | Toast + retry | Toast + retry |
| Offline | "Reconnecting..." banner | "Offline — location not sharing" |
| Unauthorized | Redirect to login | Redirect to login |

---

## 16. TESTING STRATEGY

### Unit Tests (existing test infrastructure)

- Component rendering (if test setup allows)
- API contract validation
- State transition logic

### Integration Tests

- Customer can view own order tracking
- Customer cannot view another customer's tracking
- Rider can see own offers
- Rider can accept/reject
- Admin can verify riders
- Rating creation works
- Proof retrieval works

### Manual Testing

- Realtime connection on mobile
- Map rendering across browsers
- Offline/reconnection behavior
- Offer countdown accuracy

---

## 17. IMPLEMENTATION SEQUENCE

### Phase 5A: Customer Tracking (Highest Impact)

**Prerequisites:** None — all backend ready

| Step | Files | Description |
|------|-------|-------------|
| 1 | `components/tracking/tracking-map.tsx` | Mapbox GL JS map component |
| 2 | `components/tracking/rider-card.tsx` | Rider info display |
| 3 | `components/tracking/order-timeline.tsx` | Status timeline |
| 4 | `app/(dashboard)/orders/[id]/page.tsx` | Modify — add tracking section |
| 5 | Tests | Tracking integration tests |

### Phase 5B: Rider Dashboard

**Prerequisites:** None — all backend ready

| Step | Files | Description |
|------|-------|-------------|
| 1 | `app/rider/dashboard/layout.tsx` | Rider dashboard layout |
| 2 | `app/rider/dashboard/page.tsx` | Main dashboard |
| 3 | `components/rider/offer-card.tsx` | Offer with countdown |
| 4 | `components/rider/delivery-workflow.tsx` | Action buttons |
| 5 | `app/rider/dashboard/earnings/page.tsx` | Earnings history |
| 6 | `app/rider/dashboard/profile/page.tsx` | Profile management |
| 7 | Tests | Dashboard integration tests |

### Phase 5C: Customer Enhancements

**Prerequisites:** None for cancel/proof. Rating needs backend API.

| Step | Files | Description |
|------|-------|-------------|
| 1 | `components/customer/cancel-dialog.tsx` | Cancel confirmation |
| 2 | `components/customer/proof-viewer.tsx` | Proof display |
| 3 | `app/api/orders/[id]/rating/route.ts` | **NEW API** — rating creation |
| 4 | `components/customer/rating-form.tsx` | Rating UI |
| 5 | Modify order detail page | Add cancel, rating, proof |
| 6 | Tests | Enhancement tests |

### Phase 5D: Admin Verification

**Prerequisites:** None for UI. Backend APIs needed.

| Step | Files | Description |
|------|-------|-------------|
| 1 | `app/admin/layout.tsx` | Admin layout with role check |
| 2 | `app/api/admin/riders/route.ts` | **NEW API** — rider list |
| 3 | `app/api/admin/riders/[id]/verify/route.ts` | **NEW API** — verify action |
| 4 | `app/admin/riders/page.tsx` | Verification queue UI |
| 5 | `components/admin/verification-queue.tsx` | Queue component |
| 6 | `components/admin/document-viewer.tsx` | Document review |
| 7 | Tests | Admin tests |

---

## 18. ACCEPTANCE CRITERIA

### Phase 5A

- [ ] Customer sees map with rider location during active delivery
- [ ] Rider position updates in real-time via broadcast
- [ ] Order status timeline shows all events
- [ ] Customer can see rider name, vehicle, rating
- [ ] ETA is displayed and updates
- [ ] Map gracefully falls back if Mapbox fails
- [ ] Realtime subscription cleans up on page leave

### Phase 5B

- [ ] Rider sees incoming offers with countdown
- [ ] Rider can accept/reject offers
- [ ] Rider sees active delivery with workflow buttons
- [ ] Buttons change based on delivery status
- [ ] Rider can complete delivery workflow
- [ ] Rider sees earnings summary and history
- [ ] Rider can manage profile/vehicle
- [ ] Availability toggle works

### Phase 5C

- [ ] Customer can cancel order with confirmation
- [ ] Cancel button only shows for eligible statuses
- [ ] Refund status displayed after cancellation
- [ ] Customer can rate after delivery (1-5 stars)
- [ ] Rating is idempotent (one per order)
- [ ] Customer can view delivery proof

### Phase 5D

- [ ] Admin can see pending verification queue
- [ ] Admin can view submitted documents
- [ ] Admin can approve/reject with reason
- [ ] Non-admin cannot access admin pages
- [ ] Verification history is recorded

---

## 19. RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mapbox GL JS bundle size | Medium | Low | Dynamic import, lazy loading |
| Realtime connection on mobile | Medium | Medium | Polling fallback |
| Offer countdown sync | Low | Low | Server timestamp authority |
| Admin role escalation | Low | Critical | Server-side role check |
| Map rendering on low-end devices | Medium | Medium | Simplified view fallback |

---

## 20. RECOMMENDATION

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

The architecture is straightforward. Phase 5 consumes existing APIs with minimal new backend work (3 simple API routes). The realtime tracking infrastructure already exists. The UI work is well-scoped and follows existing project conventions.

**Scope summary:**
- Phase 5A: Customer tracking (0 backend gaps)
- Phase 5B: Rider dashboard (0 backend gaps)
- Phase 5C: Customer enhancements (2 small backend APIs)
- Phase 5D: Admin verification (2 small backend APIs)
