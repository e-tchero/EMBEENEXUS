# Phase 6G Implementation Report

## Summary

Phase 6G completed the approved remediation: fixed `.env.example`, completed 56 gray-class migrations across 12 files, upgraded TrackingMap to render actual road routes, extended MapsProvider with autocomplete interface, cleaned up dead NAVIGATION constants, and added route_geometry storage.

## Files Modified (19)

| File | Change |
|------|--------|
| `.env.example` | Updated Maps section for Stadia Maps (removed Mapbox) |
| `apps/web/lib/maps/types.ts` | Added `coordinates` to RouteResult, added optional `autocomplete` to MapsProvider |
| `apps/web/lib/maps/stadia.ts` | Added Valhalla polyline decoder, populate `coordinates` in `getRoute()` |
| `apps/web/lib/services/order.service.ts` | Calculate and store `route_geometry` on order creation |
| `apps/web/components/tracking/tracking-map.tsx` | Accept `routeGeometry` prop, render actual road route |
| `apps/web/components/tracking/order-tracking.tsx` | Pass `route_geometry` from order data to TrackingMap |
| `apps/web/lib/constants.ts` | Replaced dead `NAVIGATION` with accurate `ROUTES` object |
| `apps/web/app/page.tsx` | Migrated 17 gray classes to embee tokens |
| `apps/web/app/login/page.tsx` | Migrated 2 gray classes |
| `apps/web/app/signup/page.tsx` | Migrated 4 gray classes |
| `apps/web/components/addresses/create-address-form.tsx` | Migrated 8 gray classes |
| `apps/web/components/booking/booking-form.tsx` | Migrated 7 gray classes |
| `apps/web/components/booking/quote-display.tsx` | Migrated 1 gray class |
| `apps/web/components/order/cancel-order-button.tsx` | Migrated 2 gray classes |
| `apps/web/components/order/rating-form.tsx` | Migrated 3 gray classes |
| `apps/web/components/shared/app-nav.tsx` | Migrated 3 gray classes |
| `apps/web/components/shared/mobile-nav.tsx` | Migrated 4 gray classes |
| `apps/web/components/tracking/order-timeline.tsx` | Migrated 2 gray classes |
| `apps/web/components/ui/status-badge.tsx` | Migrated 3 gray classes |

## Files Created (3)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260827010000_phase6g_route_geometry.sql` | Add `route_geometry` JSONB column to orders table |
| `docs/milestones/PHASE-6G-DISCOVERY-REPORT.md` | Discovery report |
| `docs/milestones/PHASE-6G-ARCHITECTURE-REVIEW.md` | Architecture review |

## Diff Statistics

```
19 files changed, 175 insertions(+), 94 deletions(-)
```

## Database Changes

| Change | Type |
|--------|------|
| `orders.route_geometry` JSONB column | Additive, nullable |

## API Changes

**NONE.** No existing API contracts were modified.

## Business Logic Changes

| Area | Impact |
|------|--------|
| Order creation | Now calculates and stores route_geometry (one additional MapsProvider call per order) |
| Tracking map | Renders actual road route from stored geometry instead of straight line |
| All other areas | ZERO changes |

## MapsProvider Interface

| Method | Status |
|--------|--------|
| `geocode()` | Unchanged |
| `reverseGeocode()` | Unchanged |
| `searchAddresses()` | Unchanged |
| `getRoute()` | Extended: now returns `coordinates` field |
| `autocomplete()` | NEW: optional method, implemented by StadiaMapsProvider |

## Route Geometry Lifecycle

1. **Order creation:** `OrderService.createOrder()` calls `MapsProvider.getRoute()` and stores decoded coordinates as `route_geometry` JSONB
2. **Tracking map:** `TrackingMap` receives `routeGeometry` prop and renders actual road route
3. **GPS updates:** Rider marker moves, route line stays static (zero API calls)
4. **Fallback:** If `route_geometry` is NULL (old orders), TrackingMap renders straight line

## Gray Class Migration

| Result | Count |
|--------|-------|
| Gray classes before | 56 |
| Gray classes after | **0** |
| Semantic status colors preserved | ✅ All yellow/blue/green/red/indigo/purple/orange |

## Verification Results

| Check | Result |
|-------|--------|
| Typecheck | ✅ PASS — 3/3 packages, zero errors |
| Unit tests | ✅ **407/407 PASS** |
| Production build | ✅ PASS |
| Secrets scan | ✅ CLEAN |
| Attribution scan | ✅ ZERO |
| MBEENEXUS scan | ✅ ZERO (source only) |
| Remaining gray classes | ✅ **ZERO** |
| Mapbox references (source) | ✅ Only in legacy `mapbox.ts` provider |
| NEXT_PUBLIC_STADIA exposure | ✅ **ZERO** |
| Migration created | ✅ 1 additive JSONB column |
| MapsProvider interface | ✅ Preserved + extended |
| Route-based pricing | ✅ Untouched |
| GPS throttling | ✅ Untouched |
| Phase 1–6F | ✅ Untouched |

## Scope Audit

| Category | Impact |
|----------|--------|
| Database | ONE additive column (`orders.route_geometry`) |
| Migrations | ONE new file |
| APIs | ZERO |
| Dependencies | ZERO |
| Security/auth | ZERO |
| Business logic | ONE change (order creation stores route_geometry) |
| Pricing | ZERO |
| Payment | ZERO |
| Dispatch | ZERO |
| Rider workflow | ZERO |
| Admin | ZERO |
| Customer workflow | ZERO |

## Git Status

| Field | Value |
|-------|-------|
| HEAD | `8970fac` (unchanged — not committed yet) |
| Modified | 19 files |
| Untracked | 3 files (2 docs + 1 migration) |
| Insertions | 175 |
| Deletions | 94 |
| Phase 1–6F | ✅ Untouched |
| Author | ETCHERO |
