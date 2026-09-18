# PHASE 2 — ARCHITECTURE REVIEW & HARDENING

**Document Status:** Architecture Hardening Complete — Awaiting Implementation Authorization
**Date:** August 23, 2026
**Scope:** Rider Availability & Location — Architecture Review Only

---

## 1. CRITICAL: REALTIME TRACKING MUST NOT LEAK RIDER LOCATIONS

### The Problem

Publishing `rider_current_locations` directly to Supabase Realtime would broadcast ALL rider location changes to ALL subscribers. Even with RLS filtering on SELECT, Realtime operates differently:

- **Realtime PostgreSQL replication** broadcasts row-level changes to ALL subscribers
- RLS is enforced on **queries**, not on **change notifications**
- A subscriber to `rider_current_locations` would receive every rider's GPS update regardless of authorization

### The Correct Architecture: Broadcast Channels (NOT Table Publication)

**Use Supabase Broadcast channels instead of PostgreSQL table publication for customer tracking.**

```
Rider GPS update
    ↓
POST /api/riders/location
    ↓
Server-side: INSERT rider_locations (trigger upserts rider_current_locations)
    ↓
Server-side: Check if rider has active order
    ↓
IF active delivery exists:
    ↓
Supabase Broadcast → channel: "delivery:{order_id}"
    ↓
Payload: { rider_id, latitude, longitude, heading, speed, accuracy, recorded_at }
    ↓
Customer subscribes to "delivery:{order_id}"
    ↓
ONLY receives rider location for THEIR specific order
```

### Why Broadcast > Table Publication

| Mechanism | Rider Privacy | Customer Scope | Authorization | Performance |
|-----------|---------------|----------------|---------------|-------------|
| Table Publication | ❌ All riders visible to all subscribers | ❌ All changes broadcast | ❌ RLS doesn't filter Realtime events | ❌ High event volume |
| Broadcast Channel | ✅ Only assigned rider | ✅ Only specific order | ✅ Server controls what is broadcast | ✅ Targeted delivery |

### Implementation Detail

1. **Do NOT add `rider_current_locations` to `supabase_realtime` publication**
2. **Use server-side Broadcast** from the location API endpoint
3. **Channel name:** `delivery:{order_id}`
4. **Broadcast scope:** Server-side only — client cannot broadcast
5. **Authorization:** Server verifies rider is assigned to the order before broadcasting

```typescript
// In location API handler, AFTER upsert:
if (riderHasActiveOrder) {
  await supabase.channel(`delivery:${orderId}`).send({
    type: 'broadcast',
    event: 'rider-location',
    payload: {
      rider_id: riderId,
      latitude,
      longitude,
      heading,
      speed,
      accuracy,
      recorded_at: recordedAt,
    },
  });
}
```

### Customer Subscription

```typescript
// Customer frontend:
const channel = supabase.channel(`delivery:${orderId}`)
  .on('broadcast', { event: 'rider-location' }, (payload) => {
    updateRiderMarker(payload.payload);
  })
  .subscribe();
```

### When Tracking Ends

- Order completed/cancelled → server stops broadcasting
- Customer channel automatically receives no further events
- No explicit "unsubscribe" needed (channel cleanup is automatic)

---

## 2. SEPARATE FOUR LOCATION CONCERNS

The architecture must explicitly separate four distinct workloads:

### A. LOCATION INGESTION

**Purpose:** Receive GPS updates from rider devices
**Endpoint:** `POST /api/riders/location`
**Authentication:** Rider must be authenticated
**Validation:** Coordinates, timestamp, speed, accuracy
**Output:** Persisted to `rider_locations` (append-only)

### B. CURRENT LOCATION STATE

**Purpose:** Latest known location for dispatch and tracking
**Table:** `rider_current_locations` (UPSERT model)
**Updated by:** Trigger `update_rider_current_location()` on `rider_locations` INSERT
**Read by:** Dispatch (`find_nearest_riders`), Customer tracking (via Broadcast)
**Index:** GIST spatial index for proximity queries

### C. HISTORICAL LOCATION TELEMETRY

**Purpose:** Audit trail, dispute investigation, analytics
**Table:** `rider_locations` (append-only)
**Retention:** 90 days configurable
**Cleanup:** Background job `LOCATION_CLEANUP`
**NOT used for:** Realtime tracking, dispatch queries, live customer view

### D. CUSTOMER REALTIME BROADCAST

**Purpose:** Delivery-specific rider location events
**Mechanism:** Supabase Broadcast channels
**Channel:** `delivery:{order_id}`
**Scope:** Server-controlled — only assigned rider's location
**Lifecycle:** Active during delivery only

### Why Separation Matters

| Concern | Write Frequency | Read Pattern | Retention | Latency Requirement |
|---------|----------------|--------------|-----------|---------------------|
| Ingestion | Every 5s per rider | Write-only | Permanent | Low (submission) |
| Current State | UPSERT per rider | Spatial query | Latest only | Low (dispatch) |
| Historical | Throttled | Time-range query | 90 days | Medium (analytics) |
| Broadcast | Per-location if active | Fan-out to customers | Session only | Very Low (live tracking) |

---

## 3. RECONSIDER THE 5-SECOND / 10-METER POLICY

### Configuration Location

These values MUST be stored in `platform_settings`, not hard-coded:

| Setting Key | Default | Purpose |
|-------------|---------|---------|
| `location_update_min_interval_seconds` | 5 | Minimum time between accepted updates |
| `location_update_min_distance_meters` | 10 | Minimum movement to trigger write |
| `location_stale_threshold_seconds` | 60 | How long before rider is considered stale |
| `location_max_speed_kmh` | 200 | Maximum allowed speed (reject if exceeded) |
| `location_max_age_seconds` | 300 | Reject updates older than 5 minutes |
| `location_retention_days` | 90 | Historical location retention |

### GPS Validation Rules

| Rule | Behavior | Configurable |
|------|----------|--------------|
| Invalid latitude [-90, 90] | Reject | No (safety) |
| Invalid longitude [-180, 180] | Reject | No (safety) |
| Future timestamp | Reject | No (safety) |
| Timestamp too old (>5min) | Reject | Yes (`location_max_age_seconds`) |
| Duplicate coordinates within interval | Skip write, update `updated_at` only | Yes (`location_update_min_interval_seconds`) |
| Movement < threshold | Skip write, update `updated_at` only | Yes (`location_update_min_distance_meters`) |
| Speed exceeds max | Reject with warning | Yes (`location_max_speed_kmh`) |
| GPS accuracy >100m | Accept but flag as low-accuracy | Yes |

### Edge Cases (MVP)

| Scenario | Behavior |
|----------|----------|
| Rider stationary for minutes | Accept updates, skip writes if no movement |
| GPS jitter | Distance threshold filters small jumps |
| Poor GPS accuracy | Accept but mark accuracy in payload |
| Duplicate coordinates | Skip write, update timestamp only |
| Intermittent connectivity | Batch not supported — each update is independent |
| Timestamp older than last accepted | Reject (prevents replay) |

### Advanced Anti-Fraud (Documented for Future)

- Impossible travel speed detection
- Route validation against known roads
- GPS spoofing detection (satellite count, signal strength)
- Pattern analysis (consistent location = suspicious)
- Device fingerprinting

---

## 4. DO NOT WRITE HISTORY EVERY 5 SECONDS

### The Write Volume Problem

At 5-second update intervals:

| Active Riders | Updates/sec | Writes/day | PostgreSQL Writes/sec |
|---------------|-------------|------------|----------------------|
| 10 | 2 | 172,800 | 2 |
| 100 | 20 | 1,728,000 | 20 |
| 1,000 | 200 | 17,280,000 | 200 |
| 10,000 | 2,000 | 172,800,000 | 2,000 |

**PostgreSQL can handle ~10,000 simple UPSERTs/sec** on Supabase's managed infrastructure. But this is wasteful — most updates are redundant when the rider hasn't moved.

### The Solution: Two-Tier Persistence

**Tier 1: CURRENT LOCATION (High Frequency)**

```
Rider GPS → POST /api/riders/location
    ↓
Throttle check: skip if < min_interval since last update
    ↓
Distance check: skip if < min_distance since last position
    ↓
IF passes both checks:
    ↓
INSERT rider_locations → trigger UPSERTs rider_current_locations
    ↓
Broadcast to delivery channel (if active order)
```

**Tier 2: HISTORICAL PERSISTENCE (Throttled)**

The `rider_locations` table (historical) is written on EVERY accepted update. But the throttling in Tier 1 means we only write when the rider has actually moved or enough time has passed.

**Realistic Write Volume with Throttling:**

| Active Riders | Effective Updates/sec (throttled) | Writes/day |
|---------------|-----------------------------------|------------|
| 10 | 1 | 86,400 |
| 100 | 10 | 864,000 |
| 1,000 | 100 | 8,640,000 |
| 10,000 | 1,000 | 86,400,000 |

**At 1,000 riders: ~100 writes/sec = comfortable for PostgreSQL**
**At 10,000 riders: ~1,000 writes/sec = near PostgreSQL limit, consider Redis**

### Optional: Sampled Historical Persistence

For additional reduction, the server could decide to skip historical persistence for stationary riders:

```typescript
// After throttle/distance check passes:
const shouldPersistHistorical = 
  distanceMoved > 50 ||           // Significant movement
  timeSinceLastHistorical > 30 || // 30 seconds since last historical write
  isFirstUpdate;                  // First update of the session

if (shouldPersistHistorical) {
  await insertRiderLocation(...); // Writes to rider_locations
}
// Always upsert current location regardless
```

**MVP Decision:** Use throttle-based persistence (no additional sampling). The min_interval + min_distance filters already reduce write volume substantially.

---

## 5. DATABASE RESOURCE PROTECTION

### Resource Budget per Location Update

| Resource | Cost | Mitigation |
|----------|------|------------|
| PostgreSQL WRITE (rider_locations) | ~1 row insert | Throttled by interval/distance |
| PostgreSQL UPSERT (rider_current_locations) | 1 row upsert | Trigger-based, single row |
| PostgreSQL INDEX MAINTENANCE | 3 indexes on rider_locations, 4 on current | Acceptable for write volume |
| PostgreSQL WAL | ~500 bytes per write | Bounded by write volume |
| Supabase Realtime BROADCAST | 1 event per active delivery | Only for riders with orders |
| Database CONNECTION | 1 per API request | Supabase pooler handles |
| API COMPUTE | Validation + DB write | Lightweight operations |

### Per-Update Cost Summary

For a single rider location update that passes throttling:
- 1 INSERT to `rider_locations` (~500 bytes)
- 1 UPSERT to `rider_current_locations` (~500 bytes)
- 1-2 Broadcast events (if active delivery)
- Total: ~1KB database write + optional broadcast

### Storage Growth Estimate

| Daily Active Riders | Daily Writes | Monthly Storage | Annual Storage |
|---------------------|--------------|-----------------|----------------|
| 100 | 864K | ~430 MB | ~5.2 GB |
| 1,000 | 8.6M | ~4.3 GB | ~52 GB |
| 10,000 | 86M | ~43 GB | ~520 GB |

**At 10,000 DAU:** ~520 GB/year for historical locations. Partitioning and 90-day retention reduce this significantly.

### What NOT to Do

- Do NOT write every GPS event without throttling
- Do NOT broadcast all rider locations to all customers
- Do NOT store historical locations without retention cleanup
- Do NOT use COUNT-based queries for real-time operations
- Do NOT N+1 query for dispatch (spatial index handles this)

---

## 6. CURRENT LOCATION UPSERT

### Exact Update Flow

```
1. Rider sends POST /api/riders/location
2. API authenticates rider (auth.uid())
3. API validates coordinates, timestamp, speed
4. API checks throttle: skip if < min_interval since rider_profiles.last_location_update
5. API checks distance: skip if < min_distance from rider_current_locations
6. If passes checks:
   a. INSERT rider_locations (with rider_id = auth.uid())
   b. Trigger fires: UPSERT rider_current_locations
   c. If rider has active order → Broadcast to delivery channel
7. Update rider_profiles.last_location_update
8. Return success
```

### Trigger Behavior

```sql
-- update_rider_current_location() trigger
-- Fires AFTER INSERT on rider_locations
-- UPSERTs into rider_current_locations:
INSERT INTO rider_current_locations (rider_id, latitude, longitude, location, heading, speed, accuracy, updated_at)
VALUES (NEW.rider_id, NEW.latitude, NEW.longitude, NEW.location, NEW.heading, NEW.speed, NEW.accuracy, NOW())
ON CONFLICT (rider_id) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  location = EXCLUDED.location,
  heading = EXCLUDED.heading,
  speed = EXCLUDED.speed,
  accuracy = EXCLUDED.accuracy,
  updated_at = NOW();
```

### Key Properties

- **Rider identity:** Comes from `auth.uid()` — never trust client-supplied `rider_id`
- **Spatial index:** GIST index on `location` column preserved through UPSERT
- **Freshness:** `updated_at` always set to `NOW()`
- **Concurrency:** UPSERT is atomic — no race conditions
- **No unnecessary updates:** Throttle check in application layer prevents redundant triggers

### The `rider_profiles.current_location` Inconsistency

**Finding:** `rider_profiles` has a `current_location` GEOGRAPHY column that is NOT updated by the trigger.

**Impact:** None — dispatch uses `rider_current_locations`, not `rider_profiles.current_location`.

**Recommendation:** Do NOT use `rider_profiles.current_location` for any critical path. It appears to be a legacy/redundant column. Future migration can remove it.

---

## 7. AVAILABILITY MUST NOT BE A SIMPLE BOOLEAN

### Current Schema

```sql
-- rider_current_locations.is_available (BOOLEAN)
-- rider_profiles.is_available (BOOLEAN)
```

### Required State Model

The system needs to distinguish these states conceptually:

| State | Meaning | Dispatch Eligible | Location Updates |
|-------|---------|-------------------|------------------|
| **OFFLINE** | Rider chose to go offline | No | No |
| **ONLINE / AVAILABLE** | Rider is online and accepting deliveries | Yes | Yes |
| **BUSY / ON DELIVERY** | Rider is actively delivering | No | Yes |
| **STALE / DISCONNECTED** | Rider stopped sending updates | No | N/A |
| **UNVERIFIED** | Rider not yet approved | No | Yes |
| **SUSPENDED** | Rider account suspended | No | No |

### How to Represent This

**Do NOT add a new enum/table.** Use the existing columns:

| Column | Source | Purpose |
|--------|--------|---------|
| `rider_profiles.verification_status` | Admin-managed | Controls base eligibility |
| `rider_current_locations.is_available` | Rider toggles + dispatch manages | Online/offline + dispatch lock |
| `rider_current_locations.updated_at` | Location updates | Staleness detection |
| `rider_assignments.status` | Dispatch | Active delivery state |

### State Resolution Logic

```typescript
function isRiderDispatchable(rider: {
  verification_status: string;
  is_available: boolean;
  updated_at: Date;
}): boolean {
  // Must be verified
  if (rider.verification_status !== 'approved') return false;
  
  // Must have toggled online
  if (!rider.is_available) return false;
  
  // Must not be stale (60s threshold)
  const staleThreshold = getSetting('location_stale_threshold_seconds');
  const lastSeen = new Date(rider.updated_at);
  const secondsSinceUpdate = (Date.now() - lastSeen.getTime()) / 1000;
  if (secondsSinceUpdate > staleThreshold) return false;
  
  // Must not have an active assignment
  // (checked separately via rider_assignments)
  
  return true;
}
```

### Dispatch Function Integration

The existing `find_nearest_riders()` function already filters on:
- `rcl.is_available = TRUE`
- `rp.verification_status = 'approved'`
- Spatial proximity (GIST index)

**Missing:** Staleness check. The function should also verify:
- `rcl.updated_at > NOW() - INTERVAL '60 seconds'`

**Decision:** Add staleness check to `find_nearest_riders()` function in Phase 2.

---

## 8. STALENESS MUST BE SERVER-AUTHORITATIVE

### Staleness Definition

A rider is "stale" when:
- `rider_current_locations.updated_at` is older than `location_stale_threshold_seconds` (default: 60s)

### Detection Strategy: Both A + B

**A. Dynamic calculation during dispatch queries:**

```sql
-- In find_nearest_riders():
WHERE rcl.is_available = TRUE
  AND rp.verification_status = 'approved'
  AND rcl.updated_at > NOW() - INTERVAL '60 seconds'  -- ADD THIS
  AND ST_Distance(...) / 1000 <= p_max_distance_km
```

**B. Background job for cleanup:**

```typescript
// STALE_RIDER_DETECTION job
// Runs every 30 seconds via cron
async function detectStaleRiders() {
  const staleThreshold = getSetting('location_stale_threshold_seconds');
  
  // Mark stale riders as unavailable
  await supabase.rpc('mark_stale_riders', {
    p_threshold_seconds: staleThreshold
  });
}
```

### Why Both?

- **Dynamic (A):** Ensures dispatch never selects stale riders, even if cleanup job hasn't run
- **Background (B):** Keeps the data clean, prevents stale riders from appearing in queries
- **Combined:** Defense in depth — neither mechanism alone is sufficient

### Implementation

Add a new PostgreSQL function:

```sql
CREATE OR REPLACE FUNCTION mark_stale_riders(p_threshold_seconds integer)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rider_current_locations
  SET is_available = FALSE
  WHERE is_available = TRUE
    AND updated_at < NOW() - (p_threshold_seconds || ' seconds')::INTERVAL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### What Happens When Rider Loses Connectivity

1. Rider stops sending GPS updates
2. After 60 seconds → `updated_at` becomes stale
3. Background job marks `is_available = FALSE`
4. Dispatch no longer selects this rider
5. If rider has active order → order status handling (rider_reassignment flow)
6. Rider reconnects → sends new location → `is_available` can be re-enabled

---

## 9. CUSTOMER TRACKING AUTHORIZATION

### Authorization Model

```
Customer A owns Order A
Order A is assigned to Rider X
Customer A can track Rider X for Order A ONLY
```

### How Authorization Works

1. **Customer subscribes to channel:** `delivery:{order_id}`
2. **Server-side Broadcast:** Only sends location if rider is assigned to that order
3. **No RLS needed for Realtime:** Server controls what is broadcast
4. **Channel is order-scoped:** Customer must know the order_id (which they own)

### What Customer CANNOT Do

| Attack | Prevention |
|--------|------------|
| Subscribe to another order's channel | Channel name requires order_id they don't own |
| Receive all rider locations | Server only broadcasts assigned rider |
| Track rider after delivery ends | Server stops broadcasting |
| Enumerate riders | No API exposes rider list to customers |
| Access historical locations | No API or Realtime for historical data |

### Tracking Lifecycle

| Event | Action |
|-------|--------|
| Order status → `rider_assigned` | Server starts broadcasting on `delivery:{order_id}` |
| Rider location update | Server broadcasts to `delivery:{order_id}` |
| Order status → `completed` | Server stops broadcasting |
| Order status → `cancelled` | Server stops broadcasting |
| Rider reassigned | Server stops old broadcast, starts new one |
| Rider goes offline/stale | Server stops broadcasting (no location to send) |

### Reassignment Handling

When dispatch reassigns an order to a new rider:
1. Old rider's broadcast stops (no longer assigned)
2. New rider's broadcast starts on same channel `delivery:{order_id}`
3. Customer seamlessly sees new rider's location
4. No channel change needed — same order_id

---

## 10. DISPATCH INTEGRATION

### Existing PostgreSQL Functions

| Function | Purpose | Reads | Writes |
|----------|---------|-------|--------|
| `find_nearest_riders(lat, lon, max_km, limit)` | Spatial proximity query | `rider_current_locations`, `rider_profiles` | None |
| `dispatch_rider_v2(order_id)` | Create rider offer | `rider_current_locations`, `orders` | `rider_assignments`, `rider_current_locations`, `orders` |
| `accept_rider_offer(assignment_id, rider_id)` | Rider accepts | `rider_assignments`, `orders` | `rider_assignments`, `orders`, `rider_current_locations` |
| `reject_rider_offer(assignment_id, rider_id, reason)` | Rider rejects | `rider_assignments` | `rider_assignments`, `rider_current_locations`, `background_jobs` |

### Phase 2 Enhancement Required

Add staleness check to `find_nearest_riders()`:

```sql
-- Current:
WHERE rcl.is_available = TRUE
  AND rp.verification_status = 'approved'
  AND ST_Distance(...) / 1000 <= p_max_distance_km

-- Enhanced:
WHERE rcl.is_available = TRUE
  AND rp.verification_status = 'approved'
  AND rcl.updated_at > NOW() - INTERVAL '60 seconds'  -- NEW
  AND ST_Distance(...) / 1000 <= p_max_distance_km
```

### Dispatch Query Contract

Phase 3 dispatch needs to efficiently find:
- `nearby` → GIST spatial index ✅
- `available` → Partial index on `is_available` ✅
- `fresh` → New: staleness check on `updated_at` ✅ (after enhancement)
- `eligible` → `verification_status = 'approved'` via JOIN ✅
- `not already assigned` → Check `rider_assignments` (Phase 3)

---

## 11. MAP PROVIDERS

### Location Ingestion — No Map Provider Involvement

GPS coordinates arrive directly from the rider device. Map providers are NOT involved in:
- Receiving GPS coordinates
- Validating coordinates (application logic)
- Storing current location
- Broadcasting to customers

### Map Provider Responsibilities (Separate)

| Operation | Provider Needed |
|-----------|-----------------|
| Geocoding (address → coordinates) | Mapbox or Google Maps |
| Reverse geocoding (coordinates → address) | Mapbox or Google Maps |
| Routing (pickup → destination) | Mapbox or Google Maps |
| Distance calculation | PostGIS (server-side) or Maps |
| ETA calculation | Maps provider |
| Map visualization (customer UI) | Mapbox or Google Maps GL |

### Provider Abstraction Remains Intact

```typescript
// Business logic calls abstraction:
const maps = await getMapsProvider(); // Returns Mapbox or Google Maps
const route = await maps.getRoute(pickup, destination);

// Never:
import { MapboxClient } from '@mapbox/mapbox-sdk';
```

---

## 12. SCALE BOUNDARIES

### Architecture Evolution Path

```
MVP (Abuja Launch)
├── PostgreSQL/PostGIS for all location storage
├── Supabase Realtime Broadcast for customer tracking
├── Trigger-based current location UPSERT
├── Background job for stale rider detection
├── 90-day historical retention
└── ~100-500 concurrent riders

Growth (City Expansion)
├── PostgreSQL for authoritative state
├── Redis for current rider location (hot data)
├── Separate Realtime broadcast service
├── Partitioned rider_locations by month
├── ~1,000-5,000 concurrent riders

Scale (Multi-City / National)
├── Redis/geospatial for dispatch queries
├── PostgreSQL for durable business state
├── Dedicated location ingestion service
├── Kafka/event streaming for location pipeline
├── CDN for map tiles
├── ~10,000+ concurrent riders
```

### API Contract Stability

**Critical requirement:** The client-facing API must NOT change when the location backend changes.

```typescript
// Client always calls:
POST /api/riders/location  // Rider sends GPS
GET /api/riders/location   // Rider gets current location
PATCH /api/riders/availability  // Rider toggles online/offline

// Customer always subscribes:
channel(`delivery:${orderId}`).on('broadcast', ...)
```

**When migrating to Redis:**
- Server-side: Redis replaces PostgreSQL for current location reads
- Client-side: Zero changes required
- API contract: Identical

### Migration Triggers

| Metric | Trigger | Migration |
|--------|---------|-----------|
| Location writes/sec > 1,000 | PostgreSQL pressure | Add Redis write-through |
| Dispatch query latency > 100ms | Spatial query slow | Redis geospatial for dispatch |
| Broadcast delivery latency > 500ms | Realtime backlog | Dedicated broadcast service |
| Historical storage > 500GB | Storage pressure | Partition + archive |
| Connection pool exhaustion | Too many concurrent riders | Separate read replicas |

---

## 13. INDEX AUDIT

### Current Indexes on Location Tables

| Index | Table | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| `rider_current_locations_pkey` | rider_current_locations | rider_id | B-tree UNIQUE | Primary key, UPSERT target |
| `idx_rider_current_locations_geo` | rider_current_locations | location | GIST | Spatial dispatch query |
| `idx_rider_current_locations_available` | rider_current_locations | is_available WHERE true | B-tree PARTIAL | Available riders fast lookup |
| `idx_rider_dispatch_lookup` | rider_current_locations | (is_available, updated_at) WHERE true | B-tree COMPOSITE PARTIAL | Dispatch with freshness |
| `rider_locations_pkey` | rider_locations | id | B-tree UNIQUE | Primary key |
| `idx_rider_locations_rider` | rider_locations | rider_id | B-tree | Rider history lookup |
| `idx_rider_locations_recorded` | rider_locations | recorded_at DESC | B-tree | Time-range queries |

### Assessment

**No new indexes needed for Phase 2.** All query patterns are covered:

| Query Pattern | Covered By |
|---------------|------------|
| Find nearby available riders | `idx_rider_current_locations_geo` + `idx_rider_dispatch_lookup` |
| Check rider freshness | `idx_rider_dispatch_lookup` (includes `updated_at`) |
| Rider location history | `idx_rider_locations_rider` + `idx_rider_locations_recorded` |
| UPSERT current location | `rider_current_locations_pkey` (primary key) |
| Stale rider detection | `idx_rider_dispatch_lookup` (partial index on available riders) |

### Future Index Considerations (Phase 3+)

| Query | When Needed | Index |
|-------|-------------|-------|
| Find active order for rider | Phase 3 dispatch | Consider `idx_orders_assigned_rider_status` |
| Rider assignment lookup | Phase 3 accept/reject | `idx_rider_assignments_order_rider` (if not exists) |

---

## 14. TESTING REQUIREMENTS

### Authentication Tests

| Test | Expected |
|------|----------|
| Unauthenticated location update | 401 Unauthorized |
| Unauthenticated availability toggle | 401 Unauthorized |
| Rider cannot update another rider's location | 403 Forbidden (RLS) |

### Validation Tests

| Test | Expected |
|------|----------|
| Invalid latitude (>90) | 400 Validation error |
| Invalid latitude (<-90) | 400 Validation error |
| Invalid longitude (>180) | 400 Validation error |
| Invalid longitude (<-180) | 400 Validation error |
| Future timestamp | 400 Validation error |
| Timestamp too old (>5min) | 400 Validation error |
| Speed exceeds 200 km/h | 400 Validation error |
| Malformed payload | 400 Validation error |
| Empty payload | 400 Validation error |

### Availability Tests

| Test | Expected |
|------|----------|
| Unverified rider goes online | 400 "Must be approved" |
| Approved rider goes online | 200 Success |
| Rider goes offline | 200 Success |
| Stale rider becomes non-dispatchable | Verified via query |
| Busy rider cannot become dispatch-eligible | Checked via assignment status |

### Location Tests

| Test | Expected |
|------|----------|
| Valid location accepted | 200 Success + rider_locations row created |
| rider_current_locations upserted | Verified via query |
| Duplicate location handled efficiently | 200 Success + no new rider_locations row |
| Throttled update skipped | 200 Success + no new row (timestamp-only update) |
| Historical retention policy respected | Background job deletes >90 days |

### Realtime Tests

| Test | Expected |
|------|----------|
| Customer receives only their order's rider | Broadcast channel scoped to order |
| Customer cannot subscribe to another order | Server does not broadcast |
| Completed delivery stops tracking | Broadcast stops |
| Reassignment switches tracking | New rider broadcasts on same channel |

### Concurrency Tests

| Test | Expected |
|------|----------|
| Simultaneous location updates | Deterministic (last write wins) |
| Dispatch cannot select stale riders | Staleness check prevents |

### Performance Tests

| Test | Expected |
|------|----------|
| Query plan for nearest-rider lookup | Uses GIST index |
| Query plan for dispatch lookup | Uses composite partial index |
| Write throughput under load | >500 writes/sec sustained |

---

## 15. OBSERVABILITY

| Event | Level | Details |
|-------|-------|---------|
| Location update accepted | INFO | rider_id, coordinates, accuracy |
| Location update throttled | DEBUG | rider_id, reason (interval/distance) |
| Location update rejected | WARN | rider_id, reason (validation failure) |
| Availability changed | INFO | rider_id, new_status |
| Stale rider detected | INFO | rider_id, last_seen_at |
| Stale rider marked unavailable | INFO | rider_id, stale_duration |
| Realtime broadcast sent | DEBUG | order_id, rider_id |
| Realtime broadcast failed | ERROR | order_id, rider_id, error |
| Location cleanup completed | INFO | records_deleted, retention_days |

---

## 16. EXACT IMPLEMENTATION FILES

### New Files

| File | Purpose |
|------|---------|
| `apps/web/lib/services/rider-location.service.ts` | Location update, validation, throttle |
| `apps/web/app/api/riders/location/route.ts` | POST: update location, GET: current location |
| `apps/web/app/api/riders/availability/route.ts` | PATCH: toggle online/offline |

### Modified Files

| File | Change |
|------|--------|
| `supabase/migrations/20260823020000_phase2_location.sql` | New: `mark_stale_riders()` function, platform_settings |
| `packages/database/migrations/20260823020000_phase2_location.sql` | Synced copy |

### No Changes Needed

| Item | Reason |
|------|--------|
| `rider_current_locations` table | Already exists with correct schema |
| `rider_locations` table | Already exists with correct schema |
| `update_rider_current_location()` trigger | Already exists and works |
| GIST spatial index | Already exists |
| RLS policies | Already comprehensive |
| `find_nearest_riders()` | Enhanced with staleness check only |

---

## 17. EXACT MIGRATIONS REQUIRED

### Migration: `20260823020000_phase2_location.sql`

```sql
-- 1. Add mark_stale_riders function
CREATE OR REPLACE FUNCTION mark_stale_riders(p_threshold_seconds integer)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rider_current_locations
  SET is_available = FALSE
  WHERE is_available = TRUE
    AND updated_at < NOW() - (p_threshold_seconds || ' seconds')::INTERVAL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add location configuration settings
INSERT INTO platform_settings (key, value, description, category) VALUES
  ('location_update_min_interval_seconds', '{"seconds": 5}', 'Minimum time between GPS updates', 'location'),
  ('location_update_min_distance_meters', '{"meters": 10}', 'Minimum movement to trigger write', 'location'),
  ('location_stale_threshold_seconds', '{"seconds": 60}', 'Rider considered stale after this', 'location'),
  ('location_max_speed_kmh', '{"kmh": 200}', 'Maximum allowed speed', 'location'),
  ('location_max_age_seconds', '{"seconds": 300}', 'Reject updates older than this', 'location'),
  ('location_retention_days', '{"days": 90}', 'Historical location retention', 'location')
ON CONFLICT (key) DO NOTHING;

-- 3. Enhance find_nearest_riders with staleness check
CREATE OR REPLACE FUNCTION find_nearest_riders(
  p_lat NUMERIC,
  p_lon NUMERIC,
  p_max_distance_km NUMERIC,
  p_limit INTEGER
)
RETURNS TABLE(rider_id UUID, distance_km NUMERIC, rating NUMERIC)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    rcl.rider_id,
    (ST_Distance(
      rcl.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) / 1000)::DECIMAL AS distance_km,
    rp.rating
  FROM rider_current_locations rcl
  JOIN rider_profiles rp ON rp.id = rcl.rider_id
  WHERE rcl.is_available = TRUE
    AND rp.verification_status = 'approved'
    AND rcl.updated_at > NOW() - INTERVAL '60 seconds'
    AND ST_Distance(
      rcl.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) / 1000 <= p_max_distance_km
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$function$;
```

---

## 18. EXACT CONFIGURATION REQUIRED

### Environment Variables (Already Exist)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side operations |

### Platform Settings (New)

| Key | Default | Category |
|-----|---------|----------|
| `location_update_min_interval_seconds` | 5 | location |
| `location_update_min_distance_meters` | 10 | location |
| `location_stale_threshold_seconds` | 60 | location |
| `location_max_speed_kmh` | 200 | location |
| `location_max_age_seconds` | 300 | location |
| `location_retention_days` | 90 | location |

### No New Dependencies Required

All implementation uses existing packages:
- `@supabase/supabase-js` (already installed)
- `zod` (already installed)
- `next/server` (already installed)

---

## 19. RISKS AND MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Broadcast not authorized per-order | High | Server-side broadcast only, channel scoped to order_id |
| Stale rider receives dispatch | Medium | Staleness check in `find_nearest_riders()` |
| GPS jitter causes excessive writes | Low | Distance threshold filter |
| Customer sees stale rider position | Low | Stale indicator in UI + broadcast stops |
| PostgreSQL write pressure at scale | Medium | Monitor, migrate to Redis at trigger point |
| Trigger-based UPSERT fails | Low | UPSERT is atomic, no race conditions |
| Reassignment tracking gap | Medium | Server manages broadcast lifecycle |

---

## 20. IMPLEMENTATION SEQUENCE

### Step 1: Database Migration
- Create `mark_stale_riders()` function
- Add platform_settings for location configuration
- Enhance `find_nearest_riders()` with staleness check

### Step 2: Location Service
- `rider-location.service.ts`
- Validation, throttle, distance check
- Broadcast to delivery channel

### Step 3: Location API Route
- `POST /api/riders/location` — Update GPS
- `GET /api/riders/location` — Get current location

### Step 4: Availability API Route
- `PATCH /api/riders/availability` — Toggle online/offline

### Step 5: Background Job
- `STALE_RIDER_DETECTION` job type
- Mark stale riders as unavailable

### Step 6: Verification
- Typecheck, lint, tests, build
- Test location update flow
- Test availability toggle
- Test RLS enforcement
- Test broadcast to delivery channel
- Test stale rider detection

---

**PHASE 2 ARCHITECTURE REVIEW STATUS: COMPLETE**
**AWAITING AUTHORIZATION TO BEGIN IMPLEMENTATION**
