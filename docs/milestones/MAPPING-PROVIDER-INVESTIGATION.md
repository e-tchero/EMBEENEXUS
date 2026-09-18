# MAPPING PROVIDER INVESTIGATION

## 1. Executive Summary

Embee Nexus has a clean server-side mapping abstraction (`MapsProvider`) but a direct Mapbox GL JS dependency on the client side. The `MAPBOX_ACCESS_TOKEN` is empty, blocking all mapping functionality. This investigation recommends replacing the Mapbox stack with **MapLibre GL JS + MapTiler** for tiles/geocoding and **Valhalla (self-hosted or via OpenRouteService)** for routing — or alternatively **Stadia Maps** as an all-in-one provider. The recommended approach preserves the existing provider abstraction and requires minimal migration.

---

## 2. Current Repository Mapping Architecture

### 2.1 Server-Side Abstraction (CLEAN)

```
lib/maps/types.ts          — MapsProvider interface (geocode, reverseGeocode, searchAddresses, getRoute)
lib/maps/index.ts          — Factory: MAPS_PROVIDER env var → MapboxProvider or GoogleMapsProvider
lib/maps/mapbox.ts         — Mapbox implementation (geocoding + directions)
lib/maps/google-maps.ts    — Google Maps implementation (geocoding + directions)
```

**MapsProvider Interface:**
```typescript
interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(query: string, location?: { lat: number; lon: number }): Promise<GeocodingResult[]>;
  getRoute(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }): Promise<RouteResult>;
}
```

**Assessment:** The server-side abstraction is clean and provider-agnostic. Adding a new provider only requires implementing this interface. No business logic depends on Mapbox directly.

### 2.2 Client-Side (DIRECT MAPBOX DEPENDENCY)

```
components/tracking/tracking-map.tsx  — Direct import('mapbox-gl') usage
```

**Issues:**
- Directly imports `mapbox-gl` — NOT behind any abstraction
- References `process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Uses `mapboxgl.default.Map`, `mapboxgl.default.Marker`, `mapboxgl.default.Popup`, `mapboxgl.default.NavigationControl`, `mapboxgl.default.LngLatBounds`
- Uses Mapbox-specific style: `mapbox://styles/mapbox/streets-v12`

**Assessment:** This is the primary migration target. The component must be refactored to use a provider-agnostic rendering library.

### 2.3 Dependencies

| Package | Version | Type |
|---------|---------|------|
| `mapbox-gl` | `^3.29.0` | Runtime |
| `@types/mapbox-gl` | `^3.5.0` | Dev |

### 2.4 Environment Variables

| Variable | Current Value | Scope |
|----------|---------------|-------|
| `MAPS_PROVIDER` | `mapbox` | Server |
| `MAPBOX_ACCESS_TOKEN` | **EMPTY** | Server |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | **EMPTY** | Client (referenced in tracking-map.tsx) |
| `GOOGLE_MAPS_API_KEY` | Commented out | Server |

### 2.5 Consumers

| Consumer | Uses | Server/Client |
|----------|------|---------------|
| `quote.service.ts` | `getMapsProvider().getRoute()` | Server |
| `tracking-map.tsx` | `mapbox-gl` directly | Client |
| `rider-location.service.ts` | No map provider (DB only) | Server |
| `address.service.ts` | No map provider (DB only) | Server |

---

## 3. Required Mapping Capabilities

### 3.1 Customer Journey

| Capability | Required | Current Implementation |
|------------|----------|----------------------|
| Choose pickup on map | YES | NOT YET IMPLEMENTED (address form only) |
| Choose destination on map | YES | NOT YET IMPLEMENTED (address form only) |
| Search/select addresses | YES | `MapsProvider.searchAddresses()` |
| See map with route | YES | `TrackingMap` component |
| Receive distance/ETA | YES | `MapsProvider.getRoute()` |
| Track rider in real-time | YES | `TrackingMap` + rider marker |

### 3.2 Rider Journey

| Capability | Required | Current Implementation |
|------------|----------|----------------------|
| See current position | YES | NOT YET IMPLEMENTED |
| Update location | YES | `rider-location.service.ts` (DB) |
| See active delivery route | YES | NOT YET IMPLEMENTED |
| Navigation-oriented info | FUTURE | NOT YET IMPLEMENTED |

### 3.3 Dispatch

| Capability | Required | Current Implementation |
|------------|----------|----------------------|
| Calculate distances | YES | `MapsProvider.getRoute()` + Haversine fallback |
| Determine nearby riders | FUTURE | NOT YET IMPLEMENTED |
| Route optimization | FUTURE | NOT YET IMPLEMENTED |

### 3.4 Summary

**MVP requires:**
1. Geocoding (address → coordinates)
2. Reverse geocoding (coordinates → address)
3. Address search/autocomplete
4. Routing (distance, duration, polyline)
5. Interactive map rendering (client)
6. Markers (pickup, destination, rider)
7. Live rider location updates

---

## 4. Provider Comparison Matrix

### 4.1 Map Rendering

| Provider | License | Free Tier | MapLibre Compatible | Nigeria Tiles | Quality |
|----------|---------|-----------|---------------------|---------------|---------|
| **MapLibre GL JS** | BSD-3 | ✅ FREE (OSS) | ✅ IS MapLibre | Via tile provider | Excellent |
| **Mapbox GL JS** | Proprietary | 50K loads/mo | ⚠️ Fork divergence | ✅ Excellent | Excellent |
| **Leaflet** | BSD-2 | ✅ FREE (OSS) | ❌ Different API | Via tile provider | Good (raster) |
| **Google Maps JS** | Proprietary | $200/mo credit | ❌ Different API | ✅ Excellent | Excellent |

**Decision: MapLibre GL JS** — Open source, BSD-3 license, API-compatible with Mapbox GL JS v1, actively maintained, GPU-accelerated vector tiles, no vendor lock-in.

### 4.2 Tile Providers (for MapLibre)

| Provider | Free Tier | Credits/Month | MapLibre Compatible | Nigeria Coverage | API Key Required |
|----------|-----------|---------------|---------------------|------------------|------------------|
| **MapTiler** | ✅ Free plan | ~500K tiles | ✅ Native | ✅ Good (OSM-based) | Yes (public) |
| **Stadia Maps** | ✅ Free plan | 200K credits | ✅ Native | ✅ Good (OSM-based) | Yes (public) |
| **OpenFreeMap** | ✅ FREE | Unlimited | ✅ Native | ✅ OSM data | No |
| **Thunderforest** | Free tier | 100K tiles | ✅ Native | ✅ OSM data | Yes (public) |
| **Mapbox** | 50K loads/mo | 50K | ⚠️ Works but lock-in | ✅ Excellent | Yes (public) |

**Decision: MapTiler or Stadia Maps** — Both offer generous free tiers, MapLibre-compatible tiles, and good Nigeria coverage. MapTiler is slightly cheaper for tiles-only; Stadia Maps bundles geocoding+routing.

### 4.3 Geocoding

| Provider | Free Tier | Requests/Month | Nigeria Coverage | Autocomplete | API Key |
|----------|-----------|----------------|------------------|--------------|---------|
| **Nominatim (public)** | ✅ FREE | 1 req/sec (no key) | ⚠️ Variable | ❌ No | No |
| **Nominatim (self-hosted)** | ✅ FREE | Unlimited | ⚠️ Depends on data | ❌ No | No |
| **MapTiler** | ✅ Free tier | ~100K | ✅ Good | ✅ Yes | Yes (public) |
| **Stadia Maps** | ✅ Free tier | Included in credits | ✅ Good | ✅ Yes | Yes (public) |
| **Geoapify** | ✅ Free tier | 3,000/day (~90K/mo) | ✅ Good (OSM+) | ✅ Yes | Yes (public) |
| **OpenRouteService** | ✅ Free tier | 2,000/day | ✅ Good | ❌ Limited | Yes (public) |
| **Mapbox** | 100K/mo | 100K | ✅ Excellent | ✅ Yes | Yes (public) |
| **Google Maps** | 10K/mo | 10K ($5/1K after) | ✅ Excellent | ✅ Yes | Yes (public) |
| **HERE** | Free tier | 300K/mo | ✅ Good | ✅ Yes | Yes (public) |
| **TomTom** | Free tier | 2,500/day | ✅ Good | ✅ Yes | Yes (public) |

**Decision: MapTiler geocoding or Stadia Maps** — Both provide good Nigeria coverage, autocomplete, and generous free tiers. Public Nominatim is NOT suitable for commercial use (rate limits, no SLA, no autocomplete).

### 4.4 Routing

| Provider | Free Tier | Requests/Month | Nigeria Coverage | ETA | Distance | Polyline | API Key |
|----------|-----------|----------------|------------------|-----|----------|----------|---------|
| **Valhalla (self-hosted)** | ✅ FREE | Unlimited | ✅ OSM data | ✅ Yes | ✅ Yes | ✅ Yes | No |
| **OpenRouteService** | ✅ Free tier | 2,000/day | ✅ Good | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **GraphHopper** | ✅ Free tier | 500/day | ✅ Good | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **OSRM (public)** | ✅ FREE | 1 req/sec | ✅ OSM data | ✅ Yes | ✅ Yes | ✅ Yes | No |
| **OSRM (self-hosted)** | ✅ FREE | Unlimited | ✅ OSM data | ✅ Yes | ✅ Yes | ✅ Yes | No |
| **MapTiler** | ❌ No routing | — | — | — | — | — | — |
| **Stadia Maps** | ✅ Free tier | Included in credits | ✅ Good | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **Mapbox** | 100K/mo | 100K | ✅ Excellent | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **Google Maps** | $200/mo credit | ~40K | ✅ Excellent | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **HERE** | Free tier | Included | ✅ Good | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |
| **TomTom** | Free tier | 2,500/day | ✅ Good | ✅ Yes | ✅ Yes | ✅ Yes | Yes (public) |

**Decision: Stadia Maps or self-hosted Valhalla** — Stadia Maps provides routing in its free tier (200K credits/mo covers geocoding + routing + tiles). Self-hosted Valhalla/OSRM is free but requires infrastructure.

---

## 5. Free-Tier / Cost Analysis

### 5.1 Definitions

| Term | Meaning |
|------|---------|
| **Free/Open-Source Software** | Code is free to use, modify, distribute (BSD, MIT, Apache) |
| **Free Public Infrastructure** | Publicly hosted service, no payment, no SLA, rate-limited |
| **Free Developer Tier** | Account required, generous quota, no credit card, production-usable |
| **Monthly Free Quota** | Resets monthly, overage may be blocked or charged |
| **Temporary Trial** | Time-limited (14/30 days), then requires payment |
| **Paid Production Service** | Requires payment for production use |

### 5.2 Cost Comparison (MVP Scale: ~10K map loads/mo, ~5K geocodes/mo, ~2K routes/mo)

| Stack | Monthly Cost | Notes |
|-------|-------------|-------|
| **MapLibre + MapTiler (tiles+geocode) + OpenRouteService (routing)** | **$0** | All within free tiers |
| **MapLibre + Stadia Maps (all-in-one)** | **$0** | 200K credits/mo covers all |
| **MapLibre + Geoapify (tiles+geocode+routing)** | **$0** | 3K req/day covers all |
| **MapLibre + self-hosted Valhalla + Nominatim** | **$0 + infra** | Requires VPS (~$5-10/mo) |
| **Mapbox (current)** | **$0** | Within free tier (if credentials available) |
| **Google Maps** | **$0-$50** | Within $200/mo credit for MVP |

---

## 6. API Key / Security Analysis

### 6.1 Key Types

| Provider | Browser-Side Key | Server-Side Secret | Notes |
|----------|-----------------|-------------------|-------|
| MapLibre GL JS | None (OSS) | None | No key needed for the library |
| MapTiler | Public API key | None | Restrict by domain |
| Stadia Maps | Public API key | None | Restrict by domain |
| Geoapify | Public API key | None | Restrict by domain |
| OpenRouteService | Public API key | None | Rate-limited |
| Mapbox | Public access token | None (same token) | Restrict by URL |
| Google Maps | Public API key | None (same key) | Restrict by domain + API |

### 6.2 Security Model

- **All tile/geocoding/routing keys are public** — they are designed to be exposed to the browser
- **Server-side API calls** should use the same public key (not a separate secret) for these services
- **No server-only secrets** are needed for mapping (unlike payment processing)
- **Domain restriction** should be applied to prevent unauthorized usage

### 6.3 Recommended Key Management

```
# Server-side (for quote.service.ts, address lookups)
MAPS_PROVIDER=maptiler
MAPTILER_API_KEY=pk.xxx          # Public key, domain-restricted

# Client-side (for tracking-map.tsx)
NEXT_PUBLIC_MAPTILER_API_KEY=pk.xxx  # Same public key
```

---

## 7. Nigeria / Abuja Coverage Analysis

### 7.1 Data Source Coverage

| Provider | Data Source | Nigeria Coverage | Abuja Detail |
|----------|------------|------------------|--------------|
| OSM/Nominatim | OpenStreetMap | ✅ Good (community-mapped) | ✅ Good |
| Mapbox | Proprietary + OSM | ✅ Excellent | ✅ Excellent |
| Google Maps | Proprietary | ✅ Excellent | ✅ Excellent |
| MapTiler | OSM + proprietary | ✅ Good | ✅ Good |
| Stadia Maps | OSM + proprietary | ✅ Good | ✅ Good |
| Geoapify | OSM + POI data | ✅ Good | ✅ Good |

### 7.2 Key Finding

**OSM-based providers have good Nigeria/Abuja coverage** because Nigeria has an active OpenStreetMap community. Road networks, major landmarks, and address data are well-represented. For a delivery platform operating in Abuja, any OSM-derived provider will be sufficient.

---

## 8. OSM / Nominatim Limitations

### 8.1 Public Nominatim

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| 1 request/second rate limit | Blocks rapid geocoding | Use commercial provider or self-host |
| No autocomplete | Poor UX for address search | Use provider with autocomplete |
| No SLA / no uptime guarantee | Unreliable for production | Use commercial provider |
| Usage policy prohibits heavy use | May be blocked | Respect policy or self-host |
| Data quality varies | Some addresses missing | Use provider with enriched data |

**Verdict: Public Nominatim is NOT suitable for a commercial delivery platform.** Self-hosted Nominatim is viable but requires infrastructure and maintenance.

### 8.2 Public OSRM

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| 1 request/second rate limit | Blocks rapid routing | Use commercial provider or self-host |
| No SLA | Unreliable for production | Use commercial provider |
| Basic routing only | No traffic, no alternatives | Acceptable for MVP |

**Verdict: Public OSRM is acceptable for MVP testing but NOT for production.** Self-hosted OSRM/Valhalla is viable.

---

## 9. MapLibre Assessment

### 9.1 What MapLibre IS

- **Open-source** (BSD-3) fork of Mapbox GL JS v1
- **GPU-accelerated** vector tile rendering
- **React bindings** available (`react-map-gl` works with MapLibre)
- **API-compatible** with Mapbox GL JS v1 (most examples work with minimal changes)
- **Actively maintained** by a large community
- **No vendor lock-in** — can consume any vector tile source

### 9.2 What MapLibre is NOT

- NOT a geocoding service
- NOT a routing service
- NOT a tile provider
- NOT a complete mapping platform

**MapLibre is the rendering layer only.** It needs tile sources, geocoding, and routing from separate providers.

### 9.3 Migration from Mapbox GL JS

MapLibre GL JS is a fork of Mapbox GL JS v1. The API is highly compatible:

| Mapbox GL JS | MapLibre GL JS | Migration Effort |
|-------------|---------------|-----------------|
| `new mapboxgl.Map()` | `new maplibregl.Map()` | Rename import |
| `mapboxgl.Marker` | `maplibregl.Marker` | Rename import |
| `mapboxgl.Popup` | `maplibregl.Popup` | Rename import |
| `mapboxgl.NavigationControl` | `maplibregl.NavigationControl` | Rename import |
| `mapboxgl.LngLatBounds` | `maplibregl.LngLatBounds` | Rename import |
| `mapbox://styles/mapbox/streets-v12` | Tile provider URL | Change style URL |
| `accessToken = token` | Not needed (key in URL) | Remove line |

**Migration effort: LOW** — primarily import renames and style URL changes.

---

## 10. Routing Assessment

### 10.1 Options

| Option | Self-Hosted | Managed | Free Tier | Nigeria | Complexity |
|--------|-------------|---------|-----------|---------|------------|
| OSRM | ✅ | ✅ (public) | ✅ Unlimited / 1 req/s | ✅ Good | Medium |
| Valhalla | ✅ | ❌ | ✅ Unlimited | ✅ Good | High |
| GraphHopper | ✅ | ✅ | 500/day | ✅ Good | Medium |
| OpenRouteService | ❌ | ✅ | 2,000/day | ✅ Good | Low |
| Stadia Maps | ❌ | ✅ | Included (200K credits) | ✅ Good | Low |
| Mapbox Directions | ❌ | ✅ | 100K/mo | ✅ Excellent | Low |
| Google Directions | ❌ | ✅ | $200/mo credit | ✅ Excellent | Low |

### 10.2 Recommendation

**For MVP:** Use **Stadia Maps** or **Geoapify** for routing — managed service, free tier sufficient, no infrastructure needed.

**For scale:** Evaluate self-hosted **Valhalla** or **OSRM** if routing volume exceeds free tiers.

---

## 11. Geocoding Assessment

### 11.1 Options

| Option | Self-Hosted | Managed | Free Tier | Autocomplete | Nigeria |
|--------|-------------|---------|-----------|--------------|---------|
| Nominatim | ✅ | ✅ (public) | ✅ Unlimited / 1 req/s | ❌ | ✅ Good |
| MapTiler | ❌ | ✅ | ~100K/mo | ✅ | ✅ Good |
| Stadia Maps | ❌ | ✅ | Included | ✅ | ✅ Good |
| Geoapify | ❌ | ✅ | 3,000/day | ✅ | ✅ Good |
| Mapbox Geocoding | ❌ | ✅ | 100K/mo | ✅ | ✅ Excellent |
| Google Geocoding | ❌ | ✅ | 10K/mo | ✅ | ✅ Excellent |
| HERE Geocoding | ❌ | ✅ | 300K/mo | ✅ | ✅ Good |

### 11.2 Recommendation

**For MVP:** Use **MapTiler** or **Stadia Maps** for geocoding — managed service, free tier sufficient, autocomplete included.

---

## 12. Recommended Architecture

### 12.1 Option A: Stadia Maps (All-in-One) — RECOMMENDED

```
Client:
  MapLibre GL JS (rendering)
  + Stadia Maps tiles (public key)
  + Stadia Maps markers/popups

Server:
  Stadia Maps Geocoding API
  + Stadia Maps Routing API
  (via MapsProvider implementation)
```

**Pros:**
- Single provider for tiles + geocoding + routing
- 200K free credits/month covers MVP
- MapLibre-compatible
- No infrastructure needed
- Clean API, good documentation
- Nigeria coverage good

**Cons:**
- Vendor dependency (but MapLibre keeps rendering portable)
- Credits-based pricing may be confusing

### 12.2 Option B: MapTiler + Geoapify (Split)

```
Client:
  MapLibre GL JS (rendering)
  + MapTiler tiles (public key)

Server:
  Geoapify Geocoding API
  + Geoapify Routing API
  (via MapsProvider implementation)
```

**Pros:**
- Split providers reduces single-vendor risk
- MapTiler has best free tile tier
- Geoapify has generous geocoding/routing free tier
- Both MapLibre-compatible

**Cons:**
- Two providers to manage
- Two API keys
- Two billing accounts

### 12.3 Option C: MapTiler + Self-Hosted Valhalla (Maximum Free)

```
Client:
  MapLibre GL JS (rendering)
  + MapTiler tiles (public key)

Server:
  MapTiler Geocoding API
  + Self-hosted Valhalla (routing)
  (via MapsProvider implementation)
```

**Pros:**
- Maximum free tier usage
- No routing cost at any scale
- Full control over routing engine

**Cons:**
- Requires VPS for Valhalla (~$5-10/mo)
- Valhalla setup and maintenance complexity
- OSM routing data quality varies

### 12.4 Option D: Retain Mapbox Abstraction (Defer)

```
Keep current architecture, obtain Mapbox credentials later.
```

**Pros:**
- Zero migration work now
- Existing code works as-is

**Cons:**
- Still blocked on credentials
- Mapbox GL JS is proprietary
- Vendor lock-in on client side
- Free tier may change

---

## 13. Migration Impact

### 13.1 Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `components/tracking/tracking-map.tsx` | Replace `mapbox-gl` with `maplibre-gl` | LOW |
| `lib/maps/index.ts` | Add new provider case | LOW |
| `lib/maps/mapbox.ts` | Keep as-is (or rename) | NONE |
| `lib/maps/new-provider.ts` | Create new MapsProvider implementation | MEDIUM |
| `package.json` | Replace `mapbox-gl` with `maplibre-gl` | LOW |
| `.env.local` | Update environment variables | LOW |

### 13.2 Migration Difficulty

**LOW** — The server-side abstraction means the provider swap is isolated. The client-side change is primarily import renames and style URL changes.

### 13.3 Estimated Effort

- New MapsProvider implementation: 1-2 hours
- Refactor tracking-map.tsx: 1-2 hours
- Environment variable updates: 15 minutes
- Testing: 1 hour
- **Total: 3-5 hours**

---

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New provider has poor Nigeria coverage | LOW | HIGH | Test with real Abuja addresses before committing |
| Free tier limits exceeded | LOW | MEDIUM | Monitor usage, have paid tier ready |
| Provider API changes | LOW | MEDIUM | MapLibre abstraction keeps rendering portable |
| Routing quality worse than Mapbox | MEDIUM | MEDIUM | Test with real delivery routes |
| Geocoding quality worse than Mapbox | MEDIUM | MEDIUM | Test with real Abuja addresses |

---

## 15. Rejected Alternatives and Why

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Public Nominatim | 1 req/s rate limit, no autocomplete, no SLA — not production-suitable |
| Public OSRM | 1 req/s rate limit, no SLA — not production-suitable |
| Google Maps (sole provider) | Expensive at scale, vendor lock-in, $200/mo credit insufficient for growth |
| Mapbox (retain current) | Credentials still blocked, proprietary client library, vendor lock-in |
| Leaflet | Raster-only, no vector tiles, worse performance, older API |
| Self-hosted everything | Infrastructure complexity not justified at MVP stage |

---

## 16. Decision

### Recommended Stack: **MapLibre GL JS + Stadia Maps**

| Layer | Provider | Cost |
|-------|----------|------|
| **Map rendering** | MapLibre GL JS | FREE (OSS) |
| **Map tiles** | Stadia Maps | FREE (200K credits/mo) |
| **Geocoding** | Stadia Maps | FREE (included in credits) |
| **Routing** | Stadia Maps | FREE (included in credits) |

### Why

1. **Single provider** for tiles + geocoding + routing — simpler to manage
2. **MapLibre rendering** — open source, no vendor lock-in on client
3. **200K free credits/month** — sufficient for MVP and early growth
4. **MapLibre-compatible** — minimal migration from Mapbox GL JS
5. **Nigeria coverage** — OSM-based, good for Abuja
6. **No infrastructure** — fully managed
7. **Clean API** — well-documented, reliable

### Backup Plan

If Stadia Maps proves insufficient:
1. Switch tiles to MapTiler (cheaper for tiles-only)
2. Switch geocoding/routing to Geoapify
3. MapLibre rendering stays unchanged

---

## 17. Implementation Plan (Future Phase)

### Step 1: Install Dependencies
```bash
npm install maplibre-gl
npm uninstall mapbox-gl @types/mapbox-gl
```

### Step 2: Create Stadia Maps Provider
```
lib/maps/stadia.ts  — implements MapsProvider
lib/maps/index.ts   — add "stadia" case
```

### Step 3: Refactor TrackingMap
```
components/tracking/tracking-map.tsx
  — import maplibregl instead of mapboxgl
  — use Stadia Maps tile URL
  — remove accessToken setting
```

### Step 4: Update Environment Variables
```
MAPS_PROVIDER=stadia
STADIA_MAPS_API_KEY=pk.xxx
NEXT_PUBLIC_STADIA_MAPS_API_KEY=pk.xxx
```

### Step 5: Test
- Geocoding with real Abuja addresses
- Routing with real delivery routes
- Map rendering in browser
- Rider tracking marker updates

---

## 18. Implementation Sequence

1. **Obtain Stadia Maps API key** (free, no credit card)
2. **Test geocoding** with real Abuja addresses
3. **Test routing** with real delivery routes
4. **Install maplibre-gl**, uninstall mapbox-gl
5. **Create Stadia Maps provider** (server-side)
6. **Refactor tracking-map.tsx** (client-side)
7. **Update environment variables**
8. **Run full test suite**
9. **Browser verification**
10. **Commit and push**

---

## 19. Summary

| Question | Answer |
|----------|--------|
| Current provider | Mapbox (blocked — no credentials) |
| Recommended provider | Stadia Maps |
| Rendering library | MapLibre GL JS |
| Migration difficulty | LOW (3-5 hours) |
| Monthly MVP cost | $0 |
| Nigeria coverage | Good (OSM-based) |
| Vendor lock-in risk | LOW (MapLibre keeps rendering portable) |
| Should we change now? | **YES** — Mapbox credentials are blocking progress |
| Is it safe to change now? | **YES** — existing abstraction makes it low-risk |
