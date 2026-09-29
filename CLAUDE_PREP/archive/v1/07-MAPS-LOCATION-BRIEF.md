# EMBEE NEXUS — MAPS & LOCATION BRIEF

**Authority:** LEVEL 1 — Derived from codebase + mapping architecture
**Date:** September 1, 2026

---

## Provider Architecture

```
lib/maps/
├── types.ts           # MapsProvider interface (abstract)
├── index.ts           # Provider factory (creates provider from env)
├── stadia.ts          # Stadia Maps implementation (CURRENT)
├── mapbox.ts          # Mapbox implementation (NOT USED)
└── google-maps.ts     # Google Maps implementation (NOT USED)
```

### Provider-Neutral Interface

```typescript
interface MapsProvider {
  // Address autocomplete/search
  searchAddresses(query: string, location?: { lat: number; lng: number }): Promise<AddressResult[]>;
  
  // Reverse geocoding (coordinates → address)
  reverseGeocode(lat: number, lng: number): Promise<AddressResult>;
  
  // Forward geocoding (address → coordinates)
  geocode(address: string): Promise<GeocodeResult>;
  
  // Route calculation
  getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<RouteResult>;
  
  // Distance matrix
  getDistance(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<DistanceResult>;
}
```

### Current Provider: Stadia Maps

| Feature | Status |
|---------|--------|
| Address search | ✅ Implemented |
| Reverse geocoding | ✅ Implemented |
| Forward geocoding | ✅ Implemented |
| Route calculation | ✅ Implemented |
| Distance calculation | ✅ Implemented |
| Map rendering | ✅ Implemented (frontend) |
| API key handling | ✅ Server-side only |

---

## How Maps Are Used

### 1. Address Management (Customer)
- Customer enters address text
- Backend geocodes to get latitude/longitude
- Coordinates stored in `addresses` table
- **UX ISSUE:** Current form requires manual lat/lng entry

### 2. Quote/Booking (Customer)
- Pickup and destination coordinates used for:
  - Distance calculation
  - Route geometry
  - Pricing calculation
  - Estimated duration

### 3. Order Tracking (Customer)
- Map shows rider location in real-time
- Route geometry displayed on map
- Rider marker moves along route

### 4. Rider Location (Rider)
- Rider's GPS coordinates sent to server
- Stored in `rider_locations` and `rider_current_locations`
- Used for dispatch (finding nearest rider)

### 5. Dispatch (System)
- Spatial query finds nearest available riders
- Uses PostGIS geography type
- `find_nearest_riders()` PostgreSQL function

---

## Coordinate Requirements

| System | Requires Coordinates | Notes |
|--------|---------------------|-------|
| Addresses | YES | latitude + longitude stored |
| Quotes | YES | pickup + destination |
| Orders | YES | pickup + destination |
| Dispatch | YES | rider current location |
| Tracking | YES | rider real-time location |
| Pricing | YES | distance calculation |

**Coordinates are REQUIRED by the backend. The frontend must provide them.**

---

## Frontend Map Components

| Component | File | Purpose |
|-----------|------|---------|
| Tracking Map | `components/tracking/tracking-map.tsx` | Shows rider location on map |

### Map Rendering
- Uses Stadia Maps JS API for map display
- Map container with rider marker
- Route polyline display
- Auto-center on rider location

---

## Provider Portability

To switch from Stadia Maps to another provider:
1. Create new adapter implementing `MapsProvider` interface
2. Add case in provider factory
3. Change `MAPS_PROVIDER` environment variable
4. **No domain logic changes required**

---

## What Claude Should Know

1. **Maps are provider-abstracted.** Claude should NOT hard-code Stadia Maps into the UI design.
2. **Coordinates are backend requirements.** The customer should never see raw coordinates.
3. **The address form UX is being redesigned.** Current manual lat/lng entry is unacceptable.
4. **Map rendering happens in the tracking view.** This is the primary map interaction.
5. **Route geometry is pre-calculated.** One route per quote, stored on the order.
