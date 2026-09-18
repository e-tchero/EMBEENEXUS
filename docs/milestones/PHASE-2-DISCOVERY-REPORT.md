# PHASE 2 — RIDER AVAILABILITY & LOCATION: DISCOVERY REPORT

**Document Status:** Discovery Complete — Awaiting Authorization
**Date:** August 23, 2026

---

## 1. CURRENT REPOSITORY STATE

| Metric | Count |
|--------|-------|
| Application tables | 37 |
| Custom PostgreSQL functions | 16 |
| RLS policies | 110 |
| Indexes | 69 |
| Storage buckets | 0 |
| Realtime publication tables | 0 |
| API routes | 17 (11 original + 6 Phase 1) |
| Services | 6 (4 original + 2 Phase 1) |

---

## 2. EXISTING LOCATION ARCHITECTURE

### 2.1 Tables

**`rider_current_locations`** (UPSERT model):
| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `rider_id` | UUID (PK) | NO | Rider identity |
| `latitude` | DECIMAL(10,8) | NO | Current latitude |
| `longitude` | DECIMAL(11,8) | NO | Current longitude |
| `location` | GEOGRAPHY(POINT, 4326) | NO | PostGIS point |
| `heading` | DECIMAL(5,2) | YES | Direction (0-360) |
| `speed` | DECIMAL(5,2) | YES | Speed in km/h |
| `accuracy` | DECIMAL(8,2) | YES | GPS accuracy in meters |
| `is_available` | BOOLEAN | YES | Dispatch eligibility |
| `updated_at` | TIMESTAMPTZ | YES | Last update time |

**`rider_locations`** (append-only historical):
| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | UUID (PK) | NO | Unique record ID |
| `rider_id` | UUID (FK) | NO | Rider identity |
| `latitude` | DECIMAL(10,8) | NO | Latitude |
| `longitude` | DECIMAL(11,8) | NO | Longitude |
| `location` | GEOGRAPHY(POINT, 4326) | YES | PostGIS point |
| `heading` | DECIMAL(5,2) | YES | Direction |
| `speed` | DECIMAL(5,2) | YES | Speed |
| `accuracy` | DECIMAL(8,2) | YES | GPS accuracy |
| `recorded_at` | TIMESTAMPTZ | YES | When GPS was captured |
| `created_at` | TIMESTAMPTZ | YES | When record was created |

### 2.2 Trigger

```sql
on_rider_location_insert → update_rider_current_location()
```

On INSERT to `rider_locations`:
1. UPSERTs `rider_current_locations` with new coordinates
2. Does NOT update `rider_profiles.current_location` (inconsistency — see Section 3)

### 2.3 Dispatch Integration

`find_nearest_riders()` queries `rider_current_locations` (NOT `rider_profiles.current_location`):
```sql
FROM rider_current_locations rcl
JOIN rider_profiles rp ON rp.id = rcl.rider_id
WHERE rcl.is_available = TRUE
  AND rp.verification_status = 'approved'
  AND ST_Distance(...) / 1000 <= p_max_distance_km
```

---

## 3. INCONSISTENCY FOUND

**`rider_profiles.current_location`** is a GEOGRAPHY column that is NOT updated by the `update_rider_current_location()` trigger. The trigger only updates `rider_current_locations`.

**Dispatch uses `rider_current_locations`**, not `rider_profiles.current_location`.

**Recommendation:** Do NOT use `rider_profiles.current_location` for any critical path. It appears to be a legacy/redundant column. The application layer should only read/write `rider_current_locations`.

---

## 4. EXISTING INDEXES

| Index | Table | Type | Purpose |
|-------|-------|------|---------|
| `rider_current_locations_pkey` | rider_current_locations | B-tree (rider_id) | Primary key |
| `idx_rider_current_locations_geo` | rider_current_locations | GIST (location) | Spatial dispatch query |
| `idx_rider_current_locations_available` | rider_current_locations | B-tree (is_available) WHERE true | Partial index for available riders |
| `idx_rider_dispatch_lookup` | rider_current_locations | B-tree (is_available, updated_at) WHERE true | Dispatch with freshness |
| `rider_locations_pkey` | rider_locations | B-tree (id) | Primary key |
| `idx_rider_locations_rider` | rider_locations | B-tree (rider_id) | Rider history lookup |
| `idx_rider_locations_recorded` | rider_locations | B-tree (recorded_at DESC) | Time-range queries |

**Assessment:** Indexes are sufficient for MVP. No new indexes needed for Phase 2.

---

## 5. EXISTING RLS

### rider_current_locations (5 policies)
| Policy | Operation | Rule |
|--------|-----------|------|
| `rider_current_locations_insert_own` | INSERT | `rider_id = auth.uid()` |
| `rider_current_locations_update_own` | UPDATE | `rider_id = auth.uid()` |
| `rider_current_locations_select_own` | SELECT | `rider_id = auth.uid()` |
| `rider_current_locations_select_customer` | SELECT | Customer has active order with this rider |
| `rider_current_locations_select_admin` | SELECT | Admin/operations role |

### rider_locations (2 policies)
| Policy | Operation | Rule |
|--------|-----------|------|
| `rider_locations_insert_own` | INSERT | `rider_id = auth.uid()` |
| `rider_locations_select_own` | SELECT | `rider_id = auth.uid()` |

**Assessment:** RLS is sufficient for MVP. Customer can only see rider location for their own active delivery.

---

## 6. REALTIME CONFIGURATION

**Current state:** ZERO tables in `supabase_realtime` publication.

**Implication:** No database-level Realtime is configured. Supabase Realtime subscriptions will not receive any change events.

**Required for Phase 2:** Add `rider_current_locations` to the Realtime publication for customer tracking.

---

## 7. BACKGROUND JOB CAPABILITIES

**Current state:** `background_jobs` table exists with full schema but ZERO jobs processed.

**Phase 1 added:** `background-job.service.ts` with `processPendingJobs()` and `processExpiredOffers()`.

**Phase 2 needs:** Potentially `STALE_RIDER_DETECTION` job type for marking stale riders as unavailable.

---

## 8. EXISTING VALIDATORS

`UpdateLocationRequestSchema` already exists in `packages/shared/validators/index.ts`:
```typescript
export const UpdateLocationRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(200).optional(),
  accuracy: z.number().min(0).optional(),
});
```

---

## 9. PHASE 2 GAPS

### Database Layer — CAPABLE
- Tables exist ✅
- Trigger exists ✅
- Indexes exist ✅
- RLS exists ✅
- Missing: Realtime publication configuration

### Application Layer — MISSING
- Location update API route
- Availability toggle API route
- Location service
- Stale rider detection

### Realtime Layer — MISSING
- No tables in publication
- No subscription code
- No broadcast logic

### UI Layer — MISSING
- No rider availability toggle UI
- No customer tracking UI

---

## 10. REQUIRED API ROUTES

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/riders/availability` | PATCH | Rider | Toggle online/offline |
| `/api/riders/location` | POST | Rider | Update GPS position |
| `/api/riders/location` | GET | Rider | Get current location |

---

## 11. REQUIRED SERVICES

| Service | Purpose |
|---------|---------|
| `rider-location.service.ts` | Location update, throttling, validation |

---

## 12. REQUIRED MIGRATIONS

**None.** All required tables, indexes, and RLS already exist.

**Configuration only:** Add `rider_current_locations` to Supabase Realtime publication.

---

## 13. REQUIRED INDEXES

**None.** Existing indexes cover all Phase 2 query patterns:
- Spatial dispatch: `idx_rider_current_locations_geo` ✅
- Available riders: `idx_rider_current_locations_available` ✅
- Dispatch freshness: `idx_rider_dispatch_lookup` ✅
- Rider history: `idx_rider_locations_rider` + `idx_rider_locations_recorded` ✅

---

## 14. REQUIRED REALTIME CONFIGURATION

Add to `supabase_realtime` publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE rider_current_locations;
```

This enables:
- Customer subscribes to rider location changes
- Broadcast only relevant to active delivery orders

---

## 15. SECURITY MODEL

| Check | Enforcement |
|-------|-------------|
| Rider can only update own location | RLS: `rider_id = auth.uid()` |
| Customer can only see active delivery rider | RLS: customer_id match + active status |
| Admin can see all | RLS: admin/operations role |
| No client-controlled rider_id | API uses `user.id` from Supabase Auth |
| Latitude range [-90, 90] | Zod validator |
| Longitude range [-180, 180] | Zod validator |
| No future timestamps | Application validation |
| No excessively stale updates | Application validation |

---

## 16. LOCATION VALIDATION MODEL

### Server-Side Validation
1. **Coordinate range:** latitude [-90, 90], longitude [-180, 180]
2. **Timestamp sanity:** `recorded_at` must not be in the future
3. **Staleness:** Reject updates with `recorded_at` older than 5 minutes (configurable)
4. **Duplicate detection:** Skip if coordinates unchanged within last 5 seconds (configurable)
5. **Speed validation:** Reject if calculated speed exceeds 200 km/h (configurable — allows for GPS jitter)

### What NOT to Validate (MVP)
- Exact route validation (too expensive)
- GPS spoofing detection (too complex for MVP)
- Impossible movement detection (deferred to later)

---

## 17. LOCATION FRESHNESS MODEL

### Definition of "Online"
A rider is considered "online" when:
1. `is_available = TRUE` in `rider_current_locations`
2. `updated_at` is within `stale_threshold` (configurable, default 60 seconds)

### Stale Rider Handling
- If `updated_at` > `stale_threshold` seconds ago → rider is stale
- Stale riders should not receive new dispatch offers
- Stale riders should be marked `is_available = FALSE` by background job

### Freshness Configuration (platform_settings)
| Key | Default | Purpose |
|-----|---------|---------|
| `location_stale_threshold_seconds` | 60 | How long before rider is considered stale |
| `location_update_min_interval_seconds` | 5 | Minimum time between accepted updates |
| `location_update_min_distance_meters` | 10 | Minimum movement to trigger write |

---

## 18. WRITE-FREQUENCY STRATEGY

### Update Flow
```
Rider GPS → POST /api/riders/location
    ↓
Validate coordinates, timestamp, rider identity
    ↓
Throttle check: skip if < min_interval since last update
    ↓
Distance check: skip if < min_distance since last position
    ↓
INSERT rider_locations → trigger UPSERTs rider_current_locations
    ↓
IF rider has active delivery → broadcast to order channel
    ↓
Return success
```

### Write Volume Estimates (MVP)
| Scenario | Riders | Updates/sec | Writes/sec to PostgreSQL |
|----------|--------|-------------|------------------------|
| Early stage | 10 | 1 (every 10s) | 10 |
| Growth | 100 | 1 | 100 |
| Scale | 1,000 | 1 | 1,000 |
| Large | 10,000 | 1 | 10,000 |

**PostgreSQL can handle 10,000 simple UPSERTs/sec** on modern hardware. At 10,000+ concurrent riders, consider Redis for current location.

---

## 19. HISTORICAL RETENTION STRATEGY

### Current State
- `rider_locations` is append-only
- No retention cleanup configured
- No partitioning

### MVP Strategy
- Retain for 90 days (configurable via `location_retention_days`)
- Background job: `LOCATION_CLEANUP` deletes records older than retention
- Run daily via cron

### Scale Strategy
- At 1M+ location records/day: consider partitioning by month
- At 10M+ records/day: consider partitioning by rider_id range
- Archive to cold storage before deletion

---

## 20. CUSTOMER TRACKING ARCHITECTURE

### Realtime Flow
```
Rider GPS → POST /api/riders/location
    ↓
INSERT rider_locations → trigger UPSERTs rider_current_locations
    ↓
Supabase Realtime broadcasts rider_current_locations change
    ↓
Customer frontend subscribes to channel: order:{order_id}
    ↓
RLS filters: customer can only see their active delivery rider
    ↓
Customer map updates rider marker
```

### Channel Authorization
- Channel: `order:{order_id}`
- Subscription: customer must own order (enforced by RLS on `rider_current_locations`)
- Broadcast: only rider position + timestamp (no sensitive data)

### Tracking Lifecycle
- **Start:** When order status = `rider_assigned`
- **End:** When order status = `completed` or `cancelled`
- **Cleanup:** Rider location remains, but customer subscription ends

---

## 21. DISPATCH INTEGRATION POINTS

| Function | Reads | Writes |
|----------|-------|--------|
| `find_nearest_riders()` | `rider_current_locations` (is_available, location) | None |
| `dispatch_rider_v2()` | `rider_current_locations` | Sets `is_available = FALSE` on offer |
| `accept_rider_offer()` | `rider_current_locations` | Re-makes cancelled riders available |
| `reject_rider_offer()` | `rider_current_locations` | Re-makes rider available |

**Phase 2 enables dispatch** by providing:
- Real rider locations (not empty table)
- Real availability states
- Real spatial queries

---

## 22. SCALE BOUNDARIES

| Trigger | Current | Migration |
|---------|---------|-----------|
| 100 concurrent riders | PostgreSQL sufficient | No change |
| 1,000 concurrent riders | PostgreSQL may slow | Add Redis for current location |
| 10,000 concurrent riders | PostgreSQL bottleneck | Redis + dedicated location service |
| 100,000 concurrent riders | PostgreSQL not viable | Dedicated location infrastructure |

**PostgreSQL → Redis Migration Path:**
1. Write to both PostgreSQL (historical) and Redis (current)
2. Dispatch reads from Redis instead of PostgreSQL
3. Customer tracking reads from Redis
4. Historical queries still use PostgreSQL
5. API contract remains identical

---

## 23. TESTING STRATEGY

### Unit Tests
| Test | What |
|------|------|
| Location validation | Valid/invalid coordinates, future timestamps |
| Throttling | Rate limiting, minimum interval |
| Distance check | Minimum movement threshold |
| Freshness | Stale detection logic |

### Integration Tests
| Test | What |
|------|------|
| Location update → current location UPSERT | End-to-end write flow |
| Availability toggle → dispatch eligibility | Online/offline affects dispatch |
| Stale rider → marked unavailable | Freshness enforcement |
| Customer tracking → authorized only | RLS enforcement |

### Security Tests
| Test | What |
|------|------|
| Rider cannot update another rider's location | RLS |
| Customer cannot track unrelated order | RLS |
| Anonymous cannot access locations | Auth |
| Future timestamps rejected | Validation |
| Excessively stale updates rejected | Validation |

---

## 24. OBSERVABILITY

| Event | Log Level | Details |
|-------|-----------|---------|
| Location update accepted | INFO | rider_id, coordinates |
| Location update rejected | WARN | rider_id, reason |
| Stale rider detected | INFO | rider_id, last_seen |
| Realtime broadcast sent | DEBUG | order_id, rider_id |
| Realtime broadcast failed | ERROR | order_id, error |

---

## 25. RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Realtime publication not configured | Medium | Add table to publication |
| Stale rider receives dispatch | Medium | Freshness check in dispatch |
| GPS jitter causes excessive writes | Low | Distance threshold filter |
| Customer sees stale rider position | Low | Stale indicator in UI |
| PostgreSQL write pressure at scale | Medium | Monitor, migrate to Redis when justified |

---

## 26. IMPLEMENTATION SEQUENCE

### Step 1: Configure Realtime Publication
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE rider_current_locations;
```

### Step 2: Create Location Service
- `apps/web/lib/services/rider-location.service.ts`
- Location update with validation
- Throttling logic
- Distance filtering

### Step 3: Create Location API Route
- `apps/web/app/api/riders/location/route.ts` (POST)
- Authenticated rider endpoint
- Uses existing `UpdateLocationRequestSchema`

### Step 4: Create Availability API Route
- `apps/web/app/api/riders/availability/route.ts` (PATCH)
- Toggle `is_available` in `rider_current_locations`
- Validate rider is approved before going online

### Step 5: Add Platform Settings
- `location_stale_threshold_seconds` (default: 60)
- `location_update_min_interval_seconds` (default: 5)
- `location_update_min_distance_meters` (default: 10)
- `location_retention_days` (default: 90)

### Step 6: Add Stale Rider Detection Job
- Background job: `STALE_RIDER_DETECTION`
- Mark riders as unavailable if `updated_at` > stale threshold
- Run via cron every 30 seconds

### Step 7: Verify
- Typecheck, lint, tests, build
- Test location update flow
- Test availability toggle
- Test RLS enforcement
- Test realtime broadcast

---

**PHASE 2 DISCOVERY STATUS: COMPLETE**
**AWAITING AUTHORIZATION TO BEGIN IMPLEMENTATION**
