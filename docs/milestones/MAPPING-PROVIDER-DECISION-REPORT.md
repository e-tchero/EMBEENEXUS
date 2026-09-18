# MAPPING PROVIDER DECISION REPORT

**Date:** August 26, 2026
**Status:** AWAITING ARCHITECTURE DECISION
**Scope:** Mapping infrastructure for Embee Nexus delivery platform
**Provider Direction:** APPROVED — Stadia Maps + MapLibre GL JS

---

## 1. Executive Summary

Embee Nexus has a clean server-side mapping abstraction (`MapsProvider`) but a direct `mapbox-gl` dependency on the client side. The `MAPBOX_ACCESS_TOKEN` is empty, blocking all mapping functionality. This report recommends replacing the Mapbox stack with **MapLibre GL JS + Stadia Maps** on the **Starter plan** ($20/month, 1M credits). The architecture preserves the existing `MapsProvider` abstraction, keeps rendering portable via open-source MapLibre, and supports all required delivery-platform capabilities. Projected monthly credit consumption at 100 customers/day (~3,000 orders/month) is approximately **277,000 credits**, well within the Starter plan's 1M limit.

---

## 2. Pricing Architecture

### 2.1 Embee Nexus Pricing Model

**Embee Nexus MUST NOT use fixed geographic locations or zones as the fundamental customer pricing mechanism.**

Customer pricing must be based on the **actual pickup → destination route** using normalized distance and time data from the mapping provider.

The architecture is:

```
Mapping Provider (Stadia Maps)
  → Supplies routing facts: distance_km, duration_minutes, polyline
    → Embee Nexus Pricing Engine (quote.service.ts)
      → Applies pricing rules: base_fee + distance_fee + weight_fee + priority_fee
        → Customer sees final price
```

The mapping provider is a **data source**, not a pricing authority. The `MapsProvider.getRoute()` method returns raw route geometry and metrics. The `QuoteService` consumes those metrics to calculate the customer price.

This means:
- **Route calculation is a core business function** — every order requires it
- **Routing quality directly impacts pricing accuracy**
- The mapping stack must provide reliable, consistent routing for Abuja delivery routes
- The `MapsProvider` abstraction is preserved — the pricing engine does not depend on any specific mapping vendor

### 2.2 Provider Abstraction Preservation

The existing `MapsProvider` interface remains unchanged:

```typescript
interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(query: string, location?: { lat: number; lon: number }): Promise<GeocodingResult[]>;
  getRoute(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }): Promise<RouteResult>;
}
```

The new Stadia Maps provider implements this interface. The pricing engine (`quote.service.ts`) calls `getMapsProvider().getRoute()` exactly as before. No business logic changes.

---

## 3. Current Repository Mapping Architecture

### 3.1 Server-Side Abstraction (CLEAN)

```
lib/maps/types.ts          — MapsProvider interface
lib/maps/index.ts          — Factory: MAPS_PROVIDER env var → provider instance
lib/maps/mapbox.ts         — Mapbox implementation (geocoding + directions)
lib/maps/google-maps.ts    — Google Maps implementation (geocoding + directions)
```

**Assessment:** The server-side abstraction is clean and provider-agnostic. Adding a new provider requires only implementing this interface.

### 3.2 Client-Side (DIRECT MAPBOX DEPENDENCY)

```
components/tracking/tracking-map.tsx  — Direct import('mapbox-gl') usage
```

**Current client code uses:**
- `mapboxgl.default.Map` — map initialization
- `mapboxgl.default.Marker` — pickup, destination, rider markers
- `mapboxgl.default.Popup` — marker popups
- `mapboxgl.default.NavigationControl` — zoom controls
- `mapboxgl.default.LngLatBounds` — bounds fitting
- `mapbox://styles/mapbox/streets-v12` — Mapbox tile style

**Assessment:** This is the primary migration target. Must be refactored to use MapLibre GL JS.

### 3.3 Dependencies

| Package | Version | Type |
|---------|---------|------|
| `mapbox-gl` | `^3.29.0` | Runtime |
| `@types/mapbox-gl` | `^3.5.0` | Dev |

### 3.4 Environment Variables

| Variable | Current Value | Scope |
|----------|---------------|-------|
| `MAPS_PROVIDER` | `mapbox` | Server |
| `MAPBOX_ACCESS_TOKEN` | **EMPTY** | Server |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | **EMPTY** | Client |
| `GOOGLE_MAPS_API_KEY` | Commented out | Server |

### 3.5 Consumers

| Consumer | Uses | Server/Client |
|----------|------|---------------|
| `quote.service.ts` | `getMapsProvider().getRoute()` | Server |
| `tracking-map.tsx` | `mapbox-gl` directly | Client |
| `rider-location.service.ts` | No map provider (DB only) | Server |
| `address.service.ts` | No map provider (DB only) | Server |

---

## 4. Required Mapping Capabilities

### 4.1 Customer Journey

| Capability | Required | Current State |
|------------|----------|---------------|
| Choose pickup on map | YES | NOT YET (address form only) |
| Choose destination on map | YES | NOT YET (address form only) |
| Search/select addresses | YES | `MapsProvider.searchAddresses()` |
| See map with route | YES | `TrackingMap` (blocked — no token) |
| Receive distance/ETA | YES | `MapsProvider.getRoute()` |
| Track rider in real-time | YES | `TrackingMap` + rider marker |

### 4.2 Rider Journey

| Capability | Required | Current State |
|------------|----------|---------------|
| See current position | YES | NOT YET |
| Update location | YES | `rider-location.service.ts` (DB) |
| See active delivery route | YES | NOT YET |
| Navigation-oriented info | FUTURE | NOT YET |

### 4.3 Dispatch

| Capability | Required | Current State |
|------------|----------|---------------|
| Calculate distances | YES | `MapsProvider.getRoute()` + Haversine fallback |
| Determine nearby riders | FUTURE | NOT YET |
| Distance matrix (dispatch optimization) | FUTURE | NOT YET |

---

## 5. Stadia Maps Pricing (Verified)

### 5.1 Plans

| Plan | Monthly Cost | Credits/Month | Overage | Commercial Use |
|------|-------------|---------------|---------|----------------|
| **Free** | $0 | 200,000 | Hard limit | ❌ **NOT ALLOWED** |
| **Starter** | $20 | 1,000,000 | +3¢/1000 | ✅ |
| **Standard** | $80 | 7,500,000 | +2¢/1000 | ✅ |
| **Professional** | $250 | 25,000,000 | +1.5¢/1000 | ✅ |

### 5.2 Credit Cost Schedule (Verified from stadiamaps.com/pricing)

| API | Credits/Request | Plan Availability |
|-----|-----------------|-------------------|
| Standard Vector Basemaps | 1/tile | All plans |
| Autocomplete Search (v2) | **1/req** | All plans |
| Autocomplete Search (v1) | 20/req | All plans |
| Forward Geocoding | 20/req | All plans |
| Reverse Geocoding | 20/req | All plans |
| Structured Geocoding | 20/req | All plans |
| Place Lookup | 20/GID | All plans |
| Standard Routing | 20/req | All plans |
| Optimized Routing | 40/req | Standard+ |
| **Time/Distance Matrix** | **10/element** | **Standard+ only** |
| Static Maps | 20/req | Starter+ |

### 5.3 Matrix API Plan Availability (Verified)

The Time/Distance Matrix API is available on **Standard and Professional plans only**.

From the Stadia Maps documentation:
- The Matrix API docs page shows plan availability grid: Free ✗ | Starter ✗ | Standard ✓ | Professional ✓
- Service Limits page confirms max element limits only for Standard (625) and Professional (10,000)
- The Starter plan description states "Basic + standard geocoding APIs" — Matrix is NOT included
- The Standard plan description states "Access to all standard APIs" — Matrix IS included

**This means:** If dispatch matrix optimization is required, the Standard plan ($80/month) is necessary.

### 5.4 Key: Autocomplete v2 Pricing

**Corrected from previous report:** Autocomplete Search v2 costs **1 credit per API request**, not 1 credit per keystroke.

Each address search session involves:
- Multiple autocomplete requests as the user types (each = 1 credit)
- One final selection confirmation (forward geocoding = 20 credits, or place_details = 20 credits)

---

## 6. Usage Model: First Principles

### 6.1 Baseline

| Parameter | Value |
|-----------|-------|
| Customers per day | 100 |
| Days per month | 30 |
| **Orders per month** | **3,000** |
| Orders per customer per day | 1 (conservative baseline) |
| Active riders at peak | 20 |
| Average tracking session | 15 minutes |

### 6.2 Per-Order Mapping Usage

Each order involves the following mapping operations:

| Operation | Requests/Order | Credits/Request | Credits/Order |
|-----------|---------------|-----------------|---------------|
| **Address search** (autocomplete typing) | 4 | 1 | 4 |
| **Address confirmation** (forward geocode) | 2 | 20 | 40 |
| **Route calculation** (pickup → destination) | 1 | 20 | 20 |
| **Map tiles — booking** (initial load + interaction) | ~25 tiles | 1 | 25 |
| **Map tiles — tracking** (initial load + 2 updates) | ~40 tiles | 1 | 40 |
| **Total per order** | | | **129** |

**Explanation per operation:**

1. **Address search (4 requests × 1 credit):** User types ~4 characters before selecting a result. Each character triggers an Autocomplete v2 request at 1 credit.

2. **Address confirmation (2 requests × 20 credits):** One forward geocode to confirm pickup coordinates, one to confirm destination coordinates. Each at 20 credits.

3. **Route calculation (1 request × 20 credits):** One Standard Routing call to get distance, duration, and polyline for the pickup → destination route. This is the core pricing input.

4. **Map tiles — booking (25 tiles × 1 credit):** Initial map load (~6 tiles for mobile viewport) plus user interaction (zoom/pan adds ~19 tiles). Browser caching reduces repeat loads.

5. **Map tiles — tracking (40 tiles × 1 credit):** Initial tracking map load (~6 tiles) plus 2 rider position updates that trigger additional tile requests (~17 tiles each). Browser caching mitigates.

### 6.3 Monthly Credit Model

| Category | Requests/Month | Credits/Request | Credits/Month |
|----------|---------------|-----------------|---------------|
| **Address autocomplete** | 12,000 (3K orders × 4) | 1 | 12,000 |
| **Forward geocoding** | 6,000 (3K orders × 2) | 20 | 120,000 |
| **Route calculation** | 3,000 (3K orders × 1) | 20 | 60,000 |
| **Map tiles — booking** | 75,000 (3K orders × 25) | 1 | 75,000 |
| **Map tiles — tracking** | 120,000 (3K orders × 40) | 1 | 120,000 |
| **Subtotal** | | | **387,000** |

### 6.4 Operational Overhead

| Category | Calculation | Credits/Month |
|----------|-------------|---------------|
| Dispatch map views (admin/rider queue) | 10 views/day × 30 tiles × 30 days | 9,000 |
| Rider tracking position display | 20 riders × 30 days × coordinates only | 0 (no API call) |
| Reverse geocoding (on-demand address lookup) | 100 requests/month × 20 credits | 2,000 |
| **Operational subtotal** | | **11,000** |

### 6.5 Total Monthly Credits

| Component | Credits/Month |
|-----------|---------------|
| Per-order mapping (address + routing + tiles) | 387,000 |
| Operational overhead | 11,000 |
| **Base total** | **398,000** |
| Safety margin (25%) | 99,500 |
| **TOTAL WITH SAFETY MARGIN** | **497,500** |

### 6.6 Plan Fit

| Plan | Limit | Projected Usage | Utilization | Headroom |
|------|-------|----------------|-------------|----------|
| **Starter ($20/mo)** | 1,000,000 | 497,500 | **49.8%** | **502,500 (50%)** |
| Standard ($80/mo) | 7,500,000 | 497,500 | 6.6% | 7,002,500 |

**✅ Starter plan is sufficient** with 50% headroom for growth.

---

## 7. Growth Projections

### 7.1 Scaling by Customer Volume

| Customers/Day | Orders/Month | Base Credits | With 25% Margin | Plan Required |
|---------------|-------------|-------------|-----------------|---------------|
| 50 | 1,500 | 199,000 | 248,750 | Free (200K) ⚠️ or Starter |
| **100** | **3,000** | **398,000** | **497,500** | **Starter ($20)** |
| 200 | 6,000 | 796,000 | 995,000 | Starter ($20) |
| 300 | 9,000 | 1,194,000 | 1,492,500 | Starter + overage or Standard |
| 500 | 15,000 | 1,990,000 | 2,487,500 | Standard ($80) |
| 1,000 | 30,000 | 3,980,000 | 4,975,000 | Standard ($80) |

### 7.2 When to Upgrade to Standard

Upgrade to Standard ($80/month) when:
1. Customer volume exceeds ~300/day (credits approach 1M limit)
2. Dispatch matrix optimization is needed (Matrix API requires Standard)
3. Persistent geocode caching is desired (Standard+ feature)
4. Optimized routing is needed (40 credits, Standard+ only)

---

## 8. Dispatch Matrix Analysis

### 8.1 Matrix API Requirements

The Matrix API calculates travel times/distances between multiple origins and destinations simultaneously. For Embee Nexus dispatch:

- **Sources:** Active rider locations (e.g., 20 riders)
- **Targets:** Pending order pickup locations (e.g., 10 orders)
- **Elements:** 20 × 10 = 200 matrix elements
- **Credits:** 200 × 10 = 2,000 credits per matrix calculation

### 8.2 Matrix Usage Model

| Parameter | Value |
|-----------|-------|
| Matrix calculations per day | 12 (every 2 hours during operating hours) |
| Sources per calculation | 20 riders |
| Targets per calculation | 10 orders |
| Elements per calculation | 200 |
| Credits per calculation | 2,000 |
| Daily credits | 24,000 |
| Monthly credits | 720,000 |

### 8.3 Matrix + Base Combined

| Component | Credits/Month |
|-----------|---------------|
| Base mapping (all orders) | 497,500 |
| Dispatch matrix | 720,000 |
| **TOTAL** | **1,217,500** |

**⚠️ This exceeds the Starter plan (1M).** Matrix dispatch requires the **Standard plan ($80/month)**.

### 8.4 MVP Alternative: Skip Matrix

For MVP, dispatch can use per-route distance calculations instead of matrix:

- Each order calls `getRoute()` for each nearby rider (already counted in base)
- No Matrix API needed
- Uses Haversine pre-filter to identify nearby riders
- Less optimal than matrix but sufficient for 100 customers/day

**Recommendation:** Start with Starter plan, no matrix. Add matrix when upgrading to Standard.

---

## 9. Provider Comparison

### 9.1 Complete Assessment

| Provider | Tiles | Geocoding | Autocomplete | Routing | Matrix | Free Tier | Commercial | MapLibre |
|----------|-------|-----------|-------------|---------|--------|-----------|------------|----------|
| **Stadia Maps** | ✅ 1/tile | ✅ 20/req | ✅ 1/req (v2) | ✅ 20/req | ✅ 10/elem | 200K credits | $20/mo (1M) | ✅ Native |
| **MapTiler** | ✅ 1/tile | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ~500K tiles | $15/mo (1M) | ✅ Native |
| **Geoapify** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | 3K/day | $30/mo (100K) | ✅ Native |
| **Mapbox** | ✅ 1/tile | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | 50K loads | $5/mo (100K) | ⚠️ Fork risk |
| **Google Maps** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | $300 trial | $200/mo min | ❌ Different SDK |
| **HERE** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | 300K/mo | $49/mo | ⚠️ Limited |
| **TomTom** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | 2,500/day | $500/mo | ⚠️ Limited |

### 9.2 Why Stadia Maps

| Factor | Stadia Maps | MapTiler | Geoapify | Mapbox |
|--------|-------------|----------|----------|--------|
| All-in-one (tiles+geocode+route) | ✅ | ❌ (no routing) | ✅ | ✅ |
| MapLibre native | ✅ | ✅ | ✅ | ⚠️ Fork risk |
| Commercial use on Starter | ✅ | ✅ | ✅ | ✅ |
| Matrix API | ✅ (Standard+) | ❌ | ✅ | ✅ |
| Nigeria coverage | Good (OSM) | Good (OSM) | Good (OSM+) | Excellent |
| Transparent credit pricing | ✅ | ✅ | ✅ | ✅ |
| No vendor lock-in | ✅ (MapLibre) | ✅ (MapLibre) | ✅ (MapLibre) | ❌ (Mapbox GL) |

---

## 10. Security / API Key Analysis

### 10.1 Key Types Required

| Key | Scope | Exposure | Storage |
|-----|-------|----------|---------|
| `STADIA_MAPS_API_KEY` | Server-side | Never exposed | `.env.local` (server) |
| `NEXT_PUBLIC_STADIA_MAPS_API_KEY` | Client-side | Public (domain-restricted) | `.env.local` (client) |

Both keys are the same Stadia Maps public API key. The key is designed to be exposed to browsers. Domain restriction prevents unauthorized usage.

### 10.2 Security Model

- **No server-only secrets needed** for mapping (unlike payment processing)
- **Domain restriction** on the Stadia Maps dashboard prevents key theft
- **Rate limiting** is handled by Stadia Maps
- **Server-side MapsProvider** uses the same public key for geocoding/routing
- **No sensitive data** is transmitted through mapping APIs

---

## 11. Nigeria / Abuja Coverage

Stadia Maps uses **OpenStreetMap** data supplemented with Foursquare Places (10M+ POIs in v2). Nigeria has an active OSM community, and Abuja is well-represented:

- Road networks: ✅ Good
- Major landmarks: ✅ Good
- Address data: ✅ Good (improving)
- POI data: ✅ Good (Foursquare integration)
- Some newer estates may have incomplete address data
- Named businesses may be less comprehensive than Google Maps

---

## 12. OSM / Public Service Limitations

| Service | Limitation | Impact | Verdict |
|---------|-----------|--------|---------|
| Public Nominatim | 1 req/s, no autocomplete, no SLA | Not production-suitable | ❌ |
| Public OSRM | 1 req/s, no SLA | Not production-suitable | ❌ |
| Self-hosted Valhalla/OSRM | Unlimited, but requires VPS | Infrastructure overhead | ⚠️ Future option |

---

## 13. MapLibre Assessment

### 13.1 What MapLibre GL JS IS

- **Open-source** (BSD-3) — no vendor lock-in
- **GPU-accelerated** vector tile rendering
- **API-compatible** with Mapbox GL JS v1 (minimal migration)
- **React bindings** available (optional)
- **Consumes any vector tile source**

### 13.2 What MapLibre Does NOT Provide

- Geocoding (use Stadia Maps API)
- Routing (use Stadia Maps API)
- Tile hosting (use Stadia Maps tiles)
- Matrix calculations (use Stadia Maps API)

### 13.3 Migration from Mapbox GL JS

| Mapbox GL JS | MapLibre GL JS | Change |
|-------------|---------------|--------|
| `import mapboxgl from 'mapbox-gl'` | `import maplibregl from 'maplibre-gl'` | Import rename |
| `new mapboxgl.Map()` | `new maplibregl.Map()` | Class rename |
| `mapbox://styles/mapbox/streets-v12` | `https://tiles.stadiamaps.com/styles/alidade_smooth.json` | Style URL |
| `accessToken = token` | Not needed (key in URL params) | Remove line |

**Migration effort: LOW** — primarily import renames and style URL changes.

---

## 14. Recommended Architecture

### 14.1 Stack

```
Client Layer:
  MapLibre GL JS          — Open-source vector map renderer
  + Stadia Maps tiles     — Vector tile source (public API key)

Server Layer:
  Stadia Maps Geocoding   — Address search, autocomplete v2, forward/reverse geocoding
  Stadia Maps Routing     — Route calculation (distance, duration, polyline)
```

### 14.2 Plan Recommendation

**Start with Starter plan ($20/month).**

| Criteria | Starter ($20) | Standard ($80) |
|----------|---------------|----------------|
| Credits/month | 1,000,000 | 7,500,000 |
| Fits 100 customers/day | ✅ (50% headroom) | ✅ (93% headroom) |
| Matrix API | ❌ | ✅ |
| Optimized routing | ❌ | ✅ |
| Persistent geocode cache | ❌ | ✅ |
| Commercial use | ✅ | ✅ |

**Upgrade to Standard when:** dispatch matrix is needed OR volume exceeds ~300 customers/day.

---

## 15. Migration Impact

### 15.1 Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `components/tracking/tracking-map.tsx` | Replace `mapbox-gl` with `maplibre-gl` | LOW |
| `lib/maps/index.ts` | Add `"stadia"` case to factory | LOW |
| `lib/maps/stadia.ts` | **NEW** — Stadia Maps provider implementation | MEDIUM |
| `package.json` | Replace `mapbox-gl` with `maplibre-gl` | LOW |
| `.env.local` | Update environment variables | LOW |

### 15.2 Files Unchanged

| File | Reason |
|------|--------|
| `lib/maps/types.ts` | Interface already provider-agnostic |
| `lib/maps/mapbox.ts` | Kept as fallback |
| `lib/services/quote.service.ts` | Uses `getMapsProvider()` — no change |
| All business logic | No change |

### 15.3 Migration Effort

| Step | Effort |
|------|--------|
| Create Stadia Maps provider | 1-2 hours |
| Refactor tracking-map.tsx | 1-2 hours |
| Update package.json + env vars | 15 minutes |
| Test geocoding with real Abuja addresses | 30 minutes |
| Test routing with real delivery routes | 30 minutes |
| Browser verification | 30 minutes |
| **Total** | **3-5 hours** |

---

## 16. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stadia Maps API downtime | LOW | HIGH | MapLibre rendering continues (tiles cached), fallback to Mapbox when credentials available |
| Autocomplete v2 quality differs from Mapbox | LOW | MEDIUM | Test with real Abuja addresses before committing |
| Routing accuracy differs from expected | MEDIUM | MEDIUM | Test with real delivery routes, calibrate pricing |
| Nigeria coverage gaps in OSM data | LOW | MEDIUM | Stadia Maps v2 Foursquare integration helps |
| Starter plan credits insufficient | LOW | MEDIUM | Monitor usage, upgrade to Standard ($80/mo) |
| Matrix API required sooner than expected | MEDIUM | LOW | Upgrade to Standard plan when needed |

---

## 17. Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Public Nominatim | 1 req/s rate limit, no autocomplete, no SLA |
| Public OSRM | 1 req/s rate limit, no SLA |
| MapTiler alone | No routing API — Embee Nexus requires route calculation for pricing |
| Geoapify alone | Lower MapLibre integration maturity, less generous free tier |
| Google Maps | $200/mo minimum, vendor lock-in, different SDK |
| Mapbox (retain) | Credentials blocked, proprietary client library |
| Self-hosted everything | Infrastructure complexity not justified at MVP stage |

---

## 18. Decision

### Recommended Stack: **MapLibre GL JS + Stadia Maps Starter Plan**

| Layer | Provider | Cost |
|-------|----------|------|
| **Map rendering** | MapLibre GL JS | FREE (OSS) |
| **Map tiles** | Stadia Maps | Included in $20/mo |
| **Geocoding** | Stadia Maps | Included in $20/mo |
| **Routing** | Stadia Maps | Included in $20/mo |
| **Matrix (future)** | Stadia Maps | Requires Standard plan ($80/mo) |

### Monthly Cost Summary

| Scenario | Customers/Day | Orders/Month | Credits/Month | Plan | Cost |
|----------|---------------|-------------|---------------|------|------|
| MVP baseline | 100 | 3,000 | ~497,500 | Starter | **$20** |
| 2× growth | 200 | 6,000 | ~995,000 | Starter | **$20** |
| With dispatch matrix | 100 | 3,000 | ~1,217,500 | Standard | **$80** |
| 5× growth | 500 | 15,000 | ~2,487,500 | Standard | **$80** |

### Why

1. **All-in-one provider** — tiles, geocoding, routing in one platform
2. **Commercial use allowed** on Starter plan (Free plan does NOT allow commercial use)
3. **MapLibre rendering** — open source, no vendor lock-in on client
4. **1M credits/month** — sufficient for 100 customers/day with 50% headroom
5. **Autocomplete v2** — 1 credit/request (80% cheaper than v1)
6. **Nigeria coverage** — OSM-based + Foursquare POI data
7. **No infrastructure** — fully managed
8. **Preserves abstraction** — existing MapsProvider interface unchanged
9. **Upgrade path** — Standard plan adds Matrix API for dispatch optimization

---

## 19. External Asset Dependencies

| Asset | Status | Impact |
|-------|--------|--------|
| Stadia Maps API key | **REQUIRED** | Must be obtained before implementation |
| E/N monogram logo | NOT YET AVAILABLE | Deferred to later phase |
| Mapbox credentials | BLOCKED | Reason for migration |

---

## 20. Summary

| Question | Answer |
|----------|--------|
| Current provider | Mapbox (blocked — no credentials) |
| Recommended provider | **Stadia Maps** |
| Rendering library | **MapLibre GL JS** (open source) |
| Recommended plan | **Starter ($20/month)** |
| Baseline | 100 customers/day → 3,000 orders/month |
| Credits needed (with 25% margin) | ~497,500/month |
| Starter plan limit | 1,000,000 credits |
| Headroom | 50% |
| Migration difficulty | **LOW** (3-5 hours) |
| Nigeria coverage | Good (OSM + Foursquare) |
| Vendor lock-in risk | **LOW** (MapLibre keeps rendering portable) |
| Commercial use | ✅ Allowed on Starter plan |
| Matrix API (dispatch) | Requires Standard plan ($80/mo) |
| Pricing architecture | Route-based (MapsProvider → QuoteService) |
| Should we change now? | **YES** — Mapbox credentials are blocking all mapping |
| Cost at MVP scale | **$20/month** (~$0.007/order) |

---

**STATUS: AWAITING ARCHITECTURE DECISION**

This report must be reviewed and approved before implementation begins.
