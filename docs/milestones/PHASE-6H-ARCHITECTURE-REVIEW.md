# PHASE 6H — ARCHITECTURE REVIEW

**Date:** August 27, 2026
**HEAD:** `e54f304`
**Status:** Architecture review complete. Ready for implementation authorization.

---

## 1. Executive Summary

The Embee Nexus pricing engine is **already route-based** for the only production zone (Abuja FCT). The architecture review identified four improvements that strengthen the pricing system without changing business rules:

1. **Eliminate duplicate routing** — capture route geometry at quote time, carry it into order creation (saves 20 Stadia credits per order)
2. **Fix race condition** — add atomic quote consumption to prevent theoretical duplicate orders
3. **Remove cross-zone fixed pricing** — convert to distance-based or remove (founder's "no fixed location pricing" direction)
4. **Improve Haversine fallback** — fail-safe instead of silently producing inaccurate pricing

The target architecture is a **single authoritative route calculation** per quote/order lifecycle, with the route snapshot carried through the entire flow.

---

## 2. Current Architecture

### Pricing Flow (Current)

```
Client → POST /api/orders/quote
  → QuoteService.generateQuote()
    → getMapsProvider().getRoute(origin, dest)     ← ROUTING CALL #1 (20 credits)
    → calculateSameZonePricing() or calculateCrossZonePricing()
    → Store quote in delivery_quotes

Client → POST /api/orders
  → OrderService.createOrder()
    → Read quote (pricing already calculated)
    → getMapsProvider().getRoute(origin, dest)     ← ROUTING CALL #2 (20 credits)
    → Store route_geometry on order
    → Copy pricing from quote to order
    → Create payment (amount = quote.total_amount)
```

**Total routing calls per order: 2 (40 Stadia credits)**

### What's Correct

| Aspect | Status |
|--------|--------|
| Server-authoritative pricing | ✅ |
| Client cannot supply price/distance | ✅ |
| Quote expiration (5 min) | ✅ |
| Single-use quote (is_consumed) | ✅ |
| Address ownership validation | ✅ |
| Payment = quote total_amount | ✅ |
| Rider earnings from order total | ✅ |
| TrackingMap uses stored geometry | ✅ |
| GPS throttling independent of routing | ✅ |

### What Needs Improvement

| Issue | Severity | Production Impact |
|-------|----------|-------------------|
| Duplicate routing (40 → 20 credits) | HIGH | ~$1.20/month wasted |
| Race condition on quote consumption | HIGH | Theoretical duplicate order |
| Cross-zone fixed pricing | MEDIUM | Zero today (1 zone), blocks future zones |
| Haversine fallback too optimistic | MEDIUM | Inaccurate pricing when Stadia unavailable |

---

## 3. Route Lifecycle (Target)

### Canonical Flow

```
1. Customer selects addresses (coordinates from stored addresses)
2. Client → POST /api/orders/quote
   Body: { pickup_lat/lng, destination_lat/lng, category, weight, urgency }
3. Server validates inputs (Zod schema)
4. Server validates address ownership (addresses table)
5. Server finds zone (is_in_service_zone RPC)
6. Server calculates route via MapsProvider
   → RouteResult: { distance_km, duration_minutes, coordinates }
7. Server calculates pricing from RouteResult
8. Server stores quote with COMPLETE route snapshot:
   - distance_km
   - estimated_duration_minutes
   - route_geometry (coordinates)
   - all pricing fields
   - valid_until (5 min)
9. Client displays quote
10. Client → POST /api/orders
    Body: { quote_id, address_ids, contact info, payment_method }
11. Server atomically consumes quote (SELECT ... FOR UPDATE or atomic UPDATE)
12. Server validates quote state/expiration/ownership
13. Server copies pricing + route_geometry FROM quote to order
14. Server creates order (NO additional routing call)
15. Server creates payment (amount = quote.total_amount)
16. TrackingMap renders stored route_geometry
```

### Key Principle: ONE Routing Call Per Quote

The routing result is calculated once and carried through the entire lifecycle:

```
RouteResult (1 call)
  → QuoteService (pricing calculation)
  → delivery_quotes (route snapshot stored)
  → OrderService (copies from quote, NO recalculation)
  → orders (route_geometry stored)
  → TrackingMap (renders stored geometry)
```

---

## 4. Pricing Lifecycle

### Authoritative Pricing Path

```
RouteResult.distance_km
  → QuoteService.calculateSameZonePricing()
    → distanceFee = distance_km × per_kilometer
    → deliveryFare = max(distanceFee, minimum_fare)
    → weightFee = deliveryFare × (multiplier - 1)
    → priorityFee = platform_settings.priority_fee
    → subtotal = deliveryFare + weightFee + priorityFee
    → tax = subtotal × tax_rate
    → total = subtotal + tax
  → Stored on delivery_quotes (immutable snapshot)
  → Copied to orders (immutable reference)
  → Used for payment amount
  → Used for rider earnings (total × 0.85)
```

### Pricing Invariant

```
payment.amount
  = order.total_amount
  = quote.total_amount
  = QuoteService output from RouteResult
```

**This invariant must never be broken.**

### Client-Side Price Protection

| Field | In QuoteRequestSchema? | In CreateOrderSchema? | Protected? |
|-------|----------------------|----------------------|------------|
| pickup_latitude | YES (from stored address) | NO | ✅ Address ownership check |
| destination_latitude | YES (from stored address) | NO | ✅ Address ownership check |
| distance_km | NO | NO | ✅ Server-calculated |
| total_amount | NO | NO | ✅ Server-calculated |
| price | NO | NO | ✅ Not accepted |

**No client-supplied pricing fields exist in either API schema.**

---

## 5. Duplicate Routing Analysis

### Current: 2 Routing Calls Per Order

| Call | Location | Purpose | Credits |
|------|----------|---------|---------|
| #1 | QuoteService.generateQuote() | Pricing distance/duration | 20 |
| #2 | OrderService.createOrder() | Route geometry for tracking | 20 |
| **Total** | | | **40** |

### Target: 1 Routing Call Per Order

| Call | Location | Purpose | Credits |
|------|----------|---------|---------|
| #1 | QuoteService.generateQuote() | Pricing + geometry | 20 |
| **Total** | | | **20** |

### How to Achieve

1. QuoteService captures `route.coordinates` from `RouteResult`
2. QuoteService stores `route_geometry` on `delivery_quotes`
3. OrderService reads `route_geometry` from quote instead of recalculating

### Credit Savings

| Scale | Orders/Month | Current Credits | Target Credits | Savings |
|-------|-------------|-----------------|----------------|---------|
| 100 customers/day | 3,000 | 120,000 | 60,000 | 60,000 |
| 300 customers/day | 9,000 | 360,000 | 180,000 | 180,000 |
| 500 customers/day | 15,000 | 600,000 | 300,000 | 300,000 |
| 1,000 customers/day | 30,000 | 1,200,000 | 600,000 | 600,000 |

**At 1,000 customers/day, eliminating the duplicate call saves 600K credits/month — equivalent to an entire Starter plan.**

### Monthly Cost Impact

| Scale | Current Routing Cost | Target Routing Cost | Savings |
|-------|---------------------|--------------------|---------| 
| 100/day | ~$2.40 | ~$1.20 | ~$1.20 |
| 300/day | ~$7.20 | ~$3.60 | ~$3.60 |
| 500/day | ~$12.00 | ~$6.00 | ~$6.00 |
| 1,000/day | Requires Standard ($80) | Starter ($20) | ~$60 |

---

## 6. Quote Snapshot Architecture

### Current Quote Fields

```sql
delivery_quotes (
  -- Identity
  id UUID PRIMARY KEY,
  customer_id UUID,
  
  -- Route (snapshot)
  pickup_latitude DECIMAL(10,8),
  pickup_longitude DECIMAL(11,8),
  destination_latitude DECIMAL(10,8),
  destination_longitude DECIMAL(11,8),
  distance_km DECIMAL(8,2),
  estimated_duration_minutes INTEGER,
  
  -- Pricing (snapshot)
  pricing_rule_id UUID,
  base_fee DECIMAL(10,2),
  distance_fee DECIMAL(10,2),
  weight_fee DECIMAL(10,2),
  zone_fee DECIMAL(10,2),
  urgency_fee DECIMAL(10,2),
  discount_amount DECIMAL(10,2),
  tax_amount DECIMAL(12,2),
  total_amount DECIMAL(12,2),
  currency TEXT,
  
  -- Lifecycle
  valid_until TIMESTAMPTZ,
  is_consumed BOOLEAN,
  consumed_at TIMESTAMPTZ,
  order_id UUID,
  
  -- Metadata
  category_id UUID,
  weight_kg DECIMAL,
  quantity INTEGER,
  created_at TIMESTAMPTZ
)
```

### Proposed Addition

```sql
-- Add to delivery_quotes:
route_geometry JSONB    -- Decoded [lng, lat][] coordinates from routing
```

**This is the ONLY schema change required.** It mirrors the existing `orders.route_geometry` column.

### Why Store on Quotes

| Reason | Explanation |
|--------|-------------|
| Eliminate duplicate routing | OrderService reads from quote instead of recalculating |
| Route snapshot integrity | Quote contains the exact route used for pricing |
| Tracking consistency | Order gets the same geometry used for the quoted distance |
| Audit trail | Quote is the authoritative source for route + pricing |

---

## 7. Route Snapshot Architecture

### What the Quote Should Contain

| Field | Current | Proposed | Purpose |
|-------|---------|----------|---------|
| pickup_latitude | ✅ | ✅ | Origin |
| pickup_longitude | ✅ | ✅ | Origin |
| destination_latitude | ✅ | ✅ | Destination |
| destination_longitude | ✅ | ✅ | Destination |
| distance_km | ✅ | ✅ | Pricing distance |
| estimated_duration_minutes | ✅ | ✅ | ETA |
| route_geometry | ❌ | ✅ | Tracking visualization |
| route_provider | ❌ | ❌ | Not needed (MapsProvider handles this) |
| route_calculated_at | ❌ | ❌ | Quote created_at serves this purpose |

### What NOT to Add

| Field | Reason to Skip |
|-------|---------------|
| route_provider | MapsProvider abstraction handles provider details |
| route_calculated_at | `created_at` already captures when the quote was generated |
| pricing_version | `pricing_rule_id` + `version` already captures this |
| route_hash | Not needed — quote is immutable after creation |

---

## 8. Cross-Zone Pricing Decision

### Current Cross-Zone Logic

```typescript
calculateCrossZonePricing():
  fixedPrice = zone_pricing_matrix.fixed_price  // Fixed, ignores distance
  priorityFee = getPriorityFee(urgencyLevel)
  subtotal = fixedPrice + priorityFee
  tax = subtotal × tax_rate
  total = subtotal + tax
```

### Founder's Direction

> "Pricing must be based on the actual delivery route, not fixed locations."

### Analysis

| Option | Pros | Cons |
|--------|------|------|
| A. Remove cross-zone entirely | Simplest, unified model | Lose zone-based flexibility |
| B. Convert to route-based | Consistent with founder direction | Requires per-zone pricing rules |
| C. Keep as-is (only 1 zone) | No change needed today | Technical debt when zones expand |
| D. Keep as fallback | Safety net | Confusing dual pricing models |

### Recommendation: Option B — Convert to Route-Based

**Rationale:** The founder explicitly said "no fixed location pricing." Even though only 1 zone exists today, the cross-zone code path should use the same distance-based model as same-zone pricing. This ensures consistency when additional zones are added.

**What changes:**
- `calculateCrossZonePricing()` uses `distance_km × per_kilometer` instead of `fixed_price`
- `zone_pricing_matrix.fixed_price` is replaced with per-zone `per_kilometer` rate
- Cross-zone rate = max(zone_a.per_km, zone_b.per_km) or a dedicated cross-zone rate

**What stays the same:**
- Zone detection (is_in_service_zone)
- pricing_rules table structure
- Same-zone pricing logic
- All other pricing components

**Alternatively:** If the founder wants simplicity, Option A (remove cross-zone entirely and use a single unified pricing rule) is also valid. The architecture supports both.

---

## 9. Haversine Fallback Decision

### Current Behavior

```typescript
// QuoteService.generateQuote()
try {
  route = await maps.getRoute(origin, dest);
} catch {
  // Haversine fallback
  const distanceKm = haversineDistance(origin, dest);
  route = { distance_km: distanceKm, duration_minutes: distanceKm * 3 };
}
```

### Problem

Haversine distance is straight-line, typically 20-40% shorter than road distance. This means:
- Customer is quoted a lower price than the actual road distance warrants
- Rider earnings are calculated on the lower distance
- The quoted route geometry doesn't match the quoted distance

### Options

| Option | Behavior | Risk |
|--------|----------|------|
| A. Keep as emergency fallback | Pricing may be inaccurate | Undercharging |
| B. Fail-safe: reject quote | No quote when Stadia unavailable | Service degradation |
| C. Apply road-factor multiplier | Approximate road distance | Still approximate |
| D. Use only for dispatch estimation | Don't use for pricing | Inconsistent |

### Recommendation: Option B — Fail-Safe

**Rationale:** The founder requires route-based pricing. An inaccurate distance is worse than no quote. When Stadia is unavailable:
- Return an error to the customer
- Log the failure for monitoring
- Do not produce a potentially underpriced quote

**Implementation:**
```typescript
try {
  route = await maps.getRoute(origin, dest);
} catch {
  throw new Error('Unable to calculate delivery route. Please try again.');
}
```

**Haversine function is retained** for non-pricing use cases (dispatch estimation, UI distance display) but is removed from the pricing path.

---

## 10. Dispatch Architecture Decision

### Current Dispatch

```sql
find_nearest_riders(p_lat, p_lon, p_max_distance_km, p_limit):
  SELECT rider_id, ST_Distance(rider_location, pickup) / 1000 AS distance_km
  FROM rider_current_locations
  WHERE is_available AND ST_Distance <= p_max_distance_km
  ORDER BY distance_km ASC
```

### Assessment

| Factor | Straight-Line | Route Distance | Matrix |
|--------|--------------|----------------|--------|
| Accuracy | Low | Medium | High |
| Credits/request | 0 | 20 | 10 × N riders |
| Latency | Fast | ~200ms | ~500ms |
| MVP suitability | ✅ Adequate | Optional | Overkill |

### Recommendation: Keep Straight-Line for MVP

**Rationale:**
- Dispatch only determines which riders receive offers — it doesn't affect pricing
- Straight-line is fast and free
- Route distance would add 20 credits per dispatch attempt (which can retry 3 times)
- Matrix API requires Standard plan ($80/month) — unjustified at MVP scale
- When dispatch volume grows, route distance becomes worth the credit cost

**Future consideration:** When dispatch volume exceeds ~500 orders/day, evaluate adding route-distance ranking.

---

## 11. Stadia Credit Optimization

### Current Model (Per Order)

| Step | Requests | Credits |
|------|----------|---------|
| Quote routing | 1 | 20 |
| Order routing | 1 | 20 |
| **Total routing** | **2** | **40** |

### Target Model (Per Order)

| Step | Requests | Credits |
|------|----------|---------|
| Quote routing | 1 | 20 |
| Order routing | 0 | 0 |
| **Total routing** | **1** | **20** |

### Full Monthly Model (Target)

| Category | 100/day | 300/day | 500/day | 1,000/day |
|----------|---------|---------|---------|-----------|
| Routing | 60,000 | 180,000 | 300,000 | 600,000 |
| Autocomplete | 12,000 | 36,000 | 60,000 | 120,000 |
| Geocoding | 120,000 | 360,000 | 600,000 | 1,200,000 |
| Tiles | 195,000 | 585,000 | 975,000 | 1,950,000 |
| **Total** | **387,000** | **1,161,000** | **1,935,000** | **3,870,000** |
| Starter (1M) | ✅ | ⚠️ 16% over | ❌ | ❌ |
| Standard (7.5M) | ✅ | ✅ | ✅ | ✅ |

### Plan Upgrade Threshold

| Scale | Plan | Monthly Cost |
|-------|------|-------------|
| ≤300 customers/day | Starter | $20 |
| 300–2,500 customers/day | Standard | $80 |
| >2,500 customers/day | Enterprise | Contact Stadia |

---

## 12. Payment Integrity

### Invariant

```
payment.amount = order.total_amount = quote.total_amount
```

### Current Protections

| Check | Location | Status |
|-------|----------|--------|
| Payment amount from quote | OrderService.createOrder() | ✅ `amount: quote.total_amount` |
| Quote total immutable | delivery_quotes | ✅ Set once at creation |
| Order total from quote | OrderService.createOrder() | ✅ `total_amount: quote.total_amount` |
| No client price field | CreateOrderSchema | ✅ Not accepted |
| Quote expiration | OrderService.createOrder() | ✅ `valid_until` check |
| Quote single-use | OrderService.createOrder() | ✅ `is_consumed` check |

### What Must Remain Invariant

1. `payment.amount` must always equal `order.total_amount`
2. `order.total_amount` must always equal `quote.total_amount`
3. No API endpoint may accept a client-supplied `total_amount`, `price`, or `distance_km`
4. Pricing must always be calculated server-side from `RouteResult`
5. Route geometry must be the same data used for pricing (no separate recalculation)

---

## 13. Quote Expiration / Replay Protection

### Current Quote Lifecycle

| Property | Value | Enforced? |
|----------|-------|-----------|
| Expiration | 5 minutes (configurable) | ✅ Server-side check |
| Unique ID | UUID | ✅ Primary key |
| Single-use | is_consumed flag | ✅ Server-side check |
| Customer ownership | customer_id | ✅ RLS + server check |
| Immutable pricing | Set once | ✅ No update path |
| Immutable route | Set once | ✅ No update path (once geometry added) |

### Stale Quote Attack Scenario

```
1. Customer obtains quote at T=0 (₦1,000 for 5km)
2. Customer waits 4 minutes
3. Route conditions change (road closure, detour)
4. Customer submits old quote at T=4:50
5. Order created with ₦1,000 for 5km (actual route now 8km)
```

### Assessment

This attack is **theoretically possible but practically limited:**
- 5-minute window is short
- Route conditions rarely change that dramatically in 5 minutes
- The customer paid the quoted amount — the platform absorbs the routing difference
- The rider still completes the actual delivery

### Recommendation

**Accept the 5-minute window as-is.** The current expiration is sufficient for MVP. If needed in the future:
- Reduce expiration to 2-3 minutes
- Add route revalidation at order creation (adds 1 routing call)
- Add route distance tolerance check (reject if actual route >120% of quoted)

**Do NOT add route revalidation by default** — it reintroduces the duplicate routing call.

---

## 14. Concurrency Analysis

### Race Condition Identified

**Current quote consumption flow:**
```typescript
// Step 1: Read quote (no locking)
const quote = await supabase.from('delivery_quotes').select('*').eq('id', quoteId).single();

// Step 2: Check is_consumed (application-level)
if (quote.is_consumed) throw new Error('Quote already consumed');

// ... 200ms of address validation, route calculation, order creation ...

// Step 3: Mark as consumed (non-atomic)
await supabase.from('delivery_quotes').update({ is_consumed: true }).eq('id', quoteId);
```

**Between Step 1 and Step 3, a concurrent request could also read the same quote as unconsumed and create a duplicate order.**

### Risk Assessment

| Factor | Assessment |
|--------|-----------|
| Probability | LOW — single-page app, one user, one tab |
| Impact | MEDIUM — duplicate order, duplicate payment |
| Existing protection | Unique order numbers, unique payment references |
| Missing protection | Row-level locking on quote consumption |

### Recommended Fix: Atomic Quote Consumption

**Option A (Preferred): Consume-First Pattern**

```typescript
// Atomic: mark as consumed and return the quote in one operation
const { data: quote, error } = await supabase
  .from('delivery_quotes')
  .update({ is_consumed: true, consumed_at: new Date().toISOString() })
  .eq('id', input.quote_id)
  .eq('customer_id', customerId)
  .eq('is_consumed', false)        // ← Atomic guard
  .gte('valid_until', new Date().toISOString())  // ← Expiration guard
  .select()
  .single();

if (error || !quote) {
  throw new Error('Quote not found, already consumed, or expired');
}
```

This is atomic at the database level — only one request can successfully consume the quote.

**Option B: SELECT ... FOR UPDATE**

Not directly available through Supabase client. Would require a PostgreSQL function.

**Recommendation: Option A.** It's simple, atomic, and uses existing Supabase client capabilities.

---

## 15. Database Changes Required

### Migration: Add route_geometry to delivery_quotes

```sql
ALTER TABLE delivery_quotes ADD COLUMN IF NOT EXISTS route_geometry jsonb;
COMMENT ON COLUMN delivery_quotes.route_geometry 
  IS 'Decoded route coordinates [lng, lat][] from routing. Used by OrderService to avoid duplicate routing calls.';
```

### Migration: No other schema changes

| Change | Required? | Reason |
|--------|-----------|--------|
| delivery_quotes.route_geometry | YES | Store geometry from quote-time routing |
| orders.route_geometry | Already exists | Phase 6G |
| pricing_rules changes | NO | Current structure supports route-based pricing |
| zone_pricing_matrix changes | DEFERRED | Cross-zone conversion is a logic change, not schema |
| New tables | NO | Existing structure is sufficient |

---

## 16. Target Architecture

### Complete Pricing + Route Flow

```
┌─────────────────────────────────────────────────────┐
│  QUOTE GENERATION (1 routing call = 20 credits)     │
│                                                     │
│  Client → POST /api/orders/quote                    │
│    │                                                │
│    ├─ Validate inputs (Zod)                         │
│    ├─ Validate address ownership                    │
│    ├─ Find zone (is_in_service_zone)                │
│    ├─ Get route (MapsProvider)                      │
│    │   → { distance_km, duration, coordinates }     │
│    ├─ Calculate pricing (distance × rate + etc)     │
│    └─ Store quote with route snapshot:              │
│        ├─ distance_km                               │
│        ├─ estimated_duration_minutes                │
│        ├─ route_geometry (coordinates)              │
│        └─ all pricing fields                        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  ORDER CREATION (0 routing calls = 0 credits)       │
│                                                     │
│  Client → POST /api/orders                          │
│    │                                                │
│    ├─ Atomically consume quote                      │
│    │   (UPDATE WHERE is_consumed = false)           │
│    ├─ Validate quote state/expiration/ownership     │
│    ├─ Copy pricing FROM quote                       │
│    ├─ Copy route_geometry FROM quote                │
│    ├─ Create order                                  │
│    └─ Create payment (amount = quote.total_amount)  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  TRACKING (0 routing calls = 0 credits)             │
│                                                     │
│  TrackingMap reads order.route_geometry              │
│  Renders stored coordinates as road route            │
│  Rider GPS updates update marker position only       │
│  No routing API calls during tracking                │
└─────────────────────────────────────────────────────┘
```

### Total Credits Per Order: 20 (down from 40)

---

## 17. Implementation Scope

### Files to Modify

| File | Change | Complexity |
|------|--------|-----------|
| `apps/web/lib/services/quote.service.ts` | Capture route.geometry, store on quote; remove Haversine fallback from pricing path | Low |
| `apps/web/lib/services/order.service.ts` | Read route_geometry from quote; remove duplicate routing call; add atomic quote consumption | Low |
| `apps/web/lib/maps/types.ts` | No changes needed (coordinates already in RouteResult) | None |
| `supabase/migrations/` | Add route_geometry to delivery_quotes | Low |

### Files NOT to Modify

| File | Reason |
|------|--------|
| `apps/web/lib/maps/stadia.ts` | Already correct |
| `apps/web/lib/maps/index.ts` | Already correct |
| `apps/web/components/tracking/tracking-map.tsx` | Already reads from order.route_geometry |
| `apps/web/components/tracking/order-tracking.tsx` | Already passes route_geometry |
| `apps/web/app/api/orders/quote/route.ts` | No changes needed |
| `apps/web/app/api/orders/route.ts` | No changes needed |
| `apps/web/lib/services/payment.service.ts` | Unchanged |
| `apps/web/lib/services/refund.service.ts` | Unchanged |
| `apps/web/lib/services/dispatch.service.ts` | Unchanged (keeps straight-line) |
| Any rider/customer/admin UI | Unchanged |

---

## 18. Out-of-Scope Items

| Item | Reason |
|------|--------|
| Modifying pricing rules/amounts | Requires founder decision |
| Changing platform commission | Requires founder decision |
| Implementing surge/peak pricing | Not in founder's direction |
| Matrix API integration | Not needed at MVP |
| Stadia plan upgrade | Not needed at current volume |
| Route revalidation at order time | Would reintuplicate routing |
| Route tolerance checking | Future enhancement |
| Dispatch route distance | Future enhancement |
| Changing MapsProvider | Already correct |
| Payment flow changes | Already correct |
| Rider earnings changes | Already correct |

---

## 19. Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Stadia outage blocks all quotes | Low | High (service degradation) | Log failures, alert, consider Haversine for non-pricing estimation only |
| Quote geometry doesn't match actual delivery route | Very Low | Low (5-min window) | Acceptable for MVP |
| Cross-zone pricing inaccuracy | Zero today | Medium (when zones expand) | Convert to distance-based before adding zones |
| Atomic consumption fails | Very Low | Low (retry) | Supabase handles atomic updates correctly |
| Existing orders affected by migration | Zero | None | Column is nullable, additive only |

---

## 20. Required Founder Decisions

| Decision | Options | Recommendation |
|----------|---------|---------------|
| Cross-zone pricing model | A. Remove zones, B. Distance-based, C. Keep fixed | B (distance-based, consistent with "no fixed pricing") |
| Haversine fallback behavior | A. Keep, B. Fail-safe, C. Apply multiplier | B (fail-safe, reject quote when routing unavailable) |
| Quote expiration time | Keep 5 min or reduce | Keep 5 min (adequate for MVP) |
| Dispatch distance model | Keep straight-line | Keep (adequate for MVP) |

---

## Verification

| Check | Result |
|-------|--------|
| HEAD | `e54f304` ✅ |
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Git history modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean (only docs) |

---

**PHASE 6H ARCHITECTURE REVIEW — COMPLETE**

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

The architecture is sound. The existing pricing system is already route-based. The improvements are:
1. Eliminate duplicate routing (save 20 credits/order)
2. Fix race condition (atomic quote consumption)
3. Store route geometry on quotes (enable #1)
4. Remove Haversine from pricing path (pricing integrity)

Total implementation scope: 4 files, ~50 lines changed.
