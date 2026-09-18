# Phase 6G Discovery Report

## 1. Executive Summary

Phase 6G is a comprehensive repository audit after Phases 1–6F. The platform has a complete delivery lifecycle (booking → payment → dispatch → delivery → completion), rider workflow (registration → availability → offers → active delivery → earnings), and admin verification system. The Embee Nexus brand foundation is established (Phase 6A) and applied to core surfaces.

However, the brand rebrand is incomplete — **56 gray Tailwind classes remain** across 12 files that were supposed to be rebranded in Phases 6B/6C. The tracking map draws a straight line instead of using actual road routes. The booking form lacks address search/autocomplete. Several navigation constants reference non-existent routes. No notification infrastructure exists. No Redis rate limiting is implemented. The `.env.example` still references the old Mapbox configuration.

## 2. Baseline

| Field | Value |
|-------|-------|
| HEAD | `8970fac945db9cd85784da3d1a92e63814f11755` |
| Branch | `master` |
| Remote | `origin/master` |
| Working tree | Clean |

## 3. Completed Capabilities

### Verified Working

| Capability | Status |
|------------|--------|
| Customer auth (signup/login) | ✅ VERIFIED |
| Customer dashboard | ✅ VERIFIED |
| Address management (CRUD) | ✅ VERIFIED |
| Delivery booking flow | ✅ VERIFIED |
| Quote calculation (route-based) | ✅ VERIFIED |
| Paystack payment initialization | ✅ VERIFIED |
| Paystack webhook (idempotent) | ✅ VERIFIED |
| Order creation & lifecycle | ✅ VERIFIED |
| Background job processing (FOR UPDATE SKIP LOCKED) | ✅ VERIFIED |
| Dispatch (dispatch_rider_v2) | ✅ VERIFIED |
| Rider registration & onboarding | ✅ VERIFIED |
| Rider availability toggle | ✅ VERIFIED |
| Rider offer system (accept/reject with timeout) | ✅ VERIFIED |
| Active delivery workflow (6-step state machine) | ✅ VERIFIED |
| Rider GPS location updates (throttled) | ✅ VERIFIED |
| Real-time tracking (Supabase broadcast) | ✅ VERIFIED |
| Order cancellation | ✅ VERIFIED |
| Refund processing (Paystack API) | ✅ VERIFIED |
| Delivery proof (recipient confirmation) | ✅ VERIFIED |
| Rating system (1–5, server-authoritative) | ✅ VERIFIED |
| Admin rider verification (approve/reject) | ✅ VERIFIED |
| Admin verification history/audit | ✅ VERIFIED |
| Admin document verification | ✅ VERIFIED |
| Stadia Maps integration (geocoding, routing) | ✅ VERIFIED |
| MapLibre GL JS rendering | ✅ VERIFIED |
| MapsProvider abstraction | ✅ VERIFIED |
| Route-based pricing (QuoteService → MapsProvider) | ✅ VERIFIED |
| Haversine fallback (no Maps API key) | ✅ VERIFIED |
| Cron job endpoint (CRON_SECRET protected) | ✅ VERIFIED |
| Stale rider detection | ✅ VERIFIED |
| Brand token system (globals.css, tailwind.config) | ✅ VERIFIED |
| Manrope typography | ✅ VERIFIED |
| Shared UI components (Button, Card, Input, etc.) | ✅ VERIFIED |
| Canonical StatusBadge | ✅ VERIFIED |
| Mobile navigation | ✅ VERIFIED |
| Admin sidebar navigation | ✅ VERIFIED |

## 4. Remaining Gaps

### CRITICAL

| # | Finding | File | Impact |
|---|---------|------|--------|
| C1 | `.env.example` still references `MAPS_PROVIDER=mapbox` and `MAPBOX_ACCESS_TOKEN` — developers will configure the wrong provider | `apps/web/.env.example` | Developer confusion, broken mapping in new deployments |

### HIGH

| # | Finding | Files | Count |
|---|---------|-------|-------|
| H1 | **56 gray Tailwind classes remain** across 12 files — Phases 6B/6C rebrand incomplete | `page.tsx` (17), `login/page.tsx` (2), `signup/page.tsx` (4), `create-address-form.tsx` (8), `booking-form.tsx` (7), `quote-display.tsx` (1), `cancel-order-button.tsx` (2), `rating-form.tsx` (3), `app-nav.tsx` (3), `mobile-nav.tsx` (4), `order-timeline.tsx` (2), `status-badge.tsx` (3) | 56 |
| H2 | **Tracking map draws straight line** between pickup and destination — not actual road route. MapsProvider.getRoute() is available but not used by TrackingMap | `tracking-map.tsx` | 1 |
| H3 | **Booking form lacks address search/autocomplete** — users must pre-save addresses. Stadia Maps autocomplete API exists but is not exposed to the UI | `booking-form.tsx` | 1 |
| H4 | **NAVIGATION constants reference non-existent routes** — `/deliveries/new`, `/deliveries`, `/profile`, `/rider/jobs`, `/rider/earnings`, `/rider/profile`, `/admin/orders`, `/admin/customers`, `/admin/pricing`, `/admin/analytics` | `lib/constants.ts` | 10 routes |
| H5 | **No notification infrastructure** — email/SMS providers configured in .env.example but no notification code exists. No order confirmation, delivery update, or rider assignment notifications | System-wide | — |
| H6 | **No Redis rate limiting** — UPSTASH_REDIS_REST_URL configured in .env.example but no rate limiting middleware exists in the application | System-wide | — |
| H7 | **ETA calculation is approximate** — uses fixed multiplier (`duration * 0.5`) instead of real routing data from MapsProvider | `order-tracking.tsx` | 1 |

### MEDIUM

| # | Finding | File | Impact |
|---|---------|------|--------|
| M1 | **MapsProvider interface missing `autocomplete` method** — `StadiaMapsProvider` implements it but the interface doesn't expose it. Cannot call through the abstraction | `lib/maps/types.ts` | Interface incomplete |
| M2 | **`payment.service.ts` uses user-scoped client for `getPaymentByOrderId`** — queries payments without enforcing `customer_id` filter at the query level. RLS should protect but defense-in-depth is weaker | `payment.service.ts` | Security depth |
| M3 | **`status-badge.tsx` uses gray for draft/expired/fallback states** — these are semantic states but could use embee tokens for consistency | `status-badge.tsx` | Brand consistency |
| M4 | **Tracking map doesn't update route when rider location changes** — route is drawn once at load. No dynamic re-routing or path following | `tracking-map.tsx` | UX |
| M5 | **No error boundaries** — no React error boundary components exist for graceful error recovery | System-wide | Resilience |
| M6 | **Admin sidebar shows only Dashboard and Riders** — constants reference additional admin routes that don't exist | `admin-sidebar.tsx`, `constants.ts` | Navigation mismatch |

### LOW

| # | Finding | File | Impact |
|---|---------|------|--------|
| L1 | **Order tracking polling interval is 15 seconds** — could be more frequent for active deliveries | `order-tracking.tsx` | Timeliness |
| L2 | **Rider dashboard polls every 5 seconds** — reasonable but could benefit from Supabase realtime for offer notifications | `rider-dashboard.tsx` | Performance |
| L3 | **No structured logging** — console.log/console.error used throughout. No log levels, no structured output | System-wide | Observability |
| L4 | **No Sentry/error tracking integration** — listed in .env.example but not implemented | System-wide | Monitoring |
| L5 | **Missing `focus:ring-embee-blue` on some form inputs** — some use `focus:ring-1` or `focus:ring-primary` instead of the brand token | Various | Accessibility |

### EXTERNAL / MANUAL

| # | Finding | Action Required |
|---|---------|----------------|
| E1 | **Stadia Maps API key** — production deployment requires `STADIA_MAPS_API_KEY` | Manual: obtain from stadiamaps.com, configure in production env |
| E2 | **Stadia Maps domain authentication** — production domain must be added to Stadia dashboard | Manual: configure in Stadia Maps dashboard |
| E3 | **E/N monogram logo** — external asset dependency. Current interim wordmark is acceptable | Manual: founder supplies approved vector artwork |
| E4 | **Paystack production keys** — test keys in .env.example | Manual: obtain production keys from Paystack dashboard |
| E5 | **Supabase production project** — local dev uses localhost:54321 | Manual: configure production Supabase project |
| E6 | **Vercel Cron configuration** — cron endpoint needs external scheduler | Manual: configure Vercel Cron or external cron service to call `/api/cron/process-jobs` |

## 5. File-by-File Findings

### Homepage (`apps/web/app/page.tsx`)
- **17 gray classes** — `text-gray-300`, `text-gray-400`, `text-gray-500`, `text-gray-600`, `bg-gray-600`, `border-gray-100`, `border-gray-200`, `hover:bg-gray-50`
- These are on the dark Midnight Navy sections where gray-on-dark may be intentional for contrast, but should be audited against the brand system
- Many are in the footer and dark sections where `text-gray-300`/`text-gray-400` on dark backgrounds provide readability
- **Severity: HIGH** — Phase 6B homepage rebrand incomplete

### Login (`apps/web/app/login/page.tsx`)
- **2 occurrences**: `border-gray-200`, `placeholder-gray-400` on form inputs
- Should use `border-embee-slate/20` and `placeholder-embee-slate`
- **Severity: HIGH** — Phase 6C rebrand incomplete

### Signup (`apps/web/app/signup/page.tsx`)
- **4 occurrences**: same pattern as login — `border-gray-200`, `placeholder-gray-400`
- **Severity: HIGH** — Phase 6C rebrand incomplete

### Address Form (`apps/web/components/addresses/create-address-form.tsx`)
- **8 occurrences**: `border-gray-200` on all form inputs, `border-gray-300` on checkbox, `border-gray-200` on cancel button
- **Severity: HIGH** — Phase 6C rebrand incomplete

### Booking Form (`apps/web/components/booking/booking-form.tsx`)
- **7 occurrences**: `border-gray-200` on selects and inputs, `border-gray-200` on urgency buttons
- No address search/autocomplete — uses pre-saved address dropdowns only
- **Severity: HIGH** — Phase 6C rebrand incomplete + missing search feature

### Quote Display (`apps/web/components/booking/quote-display.tsx`)
- **1 occurrence**: `border-gray-200` on urgency option
- **Severity: MEDIUM**

### Cancel Order (`apps/web/components/order/cancel-order-button.tsx`)
- **2 occurrences**: `border-gray-200` on textarea and cancel button
- **Severity: MEDIUM**

### Rating Form (`apps/web/components/order/rating-form.tsx`)
- **3 occurrences**: `text-gray-300` (unfilled star), `text-gray-200` (inactive), `border-gray-200` (textarea)
- Star rating gray is likely intentional for unfilled state
- **Severity: MEDIUM**

### App Nav (`apps/web/components/shared/app-nav.tsx`)
- **3 occurrences**: `border-gray-200` (nav border), `border-gray-300` (inactive hover), `hover:bg-gray-100` (mobile menu button)
- **Severity: HIGH** — shared component affects all customer pages

### Mobile Nav (`apps/web/components/shared/mobile-nav.tsx`)
- **4 occurrences**: `border-gray-200` (borders), `hover:bg-gray-100` (hover states)
- **Severity: HIGH** — shared component affects all mobile views

### Order Timeline (`apps/web/components/tracking/order-timeline.tsx`)
- **2 occurrences**: `bg-gray-200` for incomplete step dot and connector line
- These are semantic indicators of incomplete steps — may be intentional
- **Severity: MEDIUM**

### Status Badge (`apps/web/components/ui/status-badge.tsx`)
- **3 occurrences**: `bg-gray-100 text-gray-800` for draft, expired, and fallback states
- These are semantic status states — could use embee tokens but the meaning is clear
- **Severity: LOW**

### Tracking Map (`apps/web/components/tracking/tracking-map.tsx`)
- Draws a straight `LineString` between pickup and destination
- Does NOT use `MapsProvider.getRoute()` for actual road routing
- Does NOT show actual road path
- Rider marker updates correctly via realtime
- Attribution present (Stadia Maps, OpenMapTiles, OSM)
- **Severity: HIGH** — core tracking UX issue

### Constants (`apps/web/lib/constants.ts`)
- NAVIGATION object references 10 routes that don't exist as pages
- Admin sidebar only shows 2 of the 6 defined admin nav items
- **Severity: HIGH** — dead navigation references

## 6. Architecture Findings

### Pricing Architecture
- **VERIFIED**: Route-based pricing. `QuoteService` calls `MapsProvider.getRoute()` to get `distance_km` and `duration_minutes`, then applies zone-based pricing rules from the database
- **VERIFIED**: MapsProvider is the only mapping dependency. No pricing logic couples to a specific provider
- **VERIFIED**: Haversine fallback when Maps API is unavailable
- **COMPATIBLE** with founder's route-based pricing direction

### GPS/Location Architecture
- **VERIFIED**: Throttled GPS updates. `RiderLocationService` enforces:
  - Minimum interval: 5 seconds (configurable via `platform_settings`)
  - Minimum distance: 10 meters (configurable)
  - Max speed validation: 200 km/h
  - Stale detection: 60 seconds
- **VERIFIED**: Coordinates broadcast via Supabase Realtime, NOT via routing API
- **VERIFIED**: GPS transmission is independent of mapping API consumption
- **NOT** transmitting every second — throttled appropriately

### Background Job Architecture
- **VERIFIED**: PostgreSQL-based job queue with `FOR UPDATE SKIP LOCKED`
- **VERIFIED**: Job types: DISPATCH_ORDER, DISPATCH_RETRY, OFFER_TIMEOUT, REFUND_PROCESS
- **VERIFIED**: Idempotent processing
- **VERIFIED**: Stuck job recovery
- **VERIFIED**: Cron endpoint protected by CRON_SECRET

### Auth/Authorization Architecture
- **VERIFIED**: Middleware protects `/dashboard`, `/deliveries`, `/profile`, `/admin`, `/rider`
- **VERIFIED**: Admin routes require `admin` or `super_admin` role from `profiles` table
- **VERIFIED**: All rider APIs derive identity from `auth.uid()`
- **VERIFIED**: All admin APIs independently verify admin role
- **VERIFIED**: No client-supplied rider ID trusted for authorization

## 7. Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No client-supplied rider ID trusted | CRITICAL | ✅ VERIFIED |
| Admin role derived server-side | CRITICAL | ✅ VERIFIED |
| Paystack webhook signature verified | CRITICAL | ✅ VERIFIED |
| Cron endpoint protected by secret | HIGH | ✅ VERIFIED |
| STADIA_MAPS_API_KEY not exposed to client | HIGH | ✅ VERIFIED |
| NEXT_PUBLIC_STADIA_* does not exist | HIGH | ✅ VERIFIED |
| RLS policies intact | CRITICAL | ✅ VERIFIED |
| `payment.service.ts` `getPaymentByOrderId` uses user-scoped client without explicit customer_id filter | MEDIUM | ⚠️ RELIES ON RLS |
| No rate limiting middleware implemented | MEDIUM | ⚠️ NOT IMPLEMENTED |
| No CSRF protection beyond Next.js defaults | LOW | ⚠️ STANDARD |

## 8. Mapping Findings

| Finding | Status |
|---------|--------|
| `mapbox-gl` removed from package.json | ✅ VERIFIED |
| `maplibre-gl` installed (^6.6.0) | ✅ VERIFIED |
| Default provider = `stadia` | ✅ VERIFIED |
| MapsProvider interface preserved | ✅ VERIFIED |
| Legacy Mapbox provider retained as fallback | ✅ VERIFIED (not active) |
| TrackingMap uses MapLibre + Stadia tiles | ✅ VERIFIED |
| Stadia/OpenMapTiles/OSM attribution present | ✅ VERIFIED |
| Server-side API key handling | ✅ VERIFIED |
| No NEXT_PUBLIC_STADIA exposure | ✅ VERIFIED |
| TrackingMap draws straight line, not road route | ⚠️ ISSUE |
| MapsProvider.getRoute() available but unused by TrackingMap | ⚠️ ISSUE |
| StadiaMapsProvider.autocomplete() exists but not in interface | ⚠️ ISSUE |

## 9. Pricing Findings

| Finding | Status |
|---------|--------|
| Route-based pricing via MapsProvider.getRoute() | ✅ VERIFIED |
| Zone-based pricing rules from database | ✅ VERIFIED |
| Haversine fallback when Maps unavailable | ✅ VERIFIED |
| No fixed geographic zone pricing | ✅ VERIFIED |
| QuoteService is pricing-authoritative | ✅ VERIFIED |
| Client does not calculate prices | ✅ VERIFIED |
| Compatible with founder's route-based direction | ✅ VERIFIED |

## 10. Production Readiness Findings

| Area | Status | Gap |
|------|--------|-----|
| Authentication | ✅ Ready | — |
| Authorization / RLS | ✅ Ready | — |
| Payment (Paystack) | ✅ Ready | Needs production keys |
| Background jobs | ✅ Ready | Needs cron scheduler |
| Mapping | ⚠️ Partial | Needs Stadia API key + domain auth |
| Notifications | ❌ Not implemented | No email/SMS/push |
| Rate limiting | ❌ Not implemented | No Redis middleware |
| Error tracking | ❌ Not implemented | No Sentry |
| Logging | ⚠️ Basic | console.log only |
| Monitoring | ❌ Not implemented | — |
| Database backups | ⚠️ Unknown | Supabase-managed |
| SSL/HTTPS | ✅ Ready | Vercel-managed |
| Environment variables | ⚠️ .env.example outdated | Still references Mapbox |

## 11. External / Manual Requirements

| Requirement | Priority | Phase |
|-------------|----------|-------|
| Obtain Stadia Maps API key (Starter $20/mo) | CRITICAL | Pre-launch |
| Configure Stadia Maps domain authentication | CRITICAL | Pre-launch |
| Configure Paystack production keys | CRITICAL | Pre-launch |
| Configure Supabase production project | CRITICAL | Pre-launch |
| Set up Vercel Cron for `/api/cron/process-jobs` | HIGH | Pre-launch |
| Supply E/N monogram logo asset | MEDIUM | When available |
| Implement notification system | HIGH | Future phase |
| Implement rate limiting | MEDIUM | Future phase |
| Implement error tracking (Sentry) | MEDIUM | Future phase |

## 12. Recommended Phase 6G Scope

### IN SCOPE (Recommended)

| # | Item | Priority | Complexity |
|---|------|----------|------------|
| 1 | Fix `.env.example` to reference Stadia Maps | CRITICAL | Low |
| 2 | Complete gray class migration (56 occurrences, 12 files) | HIGH | Medium |
| 3 | Tracking map: use actual road route via MapsProvider.getRoute() | HIGH | Medium |
| 4 | Add `autocomplete` method to MapsProvider interface | HIGH | Low |
| 5 | Clean up NAVIGATION constants (remove non-existent routes) | HIGH | Low |
| 6 | Update admin sidebar to match available routes | MEDIUM | Low |

### DEFERRED

| Item | Reason |
|------|--------|
| Address search/autocomplete UI | Requires client-side MapsProvider exposure — architectural decision needed |
| Notification system | Significant new infrastructure — separate milestone |
| Rate limiting | Requires Redis infrastructure decision — separate milestone |
| Error tracking (Sentry) | Separate milestone |
| Structured logging | Separate milestone |
| React error boundaries | Separate milestone |
| ETA refinement using real routes | Depends on tracking map route fix |
| Order tracking polling optimization | Depends on realtime architecture decision |

## 13. Explicitly Deferred Items

- Notifications (email/SMS/push)
- Redis rate limiting
- Sentry/error tracking
- Structured logging
- React error boundaries
- Advanced dispatch optimization (Matrix API)
- Admin dashboard expansion
- Customer analytics
- Rider earnings analytics
- Payment reconciliation
- Multi-language support
- Dark mode activation
- Print/export functionality

## 14. Verification Results

| Check | Result |
|-------|--------|
| HEAD | `8970fac` ✅ |
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Git history modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only this report) |
