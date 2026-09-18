# MAPPING PROVIDER IMPLEMENTATION REPORT

**Date:** August 26, 2026
**Status:** IMPLEMENTATION COMPLETE — AWAITING FINAL VERIFICATION
**Scope:** Replace Mapbox GL JS with MapLibre GL JS + Stadia Maps

---

## 1. Summary

Replaced the blocked Mapbox mapping stack with **MapLibre GL JS** (open-source renderer) + **Stadia Maps** (tiles, geocoding, routing). The existing `MapsProvider` abstraction is preserved. Route-based pricing architecture is unchanged.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `apps/web/lib/maps/stadia.ts` | Stadia Maps provider implementing `MapsProvider` interface |

### 2.1 Stadia Maps Provider (`stadia.ts`)

Implements the full `MapsProvider` interface:

| Method | Stadia Maps API | Credits/Request |
|--------|----------------|-----------------|
| `geocode()` | Geocoding v2 forward | 20 |
| `reverseGeocode()` | Geocoding v2 reverse | 20 |
| `searchAddresses()` | Geocoding v2 forward (with focus) | 20 |
| `autocomplete()` | Geocoding v2 autocomplete | 1 |
| `getRoute()` | Standard Routing v1 | 20 |

Also exposes `autocomplete()` as an additional method for cost-optimized search-as-you-type (1 credit/request vs 20 for forward geocoding).

---

## 3. Files Modified

| File | Change |
|------|--------|
| `apps/web/package.json` | `mapbox-gl` → `maplibre-gl`, removed `@types/mapbox-gl` |
| `pnpm-lock.yaml` | Updated lockfile |
| `apps/web/lib/maps/index.ts` | Added `"stadia"` case as default provider |
| `apps/web/lib/maps/mapbox.ts` | Updated comments (legacy provider retained) |
| `apps/web/components/tracking/tracking-map.tsx` | Replaced `mapbox-gl` with `maplibre-gl`, Stadia Maps tiles, Embee brand colors, attribution |

---

## 4. Dependency Changes

| Before | After |
|--------|-------|
| `mapbox-gl` ^3.29.0 | `maplibre-gl` ^6.6.0 |
| `@types/mapbox-gl` ^3.5.0 | (removed — maplibre-gl includes types) |

**Net change:** -1 dependency (mapbox-gl removed), +1 dependency (maplibre-gl added)

---

## 5. Environment Variables

| Variable | Required | Scope |
|----------|----------|-------|
| `MAPS_PROVIDER` | Yes | Server (default: `stadia`) |
| `STADIA_MAPS_API_KEY` | Yes | **Server only** — used for geocoding/routing API calls |

**No client-side API key is used.** Tile authentication uses domain-based auth (see §5.1).

### 5.1 Authentication Model (Verified against Stadia Maps docs)

| Use Case | Method | API Key Required? |
|----------|--------|-------------------|
| Local development (localhost) | No auth needed | ❌ No |
| Production web app (tiles) | **Domain-based auth** | ❌ No |
| Server-side (geocoding/routing) | API key via query string | ✅ Yes (server-only) |
| Mobile apps | API key | ✅ Yes |

**Production tile authentication:** Configured through the Stadia Maps dashboard (Manage Properties → Authentication Configuration → add domain). The browser sends Origin/Referer headers automatically; Stadia validates them server-side. No API key is embedded in client JavaScript.

**Server-side API authentication:** The `STADIA_MAPS_API_KEY` env var is read only by `lib/maps/stadia.ts` (server-side module). It is never referenced in any client component, never prefixed with `NEXT_PUBLIC_*`, and never exposed to the browser.

**Localhost:** Stadia Maps allows unauthenticated requests from localhost/127.0.0.1 for development.

---

## 6. Pricing Architecture

### 6.1 Route-Based Pricing (Preserved)

```
Stadia Maps Routing API
  → Returns: distance_km, duration_minutes, polyline
    → QuoteService consumes route facts
      → Applies pricing rules (base_fee + distance_fee + weight_fee + priority_fee)
        → Customer sees final price
```

**No fixed geographic zones used for pricing.** The mapping provider supplies normalized routing facts. The Embee Nexus pricing engine determines customer price.

### 6.2 MapsProvider Abstraction (Preserved)

```typescript
interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(query: string, location?: {...}): Promise<GeocodingResult[]>;
  getRoute(origin: {...}, destination: {...}): Promise<RouteResult>;
}
```

The `quote.service.ts` calls `getMapsProvider().getRoute()` exactly as before. No business logic changes.

---

## 7. Map Rendering

### 7.1 Tile Source

- **Style:** `https://tiles.stadiamaps.com/styles/alidade_smooth.json`
- **Renderer:** MapLibre GL JS (open-source, BSD-3)
- **Attribution:** © Stadia Maps, © OpenMapTiles, © OpenStreetMap contributors

### 7.2 Tracking Map Changes

| Before (Mapbox) | After (MapLibre + Stadia) |
|-----------------|---------------------------|
| `import('mapbox-gl')` | `import('maplibre-gl')` |
| `mapboxgl.default.Map` | `maplibregl.Map` (named export) |
| `mapbox://styles/mapbox/streets-v12` | `https://tiles.stadiamaps.com/styles/alidade_smooth.json` |
| `accessToken = token` | Not needed (domain auth or URL key) |
| Route line color: `#6366f1` (indigo) | Route line color: `#147BFF` (Embee Blue) |
| Rider marker: `#3b82f6` | Rider marker: `#147BFF` (Embee Blue) |
| Error: "Check NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN" | Error: "Check mapping configuration" |
| No attribution | Attribution bar with Stadia Maps, OpenMapTiles, OSM |

---

## 8. Server-Side Provider Architecture

### 8.1 Provider Selection

```typescript
// lib/maps/index.ts
const providerType = process.env.MAPS_PROVIDER || 'stadia'; // Default changed from 'mapbox' to 'stadia'

if (providerType === 'stadia') {
  provider = new StadiaMapsProvider(apiKey);
} else if (providerType === 'google') {
  provider = new GoogleMapsProvider(apiKey);
} else {
  provider = new MapboxProvider(accessToken); // Legacy fallback
}
```

### 8.2 Legacy Providers Retained

The `MapboxProvider` and `GoogleMapsProvider` are retained as fallback options. They are not the default and are not imported unless explicitly selected via `MAPS_PROVIDER` env var.

---

## 9. Security / Authentication

### 9.1 Authentication Model

| Layer | Method | Key Exposure |
|-------|--------|-------------|
| **Client tiles (MapLibre)** | Domain-based auth | **No API key in browser** |
| **Server geocoding/routing** | API key (`STADIA_MAPS_API_KEY`) | **Server-only env var** |
| **Localhost dev** | No auth needed | **No key required** |

### 9.2 Security Verification

| Check | Result |
|-------|--------|
| API key in client source code | ✅ NONE — `STADIA_MAPS_API_KEY` is server-only |
| `NEXT_PUBLIC_*` Stadia references | ✅ ZERO — confirmed via codebase scan |
| `process.env` in tracking-map.tsx | ✅ NONE — no env vars referenced |
| `api_key` in tracking-map.tsx | ✅ NONE — no credentials in client |
| Server key exposed to browser | ✅ NO — `STADIA_MAPS_API_KEY` not in any client file |
| Domain-based tile auth | ✅ Configured via Stadia dashboard, not code |
| IDOR risk | ✅ NONE — MapsProvider is stateless, no user data |
| RLS impact | ✅ NONE — MapsProvider is not in Supabase path |
| Attribution requirement | ✅ Met — attribution bar in TrackingMap |

### 9.3 Production Setup Required

1. Sign in to Stadia Maps dashboard
2. Navigate to Manage Properties → Authentication Configuration
3. Add production domain (e.g., `embeenexus.com`)
4. Tiles will authenticate via Origin/Referer headers automatically
5. No API key embedding in client JavaScript required

---

## 10. Verification Results

| Check | Result |
|-------|--------|
| Typecheck | ✅ PASS — 3/3 packages, zero errors |
| Unit tests | ✅ **407/407 PASS** |
| Production build | ✅ PASS — Compiled successfully in 46s |
| Secrets scan | ✅ CLEAN |
| Attribution scan | ✅ ZERO |
| `mapbox-gl` in package.json | ✅ REMOVED |
| `@types/mapbox-gl` in package.json | ✅ REMOVED |
| `import('mapbox-gl')` in source | ✅ ZERO references |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in source | ✅ ZERO references |
| `NEXT_PUBLIC_STADIA_*` in source | ✅ ZERO — no client-side key exposure |
| `process.env` in tracking-map.tsx | ✅ NONE — no env vars in client |
| `api_key` in tracking-map.tsx | ✅ NONE — no credentials in client |
| `MBEENEXUS` in maps code | ✅ ZERO (cleaned from legacy comments) |
| Stadia Maps attribution | ✅ Present in TrackingMap |
| Route-based pricing preserved | ✅ QuoteService unchanged |
| MapsProvider abstraction preserved | ✅ Interface unchanged |
| Authentication model | ✅ Domain-based (tiles) + server-only API key (geocoding/routing) |

---

## 11. Git Status

| Check | Result |
|-------|--------|
| HEAD | `6c6e42b` (unchanged) |
| Modified files | 5 source + pnpm-lock |
| New files | 1 (stadia.ts) |
| Untracked docs | 3 (decision report, investigation, this report) |
| Phase 1–6D commits | ✅ Untouched |

### Files Changed

```
 apps/web/components/tracking/tracking-map.tsx |  67 ++++++----
 apps/web/lib/maps/index.ts                    |  32 +++--
 apps/web/lib/maps/mapbox.ts                   |   4 +-
 apps/web/package.json                         |   3 +-
 pnpm-lock.yaml                                | 173 +++++++++++---
 1 new file: apps/web/lib/maps/stadia.ts
```

---

## 12. What Was NOT Changed

- Database: ZERO
- Migrations: ZERO
- APIs: ZERO (existing MapsProvider interface preserved)
- Authentication logic: ZERO
- Authorization logic: ZERO
- Payment logic: ZERO
- Booking logic: ZERO
- Dispatch logic: ZERO
- QuoteService: ZERO (still calls `getMapsProvider().getRoute()`)
- Rider location service: ZERO
- Background jobs: ZERO
- Realtime subscriptions: ZERO

---

## 13. Remaining Manual Steps

### 13.1 Stadia Maps Account Setup

1. Sign up at stadiamaps.com (free, no credit card)
2. Upgrade to Starter plan ($20/month) for commercial use
3. Generate API key from Manage Properties → Authentication Configuration

### 13.2 Production Domain Authentication (Tiles)

1. In Stadia Maps dashboard → Manage Properties → Authentication Configuration
2. Add production domain (e.g., `embeenexus.com`)
3. Tiles will authenticate via Origin/Referer headers automatically
4. **No API key embedding in client JavaScript required**

### 13.3 Server-Side Environment Variables

1. Add `STADIA_MAPS_API_KEY=<your-key>` to `.env.local` (server-side only)
2. Add `MAPS_PROVIDER=stadia` to `.env.local`
3. Add same vars to production environment (Vercel/ hosting)
4. **Do NOT add `NEXT_PUBLIC_` prefix** — key must remain server-only

### 13.4 Cleanup

1. Remove old `MAPBOX_ACCESS_TOKEN` and `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` from `.env.local`
2. Remove old `MAPS_PROVIDER=mapbox` if present

---

## 14. Migration Effort Actual

| Step | Estimated | Actual |
|------|-----------|--------|
| Install maplibre-gl | 5 min | ✅ Done |
| Create Stadia Maps provider | 1-2 hrs | ✅ Done |
| Refactor tracking-map.tsx | 1-2 hrs | ✅ Done |
| Update factory | 15 min | ✅ Done |
| Typecheck fix (v6 exports) | — | ✅ Done |
| Testing | 1 hr | ✅ Done |
| **Total** | **3-5 hrs** | **Completed in session** |

---

## 15. Recommendation

**PHASE 6E (MAPPING) IMPLEMENTATION COMPLETE — AWAITING FINAL VERIFICATION / COMMIT AUTHORIZATION**

All source changes are clean. No secrets. No AI attribution. No regressions. Existing functionality preserved.
