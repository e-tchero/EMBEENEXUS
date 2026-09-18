# PHASE 5B — RIDER DASHBOARD ARCHITECTURE REVIEW

## 1. Executive Summary

Phase 5B builds the Rider Dashboard — a single-page application under `/rider/dashboard` that consumes the existing 22 rider APIs. No new database objects, no new APIs, no new dependencies are required. The dashboard is pure UI.

The architecture follows the same patterns established in Phase 5A customer tracking:
- Server-side auth in layout
- Client components for interactivity
- Supabase client for realtime subscriptions
- Existing StatusBadge component for state display
- Tailwind CSS for responsive design

## 2. Existing UI Architecture

### Route Structure
```
/rider/register       — Rider signup (exists)
/rider/onboarding     — Document upload + verification (exists)
/rider/dashboard      — MAIN DASHBOARD (does not exist — creating this)
```

### Customer Dashboard Pattern (reference)
```
/(dashboard)/layout.tsx       — Server component, auth check, nav
/(dashboard)/orders/page.tsx  — Order list
/(dashboard)/orders/[id]/page.tsx — Order detail + tracking
```

The rider dashboard follows a similar pattern but under `/rider/` since riders are a distinct role with different navigation needs.

### Existing Components to Reuse
| Component | Source | Purpose |
|-----------|--------|---------|
| StatusBadge | shared/status-badge.tsx | All order/rider state labels |
| TrackingMap | tracking/tracking-map.tsx | Mapbox GL JS map rendering |
| OrderTimeline | tracking/order-timeline.tsx | Delivery event timeline |

## 3. Backend → Frontend Contract Map

### Dashboard Sections → APIs

| Dashboard Section | Primary API | Polling/Realtime | Fallback |
|-------------------|-------------|------------------|----------|
| Active Delivery | GET /api/riders/assignments/active | Poll 10s | Manual refresh |
| Pending Offers | GET /api/riders/offers | Poll 5s | Manual refresh |
| Availability | GET /api/riders/availability | On-demand | — |
| Earnings Summary | GET /api/riders/earnings/summary | On-demand | — |
| Earnings History | GET /api/riders/earnings?page=&limit= | On-demand | — |
| Profile | GET /api/riders/profile | On-demand | — |
| Verification | GET /api/riders/verification-status | On-demand | — |

### Delivery Actions → APIs

| Rider Action | API | Request Body | Response |
|-------------|-----|-------------|----------|
| Accept offer | POST /api/riders/offers/[id]/accept | — | { success, message } |
| Reject offer | POST /api/riders/offers/[id]/reject | { reason? } | { success, message } |
| Start delivery | POST /api/riders/deliveries/[orderId]/start | — | { success, message, status } |
| Arrive at pickup | POST /api/riders/deliveries/[orderId]/arrive-pickup | — | { success, message, status } |
| Confirm pickup | POST /api/riders/deliveries/[orderId]/confirm-pickup | — | { success, message, status } |
| Arrive at destination | POST /api/riders/deliveries/[orderId]/arrive-destination | — | { success, message, status } |
| Complete delivery | POST /api/riders/deliveries/[orderId]/complete | { proof_type, file_url?, recipient_name?, notes? } | { success, message, proof_id } |
| Cancel delivery | POST /api/riders/deliveries/[orderId]/cancel | { reason? } | { success, message } |
| Report failure | POST /api/riders/deliveries/[orderId]/fail | { failure_type, reason } | { success, message } |

## 4. Page & Component Architecture

### Route Layout
```
/rider/layout.tsx                  — Server component: auth check + rider nav
/rider/dashboard/page.tsx          — Server component: initial data fetch + client shell
/rider/dashboard/page.tsx renders: RiderDashboard client component
```

### Component Tree
```
RiderDashboard (client component)
├── DashboardHeader
│   ├── Rider name + verification badge
│   └── AvailabilityToggle
├── ActiveDeliverySection (conditional: has active assignment)
│   ├── ActiveDeliveryCard
│   │   ├── StatusBadge
│   │   ├── Delivery details (pickup → destination)
│   │   ├── Action buttons (based on current status)
│   │   └── DeliveryMap (TrackingMap reuse)
│   └── DeliveryProgressSteps
├── IncomingOffersSection (conditional: has pending offers)
│   └── OfferCard[] (with countdown timer)
│       ├── Pickup/destination info
│       ├── Distance + estimated duration
│       ├── Accept/Reject buttons
│       └── Expiration countdown
├── EarningsSection
│   ├── EarningsSummary (total, deliveries, pending)
│   └── EarningsHistory (recent entries)
└── EmptyState (when no active delivery + no offers)
    ├── Online status prompt
    └── "Waiting for deliveries" message
```

### Component Inventory

| Component | File | Type | Responsibility |
|-----------|------|------|----------------|
| RiderDashboard | rider/components/rider-dashboard.tsx | Client | Main orchestrator, state management, polling |
| AvailabilityToggle | rider/components/availability-toggle.tsx | Client | Online/offline switch with confirmation |
| OfferCard | rider/components/offer-card.tsx | Client | Single offer display with countdown |
| ActiveDeliveryCard | rider/components/active-delivery-card.tsx | Client | Active delivery with action buttons |
| DeliveryProgressSteps | rider/components/delivery-progress-steps.tsx | Client | Visual step indicator |
| EarningsPanel | rider/components/earnings-panel.tsx | Client | Summary + recent history |

## 5. Data Fetching Strategy

### Initial Load (Server Component)
The page server component fetches:
- Rider profile (GET /api/riders/profile)
- Verification status (GET /api/riders/verification-status)

If not authenticated → redirect to /rider/register
If not a rider → redirect to /
If verification_status !== 'approved' → show "account not approved" message

### Client-Side Polling
The RiderDashboard client component polls:

| Data | Endpoint | Interval | Condition |
|------|----------|----------|-----------|
| Active assignment | GET /api/riders/assignments/active | 10s | Always |
| Pending offers | GET /api/riders/offers | 5s | is_available === true |
| Availability | GET /api/riders/availability | On mount only | — |
| Earnings summary | GET /api/riders/earnings/summary | On mount + after completion | — |

### Polling Implementation
```typescript
// Use useEffect + setInterval pattern consistent with Phase 5A
// Clean up intervals on unmount
// Use AbortController for fetch cancellation
// Gracefully handle network errors (no crash, retry on next interval)
```

### Realtime (NOT used for dashboard)
The existing broadcast mechanism (rider-location.service.ts) is for rider→customer GPS only. The dashboard uses polling because:
- Rider-side events (new offers, status changes) are infrequent (every 5-10s is fine)
- Polling is simpler and more reliable for the rider's primary concerns
- Supabase Realtime on rider_assignments/orders tables could be added later if needed

## 6. State Management

### Client State (useState)
| State | Type | Source | Update Trigger |
|-------|------|--------|----------------|
| riderProfile | object | Server fetch | On mount |
| isAvailable | boolean | GET /availability | Toggle + poll |
| activeAssignment | object \| null | GET /assignments/active | Poll |
| pendingOffers | array | GET /offers | Poll |
| earningsSummary | object | GET /earnings/summary | On mount + after delivery |
| earningsHistory | array | GET /earnings | On mount + pagination |
| loading | boolean | — | Fetch states |
| error | string \| null | — | API errors |
| pollingEnabled | boolean | — | User preference |

### No External State Management
No Redux, Zustand, or Context needed. The dashboard is a self-contained page with local state. Server-provided data is authoritative.

## 7. Authorization Boundaries

### Server Component (layout)
- `createClient()` from `@/lib/supabase/server`
- `supabase.auth.getUser()` — must be authenticated
- `supabase.from('rider_profiles').select('id').eq('id', user.id)` — must be a rider
- Unauthenticated → redirect to `/rider/register`
- Non-rider → redirect to `/`
- Not approved → show "pending verification" (no dashboard access)

### Client Component (RiderDashboard)
- All API calls go through authenticated fetch (cookies maintained by Supabase client)
- Every existing API endpoint independently verifies `auth.uid()` server-side
- The client never sends rider_id — server derives identity from session
- Cross-rider data isolation enforced by RLS + API-level filtering

### IDOR Protection
- Rider A calling GET /api/riders/offers sees only Rider A's offers (RLS + service filter by rider_id)
- Rider A calling POST /api/riders/offers/[id]/accept with Rider B's offer ID → server rejects (rider_id mismatch)
- Rider A cannot access GET /api/riders/deliveries/[RiderB_orderId] → delivery not found (ownership check)

## 8. Offer Countdown Architecture

Each offer has an `expires_at` timestamp. The OfferCard component:
1. Receives `expires_at` from the API
2. Calculates remaining seconds: `Math.max(0, (new Date(expires_at).getTime() - Date.now()) / 1000)`
3. Renders a visual countdown (progress bar + seconds)
4. When countdown reaches 0, the offer is removed from the displayed list
5. Next poll cycle confirms the offer is no longer returned by the API
6. The `expires_at` is server-authoritative — client countdown is display-only

### Offer Lifecycle in Dashboard
```
New offer appears → countdown starts → rider accepts/rejects → offer removed
                                                ↓
                                        Countdown reaches 0 → offer expired → removed
```

## 9. Active Delivery Action Flow

### Status Progression
```
rider_assigned → rider_en_route_to_pickup → arrived_at_pickup → picked_up → in_transit → arrived_at_destination → delivered/completed
```

### Action Buttons by Status
| Order Status | Available Actions |
|-------------|-------------------|
| rider_assigned | "Start Delivery" → POST .../start |
| rider_en_route_to_pickup | "Arrived at Pickup" → POST .../arrive-pickup |
| arrived_at_pickup | "Confirm Pickup" → POST .../confirm-pickup |
| picked_up | "Start Transit" → POST .../start (transitions to in_transit) |
| in_transit | "Arrived at Destination" → POST .../arrive-destination |
| arrived_at_destination | "Complete Delivery" → POST .../complete (opens proof form) |
| Any active state | "Cancel" or "Report Failure" (secondary actions) |

### Delivery Completion Flow
1. Rider taps "Complete Delivery"
2. Modal/form appears requesting:
   - Proof type: photo (default) or recipient confirmation
   - For photo: camera/file upload
   - For recipient confirmation: recipient name
   - Optional: notes
3. Rider submits → POST /api/riders/deliveries/[orderId]/complete
4. On success → delivery marked complete → earnings created → UI refreshes
5. Active assignment disappears → earnings summary updates

## 10. Responsive Behavior

### Mobile (< 640px)
- Single column layout
- Full-width cards
- Bottom action buttons for delivery actions
- Offer cards stacked vertically
- Earnings section collapsible

### Tablet (640px — 1024px)
- Two-column layout possible
- Active delivery + offers side by side

### Desktop (> 1024px)
- Three-column possible: sidebar (earnings/profile) + main (delivery/offers) + map
- Or two-column: main content + map sidebar

### Design System
- Tailwind CSS responsive utilities (sm:, md:, lg:)
- Existing color palette: primary, gray scale, green/red/yellow/blue for status
- Existing component patterns: rounded-lg, shadow, bg-white cards
- No new design system components needed

## 11. Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| API returns 401 | Redirect to /rider/register |
| API returns 403 | Show "Access denied" message |
| API returns 404 | Show "Not found" state |
| API returns 500 | Show error toast, retry on next poll |
| Network offline | Show "Offline" banner, pause polling, resume on reconnect |
| Polling fails | Continue with stale data, retry next interval |
| Action fails (accept/reject/transition) | Show error message, allow retry |
| Action succeeds | Refresh relevant data, show success toast |

## 12. Testing Strategy

### Unit Tests
| Test | Component | Type |
|------|-----------|------|
| OfferCard renders countdown | offer-card | Rendering |
| OfferCard removes expired offers | offer-card | State |
| AvailabilityToggle calls correct API | availability-toggle | API |
| DeliveryProgressSteps shows correct step | delivery-progress-steps | Rendering |
| EarningsPanel formats currency | earnings-panel | Display |
| StatusBadge integration | rider-dashboard | Integration |

### Integration Tests
| Test | Type |
|------|------|
| Authenticated rider can load dashboard | API |
| Unauthenticated user is redirected | API |
| Non-rider user is redirected | API |
| Pending offers are displayed | API |
| Active delivery is displayed | API |
| Accept offer calls correct endpoint | API |
| Reject offer calls correct endpoint | API |
| Delivery transition calls correct endpoint | API |
| Earnings summary is displayed | API |
| Empty state is shown correctly | API |

### Regression Tests
| Test | Type |
|------|------|
| Existing 264 tests still pass | Regression |
| Phase 1-5A functionality unaffected | Regression |
| No new secrets/credentials introduced | Security |
| No AI attribution | Attribution |

## 13. Database Changes Required

**NONE.** All data is accessible through existing tables and APIs.

## 14. API Changes Required

**NONE.** All 22 existing rider APIs cover the dashboard needs. Delivery history is proxied through the earnings API for MVP.

## 15. New Dependencies

**NONE.** mapbox-gl was already added in Phase 5A. No additional packages needed.

## 16. Files to Create

| File | Purpose |
|------|---------|
| apps/web/app/rider/layout.tsx | Server layout with auth + nav |
| apps/web/app/rider/dashboard/page.tsx | Server page with initial data |
| apps/web/components/rider/rider-dashboard.tsx | Main client dashboard |
| apps/web/components/rider/availability-toggle.tsx | Online/offline toggle |
| apps/web/components/rider/offer-card.tsx | Single offer with countdown |
| apps/web/components/rider/active-delivery-card.tsx | Active delivery + actions |
| apps/web/components/rider/delivery-progress-steps.tsx | Visual step indicator |
| apps/web/components/rider/earnings-panel.tsx | Earnings summary + history |
| packages/shared/validators/rider-dashboard.test.ts | Tests |

## 17. Files to Modify

**NONE.** All changes are new files. No existing code is modified.

## 18. Implementation Sequence

### Step 1: Rider Layout + Auth Guard
Create `/rider/layout.tsx` with:
- Server-side auth check
- Rider role verification
- Navigation (Dashboard, Earnings, Profile links)
- Redirect unauthenticated/non-rider users

### Step 2: Dashboard Page Shell
Create `/rider/dashboard/page.tsx` with:
- Server-side initial data fetch
- Client component hydration boundary

### Step 3: Core Components
Build in dependency order:
1. `availability-toggle.tsx` — standalone, no deps
2. `offer-card.tsx` — standalone, no deps
3. `delivery-progress-steps.tsx` — standalone, no deps
4. `active-delivery-card.tsx` — uses StatusBadge, delivery-progress-steps
5. `earnings-panel.tsx` — standalone, no deps

### Step 4: Dashboard Assembly
Create `rider-dashboard.tsx` combining all components with:
- Polling logic
- State management
- Conditional rendering (active delivery > offers > empty state)
- Responsive layout

### Step 5: Testing
Write comprehensive tests covering:
- Auth flow
- Component rendering
- API integration
- Error states
- Empty states
- Regression

## 19. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| No dedicated delivery history API | LOW | Earnings API provides equivalent data for MVP |
| Offer countdown drift | LOW | Server-authoritative expires_at; client display-only |
| Polling overhead | LOW | 5-10s intervals, AbortController cleanup, stale-while-revalidate |
| Rider not approved but accessing dashboard | MEDIUM | Server layout checks verification_status |
| Mobile UX for delivery actions | MEDIUM | Responsive Tailwind, touch-friendly button sizes |

## 20. Product Decisions Confirmed

| Decision | Value | Source |
|----------|-------|--------|
| Delivery history source | Earnings API | Discovery |
| Polling vs realtime for dashboard | Polling | Architecture |
| Offer countdown display | Visual progress bar + seconds | UX pattern |
| Earnings display | Summary + paginated history | Existing API |
| Dashboard entry point | /rider/dashboard | Existing onboarding links to this |
| Verification gate | Must be approved to access dashboard | Security |

## 21. GO / NO-GO Recommendation

**GO — READY FOR IMPLEMENTATION**

All backend infrastructure exists. The dashboard is pure UI with no database changes, no new APIs, and no new dependencies. The architecture is consistent with established patterns. Authorization is server-enforced. The scope is well-bounded.

---

*Architecture review completed: 2026-08-24*
*Repository verified: HEAD f92f354, working tree clean*
*No code was modified during architecture review*
