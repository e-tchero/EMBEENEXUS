# MILESTONE 10 — CUSTOMER LOCATION UX DISCOVERY

## Customer Location & Address UX Rework

**Date:** August 29, 2026
**Status:** DISCOVERY COMPLETE
**HEAD:** `640af0db62377619b5fe2e981514eadb38e4793a`

---

## 1. Executive Summary

The current customer address form exposes raw latitude/longitude fields, requiring customers to manually enter geographic coordinates. This is unacceptable for production UX. Customers should never need to know, find, or enter coordinates.

**Key finding:** The backend already has a complete geocoding infrastructure (`MapsProvider` with `geocode()`, `reverseGeocode()`, `searchAddresses()`, `autocomplete()`). The frontend simply needs to expose this existing functionality through a search-and-map interface.

**Scope:** Replace the manual coordinate entry form with a search-based address flow that automatically resolves coordinates.

---

## 2. Current Customer Address Flow

### Current Form Fields

| Field | Required | Customer-Friendly |
|-------|----------|------------------|
| Label | No | ✅ "Home", "Work" |
| Street Address | Yes | ✅ Text input |
| City | Yes | ✅ Text input (default: Abuja) |
| State | Yes | ✅ Text input (default: FCT) |
| Country | No | ✅ Hidden (Nigeria) |
| Postal Code | No | ✅ Text input |
| **Latitude** | **Yes** | ❌ **Raw number input** |
| **Longitude** | **Yes** | ❌ **Raw number input** |
| Is Default | No | ✅ Checkbox |

### Current Flow

1. Customer clicks "Add Address"
2. Modal opens with form
3. Customer manually enters street address, city, state
4. Customer manually enters latitude and longitude numbers
5. Customer submits
6. Address saved to database

### Problems

1. **Latitude/longitude exposed** — Customers cannot reasonably provide coordinates
2. **No map visualization** — No visual confirmation of location
3. **No search capability** — No address autocomplete or search
4. **No geocoding** — Coordinates must be manually calculated
5. **No reverse geocoding** — Address not auto-populated from coordinates
6. **Mobile unfriendly** — Number inputs for coordinates are terrible on mobile

---

## 3. Current Backend Address Contract

### Database Schema

```sql
CREATE TABLE addresses (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  label TEXT,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT DEFAULT 'Nigeria',
  postal_code TEXT,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Required Fields

- `street_address` — Required for delivery instructions
- `city` — Required for zone determination
- `state` — Required for address completeness
- `latitude` — Required for distance calculation, dispatch, pricing
- `longitude` — Required for distance calculation, dispatch, pricing

### Coordinate Consumers

| Consumer | Purpose |
|----------|---------|
| Quote service | Distance calculation, route planning |
| Dispatch service | Rider proximity matching |
| Pricing | Zone-based pricing |
| Tracking | Real-time location display |
| Service zones | Zone boundary validation |
| PostGIS geometry | Spatial queries (GIST index) |

### API Validation

```typescript
const CreateAddressSchema = z.object({
  label: z.string().max(50).optional(),
  street_address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  is_default: z.boolean().optional(),
});
```

---

## 4. Existing Location Architecture

### MapsProvider Interface

```typescript
export interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(query: string, location?: { lat: number; lon: number }): Promise<GeocodingResult[]>;
  getRoute(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }): Promise<RouteResult>;
  autocomplete?(query: string, location?: { lat: number; lon: number }): Promise<GeocodingResult[]>;
}
```

### GeocodingResult Type

```typescript
export interface GeocodingResult {
  address: string;
  latitude: number;
  longitude: number;
  formatted_address: string;
  components: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  };
}
```

### Available Providers

| Provider | Geocoding | Reverse Geocoding | Autocomplete | Status |
|----------|-----------|-------------------|--------------|--------|
| Mapbox | ✅ | ✅ | ✅ | Active (MAPS_PROVIDER=mapbox) |
| Stadia Maps | ✅ | ✅ | ✅ | Available |
| Google Maps | ✅ | ✅ | ✅ | Available |

### Current Usage

Geocoding is currently only used in the quote service for route calculation. It is NOT exposed to the customer UI.

---

## 5. Coordinate Dependencies

### Where Coordinates Are Required

| System | Requirement | Can Be Auto-Generated? |
|--------|-------------|----------------------|
| Database schema | `latitude DECIMAL(10,8) NOT NULL` | Yes — from geocoding |
| Database schema | `longitude DECIMAL(11,8) NOT NULL` | Yes — from geocoding |
| PostGIS geometry | `GEOGRAPHY(POINT, 4326)` | Yes — generated from lat/lng |
| Quote service | Distance calculation | Yes — from stored coordinates |
| Dispatch service | Rider proximity | Yes — from stored coordinates |
| Pricing | Zone determination | Yes — from stored coordinates |
| Tracking | Location display | Yes — from stored coordinates |

### Conclusion

Coordinates are required by the backend but can be automatically generated from:
- Address search + geocoding
- Device location (browser Geolocation API)
- Map pin interaction
- Reverse geocoding

**No changes to backend coordinate requirements are needed.**

---

## 6. Recommended Customer UX

### Step 1 — Find Location

Customer can:

**A. Search for an address**
- Text input with autocomplete
- Examples: "Shoprite Wuse 2", "12 Aminu Kano Crescent", "Efab Estate"
- Show search results as they type
- Customer selects a result

**B. Use current location**
- Browser requests location permission
- System obtains coordinates automatically
- Reverse geocode to get address text
- Show on map for confirmation

### Step 2 — Confirm on Map

- Display interactive map centered on found location
- Show location marker/pin
- Allow customer to adjust pin position
- Update coordinates as pin moves

### Step 3 — Confirm Address

- Display resolved human-readable address
- Pre-fill from geocoding results
- Allow customer to correct/add information:
  - Address label (Home, Work, Other)
  - Street address (editable)
  - City (editable)
  - State (editable)
  - Landmark (new field)
  - Delivery instructions (new field)

### Step 4 — Save

- Customer presses "Save address"
- Backend receives complete address including automatically resolved coordinates
- Latitude/longitude are HIDDEN from customer

---

## 7. Nigerian Addressing Considerations

### Challenges

- Estates without precise street numbering
- Landmark-based addressing ("near Shoprite", "Opposite NNPC")
- Area names ("Wuse 2", "Garki Area 11")
- Incomplete geocoder results
- Multiple names for same location

### Solutions

- Allow landmark field for additional context
- Allow delivery instructions for precise location
- Pre-fill from geocoding but allow manual correction
- Show map for visual confirmation
- Support both search and current location

---

## 8. Mobile/Accessibility Requirements

| Requirement | Priority |
|-------------|----------|
| Mobile-first layout | MUST |
| Touch-friendly controls | MUST |
| Readable labels | MUST |
| Clear validation | MUST |
| Loading states | MUST |
| Location permission denial handling | MUST |
| Geocoding failure handling | MUST |
| Map loading failure handling | MUST |
| Network failure handling | MUST |
| Empty search results handling | MUST |
| Ambiguous search results handling | MUST |
| Pin adjustment capability | MUST |

---

## 9. Provider Portability

### Current Abstraction

The `MapsProvider` interface already supports:
- `geocode()` — Address → Coordinates
- `reverseGeocode()` — Coordinates → Address
- `searchAddresses()` — Query → Results
- `autocomplete()` — Query → Suggestions

### Customer UI Requirements

The customer address UI must:
1. Use `getMapsProvider()` for all geocoding
2. NOT import provider-specific code directly
3. Work with any provider (Mapbox, Stadia, Google)
4. NOT contain provider-specific API calls

### Provider Switch Impact

| Change | Customer UI Impact |
|--------|-------------------|
| Mapbox → Stadia | ZERO (same interface) |
| Mapbox → Google | ZERO (same interface) |
| Stadia → Mapbox | ZERO (same interface) |

---

## 10. Security Findings

| Check | Status |
|-------|--------|
| Address ownership | ✅ RLS enforces `user_id = auth.uid()` |
| Authorization | ✅ API requires authentication |
| IDOR protection | ✅ RLS prevents cross-user access |
| Coordinate manipulation | ✅ Coordinates validated by API schema |
| Address deletion | ✅ RLS allows owner deletion |
| Default address changes | ✅ RLS allows owner updates |
| API validation | ✅ Zod schema validates all fields |

**No security issues found.**

---

## 11. Database Findings

| Finding | Impact |
|---------|--------|
| `latitude` is `NOT NULL` | Must be provided (auto-generated from geocoding) |
| `longitude` is `NOT NULL` | Must be provided (auto-generated from geocoding) |
| `location` is generated column | Automatically created from lat/lng |
| No `landmark` field | May need to add for delivery instructions |
| No `delivery_instructions` field | May need to add |
| RLS properly configured | User isolation enforced |

### Potential Schema Changes

| Change | Purpose | Priority |
|--------|---------|----------|
| Add `landmark TEXT` | Allow landmark for delivery | SHOULD |
| Add `delivery_instructions TEXT` | Allow special instructions | SHOULD |
| Add `formatted_address TEXT` | Store geocoded address | COULD |

---

## 12. Recommended Implementation Sequence

```
1. Create geocoding API endpoint
   /api/addresses/search (for autocomplete)
   /api/addresses/reverse (for current location)
    ↓
2. Create address search component
   - Search input with debounce
   - Results dropdown
   - Provider-agnostic
    ↓
3. Create address map component
   - Interactive map
   - Draggable pin
   - Provider-agnostic
    ↓
4. Redesign address form
   - Remove lat/lng inputs
   - Add search component
   - Add map component
   - Add landmark field
   - Add delivery instructions
    ↓
5. Update address API
   - Accept geocoded data
   - Validate coordinates from geocoding
    ↓
6. Test with all providers
   - Mapbox
   - Stadia Maps
   - Google Maps
    ↓
7. Mobile optimization
   - Touch-friendly controls
   - Responsive layout
    ↓
8. Error handling
   - Geocoding failures
   - Location permission denied
   - Network failures
```

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Geocoding API rate limits | MEDIUM | Implement caching, debounce |
| Geocoding accuracy | MEDIUM | Allow manual pin adjustment |
| Map loading on slow networks | LOW | Show fallback, loading states |
| Location permission denied | LOW | Provide search as alternative |
| Provider API costs | LOW | Use free tiers, cache results |

---

## 14. Scope Boundaries

### IN SCOPE

- Customer address search component
- Customer address map component
- Redesigned address form (remove lat/lng inputs)
- Geocoding API endpoint
- Reverse geocoding API endpoint
- Mobile optimization
- Error handling

### OUT OF SCOPE

- Admin address management (if different)
- Rider address management (if different)
- Bulk address import
- Address validation against postal services
- Address verification service
- Database schema changes (unless absolutely necessary)

---

## 15. GO / NO-GO Recommendation

**RECOMMENDATION: GO FOR ARCHITECTURE REVIEW**

The existing geocoding infrastructure is complete and provider-agnostic. The customer UX rework primarily involves:
1. Exposing existing geocoding to the frontend
2. Replacing manual coordinate entry with search + map
3. Adding convenience fields (landmark, delivery instructions)

No backend coordinate requirements need to change. No database schema changes are strictly required (landmark/instructions are nice-to-have).

---

**CUSTOMER LOCATION UX DISCOVERY — COMPLETE**
**STATUS: READY FOR ARCHITECTURE REVIEW**

---

*Document generated during Customer Location UX Discovery. No source code was modified.*
