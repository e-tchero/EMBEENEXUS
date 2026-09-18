# PHASE 5B — RIDER DASHBOARD DISCOVERY REPORT

## 1. Executive Summary

The rider backend is comprehensive. 22 API routes exist covering offers, delivery lifecycle, earnings, profile, verification, documents, vehicles, availability, and location. Services are well-structured with server-authoritative authorization.

**What exists:** Complete backend for all rider operations.
**What is missing:** `/rider/dashboard` page (does not exist), delivery history API, rider layout.

The rider dashboard is a UI-only feature consuming existing APIs. No new database objects are required. One small API gap exists (delivery history).

## 2. Repository Baseline

| Item | Value |
|------|-------|
| HEAD | `f92f354ece9aebb0f1234f1ababdb24b5ede251b` |
| Branch | `master` |
| Remote | `origin/master` synchronized |
| Working tree | Clean (only untracked Phase 5 docs) |
| Phase 1–5A | All commits intact |

## 3. Existing Rider API Inventory (22 Endpoints)

### Offers (4)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/riders/offers | rider | List pending offers |
| GET | /api/riders/offers/[id] | rider | Offer details |
| POST | /api/riders/offers/[id]/accept | rider | Accept offer |
| POST | /api/riders/offers/[id]/reject | rider | Reject offer |

### Active Delivery (8)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/riders/assignments/active | rider | Active assignment |
| GET | /api/riders/deliveries/[orderId] | rider | Delivery details |
| POST | /api/riders/deliveries/[orderId]/start | rider | Start delivery |
| POST | /api/riders/deliveries/[orderId]/arrive-pickup | rider | Arrive at pickup |
| POST | /api/riders/deliveries/[orderId]/confirm-pickup | rider | Confirm pickup |
| POST | /api/riders/deliveries/[orderId]/arrive-destination | rider | Arrive at destination |
| POST | /api/riders/deliveries/[orderId]/complete | rider | Complete with proof |
| POST | /api/riders/deliveries/[orderId]/cancel | rider | Cancel delivery |
| POST | /api/riders/deliveries/[orderId]/fail | rider | Report failure |

### Earnings (2)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/riders/earnings | rider | Paginated earnings history |
| GET | /api/riders/earnings/summary | rider | Earnings summary |

### Profile/Settings (8)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/riders/profile | rider | Rider profile |
| PATCH | /api/riders/profile | rider | Update profile |
| GET | /api/riders/verification-status | rider | Verification status |
| GET | /api/riders/documents | rider | List documents |
| POST | /api/riders/documents | rider | Submit document |
| GET | /api/riders/vehicles | rider | List vehicles |
| POST | /api/riders/vehicles | rider | Add vehicle |
| GET/PATCH | /api/riders/availability | rider | Online/offline toggle |
| POST | /api/riders/location | rider | Update GPS |
| GET | /api/riders/location | rider | Get current location |

## 4. Existing Rider Services

| Service | File | Responsibility |
|---------|------|----------------|
| RiderOfferService | rider-offer.service.ts | Offers, active assignment, accept/reject |
| ActiveDeliveryService | active-delivery.service.ts | Delivery lifecycle, transitions, completion |
| EarningsService | earnings.service.ts | Earnings history, summary |
| RiderService | rider.service.ts | Profile, documents, vehicles, verification |
| RiderLocationService | rider-location.service.ts | GPS updates, broadcast, stale detection |

## 5. Existing Rider Pages

| Page | Status | Purpose |
|------|--------|---------|
| /rider/register | ✅ EXISTS | Rider signup (2-step: account + vehicle) |
| /rider/onboarding | ✅ EXISTS | Document upload + verification status |
| /rider/dashboard | ❌ MISSING | Main dashboard (does not exist) |

## 6. Existing Rider UI Components

| Component | File | Purpose |
|-----------|------|---------|
| StatusBadge | shared/status-badge.tsx | Status label rendering (all order/rider states) |
| RiderCard | tracking/rider-card.tsx | Rider info display (customer-side) |

**No rider-specific dashboard components exist.**

## 7. Existing Customer UI Patterns

| Pattern | File | Notes |
|---------|------|-------|
| Dashboard layout | (dashboard)/layout.tsx | Server component, auth check, nav |
| Order list | (dashboard)/orders/page.tsx | Customer order history |
| Order detail | (dashboard)/orders/[id]/page.tsx | Full order view with tracking |
| Tracking components | tracking/*.tsx | Map, timeline, rider card |

The customer dashboard uses `(dashboard)` route group with server-side auth. The rider dashboard should follow a similar pattern under `/rider/`.

## 8. Missing Backend API: Delivery History

**Gap identified:** No API exists for rider delivery history (past completed deliveries).

The earnings API (`GET /api/riders/earnings`) provides a proxy — each earnings entry corresponds to a completed delivery with order_number, credit, debit, balance_after, and created_at. This is sufficient for MVP delivery history display.

**Alternative:** Query `rider_assignments` with status='completed' + joined order data. But this would require a new API endpoint.

**Recommendation for MVP:** Use earnings history as the delivery history source. Each entry contains order_number, amounts, and timestamps. This avoids creating a new API. If a dedicated delivery history is needed later, it can be added without disrupting the dashboard.

## 9. Security Findings

### Authorization Model
All rider APIs derive identity from `auth.uid()`. No client-supplied rider_id is trusted for authorization. The SECURITY DEFINER functions (`transition_order_status`, `complete_delivery`, `cancel_order`, `fail_delivery`) handle all state transitions server-side.

### No Issues Found
- ✅ All 22 APIs authenticate via `supabase.auth.getUser()`
- ✅ Offer queries filter by `rider_id = user.id`
- ✅ Delivery transitions use SECURITY DEFINER functions
- ✅ Earnings filter by `rider_id = user.id`
- ✅ Profile operations use `user.id`
- ✅ No cross-rider data exposure possible

### Dashboard Authorization
The rider dashboard will be at `/rider/dashboard`. No route-level auth exists (unlike customer `(dashboard)` group). The dashboard page must:
- Check authentication server-side
- Redirect unauthenticated users to `/rider/register` or `/login`
- Use `createClient()` from `@/lib/supabase/server`

## 10. Realtime/Broadcast

The existing `rider-location.service.ts` broadcasts rider GPS via Supabase channels:
- Channel: `delivery:{order_id}`
- Used by: Customer tracking (Phase 5A)

For the rider dashboard, realtime is needed for:
- **New offers:** When dispatch sends an offer to the rider
- **Offer expiration:** When an offer expires
- **Assignment updates:** When order status changes during active delivery

The existing broadcast mechanism (`rider-location.service.ts`) handles rider→customer GPS. For rider-side updates, polling is the simplest approach consistent with the existing architecture. The rider can poll offers/active-delivery every few seconds. Alternatively, Supabase Realtime subscriptions on `rider_assignments` and `orders` tables can be used since RLS already restricts data access.

**Recommendation:** Use Supabase Realtime subscriptions on `rider_assignments` and `orders` tables for the rider dashboard. This is consistent with the existing architecture (Phase 5A customer tracking already uses broadcast). RLS ensures riders only see their own assignments.

## 11. API Gap Analysis

| Feature | Existing API | Gap |
|---------|-------------|-----|
| Pending offers | GET /api/riders/offers | None |
| Accept/reject | POST /api/riders/offers/[id]/accept\|reject | None |
| Active delivery | GET /api/riders/assignments/active | None |
| Delivery details | GET /api/riders/deliveries/[orderId] | None |
| Delivery actions | POST .../start, arrive-pickup, etc. | None |
| Availability | GET/PATCH /api/riders/availability | None |
| Earnings summary | GET /api/riders/earnings/summary | None |
| Earnings history | GET /api/riders/earnings | None |
| Delivery history | None | **Use earnings as proxy (MVP)** |
| Rider profile | GET /api/riders/profile | None |
| Verification status | GET /api/riders/verification-status | None |

## 12. Dependencies

| Dependency | Required | Status |
|------------|----------|--------|
| mapbox-gl | Yes (for rider map) | Already installed in Phase 5A |
| @types/mapbox-gl | Yes | Already installed in Phase 5A |
| No new npm packages needed | — | — |

## 13. Database Objects

No new database objects are required for Phase 5B. All needed data is accessible through existing tables:
- `rider_assignments` — offers, active assignment, delivery history
- `orders` — order details, status, pickup/destination
- `rider_profiles` — profile, verification status
- `rider_vehicles` — vehicle info
- `rider_documents` — submitted documents
- `rider_current_locations` — availability state
- `earnings_ledger` — earnings data
- `order_events` — delivery event history

## 14. Proposed Phase 5B Scope

### Pages
1. `/rider/dashboard` — Main dashboard page with tab-based navigation

### Components
1. `rider-dashboard.tsx` — Main dashboard client component
2. `availability-toggle.tsx` — Online/offline switch
3. `offer-card.tsx` — Incoming offer display with countdown
4. `active-delivery-panel.tsx` — Current delivery with action buttons
5. `earnings-panel.tsx` — Earnings summary + history
6. `rider-layout.tsx` — Layout with auth check + nav

### Routes
- `/rider/dashboard` — Main dashboard (client component)
- `/rider/dashboard/earnings` — Detailed earnings view (optional, can be a tab)

### No New APIs Required
All 22 existing APIs cover the dashboard needs.

## 15. Implementation Sequence

### Step 1: Rider Layout + Auth
Create `/rider/layout.tsx` with server-side auth check, nav, and role verification.

### Step 2: Dashboard Page
Create `/rider/dashboard/page.tsx` as the main entry point.

### Step 3: Core Components
Build in order:
1. `availability-toggle.tsx`
2. `offer-card.tsx` (with countdown)
3. `active-delivery-panel.tsx` (with state progression)
4. `earnings-panel.tsx`

### Step 4: Dashboard Assembly
Combine components into `rider-dashboard.tsx` with:
- Priority: Active delivery > Incoming offers > Availability > Earnings
- Tab or section-based layout
- Mobile-responsive

### Step 5: Testing
- Auth/authorization tests
- Component behavior tests
- API integration tests
- Regression tests

## 16. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No delivery history API | LOW | Use earnings as proxy for MVP |
| Rider auth not in route group | MEDIUM | Implement server-side auth in layout |
| Offer countdown timer | LOW | Client-side countdown using expires_at |
| Mobile responsiveness | MEDIUM | Use Tailwind responsive utilities consistently |

## 17. Recommendation

**GO — READY FOR ARCHITECTURE REVIEW**

All backend infrastructure exists. The dashboard is pure UI consuming existing APIs. No database changes, no new APIs, no new dependencies. The only gap (delivery history) is covered by the earnings API for MVP.

---

*Discovery completed: 2026-08-24*
*Repository verified: HEAD f92f354, working tree clean*
*No code was modified during discovery*
