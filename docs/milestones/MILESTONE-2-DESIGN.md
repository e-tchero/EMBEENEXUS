# MILESTONE 2 — IMPLEMENTATION DESIGN

**Document Status:** Design Phase
**Platform:** MBEENEXUS
**Domain:** mbeenenexus.com
**Initial Launch:** Abuja, Nigeria
**Architecture Baseline:** ARCHITECTURE.md V1.2

---

## 1. EXECUTIVE SUMMARY

Milestone 2 implements the core customer booking flow:

1. **Address Management** — Create, read, update, delete customer addresses
2. **Quote Calculation** — Generate authoritative delivery quotes with pricing
3. **Quote Locking** — Atomic quote consumption preventing double-use
4. **Order Creation** — Server-authoritative order creation from consumed quotes
5. **Payment Initialization** — Paystack payment setup for order completion

The design strictly follows ARCHITECTURE.md V1.2. All financial calculations are server-authoritative. All authorization is enforced via RLS and server-side checks. No client-provided values influence pricing or order state.

---

## 2. EXISTING ARCHITECTURE DEPENDENCIES

### 2.1 Tables Reused (No Changes)

| Table | Milestone 2 Usage |
|-------|-------------------|
| `profiles` | Customer identity via `auth.uid()` |
| `customer_profiles` | Customer profile reference |
| `addresses` | Pickup and destination addresses |
| `service_zones` | Zone validation for pickup/dropoff |
| `delivery_categories` | Package category validation |
| `pricing_rules` | Pricing calculation source |
| `delivery_quotes` | Quote storage and locking |
| `orders` | Order creation |
| `order_events` | Order lifecycle events |
| `order_status_history` | Status change audit trail |
| `payments` | Payment record creation |
| `promotions` | Discount application |
| `platform_settings` | Configurable values |
| `idempotency_keys` | Request deduplication |
| `audit_logs` | Financial audit trail |

### 2.2 Functions Reused (No Changes)

| Function | Purpose |
|----------|---------|
| `consume_quote()` | Atomic quote consumption with `FOR UPDATE` |
| `generate_order_number()` | Unique order number generation |
| `generate_tracking_code()` | Unique tracking code generation |
| `calculate_distance()` | PostGIS distance calculation |
| `get_user_role()` | Role resolution for authorization |
| `has_role()` | Role check for authorization |

### 2.3 Existing Shared Code

| File | Status | Milestone 2 Reuse |
|------|--------|-------------------|
| `packages/shared/types/index.ts` | ✅ Complete | All types exist |
| `packages/shared/validators/index.ts` | ✅ Complete | All schemas exist |
| `apps/web/lib/supabase/server.ts` | ✅ Complete | Client + service role |
| `apps/web/lib/supabase/client.ts` | ✅ Complete | Browser client |
| `apps/web/middleware.ts` | ✅ Complete | Session refresh |

### 2.4 Discrepancies Found

**None.** The existing codebase matches ARCHITECTURE.md V1.2 for all Milestone 2 dependencies.

---

## 3. ADDRESS ARCHITECTURE

### 3.1 Data Model

The `addresses` table already exists in the schema:

```sql
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Required Fields

| Field | Required | Validation | Notes |
|-------|----------|------------|-------|
| `street_address` | ✅ | 1-500 chars | Free text, geocoded |
| `city` | ✅ | 1-100 chars | Must match service area |
| `state` | ✅ | 1-100 chars | Must match service area |
| `country` | ✅ | Default: "Nigeria" | Configurable |
| `latitude` | ✅ | -90 to 90 | Must be valid coordinates |
| `longitude` | ✅ | -180 to 180 | Must be valid coordinates |
| `label` | Optional | 1-50 chars | "Home", "Office", etc. |
| `postal_code` | Optional | 1-20 chars | Nigerian postal codes |
| `is_default` | Optional | Boolean | Only one default per user |

### 3.3 Address Operations

| Operation | Method | Authorization | Idempotency |
|-----------|--------|---------------|-------------|
| Create address | `POST /api/addresses` | Customer (auth.uid()) | No (safe to retry) |
| List addresses | `GET /api/addresses` | Customer (RLS) | N/A |
| Get address | `GET /api/addresses/:id` | Customer (RLS) | N/A |
| Update address | `PATCH /api/addresses/:id` | Customer (RLS) | No |
| Delete address | `DELETE /api/addresses/:id` | Customer (RLS) | No |
| Set default | `PATCH /api/addresses/:id/default` | Customer (RLS) | No |

### 3.4 Default Address Behavior

- Only one address per user can be `is_default = TRUE`
- Setting a new default clears the old default (transactional)
- Default address is used to pre-fill pickup in the booking flow
- Default address is NOT required for order creation

### 3.5 Coordinate Validation

1. **Range check:** latitude ∈ [-90, 90], longitude ∈ [-180, 180]
2. **Nigeria bounds check:** latitude ∈ [4.0, 14.0], longitude ∈ [2.5, 14.7]
3. **Abuja bounds check (soft):** latitude ∈ [8.8, 9.5], longitude ∈ [6.8, 7.8]
4. **Service zone check:** PostGIS `ST_Contains` against active zones

### 3.6 Soft Deletion

Addresses use hard deletion (`ON DELETE CASCADE`). When an address is deleted:
- If it's referenced by an order, the order retains the address data (denormalized in order row)
- If it's the default address, `customer_profiles.default_address_id` is set to NULL
- The address is immediately unavailable for new orders

### 3.7 Abuja/Nigeria Considerations

- Default country: "Nigeria"
- Default state for Abuja: "FCT" (Federal Capital Territory)
- Phone numbers: Nigerian format validated by existing `NigerianPhoneSchema`
- Addresses must be geocoded to valid coordinates within Nigeria

---

## 4. SERVICE ZONE ARCHITECTURE

### 4.1 Zone Representation

Zones use PostGIS polygons stored in `service_zones.boundary`:

```sql
CREATE TABLE service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- "Abuja Central"
  slug TEXT NOT NULL UNIQUE,    -- "abuja-central"
  boundary GEOGRAPHY(POLYGON, 4326) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  operating_hours JSONB DEFAULT '{}',
  ...
);
```

### 4.2 Point-in-Polygon Check

```sql
-- Check if a point is inside any active service zone
CREATE OR REPLACE FUNCTION is_in_service_zone(
  p_lat DECIMAL,
  p_lon DECIMAL
) RETURNS TABLE (
  zone_id UUID,
  zone_name TEXT,
  zone_slug TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT sz.id, sz.name, sz.slug
  FROM service_zones sz
  WHERE sz.is_active = TRUE
    AND ST_Contains(
      sz.boundary,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    )
  LIMIT 1;
END;
$$ LANGUAGE sql;
```

### 4.3 Zone Priority

If multiple zones overlap (e.g., "Abuja Central" within "Abuja Metro"):
- **Priority:** Zone with smallest area wins (most specific)
- **Implementation:** `ORDER BY ST_Area(boundary) ASC LIMIT 1`
- **Pricing:** Use the pricing rule associated with the most specific zone

### 4.4 Location Outside Service Area

When pickup or dropoff is outside all active zones:
1. Return error: `SERVICE_ZONE_UNSUPPORTED`
2. Include list of supported zone names
3. Do NOT create quote
4. Do NOT create order

### 4.5 Cross-Zone Deliveries

If pickup is in Zone A and dropoff is in Zone B:
- Use the pricing rule from the **pickup zone** (Zone A)
- Both zones must be active
- If either zone is inactive, reject the request

---

## 5. MAPS PROVIDER ABSTRACTION

### 5.1 Provider Interface

```typescript
// packages/shared/types/maps.ts

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

export interface RouteResult {
  distance_km: number;
  duration_minutes: number;
  polyline?: string;
}

export interface MapsProvider {
  geocode(address: string): Promise<GeocodingResult[]>;
  reverseGeocode(lat: number, lon: number): Promise<GeocodingResult>;
  searchAddresses(query: string, location?: { lat: number; lon: number }): Promise<GeocodingResult[]>;
  getRoute(
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number }
  ): Promise<RouteResult>;
}
```

### 5.2 Provider Configuration

```typescript
// apps/web/lib/maps/provider.ts

import type { MapsProvider } from '@repo/shared/types/maps';

let provider: MapsProvider | null = null;

export function getMapsProvider(): MapsProvider {
  if (!provider) {
    const providerName = process.env.MAPS_PROVIDER || 'google';
    switch (providerName) {
      case 'google':
        provider = new GoogleMapsProvider(process.env.MAPS_API_KEY!);
        break;
      // Add more providers as needed
      default:
        throw new Error(`Unknown maps provider: ${providerName}`);
    }
  }
  return provider;
}
```

### 5.3 Quote System Integration

The quote system consumes **normalized internal data**, not provider-specific responses:

1. Call `provider.getRoute()` → receive `RouteResult`
2. Use `RouteResult.distance_km` for pricing calculation
3. Use `RouteResult.duration_minutes` for ETA display
4. Store normalized data in `delivery_quotes`

---

## 6. QUOTE ENGINE ARCHITECTURE

### 6.1 Quote Generation Flow

```
Customer Request
    ↓
Validate addresses (range, service zone)
    ↓
Get route distance/duration from Maps Provider
    ↓
Find applicable pricing rule (zone + category)
    ↓
Calculate fees using pricing formula
    ↓
Apply promotions (if code provided)
    ↓
Apply tax
    ↓
Enforce minimum fare
    ↓
Store quote with expiration
    ↓
Return quote to customer
```

### 6.2 Pricing Rule Selection

```sql
-- Find applicable pricing rule for a delivery
CREATE OR REPLACE FUNCTION find_pricing_rule(
  p_zone_id UUID,
  p_category_id UUID
) RETURNS pricing_rules AS $$
DECLARE
  v_rule pricing_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_rule
  FROM pricing_rules
  WHERE zone_id = p_zone_id
    AND is_active = TRUE
    AND valid_from <= NOW()
    AND (valid_to IS NULL OR valid_to > NOW())
  ORDER BY version DESC
  LIMIT 1;

  RETURN v_rule;
END;
$$ LANGUAGE plpgsql;
```

### 6.3 Promotion Application

```sql
-- Validate and apply promotion
CREATE OR REPLACE FUNCTION validate_promotion(
  p_code TEXT,
  p_order_amount DECIMAL,
  p_customer_id UUID,
  p_zone_id UUID,
  p_category_id UUID
) RETURNS TABLE (
  discount_amount DECIMAL,
  discount_type TEXT,
  valid BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_promo promotions%ROWTYPE;
  v_calculated_discount DECIMAL;
BEGIN
  SELECT * INTO v_promo
  FROM promotions
  WHERE code = p_code
    AND is_active = TRUE
    AND valid_from <= NOW()
    AND valid_to >= NOW();

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::DECIMAL, ''::TEXT, FALSE, 'Invalid or expired promo code'::TEXT;
    RETURN;
  END IF;

  -- Check usage limit
  IF v_promo.usage_limit IS NOT NULL AND v_promo.usage_count >= v_promo.usage_limit THEN
    RETURN QUERY SELECT 0::DECIMAL, ''::TEXT, FALSE, 'Promo code usage limit reached'::TEXT;
    RETURN;
  END IF;

  -- Check per-user limit
  IF v_promo.per_user_limit IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM orders WHERE customer_id = p_customer_id AND promotion_code = p_code) >= v_promo.per_user_limit THEN
      RETURN QUERY SELECT 0::DECIMAL, ''::TEXT, FALSE, 'You have reached the usage limit for this promo code'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check minimum order amount
  IF v_promo.minimum_order_amount IS NOT NULL AND p_order_amount < v_promo.minimum_order_amount THEN
    RETURN QUERY SELECT 0::DECIMAL, ''::TEXT, FALSE, 'Order does not meet minimum amount for this promo code'::TEXT;
    RETURN;
  END IF;

  -- Calculate discount
  IF v_promo.discount_type = 'percentage' THEN
    v_calculated_discount := p_order_amount * (v_promo.discount_value / 100);
  ELSE
    v_calculated_discount := v_promo.discount_value;
  END IF;

  -- Apply maximum discount limit
  IF v_promo.maximum_discount_amount IS NOT NULL THEN
    v_calculated_discount := LEAST(v_calculated_discount, v_promo.maximum_discount_amount);
  END IF;

  -- Ensure discount doesn't exceed order amount
  v_calculated_discount := LEAST(v_calculated_discount, p_order_amount);

  RETURN QUERY SELECT v_calculated_discount, v_promo.discount_type, TRUE, ''::TEXT;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. EXACT PRICING FORMULA

### 7.1 Calculation Order

```
1. base_fee                    (from pricing_rules)
2. + distance_fee              (distance_km × per_kilometer)
3. + weight_fee                (weight_kg × per_kg × weight_band_multiplier)
4. + urgency_fee               (base × urgency_multiplier - base)
5. = subtotal_before_discount
6. - discount_amount           (from promotion, capped at subtotal)
7. = subtotal_after_discount
8. + tax_amount                (subtotal_after_discount × tax_rate)
9. = total_before_minimum
10. = MAX(total_before_minimum, minimum_fare)
11. = final_total              (rounded to 2 decimal places)
```

### 7.2 Mathematical Formula

```
final_total = MAX(
  (base_fee + distance_fee + weight_fee + urgency_fee - discount) × (1 + tax_rate),
  minimum_fare
)
```

Where:
- `distance_fee = distance_km × per_kilometer`
- `weight_fee = weight_kg × per_kg × weight_band_multiplier`
- `urgency_fee = base_fee × (urgency_multiplier - 1)`
- `discount = MIN(promotion_discount, subtotal_before_discount)`
- `tax_rate = pricing_rules.tax_rate` (default 0.075 = 7.5% VAT)

### 7.3 Decimal Precision

- All intermediate calculations: `DECIMAL(12,4)` (4 decimal places)
- Final amount: `DECIMAL(12,2)` (2 decimal places, standard for NGN)
- Rounding: **Round half up** (standard banking rounding)
- No JavaScript floating-point for authoritative calculations

### 7.4 Currency

- Default: `NGN` (Nigerian Naira)
- Symbol: `₦`
- No kobo in customer-facing amounts (rounded to nearest Naira)
- Internal records store 2 decimal places

### 7.5 Weight Band Multiplier

```sql
-- Example weight bands in pricing_rules.weight_bands
[
  {"min_kg": 0, "max_kg": 2, "multiplier": 1.0},
  {"min_kg": 2, "max_kg": 5, "multiplier": 1.2},
  {"min_kg": 5, "max_kg": 10, "multiplier": 1.5},
  {"min_kg": 10, "max_kg": 20, "multiplier": 2.0}
]
```

### 7.6 Urgency Multipliers

```sql
-- Example urgency_multipliers in pricing_rules
{
  "standard": 1.0,
  "express": 1.3,
  "urgent": 1.8
}
```

### 7.7 Zero/Negative Value Prevention

- `base_fee` must be > 0 (enforced by schema: `DECIMAL(10,2) NOT NULL`)
- `distance_fee` must be ≥ 0 (calculated, not user input)
- `weight_fee` must be ≥ 0 (calculated, not user input)
- `discount_amount` must be ≥ 0 and ≤ subtotal
- `tax_amount` must be ≥ 0
- `total_amount` must be ≥ `minimum_fare`
- All enforced by PostgreSQL `CHECK` constraints and application logic

---

## 8. QUOTE LIFECYCLE

### 8.1 States

```
CREATED → ACTIVE → CONSUMED → ORDER CREATED
    ↓         ↓
EXPIRED    EXPIRED
```

### 8.2 Lifecycle Details

| State | Duration | Description |
|-------|----------|-------------|
| `ACTIVE` | 5 minutes | Quote is valid and usable |
| `EXPIRED` | Permanent | Quote exceeded `valid_until` |
| `CONSUMED` | Permanent | Quote was atomically consumed by `consume_quote()` |

### 8.3 Quote Snapshot

When a quote is created, the following are stored:

| Field | Source | Purpose |
|-------|--------|---------|
| `pickup_latitude/longitude` | Customer input | Location lock |
| `destination_latitude/longitude` | Customer input | Location lock |
| `pickup_address_text` | Geocoding | Display |
| `destination_address_text` | Geocoding | Display |
| `category_id` | Customer input | Package type |
| `weight_kg` | Customer input | Pricing |
| `pricing_rule_id` | System | Rule version lock |
| `base_fee` | Calculation | Price component |
| `distance_fee` | Calculation | Price component |
| `weight_fee` | Calculation | Price component |
| `zone_fee` | Calculation | Price component |
| `urgency_fee` | Calculation | Price component |
| `discount_amount` | Calculation | Price component |
| `tax_amount` | Calculation | Tax component |
| `total_amount` | Calculation | Final price |
| `distance_km` | Maps provider | Route lock |
| `estimated_duration_minutes` | Maps provider | ETA |
| `valid_until` | System (NOW() + 5min) | Expiration |

### 8.4 Quote Independence

A quote is **independent of future pricing-rule changes** because:
- `pricing_rule_id` is stored with the quote
- All fee components are pre-calculated and stored
- `total_amount` is the authoritative value
- When consumed, the order inherits these exact values

### 8.5 Quote Consumption

```sql
-- Atomic consumption (already exists in ARCHITECTURE.md)
SELECT consume_quote(p_quote_id, p_order_id);
-- Returns TRUE if successful, FALSE if expired/consumed
```

PostgreSQL guarantees:
- `FOR UPDATE` locks the row
- `is_consumed` check prevents double-use
- Transaction ensures atomicity
- Two concurrent requests cannot both consume the same quote

---

## 9. ORDER CREATION ARCHITECTURE

### 9.1 Order Creation Flow

```
Authenticated Customer
    ↓
Validate request (Zod schema)
    ↓
Validate addresses exist and belong to customer (RLS)
    ↓
Validate pickup/destination in service zone
    ↓
Validate quote exists and is unconsumed
    ↓
BEGIN TRANSACTION
    ├─ consume_quote(quote_id, order_id)
    ├─ Generate order_number (generate_order_number)
    ├─ Generate tracking_code (generate_tracking_code)
    ├─ INSERT into orders (all fields from quote)
    ├─ INSERT into order_events
    ├─ INSERT into order_status_history
    └─ INSERT into payments (status: 'pending')
COMMIT TRANSACTION
    ↓
Return order + payment reference
```

### 9.2 Transaction Boundary

**Inside transaction (atomic):**
1. Quote consumption (`consume_quote`)
2. Order creation
3. Order event recording
4. Payment record creation

**Outside transaction (async):**
1. Payment initialization (Paystack API call)
2. Notification sending
3. Background job creation

### 9.3 Order Creation PostgreSQL Function

```sql
CREATE OR REPLACE FUNCTION create_order_from_quote(
  p_customer_id UUID,
  p_quote_id UUID,
  p_payment_method TEXT
) RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  tracking_code TEXT,
  payment_reference TEXT,
  total_amount DECIMAL
) AS $$
DECLARE
  v_quote delivery_quotes%ROWTYPE;
  v_order_id UUID;
  v_order_number TEXT;
  v_tracking_code TEXT;
  v_payment_reference TEXT;
BEGIN
  -- 1. Lock and validate quote
  SELECT * INTO v_quote
  FROM delivery_quotes
  WHERE id = p_quote_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.is_consumed THEN
    RAISE EXCEPTION 'Quote already consumed';
  END IF;

  IF v_quote.valid_until < NOW() THEN
    RAISE EXCEPTION 'Quote expired';
  END IF;

  -- 2. Generate identifiers
  v_order_number := generate_order_number();
  v_tracking_code := generate_tracking_code();
  v_payment_reference := 'PAY-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));
  v_order_id := gen_random_uuid();

  -- 3. Create order
  INSERT INTO orders (
    id, order_number, customer_id, status,
    pickup_address_id, pickup_contact_name, pickup_contact_phone, pickup_instructions,
    pickup_latitude, pickup_longitude,
    destination_address_id, recipient_name, recipient_phone, delivery_instructions,
    destination_latitude, destination_longitude,
    category_id, package_description, package_weight_kg, package_dimensions, quantity,
    special_handling_requirements,
    pricing_rule_id, base_fee, distance_fee, weight_fee, zone_fee, urgency_fee,
    discount_amount, tax_amount, tax_rate_applied, tax_name_applied, total_amount, currency,
    distance_km, estimated_duration_minutes, urgency_level,
    tracking_code, created_at, updated_at
  ) VALUES (
    v_order_id, v_order_number, p_customer_id, 'pending_payment',
    -- Address IDs from quote (need to be resolved)
    -- For now, use quote coordinates directly
    NULL, 'Customer', '', NULL,
    v_quote.pickup_latitude, v_quote.pickup_longitude,
    NULL, 'Recipient', '', NULL,
    v_quote.destination_latitude, v_quote.destination_longitude,
    v_quote.category_id, 'Package', v_quote.weight_kg, v_quote.dimensions, v_quote.quantity,
    NULL,
    v_quote.pricing_rule_id, v_quote.base_fee, v_quote.distance_fee, v_quote.weight_fee,
    v_quote.zone_fee, v_quote.urgency_fee, v_quote.discount_amount, v_quote.tax_amount,
    -- Tax rate snapshot
    (SELECT tax_rate FROM pricing_rules WHERE id = v_quote.pricing_rule_id),
    (SELECT tax_name FROM pricing_rules WHERE id = v_quote.pricing_rule_id),
    v_quote.total_amount, v_quote.currency,
    v_quote.distance_km, v_quote.estimated_duration_minutes, 'standard',
    v_tracking_code, NOW(), NOW()
  );

  -- 4. Mark quote as consumed
  UPDATE delivery_quotes
  SET is_consumed = TRUE, consumed_at = NOW(), order_id = v_order_id
  WHERE id = p_quote_id;

  -- 5. Record events
  INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_id, actor_type, metadata)
  VALUES (v_order_id, 'order_created', NULL, 'pending_payment', p_customer_id, 'customer',
          jsonb_build_object('quote_id', p_quote_id, 'payment_method', p_payment_method));

  INSERT INTO order_status_history (order_id, status, notes, created_by)
  VALUES (v_order_id, 'pending_payment', 'Order created, awaiting payment', p_customer_id);

  -- 6. Create payment record
  INSERT INTO payments (order_id, customer_id, paystack_reference, amount, currency, payment_method, status)
  VALUES (v_order_id, p_customer_id, v_payment_reference, v_quote.total_amount, v_quote.currency, p_payment_method, 'pending');

  -- 7. Return
  RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_code, v_payment_reference, v_quote.total_amount;
END;
$$ LANGUAGE plpgsql;
```

### 9.4 Server Action vs Route Handler

| Operation | Type | Reason |
|-----------|------|--------|
| Create address | Server Action | Form submission |
| List addresses | Route Handler | GET request |
| Generate quote | Server Action | Form submission |
| Create order | Server Action | Form submission |
| Initialize payment | Route Handler | API call after order creation |

---

## 10. PAYMENT INITIALIZATION ARCHITECTURE

### 10.1 Payment Flow

```
Order Created (status: 'pending_payment')
    ↓
POST /api/payments/initialize
    ↓
Validate order belongs to customer
    ↓
Call Paystack API: InitializeTransaction
    ↓
Store access_code in payments table
    ↓
Return access_code to frontend
    ↓
Frontend opens Paystack inline popup
    ↓
Customer completes payment
    ↓
Paystack sends webhook: charge.success
    ↓
POST /api/webhooks/paystack
    ↓
Verify HMAC signature
    ↓
Check idempotency (processed_webhook_events)
    ↓
BEGIN TRANSACTION
    ├─ verify_payment_and_confirm_order()
    ├─ Update payment status = 'success'
    ├─ Update order status = 'paid'
    └─ Record processed_webhook_events
COMMIT TRANSACTION
    ↓
Create background job: DISPATCH_ORDER
    ↓
Return 200 OK
```

### 10.2 Paystack Integration Boundary

```typescript
// apps/web/lib/payments/paystack.ts

export interface PaystackInitialization {
  reference: string;
  access_code: string;
  authorization_url: string;
}

export async function initializePaystackTransaction(params: {
  amount: number; // In kobo (amount × 100)
  email: string;
  reference: string;
  callback_url: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitialization> {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(params.amount * 100), // Convert NGN to kobo
      email: params.email,
      reference: params.reference,
      callback_url: params.callback_url,
      metadata: params.metadata,
    }),
  });

  const data = await response.json();
  if (!data.status) {
    throw new Error(data.message || 'Payment initialization failed');
  }

  return {
    reference: data.data.reference,
    access_code: data.data.access_code,
    authorization_url: data.data.authorization_url,
  };
}
```

### 10.3 Amount Verification

- Paystack amount is in **kobo** (NGN × 100)
- Server converts: `amount_in_kobo = order.total_amount × 100`
- Webhook verification: `webhook_amount / 100 === order.total_amount`
- Any mismatch triggers audit log and flag for review

### 10.4 Payment Reference Generation

```typescript
function generatePaymentReference(orderNumber: string): string {
  return `MBEENEXUS-${orderNumber}-${Date.now()}`;
}
```

### 10.5 Callback/Redirect Handling

- **Success:** Redirect to `/orders/{order_id}?status=success`
- **Failed:** Redirect to `/orders/{order_id}?status=failed`
- **Abandoned:** Redirect to `/orders/{order_id}?status=abandoned`
- **Note:** Redirect is NOT authoritative. Only webhook determines payment status.

### 10.6 Payment State Model

```
pending → processing → success
    ↓         ↓
  failed    failed
    ↓
abandoned
```

### 10.7 Webhook Verification

```typescript
// apps/web/lib/payments/webhook.ts

import crypto from 'crypto';

export function verifyPaystackWebhook(
  payload: string,
  signature: string
): boolean {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');
  return hash === signature;
}
```

### 10.8 Failure Handling

| Failure | Action | Retry |
|---------|--------|-------|
| Paystack API error | Return error to customer | Customer retries |
| Webhook signature invalid | Reject webhook (400) | Paystack retries |
| Amount mismatch | Flag for review, don't process | Manual review |
| Duplicate webhook | Idempotent via `processed_webhook_events` | N/A |
| Database error | Return 500, log error | Automatic retry |

---

## 11. ORDER STATE MACHINE

### 11.1 Milestone 2 Transitions

| From | To | Actor | Trigger |
|------|-----|-------|---------|
| `draft` | `pending_payment` | system | Quote consumed, order created |
| `pending_payment` | `paid` | system | Webhook verified |
| `pending_payment` | `cancelled` | customer | Cancellation |
| `pending_payment` | `expired` | system | Payment timeout (15 min) |

### 11.2 State Transition Validation

```sql
-- Validate state transition
CREATE OR REPLACE FUNCTION validate_order_transition(
  p_current_status TEXT,
  p_new_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN CASE p_current_status
    WHEN 'draft' THEN p_new_status IN ('pending_payment', 'cancelled')
    WHEN 'pending_payment' THEN p_new_status IN ('paid', 'cancelled', 'expired')
    WHEN 'paid' THEN p_new_status IN ('searching_rider', 'cancelled')
    -- ... (full matrix in ARCHITECTURE.md §5.1)
    ELSE FALSE
  END;
END;
$$ LANGUAGE plpgsql;
```

### 11.3 Payment State Machine

```
pending → processing → success
    ↓         ↓
  failed    failed
    ↓
abandoned
```

| Payment Status | Order Status | Description |
|----------------|--------------|-------------|
| `pending` | `pending_payment` | Awaiting customer payment |
| `processing` | `pending_payment` | Payment in progress |
| `success` | `paid` | Payment confirmed by webhook |
| `failed` | `pending_payment` | Payment failed |
| `abandoned` | `pending_payment` | Customer abandoned payment |

---

## 12. IDEMPOTENCY DESIGN

### 12.1 Operations Requiring Idempotency

| Operation | Required | Key Source | Reason |
|-----------|----------|------------|--------|
| Order creation | ✅ | Client-generated UUID | Prevent duplicate orders |
| Payment initialization | ✅ | Client-generated UUID | Prevent duplicate payment refs |
| Quote generation | ❌ | N/A | Quotes are cheap to regenerate |
| Address creation | ❌ | N/A | Safe to retry |
| Payment webhook | ✅ | `processed_webhook_events` | Already implemented |

### 12.2 Idempotency Key Format

```
{operation}:{user_id}:{client_uuid}
```

Example: `order_create:6dcf6e7e-...:550e8400-e29b-41d4-a716-446655440000`

### 12.3 Request Hash

```typescript
const requestHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(requestBody))
  .digest('hex');
```

### 12.4 Replay Behavior

1. Check `idempotency_keys` for existing key
2. If found and hash matches → return cached response
3. If found and hash differs → return 422 (key reuse with different payload)
4. If not found → process request, store response

### 12.5 Expiration/Retention

- Idempotency keys expire after **24 hours**
- Expired keys are cleaned up by background job
- `expires_at` column with index for efficient cleanup

---

## 13. RLS / AUTHORIZATION MATRIX

### 13.1 Addresses Table

| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| Customer | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| Admin | `get_user_role() IN ('admin', 'super_admin')` | ❌ | ❌ | ❌ |
| Service Role | ✅ (bypasses RLS) | ✅ | ✅ | ✅ |

### 13.2 Delivery Quotes Table

| Role | SELECT | INSERT | UPDATE |
|------|--------|--------|--------|
| Customer | `customer_id = auth.uid()` | `customer_id = auth.uid()` | `customer_id = auth.uid()` (for consumption) |
| Admin | `get_user_role() IN ('admin', 'super_admin')` | ❌ | ❌ |
| Service Role | ✅ | ✅ | ✅ |

### 13.3 Orders Table

| Role | SELECT | INSERT | UPDATE |
|------|--------|--------|--------|
| Customer | `customer_id = auth.uid()` | `customer_id = auth.uid()` | `customer_id = auth.uid()` (limited) |
| Admin | `get_user_role() IN ('admin', 'super_admin', 'support', 'operations')` | ❌ | `get_user_role() IN ('admin', 'super_admin', 'operations')` |
| Service Role | ✅ | ✅ | ✅ |

### 13.4 Payments Table

| Role | SELECT | INSERT | UPDATE |
|------|--------|--------|--------|
| Customer | `customer_id = auth.uid()` | ❌ | ❌ |
| Admin | `get_user_role() IN ('admin', 'super_admin')` | ❌ | ❌ |
| Service Role | ✅ | ✅ | ✅ |

### 13.5 Recursive RLS Check

**No recursive RLS risks in Milestone 2.** All policies use:
- Direct column comparison: `user_id = auth.uid()`
- Existing SECURITY DEFINER functions: `get_user_role()`, `has_role()`
- No self-referencing subqueries

---

## 14. RATE LIMITING DESIGN

### 14.1 Milestone 2 Rate Limits

| Endpoint | Per-User | Per-IP | Window | Env Variable |
|----------|----------|--------|--------|---------------|
| Address CRUD | 30 | 60 | 1 min | `RATE_LIMIT_GENERAL` |
| Quote generation | 30 | 60 | 1 min | `RATE_LIMIT_QUOTE` |
| Order creation | 5 | 10 | 1 min | `RATE_LIMIT_ORDER` |
| Payment initialization | 5 | 10 | 1 min | `RATE_LIMIT_PAYMENT` |
| Geocoding (maps) | 10 | 20 | 1 min | `RATE_LIMIT_GEOCODING` |

### 14.2 Key Format

```
{category}:{identifier}
```

Examples:
- `quote:6dcf6e7e-...` (per-user)
- `quote:ip:192.168.1.1` (per-IP)

### 14.3 Response Behavior

When rate limited:
```json
{
  "error": "Too many requests",
  "retry_after": 45
}
```

HTTP Status: `429 Too Many Requests`

---

## 15. API / SERVER BOUNDARY MATRIX

### 15.1 Milestone 2 Endpoints

| Endpoint | Method | Type | Auth | Authorization | Idempotency |
|----------|--------|------|------|---------------|-------------|
| `/api/addresses` | POST | Server Action | ✅ | Customer (RLS) | ❌ |
| `/api/addresses` | GET | Route Handler | ✅ | Customer (RLS) | N/A |
| `/api/addresses/:id` | GET | Route Handler | ✅ | Customer (RLS) | N/A |
| `/api/addresses/:id` | PATCH | Server Action | ✅ | Customer (RLS) | ❌ |
| `/api/addresses/:id` | DELETE | Server Action | ✅ | Customer (RLS) | ❌ |
| `/api/orders/quote` | POST | Server Action | ✅ | Customer | ❌ |
| `/api/orders` | POST | Server Action | ✅ | Customer | ✅ |
| `/api/orders/:id` | GET | Route Handler | ✅ | Customer (RLS) | N/A |
| `/api/payments/initialize` | POST | Route Handler | ✅ | Customer | ✅ |
| `/api/webhooks/paystack` | POST | Route Handler | ❌ (webhook) | Signature verification | ✅ |

### 15.2 Request/Response Schemas

All schemas defined in `packages/shared/validators/index.ts`.

### 15.3 Error Responses

All errors follow consistent format:
```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": {}
}
```

---

## 16. ERROR MODEL

### 16.1 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_ADDRESS` | 400 | Address validation failed |
| `UNSUPPORTED_ZONE` | 400 | Location outside service area |
| `INVALID_COORDINATES` | 400 | Coordinates out of range |
| `QUOTE_EXPIRED` | 400 | Quote exceeded validity |
| `QUOTE_ALREADY_CONSUMED` | 400 | Quote was already used |
| `QUOTE_MISMATCH` | 400 | Quote parameters don't match |
| `PRICING_UNAVAILABLE` | 400 | No active pricing rule found |
| `PAYMENT_INITIALIZATION_FAILED` | 400 | Paystack API error |
| `DUPLICATE_REQUEST` | 409 | Idempotency key conflict |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized |
| `ORDER_CREATION_FAILED` | 500 | Database error during order creation |
| `PROVIDER_FAILURE` | 502 | External service (Paystack/Maps) error |

### 16.2 Error Handling

- Never expose database internals
- Never expose SQL errors
- Never expose stack traces
- Log detailed errors server-side
- Return generic messages to client

---

## 17. OBSERVABILITY / AUDIT EVENTS

### 17.1 Milestone 2 Events

| Event | Table | Actor | Metadata |
|-------|-------|-------|----------|
| Address created | `audit_logs` | customer | address_id |
| Address updated | `audit_logs` | customer | address_id, changes |
| Address deleted | `audit_logs` | customer | address_id |
| Quote generated | `order_events` | customer | quote_id, pricing_rule_id |
| Quote consumed | `order_events` | system | quote_id, order_id |
| Order created | `order_events` | customer | order_id, quote_id |
| Order status changed | `order_status_history` | system | from_status, to_status |
| Payment initialized | `order_events` | customer | payment_id, reference |
| Payment webhook received | `order_events` | system | event_id, reference |
| Payment confirmed | `order_events` | system | payment_id, amount |

### 17.2 Financial Audit

All financially significant operations are logged to `audit_logs`:
- Quote generation (pricing snapshot)
- Order creation (total_amount)
- Payment confirmation (amount verified)
- Any amount mismatch (flagged for review)

---

## 18. DATABASE IMPACT

### 18.1 No Database Changes Required

All Milestone 2 functionality uses existing tables and columns.

### 18.2 New PostgreSQL Functions Required

| Function | Purpose |
|----------|---------|
| `is_in_service_zone(lat, lon)` | Check if point is in active zone |
| `find_pricing_rule(zone_id, category_id)` | Find applicable pricing rule |
| `validate_promotion(code, amount, customer_id, zone_id, category_id)` | Validate and calculate discount |
| `create_order_from_quote(customer_id, quote_id, payment_method)` | Atomic order creation |

### 18.3 New Indexes Required

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_addresses_default` | `addresses` | Find default address per user |

### 18.4 New Columns Required

**None.** All required columns already exist.

### 18.5 New Tables Required

**None.** All required tables already exist.

---

## 19. CONCURRENCY ANALYSIS

### 19.1 Race Condition: Two Simultaneous Order Requests

**Scenario:** Customer clicks "Create Order" twice simultaneously.

**Prevention:**
1. Idempotency key prevents duplicate processing
2. `consume_quote()` uses `FOR UPDATE` — only one transaction can lock the quote
3. Partial unique index on `orders.order_number` prevents duplicate order numbers
4. Transaction ensures atomicity

**Result:** Only one order is created. Second request returns error or cached response.

### 19.2 Race Condition: Two Simultaneous Quote Consumption

**Scenario:** Two requests try to consume the same quote.

**Prevention:**
1. `consume_quote()` acquires row lock with `FOR UPDATE`
2. First transaction succeeds, sets `is_consumed = TRUE`
3. Second transaction sees `is_consumed = TRUE`, returns `FALSE`
4. PostgreSQL transaction isolation prevents dirty reads

**Result:** Only one quote is consumed.

### 19.3 Race Condition: Repeated Payment Initialization

**Scenario:** Customer clicks "Pay" multiple times.

**Prevention:**
1. Idempotency key on payment initialization
2. Payment reference is unique (`UNIQUE` constraint)
3. Paystack reference is unique (`UNIQUE` constraint)

**Result:** Only one payment reference is created.

### 19.4 Race Condition: Duplicate Webhooks

**Scenario:** Paystack sends the same webhook twice.

**Prevention:**
1. `processed_webhook_events` table with `UNIQUE(provider, event_id)`
2. Webhook handler checks idempotency before processing
3. Duplicate webhook returns 200 OK without reprocessing

**Result:** Payment is confirmed only once.

### 19.5 Race Condition: Pricing Rule Change During Quote Lifetime

**Scenario:** Admin updates pricing rule while customer has an active quote.

**Prevention:**
1. Quote stores `pricing_rule_id` and all fee components
2. Quote is independent of future pricing changes
3. Order inherits quote values, not current pricing rule values

**Result:** Customer pays the price quoted, regardless of pricing rule changes.

### 19.6 Race Condition: Promotion Exhaustion

**Scenario:** Multiple customers use the same promo code simultaneously.

**Prevention:**
1. `usage_count` is incremented atomically
2. Check `usage_count < usage_limit` before applying
3. Transaction ensures consistency

**Result:** Promo code usage is accurately tracked. Excess requests get error.

### 19.7 Race Condition: Address Deletion During Order Creation

**Scenario:** Customer deletes an address while order creation is in progress.

**Prevention:**
1. Order creation transaction locks the quote
2. Address is referenced by ID in the order
3. `ON DELETE CASCADE` on addresses would delete the order if address is deleted
4. Address deletion checks for active orders before deleting

**Result:** Order creation completes atomically. Address deletion is blocked if order references it.

---

## 20. SECURITY THREAT MODEL

### 20.1 Threat Matrix

| Threat | Attack | Control | Enforcement | Test |
|--------|--------|---------|-------------|------|
| **IDOR** | Access another user's address | RLS: `user_id = auth.uid()` | PostgreSQL RLS | Customer A cannot read Customer B's addresses |
| **Price manipulation** | Modify quote amount in request | Server recalculates from pricing rules | PostgreSQL function | Quote total is server-generated |
| **Payment amount manipulation** | Send wrong amount to Paystack | Server sets amount from order | Paystack API + webhook verification | Amount mismatch triggers audit |
| **Replay attacks** | Resend old request | Idempotency keys | `idempotency_keys` table | Duplicate request returns cached response |
| **Duplicate requests** | Create multiple orders from one quote | Quote consumption is atomic | `consume_quote()` with `FOR UPDATE` | Only one order per quote |
| **Webhook forgery** | Fake payment webhook | HMAC-SHA512 signature verification | Paystack webhook secret | Invalid signature returns 400 |
| **Unauthorized order access** | View another user's order | RLS: `customer_id = auth.uid()` | PostgreSQL RLS | Customer A cannot read Customer B's orders |
| **Location privacy** | Extract sensitive location data | Coordinates only, no personal data | API response filtering | Response doesn't include extra location data |
| **Coordinate spoofing** | Submit fake coordinates | Validate against service zone | PostGIS `ST_Contains` | Coordinates must be in active zone |
| **Privilege escalation** | Access admin endpoints | Role-based middleware | `get_user_role()` check | Customer cannot access admin endpoints |
| **Rate-limit bypass** | Abuse API endpoints | Upstash Redis rate limiting | Edge Middleware | Exceeding limits returns 429 |
| **Race conditions** | Concurrent modifications | PostgreSQL transactions + locks | `FOR UPDATE` + unique constraints | Concurrent requests produce consistent state |
| **Financial integrity** | Manipulate order totals | Server-authoritative calculations | PostgreSQL functions | All amounts calculated server-side |

---

## 21. TEST PLAN

### 21.1 Unit Tests

| Test | File | Coverage |
|------|------|----------|
| Pricing calculation | `pricing.test.ts` | Base fee, distance, weight, urgency, tax |
| Tax calculation | `pricing.test.ts` | Rate application, rounding |
| Discount calculation | `pricing.test.ts` | Percentage, fixed, caps, minimum order |
| Rounding | `pricing.test.ts` | Half-up, 2 decimal places |
| Zone validation | `zone.test.ts` | Point-in-polygon, active zones |
| Quote expiration | `quote.test.ts` | Active, expired, consumed states |
| State transitions | `state-machine.test.ts` | Valid/invalid transitions |

### 21.2 Database Tests

| Test | Method | Coverage |
|------|--------|----------|
| RLS - Address isolation | SQL + Supabase client | Customer A cannot access Customer B's addresses |
| RLS - Order isolation | SQL + Supabase client | Customer A cannot access Customer B's orders |
| Quote locking | SQL + concurrent requests | `consume_quote()` prevents double-use |
| Idempotency | SQL + concurrent requests | Duplicate key returns cached response |
| Constraints | SQL | CHECK, UNIQUE, FK constraints enforced |

### 21.3 Integration Tests

| Test | Flow | Coverage |
|------|------|----------|
| Address → Quote | Create address → Generate quote | End-to-end pricing |
| Quote → Order | Generate quote → Create order → Verify order | Atomic creation |
| Order → Payment | Create order → Initialize payment → Verify reference | Payment setup |
| Payment webhook → Background job | Simulate webhook → Verify job created | Async dispatch |

### 21.4 Security Tests

| Test | Method | Coverage |
|------|--------|----------|
| IDOR - Addresses | API call with wrong user token | RLS enforcement |
| IDOR - Orders | API call with wrong user token | RLS enforcement |
| Unauthorized quote consumption | API call without auth | Auth enforcement |
| Price tampering | Modify request body | Server recalculates |
| Customer ID spoofing | Modify customer_id in request | Server ignores client value |
| Duplicate order creation | Idempotency key reuse | Returns cached response |
| Duplicate payment init | Idempotency key reuse | Returns cached response |
| Replayed webhook | Resend webhook payload | Idempotent via processed_webhook_events |
| Expired quote abuse | Use expired quote | Quote validation rejects |

---

## 22. PRODUCT DECISIONS REQUIRED

### 22.1 Critical Decisions (Block Implementation)

| # | Decision | Current Default | Impact |
|---|----------|-----------------|--------|
| 1 | **Maps Provider** | None selected | Blocks geocoding, routing, distance calculation |
| 2 | **Base Fare** | Not set | Blocks pricing calculation |
| 3 | **Per-km Rate** | Not set | Blocks pricing calculation |
| 4 | **Per-kg Rate** | Not set | Blocks pricing calculation |
| 5 | **Minimum Fare** | Not set | Blocks pricing calculation |
| 6 | **Tax Rate** | 7.5% (Nigerian VAT) | May need confirmation |
| 7 | **Quote Lifetime** | 5 minutes | May need adjustment |
| 8 | **Platform Fee** | Not set | Affects revenue model |

### 22.2 Configuration Decisions (Can Use Defaults)

| # | Decision | Default | Notes |
|---|----------|---------|-------|
| 9 | Currency | NGN | Nigerian Naira |
| 10 | Supported zones | Abuja | Initial launch city |
| 11 | Delivery categories | Documents, Clothing, Electronics, Personal items, Retail purchases, Small parcels, Business packages, E-commerce orders, Other | From Master Spec |
| 12 | Vehicle types | Motorcycle | Initial default |
| 13 | Max package weight | 10kg | Configurable |
| 14 | Max package dimensions | 100cm | Configurable |
| 15 | Payment methods | Card, Bank Transfer | From Master Spec |
| 16 | Urgency levels | Standard, Express, Urgent | From Master Spec |
| 17 | Dispute window | 24 hours | From ARCHITECTURE.md |

---

## 23. MILESTONE 2 DEFINITION OF DONE

### 23.1 Feature Completion

- [ ] Customer can create, read, update, delete addresses
- [ ] Customer can set a default address
- [ ] Customer can generate a delivery quote
- [ ] Quote includes all fee components
- [ ] Quote is stored with expiration
- [ ] Customer can create an order from a quote
- [ ] Quote is atomically consumed
- [ ] Order inherits quote pricing
- [ ] Customer can initialize payment
- [ ] Payment reference is created
- [ ] Customer is redirected to Paystack
- [ ] Webhook confirms payment
- [ ] Order status updates to 'paid'

### 23.2 Technical Completion

- [ ] All API endpoints implemented
- [ ] All RLS policies enforced
- [ ] All Zod validations in place
- [ ] All idempotency keys implemented
- [ ] All rate limits configured
- [ ] All error codes defined
- [ ] All audit events logged
- [ ] All PostgreSQL functions created

### 23.3 Quality Completion

- [ ] Unit tests pass (pricing, validation)
- [ ] Integration tests pass (address → quote → order)
- [ ] Security tests pass (IDOR, authorization)
- [ ] RLS tests pass (data isolation)
- [ ] No secrets in frontend code
- [ ] No client-side pricing calculations
- [ ] All amounts server-authoritative

---

## 24. IMPLEMENTATION SEQUENCE

### Phase 1: Database Functions (No UI)

1. Create `is_in_service_zone()` function
2. Create `find_pricing_rule()` function
3. Create `validate_promotion()` function
4. Create `create_order_from_quote()` function
5. Add `idx_addresses_default` index
6. Test all functions against live database

### Phase 2: Address Management

1. Create address API routes
2. Implement address CRUD
3. Implement default address logic
4. Add address validation
5. Test RLS policies

### Phase 3: Quote Engine

1. Create maps provider abstraction
2. Implement quote generation logic
3. Implement pricing calculation
4. Implement promotion validation
5. Create quote API routes
6. Test pricing accuracy

### Phase 4: Order Creation

1. Implement order creation server action
2. Implement quote consumption
3. Implement payment record creation
4. Test atomic transactions
5. Test concurrent order creation

### Phase 5: Payment Initialization

1. Create Paystack integration
2. Implement payment initialization
3. Implement webhook handler
4. Implement payment verification
5. Test payment flow end-to-end

### Phase 6: Frontend

1. Address management UI
2. Quote display UI
3. Order confirmation UI
4. Payment flow UI
5. Error handling UI

---

**DESIGN STATUS: READY FOR REVIEW**

Awaiting your approval, Major. 🫡
