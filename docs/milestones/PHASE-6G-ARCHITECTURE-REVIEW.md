# Phase 6G Architecture Review

## 1. Architecture Summary

Phase 6G addresses 6 verified gaps from the Phase 6G Discovery. The scope is narrow, presentation-focused, and does not alter business logic, database, APIs, authentication, or authorization.

| # | Scope Item | Priority | Backend | Database | Dependencies |
|---|-----------|----------|---------|----------|-------------|
| 1 | Fix `.env.example` for Stadia Maps | CRITICAL | NONE | NONE | NONE |
| 2 | Complete gray-class migration (56 occurrences, 12 files) | HIGH | NONE | NONE | NONE |
| 3 | Tracking map: actual road route | HIGH | NONE | NONE | NONE |
| 4 | MapsProvider autocomplete interface | HIGH | NONE | NONE | NONE |
| 5 | NAVIGATION constants cleanup | HIGH | NONE | NONE | NONE |
| 6 | Admin sidebar correction | MEDIUM | NONE | NONE | NONE |

**Total: ZERO backend, ZERO database, ZERO API, ZERO dependency changes.**

## 2. Per-File Decisions

### 2.1 `.env.example` (CRITICAL)

**Current:** References `MAPS_PROVIDER=mapbox` and `MAPBOX_ACCESS_TOKEN`.

**Change:** Update to reflect current Stadia Maps implementation.

```
# Maps (Stadia Maps — default provider)
MAPS_PROVIDER=stadia
STADIA_MAPS_API_KEY=your_stadia_maps_api_key
# Legacy: MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
```

**No NEXT_PUBLIC_ prefix for STADIA_MAPS_API_KEY.**

### 2.2 Gray Class Migration (HIGH — 12 files, 56 occurrences)

**Decision: Migrate ALL 56 gray classes.** No exceptions for "intentional" uses.

Rationale: The brand system defines `embee-slate` (#64748B) as the neutral gray equivalent. Using `gray-*` alongside `embee-*` creates visual inconsistency. The brand system is authoritative.

#### Token Migration Map

| Source | Target | Files Affected |
|--------|--------|----------------|
| `border-gray-100` | `border-embee-slate/10` | `page.tsx` (1) |
| `border-gray-200` | `border-embee-slate/20` | `page.tsx` (1), `login/page.tsx` (2), `signup/page.tsx` (4), `create-address-form.tsx` (7), `booking-form.tsx` (6), `quote-display.tsx` (1), `cancel-order-button.tsx` (2), `rating-form.tsx` (1), `app-nav.tsx` (1), `mobile-nav.tsx` (2) |
| `border-gray-300` | `border-embee-slate/30` | `create-address-form.tsx` (1) |
| `bg-gray-100` | `bg-embee-slate/10` | `status-badge.tsx` (3) |
| `bg-gray-200` | `bg-embee-slate/20` | `order-timeline.tsx` (2) |
| `bg-gray-600` | `bg-embee-slate/60` | `page.tsx` (1) |
| `hover:bg-gray-50` | `hover:bg-embee-white` | `page.tsx` (1), `booking-form.tsx` (1) |
| `hover:bg-gray-100` | `hover:bg-embee-slate/10` | `app-nav.tsx` (1), `mobile-nav.tsx` (2) |
| `text-gray-300` | `text-embee-slate/60` | `page.tsx` (5) |
| `text-gray-400` | `text-embee-slate/50` | `page.tsx` (5) |
| `text-gray-500` | `text-embee-slate/70` | `page.tsx` (2) |
| `text-gray-600` | `text-embee-slate/80` | `page.tsx` (1) |
| `text-gray-800` | `text-embee-charcoal` | `status-badge.tsx` (3) |
| `placeholder-gray-400` | `placeholder-embee-slate/50` | `login/page.tsx` (2), `signup/page.tsx` (4) |

#### Semantic Color Exceptions (NOT migrated)

These are **excluded** from migration:

| Color | Usage | Reason |
|-------|-------|--------|
| `yellow-100/800` | Pending status | Semantic status |
| `blue-100/800` | Under review, searching, in transit | Semantic status |
| `green-100/800` | Approved, paid, delivered | Semantic status |
| `red-100/800/50/200/300/600/700` | Rejected, cancelled, error, destructive | Semantic status |
| `indigo-100/800` | Rider assigned, en route | Semantic status |
| `purple-100/800` | Arrived at pickup, picked up | Semantic status |
| `orange-100/800` | Disputed | Semantic status |
| `text-yellow-400` | Filled star (rating) | Semantic icon |
| `text-gray-300` (rating star) | Unfilled star | Semantic icon — will migrate to `text-embee-slate/40` |

### 2.3 Tracking Map: Actual Road Route (HIGH)

**Current behavior:** TrackingMap draws a straight `LineString` between pickup and destination.

**Problem:** Customers expect to see the actual road path, not a straight line.

**Architecture Decision: Backend-calculated route geometry, passed as prop.**

#### Why Backend-Calculated?

1. **Security:** MapsProvider API key stays server-side. The client never calls routing APIs directly.
2. **Cost control:** Route calculated once at booking/dispatch time, not on every GPS update.
3. **Consistency:** Route geometry matches the pricing/distance already calculated by QuoteService.
4. **Provider-agnostic:** Backend uses MapsProvider abstraction. Client doesn't know which provider.

#### Route Calculation Lifecycle

| Event | Action | API Calls |
|-------|--------|-----------|
| **Quote created** | `QuoteService.generateQuote()` already calls `MapsProvider.getRoute()` which returns `polyline` | 1 (already happening) |
| **Order confirmed** | Store `route_polyline` on the order record (decode the polyline to GeoJSON coordinates) | 0 (reuse quote data) |
| **TrackingMap renders** | Read `route_polyline` from order data, render as GeoJSON LineString | 0 |
| **GPS updates** | Update rider marker position only. Do NOT recalculate route. | 0 |
| **Rider significantly deviates** | Optional: recalculate route. Defer to future phase. | 0 (MVP) |

#### Implementation Plan

**Step 1: Extend RouteResult to include decoded coordinates**

The current `RouteResult` has `polyline?: string` (encoded polyline string). For MapLibre rendering, we need decoded `[lng, lat]` coordinate arrays. Add a `coordinates` field:

```typescript
// lib/maps/types.ts
export interface RouteResult {
  distance_km: number;
  duration_minutes: number;
  polyline?: string;
  coordinates?: [number, number][];  // Decoded route coordinates for map rendering
}
```

**Step 2: Decode polyline in StadiaMapsProvider**

Stadia Maps returns Valhalla-encoded polylines. Add a `decodePolyline()` utility and populate `coordinates` in `getRoute()`.

**Step 3: Store route coordinates on order**

When an order is created (after quote acceptance + payment), store the route coordinates. The order table already has `distance_km` and `estimated_duration_minutes`. Add a `route_geometry` JSONB column to store the decoded coordinates.

**CRITICAL: This is the only database change in Phase 6G.**

```sql
ALTER TABLE orders ADD COLUMN route_geometry jsonb;
```

This stores the `[lng, lat]` coordinate array from the quote/route calculation. It is written once at order creation and read by TrackingMap.

**Step 4: Pass route_geometry to TrackingMap**

The `OrderTracking` component already receives the full order data. The `route_geometry` field will be included automatically. TrackingMap receives it as a new optional prop.

**Step 5: Render actual road route in TrackingMap**

Replace the straight-line `LineString` with the actual route geometry coordinates.

#### When NOT to Recalculate

- GPS updates: NEVER recalculate. Just update rider marker position.
- Status changes: NEVER recalculate. Route is pickup→destination, independent of status.
- Deviation detection: DEFERRED. The MVP shows the planned route. Deviation-aware rerouting is a future enhancement.

#### Polyline Decoding

Valhalla polyline encoding is different from Google's. We need a decoder utility. This is a pure mathematical function with zero external dependencies.

### 2.4 MapsProvider Autocomplete Interface (HIGH)

**Current:** `StadiaMapsProvider` implements `autocomplete()` but the `MapsProvider` interface doesn't declare it.

**Decision:** Add `autocomplete` to the `MapsProvider` interface as an optional method.

```typescript
// lib/maps/types.ts
export interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(
    query: string,
    location?: { lat: number; lon: number }
  ): Promise<GeocodingResult[]>;
  getRoute(
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number }
  ): Promise<RouteResult>;
  autocomplete?(
    query: string,
    location?: { lat: number; lon: number }
  ): Promise<GeocodingResult[]>;
}
```

Making it optional (`autocomplete?`) means:
- Stadia provider implements it ✅
- Mapbox provider doesn't need to (legacy) ✅
- Google provider can add it later ✅
- UI code can check `if (provider.autocomplete)` before calling ✅

**Note:** The autocomplete API will NOT be exposed to the client in Phase 6G. This phase only fixes the interface. Actual address search UI is deferred to a future phase (requires client-side MapsProvider exposure architecture).

### 2.5 NAVIGATION Constants Cleanup (HIGH)

**Current:** `NAVIGATION` in `constants.ts` defines 10 routes that don't exist as pages:

```
Customer: /deliveries/new, /deliveries, /profile (3 dead)
Rider: /rider/jobs, /rider/earnings, /rider/profile (3 dead)
Admin: /admin/orders, /admin/customers, /admin/pricing, /admin/analytics (4 dead)
```

**Verified:** The `NAVIGATION` constant is **never imported or used** anywhere in the codebase. It is 100% dead code.

**Decision:** Remove the `NAVIGATION` constant entirely. Replace with accurate route references based on actual existing pages:

```typescript
// Accurate routes based on actual page.tsx files
export const ROUTES = {
  customer: {
    dashboard: '/dashboard',
    addresses: '/addresses',
    orders: '/orders',
    orderDetail: (id: string) => `/orders/${id}`,
  },
  rider: {
    register: '/rider/register',
    onboarding: '/rider/onboarding',
    dashboard: '/rider/dashboard',
  },
  admin: {
    dashboard: '/admin/dashboard',
    riders: '/admin/riders',
    riderDetail: (id: string) => `/admin/riders/${id}`,
  },
  auth: {
    login: '/login',
    signup: '/signup',
    signout: '/auth/signout',
  },
} as const;
```

This provides accurate, type-safe route references without dead code.

### 2.6 Admin Sidebar Correction (MEDIUM)

**Current:** Admin sidebar shows only Dashboard and Riders. The `NAVIGATION` constant defined 6 admin routes but 4 don't exist.

**Decision:** Keep the sidebar as-is (Dashboard + Riders only). These are the only admin pages that actually exist. Do NOT add placeholder links to non-existent pages.

**No change needed** to the admin sidebar component. The fix to `constants.ts` (removing dead NAVIGATION) resolves the inconsistency.

## 3. Mapping Architecture

### Provider Abstraction (Preserved)

```
UI Components → never call Maps APIs directly
                ↓
QuoteService → getMapsProvider().getRoute() → route geometry + pricing
                ↓
MapsProvider interface → StadiaMapsProvider / MapboxProvider / GoogleMapsProvider
                ↓
APIs → server-side only, STADIA_MAPS_API_KEY never exposed to client
```

### Route Geometry Flow

```
1. Customer requests quote
   → QuoteService.generateQuote()
   → MapsProvider.getRoute()
   → Returns: distance_km, duration_minutes, polyline, coordinates
   → Stored on delivery_quotes table

2. Customer accepts quote → order created
   → Route coordinates stored on orders.route_geometry (JSONB)
   → Written ONCE

3. Customer views tracking
   → OrderTracking receives order data (includes route_geometry)
   → TrackingMap receives route_geometry as prop
   → Renders actual road route from coordinates
   → Zero additional API calls

4. Rider GPS updates
   → Rider marker moves on the map
   → Route line stays static (planned route)
   → Zero routing API calls
```

### Cost Impact

| Scenario | Current | After Phase 6G |
|----------|---------|----------------|
| Quote generation | 1 routing call (20 credits) | Same |
| Order creation | 0 | 0 |
| Tracking map render | 0 (straight line) | 0 (stored geometry) |
| GPS update | 0 | 0 |
| **Total per order** | **20 credits** | **20 credits** |

No additional mapping API costs.

## 4. Tracking Route Architecture

### Route Geometry Storage

Add `route_geometry` column to `orders` table:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_geometry jsonb;
```

**Type:** `jsonb` storing `[lng, lat][]` coordinate array.

**Why JSONB:** Flexible, queryable, no additional table needed. PostGIS would be ideal but adds complexity. JSONB is sufficient for storing a coordinate array.

**Write path:** Order creation service stores the coordinates from the quote's route calculation.

**Read path:** `OrderTracking` component receives the full order object, passes `route_geometry` to `TrackingMap`.

### TrackingMap Prop Interface Change

```typescript
interface TrackingMapProps {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  riderLat?: number | null;
  riderLng?: number | null;
  riderHeading?: number | null;
  status: string;
  routeGeometry?: [number, number][] | null;  // NEW: actual road coordinates
}
```

### Rendering Logic

```
if (routeGeometry && routeGeometry.length > 0) {
  // Render actual road route from stored coordinates
  renderLineString(routeGeometry);
} else {
  // Fallback: straight line between pickup and destination
  renderLineString([[pickupLng, pickupLat], [destinationLng, destinationLat]]);
}
```

The fallback preserves backward compatibility for orders created before this column was added.

## 5. Autocomplete Interface Design

### Interface Addition

```typescript
// lib/maps/types.ts — addition to MapsProvider
autocomplete?(
  query: string,
  location?: { lat: number; lon: number }
): Promise<GeocodingResult[]>;
```

### Provider Implementations

| Provider | autocomplete() | Fallback |
|----------|---------------|----------|
| StadiaMapsProvider | ✅ Implemented (1 credit/request) | — |
| MapboxProvider | ❌ Not implemented | `searchAddresses()` |
| GoogleMapsProvider | ❌ Not implemented | `searchAddresses()` |

### UI Consumption (Deferred)

Phase 6G only fixes the interface. The actual address search/autocomplete UI is deferred because it requires:
- Client-side MapsProvider exposure (currently server-only)
- New API route for autocomplete proxy
- UI component for search-as-you-type

This is a separate architectural decision.

## 6. Route Recalculation Strategy

| Scenario | Recalculate? | Reason |
|----------|-------------|--------|
| Quote created | YES (once) | Pricing needs distance/duration |
| Order confirmed | NO (reuse quote data) | Route already calculated |
| Tracking map loads | NO (use stored geometry) | Zero API cost |
| Rider GPS update | NO | Route is pickup→destination, not rider→destination |
| Rider deviates significantly | DEFERRED | Future enhancement |
| Road conditions change | DEFERRED | Future enhancement |

**MVP rule: Route calculated ONCE at quote time, stored, and never recalculated.**

## 7. API/Request-Efficiency Strategy

### Current API Call Budget Per Order

| Call | Credits | When |
|------|---------|------|
| Routing (getRoute) | 20 | Quote generation |
| Forward geocoding (if used) | 20 | Address selection |
| **Total** | **20–40** | Per order |

### After Phase 6G

No change. Route geometry is stored from the existing routing call. No additional API calls needed.

### Autocomplete (Future)

When address search UI is implemented:
- Typing phase: autocomplete endpoint (1 credit/request)
- Selection confirmation: forward geocoding (20 credits/request)
- Estimated 3–5 autocomplete requests per address search = 3–5 credits

## 8. Brand Token Migration Map

### Files to Modify (12)

| File | Gray Occurrences | Change Type |
|------|-----------------|-------------|
| `apps/web/app/page.tsx` | 17 | Full token migration |
| `apps/web/app/login/page.tsx` | 2 | Border + placeholder |
| `apps/web/app/signup/page.tsx` | 4 | Border + placeholder |
| `apps/web/components/addresses/create-address-form.tsx` | 8 | Border |
| `apps/web/components/booking/booking-form.tsx` | 7 | Border |
| `apps/web/components/booking/quote-display.tsx` | 1 | Border |
| `apps/web/components/order/cancel-order-button.tsx` | 2 | Border |
| `apps/web/components/order/rating-form.tsx` | 3 | Border + text |
| `apps/web/components/shared/app-nav.tsx` | 3 | Border + hover |
| `apps/web/components/shared/mobile-nav.tsx` | 4 | Border + hover |
| `apps/web/components/tracking/order-timeline.tsx` | 2 | bg |
| `apps/web/components/ui/status-badge.tsx` | 3 | bg + text |

### Semantic Status Colors Preserved

All `yellow-*`, `blue-*`, `green-*`, `red-*`, `indigo-*`, `purple-*`, `orange-*` classes used for status indicators remain unchanged.

The only `text-gray-300` in `rating-form.tsx` (unfilled star) migrates to `text-embee-slate/40`.

## 9. NAVIGATION Cleanup Decisions

| Current Constant | Status | Action |
|-----------------|--------|--------|
| `NAVIGATION.customer` | Dead code | Remove entirely |
| `NAVIGATION.rider` | Dead code | Remove entirely |
| `NAVIGATION.admin` | Dead code | Remove entirely |
| `APP_NAME` | Used | Keep |
| `APP_DESCRIPTION` | Used | Keep |
| `APP_URL` | Used | Keep |

Replace with `ROUTES` object containing only actual existing routes.

## 10. Admin Sidebar Decision

**No change required.** The admin sidebar correctly shows only Dashboard and Riders — the only admin pages that exist. The inconsistency was in `constants.ts` (dead code), not in the sidebar.

## 11. Security Analysis

| Check | Result |
|-------|--------|
| API keys in client bundles | ✅ NONE — STADIA_MAPS_API_KEY remains server-only |
| NEXT_PUBLIC_STADIA_MAPS_API_KEY | ✅ DOES NOT EXIST |
| RLS weakened | ✅ NO — no database policy changes |
| Authentication changed | ✅ NO |
| Authorization changed | ✅ NO |
| New IDOR surface | ✅ NO — route_geometry is order-scoped, read through existing auth |
| Database schema change | ⚠️ ONE: `orders.route_geometry` JSONB column added |
| MapsProvider abstraction preserved | ✅ YES |
| Provider-agnostic routing | ✅ YES |
| No direct Stadia API calls in UI | ✅ YES |

## 12. Scope Boundaries

### IN SCOPE

| # | Item | Files |
|---|------|-------|
| 1 | Fix `.env.example` | `apps/web/.env.example` |
| 2 | Gray-class migration (56 occurrences) | 12 files (listed above) |
| 3 | Tracking map road route | `tracking-map.tsx`, `order-tracking.tsx`, `types.ts`, `stadia.ts` |
| 4 | MapsProvider autocomplete interface | `lib/maps/types.ts` |
| 5 | NAVIGATION constants cleanup | `lib/constants.ts` |
| 6 | Add route_geometry column | `supabase/migrations/` (new migration) |
| 7 | Store route_geometry on order creation | `lib/services/order.service.ts` or quote acceptance flow |

### EXPLICITLY NOT IN SCOPE

| Item | Reason |
|------|--------|
| Address search/autocomplete UI | Requires client-side MapsProvider architecture — separate phase |
| Notification system | Separate milestone |
| Rate limiting | Separate milestone |
| Error tracking (Sentry) | Separate milestone |
| React error boundaries | Separate milestone |
| ETA refinement | Depends on route geometry, defer |
| Deviation detection/rerouting | Future enhancement |
| Admin dashboard expansion | Future milestone |
| Redis/observability | Future milestone |

## 13. Files to Modify

| File | Change |
|------|--------|
| `apps/web/.env.example` | Update Maps section for Stadia |
| `apps/web/lib/maps/types.ts` | Add `autocomplete?` method, add `coordinates` to RouteResult |
| `apps/web/lib/maps/stadia.ts` | Decode polyline to coordinates, implement autocomplete in interface |
| `apps/web/components/tracking/tracking-map.tsx` | Accept + render routeGeometry prop |
| `apps/web/components/tracking/order-tracking.tsx` | Pass route_geometry to TrackingMap |
| `apps/web/lib/constants.ts` | Replace NAVIGATION with ROUTES |
| `apps/web/app/page.tsx` | Migrate 17 gray classes |
| `apps/web/app/login/page.tsx` | Migrate 2 gray classes |
| `apps/web/app/signup/page.tsx` | Migrate 4 gray classes |
| `apps/web/components/addresses/create-address-form.tsx` | Migrate 8 gray classes |
| `apps/web/components/booking/booking-form.tsx` | Migrate 7 gray classes |
| `apps/web/components/booking/quote-display.tsx` | Migrate 1 gray class |
| `apps/web/components/order/cancel-order-button.tsx` | Migrate 2 gray classes |
| `apps/web/components/order/rating-form.tsx` | Migrate 3 gray classes |
| `apps/web/components/shared/app-nav.tsx` | Migrate 3 gray classes |
| `apps/web/components/shared/mobile-nav.tsx` | Migrate 4 gray classes |
| `apps/web/components/tracking/order-timeline.tsx` | Migrate 2 gray classes |
| `apps/web/components/ui/status-badge.tsx` | Migrate 3 gray classes |
| `supabase/migrations/YYYYMMDDHHMMSS_phase6g_route_geometry.sql` | Add route_geometry column |

## 14. Files Explicitly NOT to Modify

| File | Reason |
|------|--------|
| Any API route | No API changes |
| Any service besides order creation | No business logic changes |
| Any database function/trigger/RLS | No security changes |
| Any auth middleware | No auth changes |
| `lib/maps/mapbox.ts` | Legacy fallback, untouched |
| `lib/maps/google-maps.ts` | Future provider, untouched |
| `lib/maps/index.ts` | Factory already correct |
| Any admin component | No admin changes beyond constants |
| `package.json` | No dependency changes |

## 15. Verification Plan

| Check | Expected |
|-------|----------|
| Typecheck | PASS — zero errors |
| Unit tests | 407/407 PASS (or higher if route geometry tests added) |
| Production build | PASS |
| Secrets scan | CLEAN |
| Attribution scan | ZERO |
| Gray class scan | ZERO remaining (excluding semantic status colors) |
| MBEENEXUS scan | ZERO |
| MapsProvider abstraction | Preserved |
| Route-based pricing | Untouched |
| GPS throttling | Untouched |
| Browser: tracking map shows road route | VERIFIED |
| Browser: gray classes removed from all 12 files | VERIFIED |
| Browser: admin sidebar unchanged | VERIFIED |
| Browser: homepage brand tokens correct | VERIFIED |

## 16. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Polyline decoding inaccuracy | Low | Medium | Use proven Valhalla decoder, test with known coordinates |
| route_geometry NULL for old orders | Medium | Low | TrackingMap falls back to straight line |
| Valhalla polyline format differs from expected | Low | Medium | Verify against Stadia Maps documentation |
| Gray class migration breaks layout | Low | Low | Token equivalents are visually similar |
| NAVIGATION removal breaks something | Very Low | Low | Verified: constant is never imported |

## 17. Implementation Sequence

1. **Fix `.env.example`** (CRITICAL, 5 min)
2. **Add `autocomplete?` to MapsProvider interface** (HIGH, 10 min)
3. **Add `coordinates` to RouteResult, decode polyline in StadiaMapsProvider** (HIGH, 30 min)
4. **Create migration for `orders.route_geometry`** (HIGH, 10 min)
5. **Store route_geometry on order creation** (HIGH, 20 min)
6. **Update TrackingMap to render actual route** (HIGH, 30 min)
7. **Update OrderTracking to pass route_geometry** (HIGH, 10 min)
8. **Replace NAVIGATION with ROUTES in constants.ts** (HIGH, 10 min)
9. **Migrate gray classes across 12 files** (HIGH, 45 min)
10. **Run typecheck, tests, build, scans** (30 min)
11. **Browser verification** (20 min)

**Total estimated effort: ~3 hours**

## 18. Final Recommendation

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

Phase 6G is safe to implement. The scope is narrow, well-defined, and verified against the actual repository. The single database change (adding a JSONB column) is additive and non-destructive. All other changes are presentation-layer or interface-level. No business logic, security, or authorization is affected.
