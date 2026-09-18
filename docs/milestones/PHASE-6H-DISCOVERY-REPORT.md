# PHASE 6H — PRICING ARCHITECTURE DISCOVERY REPORT

**Date:** August 27, 2026
**HEAD:** `e54f304`
**Status:** Discovery complete. Ready for architecture review.

---

## 1. Executive Summary

The Embee Nexus pricing engine currently uses a **hybrid model**:

- **Same-zone pricing:** Route-based (distance × per-km rate) ✅
- **Cross-zone pricing:** Fixed price lookup from `zone_pricing_matrix` ❌

The founder's directive is **route-based pricing**. Same-zone pricing already satisfies this. Cross-zone pricing does not.

Additional findings:
- **Duplicate route calculation** wastes Stadia API credits (20 credits per order)
- **QuoteService doesn't capture route geometry** — OrderService recalculates unnecessarily
- **Dispatch uses straight-line distance**, not route distance
- **Haversine fallback** produces inaccurate distance when Stadia is unavailable
- **No route distance validation** between quote creation and order creation

None of these are production blockers. All are architectural improvements.

---

## 2. Current Pricing Architecture

### Same-Zone Pricing (Abuja FCT — the only active zone)

```
QuoteService.calculateSameZonePricing():
  distanceFee = distanceKm × per_kilometer (₦100/km)
  deliveryFare = max(distanceFee, minimum_fare ₦700)
  weightFee = deliveryFare × (weightMultiplier - 1)
  priorityFee = platform_settings.priority_delivery_fee (flat add-on)
  subtotal = deliveryFare + weightFee + priorityFee
  tax = subtotal × 0.075 (7.5% VAT)
  total = subtotal + tax
```

**Verdict:** This IS route-based. The distance comes from Stadia Maps routing (or Haversine fallback).

### Cross-Zone Pricing

```
QuoteService.calculateCrossZonePricing():
  fixedPrice = zone_pricing_matrix.fixed_price (looked up by zone pair)
  priorityFee = platform_settings.priority_delivery_fee
  subtotal = fixedPrice + priorityFee
  tax = subtotal × 0.075
  total = subtotal + tax
```

**Verdict:** This is NOT route-based. It uses a fixed price regardless of actual distance.

### Current Zone Configuration

| Zone | Slug | Pricing Type |
|------|------|-------------|
| Abuja FCT | abuja-fct | Same-zone (distance-based) |

**Only 1 zone exists.** Cross-zone pricing code path exists but has no seed data and currently never triggers.

### Pricing Rules (Abuja FCT)

| Parameter | Value |
|-----------|-------|
| base_fee | ₦500 |
| per_kilometer | ₦100 |
| minimum_fare | ₦700 |
| maximum_distance_km | 50 |
| weight_bands | 0-2kg (1.0x), 2-5kg (1.2x), 5-10kg (1.5x) |
| urgency_multipliers | standard (1.0), express (1.3), urgent (1.5) |
| tax_rate | 7.5% VAT |
| platform_commission | 15% |

---

## 3. Current Route Calculation Architecture

### Where Route Is Calculated

| Location | Purpose | Credits |
|----------|---------|---------|
| `QuoteService.generateQuote()` | Pricing distance/duration | 20 |
| `OrderService.createOrder()` | Route geometry for TrackingMap | 20 |
| **Total per order** | | **40** |

### Route Data Flow

```
QuoteService.generateQuote():
  1. getMapsProvider().getRoute(origin, dest) → { distance_km, duration_minutes }
  2. Haversine fallback if Stadia fails
  3. Store: distance_km, estimated_duration_minutes on delivery_quotes

OrderService.createOrder():
  1. Read quote (distance_km, duration_minutes already available)
  2. getMapsProvider().getRoute(origin, dest) → { distance_km, duration_minutes, coordinates }
  3. Store: route_geometry (coordinates) on orders
  4. Pricing is copied from quote (not recalculated)
```

### Key Finding: Duplicate Route Calculation

The OrderService recalculates the route even though:
- The quote already has `distance_km` and `estimated_duration_minutes`
- The only additional data needed is `coordinates` (route geometry)
- `RouteResult` now includes `coordinates` (added in Phase 6G)

**The QuoteService could capture coordinates from the first call and store them on the quote, eliminating the second routing call entirely.**

### Haversine Fallback

When Stadia Maps is unavailable (no API key, network error), QuoteService falls back to Haversine straight-line distance:

```typescript
function haversineDistance(lat1, lon1, lat2, lon2): number {
  // Returns straight-line distance in km
}
```

**Risk:** Haversine distance is typically 20-40% shorter than actual road distance. This means:
- Customer pays less than the actual road distance warrants
- Rider earnings are calculated on the same lower distance
- Pricing is inconsistent between Stadia-available and Stadia-unavailable scenarios

---

## 4. Fixed-Location Pricing Audit

### Current Fixed-Location Pricing

The cross-zone pricing path uses `zone_pricing_matrix.fixed_price` — a single fixed price for any delivery between two zones, regardless of actual distance.

**Files affected:**
- `apps/web/lib/services/quote.service.ts` — `calculateCrossZonePricing()`
- `supabase/migrations/20260820020000_zone_pricing_matrix_and_priority.sql` — schema

### Severity Assessment

| Finding | Severity | Impact |
|---------|----------|--------|
| Cross-zone pricing uses fixed prices | HIGH | Violates founder's route-based pricing direction |
| Only 1 zone exists (Abuja FCT) | LOW | Cross-zone code path never triggers today |
| zone_pricing_matrix has no seed data | LOW | No impact on current production |

### Recommendation

Since only 1 zone exists, the cross-zone pricing issue has **zero production impact today**. However, if/when additional zones are added, cross-zone pricing would need to be converted to route-based. The architecture review should determine whether to:
- A. Remove cross-zone pricing entirely (unified distance-based model)
- B. Convert cross-zone pricing to route-based (distance × rate across zones)
- C. Leave cross-zone pricing as-is (future concern)

---

## 5. Route-Based Pricing Readiness

### What Already Works

| Capability | Status |
|------------|--------|
| Stadia Maps routing | ✅ Working |
| Route distance calculation | ✅ Working |
| Route duration calculation | ✅ Working |
| Same-zone distance-based pricing | ✅ Working |
| Minimum fare enforcement | ✅ Working |
| Weight multiplier | ✅ Working |
| Priority fee | ✅ Working |
| Tax calculation | ✅ Working |
| Quote storage with pricing snapshot | ✅ Working |
| Order copies pricing from quote | ✅ Working |
| Route geometry storage | ✅ Working (Phase 6G) |
| TrackingMap renders road route | ✅ Working (Phase 6G) |

### What Needs Improvement

| Issue | Priority | Effort |
|-------|----------|--------|
| Duplicate route calculation (40 → 20 credits) | HIGH | Low |
| QuoteService doesn't capture coordinates | HIGH | Low |
| Haversine fallback distance accuracy | MEDIUM | Low |
| Cross-zone pricing model | MEDIUM | Medium |
| Dispatch straight-line distance | LOW | Medium |

---

## 6. Quote Lifecycle Audit

### Quote Schema (delivery_quotes)

| Field | Purpose | Immutability |
|-------|---------|-------------|
| id | UUID primary key | Immutable |
| customer_id | Ownership | Immutable |
| pickup_latitude/longitude | Origin | Immutable |
| destination_latitude/longitude | Destination | Immutable |
| pricing_rule_id | Pricing reference | Immutable |
| base_fee | Pricing snapshot | Immutable |
| distance_fee | Pricing snapshot | Immutable |
| weight_fee | Pricing snapshot | Immutable |
| urgency_fee | Pricing snapshot | Immutable |
| discount_amount | Pricing snapshot | Immutable |
| tax_amount | Pricing snapshot | Immutable |
| total_amount | Pricing snapshot | Immutable |
| distance_km | Route snapshot | Immutable |
| estimated_duration_minutes | Route snapshot | Immutable |
| valid_until | Expiration | Immutable |
| is_consumed | Single-use flag | Updated on consumption |
| order_id | Link to order | Set on consumption |

### Quote Protection Mechanisms

| Mechanism | Status |
|-----------|--------|
| Expiration (5 minutes) | ✅ Enforced in OrderService |
| Single-use (is_consumed) | ✅ Enforced in OrderService |
| Customer ownership check | ✅ `.eq('customer_id', customerId)` |
| Pricing snapshot immutable | ✅ Copied to order, not recalculated |
| Route snapshot immutable | ✅ distance_km/duration stored on quote |

### Quote → Order Integrity

| Check | Result |
|-------|--------|
| Client can supply price | ❌ NO — not in CreateOrderSchema |
| Client can supply distance | ❌ NO — not in CreateOrderSchema |
| Client can supply total_amount | ❌ NO — not in CreateOrderSchema |
| Order amount = quote amount | ✅ YES — `total_amount: quote.total_amount` |
| Payment amount = quote amount | ✅ YES — `amount: quote.total_amount` |
| Stale quote rejected | ✅ YES — `valid_until` check |
| Consumed quote rejected | ✅ YES — `is_consumed` check |
| Quote coordinates validated | ✅ YES — address ownership check |

### Anti-Tampering Assessment

**The client cannot influence pricing.** The flow is:
1. Client sends origin/destination coordinates (from stored addresses)
2. Server validates address ownership
3. Server calculates pricing independently
4. Quote is stored with immutable pricing snapshot
5. Order creation copies pricing from quote
6. Payment amount = quote total_amount

**Remaining risk:** If the same address is used with different coordinates over time (e.g., address table updated), the quote might reference stale coordinates. However, address coordinates are immutable in the current schema.

---

## 7. Order Creation / Pricing Integrity Audit

### Order Creation Flow

```
1. Validate quote exists, not consumed, not expired
2. Validate address ownership (pickup + destination)
3. Generate order number + tracking code
4. Get tax snapshot from pricing_rule
5. Calculate route geometry (RECALCULATES route — duplicate call)
6. Create order (copies all pricing from quote)
7. Mark quote as consumed
8. Create order event
9. Create payment record (amount = quote.total_amount)
```

### Pricing Consistency Check

| Point | Source | Value |
|-------|--------|-------|
| Quote calculation | QuoteService | quote.total_amount |
| Order creation | OrderService | order.total_amount = quote.total_amount |
| Payment initialization | OrderService | payment.amount = quote.total_amount |
| Delivery completion | complete_delivery() | rider_earning = order.total_amount × (1 - 0.15) |

**All pricing flows originate from the quote. No recalculation occurs.**

### Route Distance Consistency

| Point | Source | Distance |
|-------|--------|----------|
| Quote | QuoteService | distance_km from routing |
| Order | OrderService | distance_km = quote.distance_km |
| Dispatch | find_nearest_riders | ST_Distance (straight-line, NOT route) |
| TrackingMap | route_geometry | Stored route coordinates |

**Finding:** Dispatch uses straight-line distance, while pricing uses route distance. This means a rider 5km straight-line away might be 8km by road. Dispatch does NOT affect pricing — it only determines which riders receive offers.

---

## 8. Dispatch Distance Audit

### Current Dispatch Architecture

```sql
find_nearest_riders(p_lat, p_lon, p_max_distance_km, p_limit):
  SELECT rider_id, ST_Distance(rider_location, pickup_point) / 1000 AS distance_km
  FROM rider_current_locations
  WHERE is_available = TRUE
    AND verification_status = 'approved'
    AND ST_Distance(...) / 1000 <= p_max_distance_km
  ORDER BY distance_km ASC
  LIMIT p_limit
```

### Assessment

| Factor | Current | Impact |
|--------|---------|--------|
| Distance type | Straight-line (PostGIS) | Adequate for MVP |
| Radius | 10km (configurable) | Reasonable |
| Route distance | Not used | May miss closer road-accessible riders |
| Matrix API | Not used | Not needed at current scale |
| Rider selection | Nearest first | Simple, effective |

### Matrix API Assessment

| Option | Pros | Cons |
|--------|------|------|
| Keep straight-line | Simple, fast, free | May miss optimal riders |
| Add route distance | More accurate | +20 credits per dispatch attempt |
| Use Matrix API | Best accuracy | +10 credits × N riders, requires Standard plan ($80/mo) |

**Recommendation:** Keep straight-line for MVP. Route distance is a future optimization when dispatch volume justifies the additional Stadia credits.

---

## 9. Stadia Maps Credit/Request Impact

### Current Credit Usage Per Order

| Step | Request | Credits | Purpose |
|------|---------|---------|---------|
| Quote generation | 1 routing call | 20 | Price calculation |
| Order creation | 1 routing call | 20 | Route geometry |
| **Total** | **2 routing calls** | **40** | |

### Optimized Credit Usage (Proposed)

| Step | Request | Credits | Purpose |
|------|---------|---------|---------|
| Quote generation | 1 routing call | 20 | Price + geometry |
| Order creation | 0 routing calls | 0 | Reuse quote geometry |
| **Total** | **1 routing call** | **20** | |

**Savings: 20 credits per order (50% reduction in routing costs)**

### Monthly Impact (100 customers/day)

| Model | Routing Calls | Routing Credits | Cost at $20/1M |
|-------|---------------|-----------------|----------------|
| Current (2 per order) | 6,000 | 120,000 | ~$2.40 |
| Optimized (1 per order) | 3,000 | 60,000 | ~$1.20 |
| Savings | 3,000 | 60,000 | ~$1.20/month |

### Other Credit Usage (Unchanged)

| Category | Credits/Month |
|----------|---------------|
| Autocomplete (when built) | 12,000 |
| Geocoding | 120,000 |
| Map tiles | 195,000 |
| **Total (optimized)** | **387,000** |

**Well within Starter plan (1M credits/month).**

---

## 10. Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| Client cannot supply price | N/A | ✅ Already protected |
| Client cannot supply distance | N/A | ✅ Already protected |
| Quote expiration enforced | N/A | ✅ Already protected |
| Single-use quote enforcement | N/A | ✅ Already protected |
| Address ownership validation | N/A | ✅ Already protected |
| Server-side pricing calculation | N/A | ✅ Already protected |
| Payment amount = quote amount | N/A | ✅ Already protected |
| No API keys exposed client-side | N/A | ✅ Already protected |

**No security issues found in the pricing architecture.**

---

## 11. Data Model Findings

### Tables Involved in Pricing

| Table | Role | Key Columns |
|-------|------|-------------|
| `service_zones` | Geographic boundaries | boundary (GEOGRAPHY) |
| `pricing_rules` | Per-zone pricing config | per_kilometer, minimum_fare, weight_bands |
| `zone_pricing_matrix` | Cross-zone fixed prices | fixed_price (UNUSED today) |
| `delivery_quotes` | Immutable pricing snapshot | all fee fields, distance_km, total_amount |
| `orders` | Pricing reference | copies from quote |
| `payments` | Payment amount | amount = quote.total_amount |
| `earnings_ledger` | Rider earnings | credit = total_amount × 0.85 |
| `platform_settings` | Configuration | commission_rate, priority_fee, tax_rate |

### Potential Schema Improvements

| Improvement | Priority | Notes |
|-------------|----------|-------|
| Store route_geometry on delivery_quotes | MEDIUM | Avoid duplicate routing call |
| Add route_distance_accuracy field | LOW | Track Haversine vs routing |
| Deprecate zone_pricing_matrix | LOW | If unified distance-based model adopted |

---

## 12. Recommended Target Architecture

### Pricing Flow (Optimized)

```
1. Customer selects addresses (coordinates from stored addresses)
2. Client → POST /api/orders/quote (coordinates + category + weight)
3. QuoteService:
   a. Validate coordinates
   b. Find zone (is_in_service_zone)
   c. Calculate route via MapsProvider → { distance_km, duration_minutes, coordinates }
   d. Calculate pricing (distance × rate + weight + priority + tax)
   e. Store quote with ALL route data (distance, duration, geometry)
4. Client displays quote
5. Client → POST /api/orders (quote_id + address_ids)
6. OrderService:
   a. Validate quote (expiration, consumption, ownership)
   b. Validate address ownership
   c. Copy pricing from quote (NO recalculation)
   d. Copy route_geometry from quote (NO recalculation)
   e. Create order
   f. Mark quote consumed
   g. Create payment
```

### Key Changes from Current

| Current | Proposed |
|---------|----------|
| QuoteService stores distance/duration only | QuoteService stores distance/duration/geometry |
| OrderService recalculates route | OrderService reads geometry from quote |
| 2 routing calls per order | 1 routing call per order |
| Cross-zone = fixed price | Cross-zone = distance-based (or removed) |

---

## 13. Required Founder Decisions

| Decision | Options | Current State |
|----------|---------|---------------|
| Cross-zone pricing model | A. Remove (unified distance-based), B. Convert to distance-based, C. Keep fixed | Only 1 zone exists; code never triggers |
| Minimum fare | Keep ₦700 or adjust | Currently ₦700 |
| Per-km rate | Keep ₦100/km or adjust | Currently ₦100/km |
| Weight bands | Keep current bands or adjust | 0-2kg (1.0x), 2-5kg (1.2x), 5-10kg (1.5x) |
| Urgency multipliers | Keep or adjust | express (1.3x), urgent (1.5x) |
| Platform commission | Keep 15% or adjust | Currently 15% |
| Dispatch distance model | A. Keep straight-line, B. Add route distance | Currently straight-line |

---

## 14. Proposed Phase 6H Implementation Scope

### Priority 1: Eliminate Duplicate Route Calculation (HIGH)

**What:** Capture route geometry in QuoteService and store it on the quote, so OrderService doesn't need to recalculate.

**Files affected:**
- `apps/web/lib/services/quote.service.ts` — capture `route.coordinates`
- `apps/web/lib/services/order.service.ts` — read geometry from quote instead of recalculating
- `supabase/migrations/` — add `route_geometry` column to `delivery_quotes` table

**Impact:** -20 Stadia credits per order, eliminates redundant API call, improves order creation speed.

### Priority 2: Improve Haversine Fallback Accuracy (MEDIUM)

**What:** When Stadia is unavailable, use a more accurate distance estimation (e.g., multiply Haversine by 1.3 road-factor) or refuse quote generation.

**Files affected:**
- `apps/web/lib/services/quote.service.ts` — modify fallback behavior

### Priority 3: Cross-Zone Pricing Decision (MEDIUM — requires founder input)

**What:** Determine whether to remove, convert, or keep cross-zone fixed pricing.

**Depends on:** Founder decision on cross-zone pricing model.

### Priority 4: Dispatch Route Distance (LOW — future)

**What:** Consider route distance for dispatch when volume justifies additional Stadia credits.

**Deferred:** Not needed at MVP scale.

---

## 15. Explicit Out-of-Scope Items

| Item | Reason |
|------|--------|
| Modifying pricing rules/amounts | Requires founder decision |
| Changing platform commission | Requires founder decision |
| Implementing surge/peak pricing | Not in founder's current direction |
| Matrix API integration | Not needed at MVP scale |
| Stadia plan upgrade | Not needed at current volume |
| Modifying rider earnings calculation | Currently correct |
| Modifying payment flow | Currently correct |
| Modifying background jobs | Currently correct |
| Changing MapsProvider | Currently correct |

---

## 16. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Haversine fallback produces wrong price | Medium | Low (only when Stadia unavailable) | Improve fallback or fail-safe |
| Cross-zone pricing inaccuracy | Low (only 1 zone today) | Medium (when zones expand) | Founder decision required |
| Duplicate routing wastes credits | High (happens every order) | Low ($1.20/month) | Priority 1 fix |
| Quote/price manipulation | Very Low | High | Already protected by server-side validation |
| Route changes after quote | Very Low | Medium | 5-min quote expiration limits window |

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
| Working tree | ✅ Clean |

---

**PHASE 6H DISCOVERY — COMPLETE**

**STATUS: READY FOR ARCHITECTURE REVIEW**
