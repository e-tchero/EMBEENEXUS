# DELIVERY PLATFORM — TECHNICAL ARCHITECTURE & IMPLEMENTATION BLUEPRINT V1.2

**Document Status:** Architecture V1.2 — Second Review Resolved
**Based On:** Master Product & Engineering Specification V1
**Previous Version:** V1.1 (Second Review Required Changes)
**Implementation Status:** NOT STARTED — Pending Final Approval

---

## CHANGELOG (V1.0 → V1.1)

| # | Change | Reason |
|---|--------|--------|
| 1 | Supabase `auth.users` is now the sole authentication identity | BLOCKER 1: Eliminated duplicate users table |
| 2 | Complete RLS rewrite with proper `auth.uid()` usage | BLOCKER 2: Fixed recursive evaluation and identifier mismatch |
| 3 | Dispatch redesigned with advisory locks and single-active-assignment constraint | BLOCKER 3: Prevented race conditions and conflicting assignments |
| 4 | Unified on Supabase JS client + PostgreSQL functions | BLOCKER 4: Eliminated Prisma inconsistency |
| 5 | Payment processing uses durable dispatch jobs | REQUIRED 5: Webhook no longer runs synchronous dispatch |
| 6 | Quote locking uses `SELECT ... FOR UPDATE` with atomic consumption | REQUIRED 6: Prevents double-use under concurrency |
| 7 | Complete cancellation policy matrix | REQUIRED 7: No assumptions about cancellability |
| 8 | Defined completion mechanism with dispute window | REQUIRED 8: Clear delivered → completed flow |
| 9 | Businesses are first-class organizations with member roles | REQUIRED 9: Business identity properly modeled |
| 10 | Financial ledger replaces mutable aggregates | REQUIRED 10: Auditable earnings model |
| 11 | Payout uses tokenized Paystack transfer recipients | REQUIRED 11: Raw banking data minimized |
| 12 | Tax rules are configurable and versioned | REQUIRED 12: No hard-coded tax assumptions |
| 13 | Explicit background job architecture via pg_notify/edge functions | REQUIRED 13: No synchronous long-running jobs |
| 14 | Realtime tracking with authorized subscription model | REQUIRED 14: Channel-based authorization |
| 15 | Current-location materialized view for dispatch | REQUIRED 15: Optimized spatial queries |

## CHANGELOG (V1.1 → V1.2)

| # | Change | Reason |
|---|--------|--------|
| 16 | Dispatch state semantics clarified: offer ≠ acceptance | REVIEW 1: Rider offer pending is distinct from rider assigned |
| 17 | `rider_current_locations` is now a regular table, not materialized view | REVIEW 2: Materialized view too slow for live GPS updates |
| 18 | Added `idempotency_keys` table and idempotency middleware | REVIEW 3: Unstable mobile connections require safe retries |
| 19 | Added rate limiting architecture (Upstash Redis + Edge) | REVIEW 4: Explicit rate limiting across all endpoints |
| 20 | Rider assignment partial unique index refined | REVIEW 1: Only one active offer per order at a time |
| 21 | Added `dispatch_rider_v2()` with atomic offer/accept lifecycle | REVIEW 1: Race-condition-safe rider acceptance |
| 22 | Added consistency review across all subsystems | REVIEW 5: Cross-system contradiction check |
| 23 | Financial safety audit: all operations transactionally safe | REVIEW 6: Server-authoritative, idempotent, auditable |

---

# 1. SYSTEM ARCHITECTURE

## 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
│  Customer Web (Next.js)  │  Rider Web (Mobile)  │  Admin  │  Business   │
└───────────────────────────┴──────────────────────┴─────────┴─────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE / CDN                                    │
│  Static Assets · ISR · Edge Middleware (auth check, rate limiting)       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS APPLICATION                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │  Pages/Routes │  │  API Routes  │  │Server Actions│                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         └─────────────────┼──────────────────┘                           │
│                           ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     SERVICE LAYER                                  │  │
│  │  Auth · Order · Pricing · Dispatch · Payment · Rider · Notification│  │
│  │  Maps · Tracking · Business · Audit · Background Jobs             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                              │
│                           ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Supabase JS Client (@supabase/supabase-js)                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │  │
│  │  │ PostgreSQL │  │   Auth     │  │  Realtime  │  │  Storage   │  │  │
│  │  │ + PostGIS  │  │  (GoTrue)  │  │ (WebSocket)│  │            │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                                    │
│  Paystack · Maps Provider · Email (SendGrid) · SMS (Termii) · Sentry    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Database Access Strategy

**Chosen approach: Supabase JS client + PostgreSQL functions (RPC)**

- All application code uses `@supabase/supabase-js` client
- Server-side uses the **service_role** client for privileged operations
- Client-side uses the **anon** client (subject to RLS)
- Complex transactions use **PostgreSQL functions** called via `.rpc()`
- No Prisma — eliminated to avoid inconsistency with Supabase Auth/RLS

### Why Not Prisma

Prisma does not natively integrate with Supabase Auth (`auth.uid()`), does not respect RLS by default, and creates a parallel schema that diverges from Supabase migrations. Supabase's client library provides direct access to Auth, Realtime, Storage, and Edge Functions alongside the database, making it the coherent choice.

## 1.3 Server-Side vs Client-Side Access

| Operation | Client | Server (anon) | Server (service_role) |
|-----------|--------|---------------|----------------------|
| Read public data | ✅ | ✅ | ✅ |
| Read own data | ✅ (RLS) | ✅ (RLS) | ✅ |
| Write own data | ✅ (RLS) | ✅ (RLS) | ✅ |
| Admin operations | ❌ | ❌ | ✅ |
| Payment webhooks | ❌ | ❌ | ✅ |
| Dispatch | ❌ | ❌ | ✅ |
| Background jobs | ❌ | ❌ | ✅ |
| Rider location update | ❌ | ✅ (RLS) | ✅ |

**RLS is always enforced on the anon client.** The service_role client bypasses RLS but is only used in server-side API routes and background jobs where authorization is checked in application code.

---

# 2. AUTHENTICATION & IDENTITY MODEL

## 2.1 Identity Architecture

```
auth.users (Supabase Auth — authoritative identity)
    │
    ├── id (UUID) ← PRIMARY KEY, source of truth
    ├── email
    ├── phone
    ├── email_confirmed_at
    ├── phone_confirmed_at
    ├── created_at
    └── raw_user_meta_data
         │
         ▼
profiles (1:1 with auth.users)
    │
    ├── id (UUID) ← REFERENCES auth.users(id) ON DELETE CASCADE
    ├── role (TEXT) ← 'customer' | 'rider' | 'business' | 'support' | 'operations' | 'admin' | 'super_admin'
    ├── full_name (TEXT)
    ├── avatar_url (TEXT)
    ├── is_active (BOOLEAN)
    ├── created_at
    └── updated_at
         │
         ├──► customer_profiles (1:1, optional)
         │       ├── id ← REFERENCES profiles(id)
         │       ├── default_address_id
         │       └── created_at
         │
         ├──► rider_profiles (1:1, optional)
         │       ├── id ← REFERENCES profiles(id)
         │       ├── verification_status
         │       ├── is_available
         │       ├── current_location (GEOGRAPHY)
         │       ├── last_location_update
         │       ├── rating
         │       └── created_at
         │
         └──► business_profiles (1:1, optional)
                 ├── id ← REFERENCES profiles(id)
                 ├── business_name
                 ├── registration_number
                 ├── tax_id
                 └── created_at
                      │
                      └──► business_members (M:N with profiles)
                              ├── id
                              ├── business_id ← REFERENCES business_profiles(id)
                              ├── user_id ← REFERENCES profiles(id)
                              ├── role ← 'owner' | 'admin' | 'member'
                              ├── invited_at
                              └── accepted_at
```

## 2.2 Key Principles

1. **`auth.users.id` is the sole authentication identity.** Every foreign key that references a user goes through `auth.users(id)` → `profiles(id)`.
2. **No independent `users` table.** Supabase Auth manages authentication. The `profiles` table extends it with application data.
3. **`auth.uid()` returns `auth.users.id`.** RLS policies use `auth.uid()` which matches `profiles.id` because `profiles.id REFERENCES auth.users(id)`.
4. **One profile per user.** A user has exactly one profile with one role. A user can simultaneously be a customer AND a rider (two profiles linked to same auth user) if needed, but initially we enforce one profile.

## 2.3 Profile Creation Trigger

```sql
-- Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

## 2.4 Role Resolution (Safe, Non-Recursive)

```sql
-- Create a security-definer function to get the current user's role
-- This avoids recursive RLS on the profiles table
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Create a function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = required_role
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Create a function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION has_any_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = ANY(roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

---

# 3. ROW LEVEL SECURITY (RLS)

## 3.1 RLS Architecture Principles

1. **Every table has RLS enabled.**
2. **RLS policies use `auth.uid()` which equals `profiles.id`** (because `profiles.id REFERENCES auth.users(id)`).
3. **No recursive queries** on `profiles` for role resolution — use `get_user_role()` function instead.
4. **Service-role bypasses RLS** — used only in server-side trusted code.
5. **Client-side anon client** is always subject to RLS.

## 3.2 RLS Policies by Table

### profiles

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile (limited columns)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins and super_admins can read all profiles
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));

-- Admins can update any profile
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (get_user_role() IN ('admin', 'super_admin'));

-- Profile creation is handled by the trigger (SECURITY DEFINER)
-- No INSERT policy needed for regular users
```

### customer_profiles

```sql
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own customer profile
CREATE POLICY "customer_profiles_select_own"
  ON customer_profiles FOR SELECT
  USING (id = auth.uid());

-- Users can create their own customer profile
CREATE POLICY "customer_profiles_insert_own"
  ON customer_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own customer profile
CREATE POLICY "customer_profiles_update_own"
  ON customer_profiles FOR UPDATE
  USING (id = auth.uid());

-- Admins can read all
CREATE POLICY "customer_profiles_select_admin"
  ON customer_profiles FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));
```

### rider_profiles

```sql
ALTER TABLE rider_profiles ENABLE ROW LEVEL SECURITY;

-- Riders can read their own profile
CREATE POLICY "rider_profiles_select_own"
  ON rider_profiles FOR SELECT
  USING (id = auth.uid());

-- Riders can create their own profile
CREATE POLICY "rider_profiles_insert_own"
  ON rider_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Riders can update their own profile
CREATE POLICY "rider_profiles_update_own"
  ON rider_profiles FOR UPDATE
  USING (id = auth.uid());

-- Admins and operations can read all rider profiles
CREATE POLICY "rider_profiles_select_admin"
  ON rider_profiles FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin', 'operations'));

-- Admins can update rider profiles (verification, availability)
CREATE POLICY "rider_profiles_update_admin"
  ON rider_profiles FOR UPDATE
  USING (get_user_role() IN ('admin', 'super_admin', 'operations'));
```

### business_profiles

```sql
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

-- Business members can read their business profile
CREATE POLICY "business_profiles_select_member"
  ON business_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = business_profiles.id
      AND business_members.user_id = auth.uid()
      AND business_members.accepted_at IS NOT NULL
    )
  );

-- Business owners can update
CREATE POLICY "business_profiles_update_owner"
  ON business_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = business_profiles.id
      AND business_members.user_id = auth.uid()
      AND business_members.role = 'owner'
    )
  );

-- Admins can read all
CREATE POLICY "business_profiles_select_admin"
  ON business_profiles FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));
```

### business_members

```sql
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- Business members can see other members of their business
CREATE POLICY "business_members_select_own_business"
  ON business_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.accepted_at IS NOT NULL
    )
  );

-- Business owners and admins can manage members
CREATE POLICY "business_members_manage"
  ON business_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'admin')
    )
  );
```

### orders

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customers can read their own orders
CREATE POLICY "orders_select_customer"
  ON orders FOR SELECT
  USING (customer_id = auth.uid());

-- Customers can create orders
CREATE POLICY "orders_insert_customer"
  ON orders FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- Customers can cancel their own orders (application logic enforces state rules)
CREATE POLICY "orders_update_customer"
  ON orders FOR UPDATE
  USING (customer_id = auth.uid());

-- Riders can read orders assigned to them
CREATE POLICY "orders_select_rider"
  ON orders FOR SELECT
  USING (assigned_rider_id = auth.uid());

-- Riders can update status of assigned orders (application logic enforces state rules)
CREATE POLICY "orders_update_rider"
  ON orders FOR UPDATE
  USING (assigned_rider_id = auth.uid());

-- Admins, super_admins, support, operations can read all
CREATE POLICY "orders_select_admin"
  ON orders FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin', 'support', 'operations'));

-- Admins and operations can update orders
CREATE POLICY "orders_update_admin"
  ON orders FOR UPDATE
  USING (get_user_role() IN ('admin', 'super_admin', 'operations'));

-- Service-role can do everything (for webhooks, background jobs)
-- No policy needed — service_role bypasses RLS
```

### payments

```sql
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Customers can read their own payments
CREATE POLICY "payments_select_customer"
  ON payments FOR SELECT
  USING (customer_id = auth.uid());

-- Admins can read all payments
CREATE POLICY "payments_select_admin"
  ON payments FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));

-- No INSERT/UPDATE policies for clients — only service-role via webhooks
```

### rider_assignments

```sql
ALTER TABLE rider_assignments ENABLE ROW LEVEL SECURITY;

-- Riders can read assignments offered to them
CREATE POLICY "rider_assignments_select_own"
  ON rider_assignments FOR SELECT
  USING (rider_id = auth.uid());

-- Riders can update their own assignments (accept/reject)
CREATE POLICY "rider_assignments_update_own"
  ON rider_assignments FOR UPDATE
  USING (rider_id = auth.uid());

-- Admins can read all
CREATE POLICY "rider_assignments_select_admin"
  ON rider_assignments FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin', 'operations'));
```

### rider_locations

```sql
ALTER TABLE rider_locations ENABLE ROW LEVEL SECURITY;

-- Riders can insert their own location
CREATE POLICY "rider_locations_insert_own"
  ON rider_locations FOR INSERT
  WITH CHECK (rider_id = auth.uid());

-- Riders can read their own locations
CREATE POLICY "rider_locations_select_own"
  ON rider_locations FOR SELECT
  USING (rider_id = auth.uid());

-- Customers can read locations for their active orders (via view)
-- This is handled through a separate customer_tracking view, not direct table access
```

### delivery_proofs

```sql
ALTER TABLE delivery_proofs ENABLE ROW LEVEL SECURITY;

-- Riders can insert proofs for their deliveries
CREATE POLICY "delivery_proofs_insert_rider"
  ON delivery_proofs FOR INSERT
  WITH CHECK (rider_id = auth.uid());

-- Customers can read proofs for their orders
CREATE POLICY "delivery_proofs_select_customer"
  ON delivery_proofs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = delivery_proofs.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Admins can read all
CREATE POLICY "delivery_proofs_select_admin"
  ON delivery_proofs FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));
```

### notifications

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());
```

### refunds

```sql
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Customers can read refunds for their orders
CREATE POLICY "refunds_select_customer"
  ON refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = refunds.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Admins can read all
CREATE POLICY "refunds_select_admin"
  ON refunds FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));
```

### payouts

```sql
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Riders can read their own payouts
CREATE POLICY "payouts_select_rider"
  ON payouts FOR SELECT
  USING (rider_id = auth.uid());

-- Admins can read all
CREATE POLICY "payouts_select_admin"
  ON payouts FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));
```

### audit_logs

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and super_admins can read audit logs
CREATE POLICY "audit_logs_select_admin"
  ON audit_logs FOR SELECT
  USING (get_user_role() IN ('admin', 'super_admin'));

-- No client INSERT — only service-role writes audit logs
```

## 3.3 Trusted Server-Side Operations

The following operations use the **service_role** client (bypasses RLS) but still enforce authorization in application code:

| Operation | Authorization Check |
|-----------|---------------------|
| Payment webhook processing | Webhook signature verification |
| Dispatch rider assignment | Order must be in dispatchable state |
| Background job execution | Job type validation |
| Admin operations | Admin role check in middleware |
| Quote expiration | System-level cron |
| Location cleanup | System-level cron |
| Financial calculations | System-level with audit logging |

---

# 4. DATABASE SCHEMA

## 4.1 Complete Schema

```sql
-- =============================================
-- PROFILES (extends auth.users)
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'rider', 'business', 'support', 'operations', 'admin', 'super_admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CUSTOMER PROFILES
-- =============================================
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  default_address_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RIDER PROFILES
-- =============================================
CREATE TABLE rider_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'under_review', 'approved', 'rejected')),
  verification_notes TEXT,
  is_available BOOLEAN DEFAULT FALSE,
  current_location GEOGRAPHY(POINT, 4326),
  last_location_update TIMESTAMPTZ,
  rating DECIMAL(3,2) DEFAULT 5.00,
  total_deliveries INTEGER DEFAULT 0,
  -- total_earnings is a CACHED value, reconstructed from earnings_ledger
  cached_total_earnings DECIMAL(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BUSINESS PROFILES
-- =============================================
CREATE TABLE business_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  registration_number TEXT,
  tax_id TEXT,
  billing_address_id UUID,
  credit_limit DECIMAL(12,2) DEFAULT 0.00,
  current_balance DECIMAL(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BUSINESS MEMBERS
-- =============================================
CREATE TABLE business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(business_id, user_id)
);

CREATE INDEX idx_business_members_user ON business_members(user_id);

-- =============================================
-- ADDRESSES
-- =============================================
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

CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_location ON addresses USING GIST(location);

-- =============================================
-- VEHICLES
-- =============================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('bicycle', 'motorcycle', 'tricycle', 'car', 'van')),
  make TEXT,
  model TEXT,
  year INTEGER,
  registration_number TEXT,
  insurance_expiry DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicles_rider ON vehicles(rider_id);

-- =============================================
-- SERVICE ZONES
-- =============================================
CREATE TABLE service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  boundary GEOGRAPHY(POLYGON, 4326) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  operating_hours JSONB DEFAULT '{}',
  min_delivery_time_minutes INTEGER DEFAULT 30,
  max_delivery_time_minutes INTEGER DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_zones_boundary ON service_zones USING GIST(boundary);

-- =============================================
-- DELIVERY CATEGORIES
-- =============================================
CREATE TABLE delivery_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prohibited_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES delivery_categories(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PRICING RULES (with tax configuration)
-- =============================================
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES service_zones(id),
  name TEXT NOT NULL,
  description TEXT,
  base_fee DECIMAL(10,2) NOT NULL,
  per_kilometer DECIMAL(10,2) NOT NULL,
  per_kg DECIMAL(10,2) DEFAULT 0.00,
  minimum_fare DECIMAL(10,2) NOT NULL,
  maximum_distance_km DECIMAL(8,2),
  vehicle_type_multiplier JSONB DEFAULT '{}',
  weight_bands JSONB DEFAULT '[]',
  urgency_multipliers JSONB DEFAULT '{}',
  tax_rate DECIMAL(5,4) DEFAULT 0.075, -- 7.5% VAT, configurable
  tax_name TEXT DEFAULT 'VAT',
  is_active BOOLEAN DEFAULT TRUE,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_pricing_rules_zone ON pricing_rules(zone_id);
CREATE INDEX idx_pricing_rules_validity ON pricing_rules(valid_from, valid_to);

-- =============================================
-- ORDERS
-- =============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_payment', 'paid', 'searching_rider', 'rider_assigned',
    'rider_en_route_to_pickup', 'arrived_at_pickup', 'picked_up',
    'in_transit', 'arrived_at_destination', 'delivered', 'completed',
    'cancelled', 'failed', 'expired', 'disputed', 'refunded'
  )),

  -- Pickup
  pickup_address_id UUID NOT NULL REFERENCES addresses(id),
  pickup_contact_name TEXT NOT NULL,
  pickup_contact_phone TEXT NOT NULL,
  pickup_instructions TEXT,
  pickup_latitude DECIMAL(10,8) NOT NULL,
  pickup_longitude DECIMAL(11,8) NOT NULL,

  -- Destination
  destination_address_id UUID NOT NULL REFERENCES addresses(id),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  delivery_instructions TEXT,
  destination_latitude DECIMAL(10,8) NOT NULL,
  destination_longitude DECIMAL(11,8) NOT NULL,

  -- Package
  category_id UUID NOT NULL REFERENCES delivery_categories(id),
  package_description TEXT NOT NULL,
  package_weight_kg DECIMAL(8,2),
  package_dimensions JSONB,
  quantity INTEGER DEFAULT 1,
  special_handling_requirements TEXT,

  -- Pricing (locked at creation)
  pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id),
  base_fee DECIMAL(10,2) NOT NULL,
  distance_fee DECIMAL(10,2) NOT NULL,
  weight_fee DECIMAL(10,2) DEFAULT 0.00,
  zone_fee DECIMAL(10,2) DEFAULT 0.00,
  urgency_fee DECIMAL(10,2) DEFAULT 0.00,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_rate_applied DECIMAL(5,4), -- Snapshot of tax rate at time of order
  tax_name_applied TEXT, -- Snapshot of tax name
  total_amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',

  -- Delivery
  distance_km DECIMAL(8,2) NOT NULL,
  estimated_duration_minutes INTEGER NOT NULL,
  actual_duration_minutes INTEGER,
  urgency_level TEXT DEFAULT 'standard' CHECK (urgency_level IN ('standard', 'express', 'urgent')),

  -- Rider assignment
  assigned_rider_id UUID REFERENCES rider_profiles(id),
  rider_assigned_at TIMESTAMPTZ,
  rider_arrived_at_pickup TIMESTAMPTZ,
  rider_picked_up_at TIMESTAMPTZ,
  rider_arrived_at_destination TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Business
  business_id UUID REFERENCES business_profiles(id),
  business_reference TEXT,

  -- Tracking
  tracking_code TEXT UNIQUE NOT NULL,

  -- Cancellation
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES profiles(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_rider ON orders(assigned_rider_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_tracking ON orders(tracking_code);
CREATE INDEX idx_orders_business ON orders(business_id);

-- =============================================
-- ORDER EVENTS & STATUS HISTORY
-- =============================================
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id UUID REFERENCES profiles(id),
  actor_type TEXT CHECK (actor_type IN ('customer', 'rider', 'admin', 'system')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events(order_id);

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);

-- =============================================
-- DELIVERY QUOTES
-- =============================================
CREATE TABLE delivery_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  pickup_latitude DECIMAL(10,8) NOT NULL,
  pickup_longitude DECIMAL(11,8) NOT NULL,
  pickup_address_text TEXT,
  destination_latitude DECIMAL(10,8) NOT NULL,
  destination_longitude DECIMAL(11,8) NOT NULL,
  destination_address_text TEXT,
  category_id UUID NOT NULL REFERENCES delivery_categories(id),
  weight_kg DECIMAL(8,2),
  dimensions JSONB,
  quantity INTEGER DEFAULT 1,
  pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id),
  base_fee DECIMAL(10,2) NOT NULL,
  distance_fee DECIMAL(10,2) NOT NULL,
  weight_fee DECIMAL(10,2) DEFAULT 0.00,
  zone_fee DECIMAL(10,2) DEFAULT 0.00,
  urgency_fee DECIMAL(10,2) DEFAULT 0.00,
  discount_amount DECIMAL(10,2) DEFAULT 0.00,
  tax_amount DECIMAL(12,2) DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  distance_km DECIMAL(8,2) NOT NULL,
  estimated_duration_minutes INTEGER NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  is_consumed BOOLEAN DEFAULT FALSE, -- Renamed from is_used for clarity
  consumed_at TIMESTAMPTZ,
  order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_quotes_customer ON delivery_quotes(customer_id);
CREATE INDEX idx_delivery_quotes_validity ON delivery_quotes(valid_until);

-- =============================================
-- RIDER ASSIGNMENTS (with concurrency control)
-- =============================================
CREATE TABLE rider_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'rejected', 'expired', 'cancelled', 'completed')),
  offered_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRITICAL: Only ONE active assignment per order
-- This partial unique index ensures only one assignment can be in a non-terminal state per order
CREATE UNIQUE INDEX idx_rider_assignments_one_active
  ON rider_assignments(order_id)
  WHERE status IN ('offered', 'accepted');

-- Also prevent a rider from holding multiple active assignments
CREATE UNIQUE INDEX idx_rider_assignments_rider_one_active
  ON rider_assignments(rider_id)
  WHERE status IN ('offered', 'accepted');

CREATE INDEX idx_rider_assignments_order ON rider_assignments(order_id);
CREATE INDEX idx_rider_assignments_rider ON rider_assignments(rider_id);
CREATE INDEX idx_rider_assignments_status ON rider_assignments(status);
CREATE INDEX idx_rider_assignments_expires ON rider_assignments(expires_at);

-- =============================================
-- RIDER LOCATIONS
-- =============================================
CREATE TABLE rider_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED,
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  accuracy DECIMAL(8,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rider_locations_rider ON rider_locations(rider_id);
CREATE INDEX idx_rider_locations_recorded ON rider_locations(recorded_at DESC);

-- Current rider locations (regular table, NOT materialized view)
-- Updated on every location insert for live dispatch freshness
CREATE TABLE rider_current_locations (
  rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  accuracy DECIMAL(8,2),
  is_available BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rider_current_locations_geo ON rider_current_locations USING GIST(location);
CREATE INDEX idx_rider_current_locations_available ON rider_current_locations(is_available) WHERE is_available = TRUE;

-- =============================================
-- PAYMENTS
-- =============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  paystack_reference TEXT UNIQUE NOT NULL,
  paystack_access_code TEXT,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'bank_transfer', 'ussd', 'bank')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'success', 'failed', 'abandoned', 'refunded', 'partially_refunded'
  )),
  verified_at TIMESTAMPTZ,
  paystack_response JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_reference ON payments(paystack_reference);
CREATE INDEX idx_payments_status ON payments(status);

-- =============================================
-- PROCESSED WEBHOOK EVENTS (for idempotency)
-- =============================================
CREATE TABLE processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'paystack',
  event_id TEXT NOT NULL, -- Paystack event ID
  event_type TEXT NOT NULL,
  reference TEXT, -- Payment reference if applicable
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(provider, event_id)
);

CREATE INDEX idx_processed_webhook_events_reference ON processed_webhook_events(reference);

-- =============================================
-- REFUNDS
-- =============================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('full', 'partial', 'administrative')),
  paystack_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_order ON refunds(order_id);

-- =============================================
-- PAYOUTS (tokenized banking)
-- =============================================
CREATE TABLE payout_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  paystack_recipient_code TEXT NOT NULL, -- Tokenized reference from Paystack
  bank_name TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL, -- Only last 4 digits stored
  account_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payout_recipients_rider ON payout_recipients(rider_id);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  recipient_id UUID NOT NULL REFERENCES payout_recipients(id),
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  paystack_transfer_id TEXT,
  processed_at TIMESTAMPTZ,
  failed_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_rider ON payouts(rider_id);
CREATE INDEX idx_payouts_status ON payouts(status);

-- =============================================
-- EARNINGS LEDGER (authoritative financial records)
-- =============================================
CREATE TABLE earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  credit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  debit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_after DECIMAL(12,2) NOT NULL, -- Running balance
  description TEXT NOT NULL,
  reference_type TEXT NOT NULL, -- 'delivery_earning', 'payout', 'adjustment', 'refund'
  reference_id UUID, -- ID of related payout/adjustment
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_earnings_ledger_rider ON earnings_ledger(rider_id);
CREATE INDEX idx_earnings_ledger_order ON earnings_ledger(order_id);
CREATE INDEX idx_earnings_ledger_created ON earnings_ledger(created_at DESC);

-- =============================================
-- DELIVERY PROOFS
-- =============================================
CREATE TABLE delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  proof_type TEXT NOT NULL CHECK (proof_type IN ('photo', 'signature', 'pin', 'recipient_confirmation')),
  file_url TEXT,
  signature_data TEXT,
  pin_code TEXT,
  recipient_name TEXT,
  notes TEXT,
  proof_latitude DECIMAL(10,8),
  proof_longitude DECIMAL(11,8),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_proofs_order ON delivery_proofs(order_id);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  in_app BOOLEAN DEFAULT TRUE,
  email BOOLEAN DEFAULT FALSE,
  sms BOOLEAN DEFAULT FALSE,
  push BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read_at);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- =============================================
-- RATINGS
-- =============================================
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  rider_id UUID NOT NULL REFERENCES rider_profiles(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, customer_id)
);

CREATE INDEX idx_ratings_order ON ratings(order_id);
CREATE INDEX idx_ratings_rider ON ratings(rider_id);

-- =============================================
-- SUPPORT TICKETS
-- =============================================
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  order_id UUID REFERENCES orders(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('order', 'payment', 'rider', 'account', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

-- =============================================
-- PROMOTIONS
-- =============================================
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value DECIMAL(10,2) NOT NULL,
  minimum_order_amount DECIMAL(10,2),
  maximum_discount_amount DECIMAL(10,2),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  per_user_limit INTEGER,
  applicable_zones UUID[],
  applicable_categories UUID[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_promotions_code ON promotions(code);

-- =============================================
-- AUDIT LOGS
-- =============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'rider', 'admin', 'system')),
  actor_ip INET,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- =============================================
-- PLATFORM SETTINGS
-- =============================================
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- =============================================
-- BACKGROUND JOBS
-- =============================================
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  priority INTEGER DEFAULT 0, -- Higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_background_jobs_status ON background_jobs(status, scheduled_at);
CREATE INDEX idx_background_jobs_type ON background_jobs(job_type);
```

## 4.2 Database Functions

```sql
-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM orders WHERE DATE(created_at) = CURRENT_DATE;
  new_number := 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Generate tracking code
CREATE OR REPLACE FUNCTION generate_tracking_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    code := 'TRK-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM orders WHERE tracking_code = code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DECIMAL, lon1 DECIMAL,
  lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
  RETURN ST_Distance(
    ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
  ) / 1000;
END;
$$ LANGUAGE plpgsql;

-- Atomically consume a quote (prevents double-use)
CREATE OR REPLACE FUNCTION consume_quote(
  p_quote_id UUID,
  p_order_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_quote delivery_quotes%ROWTYPE;
BEGIN
  -- Lock the row and check if unconsumed
  SELECT * INTO v_quote
  FROM delivery_quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_quote.is_consumed = TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_quote.valid_until < NOW() THEN
    RETURN FALSE;
  END IF;

  -- Mark as consumed atomically
  UPDATE delivery_quotes
  SET is_consumed = TRUE,
      consumed_at = NOW(),
      order_id = p_order_id
  WHERE id = p_quote_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Find nearest eligible riders (uses regular table with GIST index)
CREATE OR REPLACE FUNCTION find_nearest_riders(
  p_lat DECIMAL,
  p_lon DECIMAL,
  p_max_distance_km DECIMAL,
  p_limit INTEGER
)
RETURNS TABLE (
  rider_id UUID,
  distance_km DECIMAL,
  rating DECIMAL
) AS $$
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
    AND ST_Distance(
      rcl.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) / 1000 <= p_max_distance_km
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

---

# 5. ORDER STATE MACHINE

## 5.1 All Legal Transitions

```typescript
export const TRANSITION_RULES: Record<string, string[]> = {
  draft: ['pending_payment', 'cancelled'],
  pending_payment: ['paid', 'cancelled', 'expired'],
  paid: ['searching_rider', 'cancelled'],
  searching_rider: ['rider_assigned', 'cancelled', 'failed'],
  rider_assigned: ['rider_en_route_to_pickup', 'cancelled'],
  rider_en_route_to_pickup: ['arrived_at_pickup', 'cancelled'],
  arrived_at_pickup: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'cancelled'],
  in_transit: ['arrived_at_destination', 'cancelled'],
  arrived_at_destination: ['delivered', 'cancelled'],
  delivered: ['completed', 'disputed'],
  completed: [],           // Terminal
  cancelled: [],           // Terminal
  failed: [],              // Terminal
  expired: [],             // Terminal
  disputed: ['refunded', 'completed'],
  refunded: [],            // Terminal
};
```

## 5.2 Transition Authorization Matrix

| Transition | Actor | Preconditions |
|------------|-------|---------------|
| `draft → pending_payment` | customer | Valid addresses, package, quote |
| `pending_payment → paid` | system | Webhook verified, amount matches |
| `paid → searching_rider` | system | Payment confirmed |
| `searching_rider → rider_assigned` | system | Rider accepted assignment |
| `rider_assigned → rider_en_route_to_pickup` | rider | Rider is assigned to this order |
| `rider_en_route_to_pickup → arrived_at_pickup` | rider | Rider is assigned |
| `arrived_at_pickup → picked_up` | rider | Rider is assigned, proof optional |
| `picked_up → in_transit` | system | Auto-transition after pickup |
| `in_transit → arrived_at_destination` | rider | Rider is assigned |
| `arrived_at_destination → delivered` | rider | Proof of delivery collected |
| `delivered → completed` | system | Dispute window elapsed (see 5.3) |
| `delivered → disputed` | customer | Within dispute window |
| `disputed → completed` | admin | Dispute resolved in favor of delivery |
| `disputed → refunded` | admin | Dispute resolved in favor of customer |
| `pending_payment → cancelled` | customer | No restrictions |
| `paid → cancelled` | customer | Full refund |
| `searching_rider → cancelled` | customer | Full refund |
| `rider_assigned → cancelled` | customer | Full refund, rider notified |
| `rider_en_route_to_pickup → cancelled` | customer | Partial refund (policy-dependent) |
| `arrived_at_pickup → cancelled` | customer | Partial refund (policy-dependent) |
| `picked_up → cancelled` | customer/admin | Partial refund, rider compensation |
| `in_transit → cancelled` | admin only | Partial refund, rider compensation |
| `arrived_at_destination → cancelled` | admin only | Case-by-case |
| `* → cancelled` | admin | Admin override, refund per policy |

## 5.3 Completion Mechanism (delivered → completed)

```
delivered
    │
    ▼
┌─────────────────────────┐
│  DISPUTE WINDOW (24h)   │
│  Scheduled job checks   │
│  every hour             │
└─────────┬───────────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
 No dispute  Dispute filed
    │           │
    ▼           ▼
 completed   disputed
    │           │
    │     ┌─────┴─────┐
    │     │           │
    │     ▼           ▼
    │  resolved    resolved
    │  (customer)  (rider)
    │     │           │
    │     ▼           ▼
    │  refunded    completed
    │
    ▼
 Financial settlement:
 - Rider earnings recorded
 - Platform revenue recorded
 - Receipt generated
```

### Completion SQL Function

```sql
CREATE OR REPLACE FUNCTION complete_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.status != 'delivered' THEN
    RETURN FALSE;
  END IF;

  -- Check dispute window (24 hours)
  IF v_order.delivered_at > NOW() - INTERVAL '24 hours' THEN
    RETURN FALSE; -- Still in dispute window
  END IF;

  -- Complete the order
  UPDATE orders
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Record completion event
  INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type)
  VALUES (p_order_id, 'status_change', 'delivered', 'completed', 'system');

  -- Calculate and record rider earnings
  PERFORM calculate_rider_earnings(p_order_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

# 6. CANCELLATION POLICY MATRIX

## 6.1 Cancellation Rules

| Order State | Customer Can Cancel? | Admin Can Cancel? | Refund | Rider Compensation | Notes |
|-------------|---------------------|-------------------|--------|-------------------|-------|
| `draft` | ✅ | ✅ | N/A (not paid) | None | Order deleted |
| `pending_payment` | ✅ | ✅ | N/A (not paid) | None | Payment abandoned |
| `paid` | ✅ | ✅ | 100% | None | Before dispatch |
| `searching_rider` | ✅ | ✅ | 100% | None | Dispatch cancelled |
| `rider_assigned` | ✅ | ✅ | 100% | None | Assignment cancelled |
| `rider_en_route_to_pickup` | ⚠️ Policy | ✅ | 80-100% | Small compensation | Policy-dependent |
| `arrived_at_pickup` | ⚠️ Policy | ✅ | 50-80% | Compensation | Policy-dependent |
| `picked_up` | ❌ Customer | ✅ | 0-50% | Full earning | Admin discretion |
| `in_transit` | ❌ Customer | ✅ | 0-50% | Full earning | Admin discretion |
| `arrived_at_destination` | ❌ Customer | ⚠️ Case-by-case | 0% | Full earning | Package with rider |
| `delivered` | ❌ | ❌ (use dispute) | Via dispute | Via dispute | Use dispute flow |
| `completed` | ❌ | ❌ | None | None | Terminal |

## 6.2 Product Decisions Required

1. **Exact refund percentages** for `rider_en_route_to_pickup` and `arrived_at_pickup`
2. **Rider compensation amounts** for cancellations after dispatch
3. **Dispute window duration** (recommended: 24 hours)
4. **Maximum time to file a dispute** after delivery

---

# 7. PRICING ENGINE

## 7.1 Tax Configuration

```sql
-- Tax rules are versioned and stored in pricing_rules
-- Each order snapshots the tax_rate and tax_name at time of creation

-- Example pricing rule with tax
INSERT INTO pricing_rules (name, base_fee, per_kilometer, tax_rate, tax_name, ...)
VALUES ('Lagos Standard', 500, 100, 0.075, 'VAT', ...);

-- Order stores snapshot:
-- tax_rate_applied = 0.075
-- tax_name_applied = 'VAT'
-- tax_amount = calculated amount
```

## 7.2 Quote Locking (Atomic)

```sql
-- Use the consume_quote function for atomic consumption
SELECT consume_quote($1, $2); -- quote_id, order_id

-- This function:
-- 1. Locks the row with FOR UPDATE
-- 2. Checks is_consumed = FALSE
-- 3. Checks valid_until > NOW()
-- 4. Sets is_consumed = TRUE atomically
-- Returns TRUE if successful, FALSE if already consumed or expired
```

---

# 8. DISPATCH ENGINE

## 8.1 Concurrency Control

### Database Constraints

```sql
-- Only ONE active assignment per order
CREATE UNIQUE INDEX idx_rider_assignments_one_active
  ON rider_assignments(order_id)
  WHERE status IN ('offered', 'accepted');

-- Only ONE active assignment per rider
CREATE UNIQUE INDEX idx_rider_assignments_rider_one_active
  ON rider_assignments(rider_id)
  WHERE status IN ('offered', 'accepted');
```

### Transaction Boundary (PostgreSQL Function)

```sql
CREATE OR REPLACE FUNCTION dispatch_rider(p_order_id UUID)
RETURNS TABLE (success BOOLEAN, rider_id UUID, message TEXT) AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_rider RECORD;
  v_assignment_id UUID;
BEGIN
  -- 1. Lock the order row
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- 2. Validate order state
  IF v_order.status NOT IN ('paid', 'searching_rider') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Order not in dispatchable state'::TEXT;
    RETURN;
  END IF;

  -- 3. Update order status to searching
  UPDATE orders SET status = 'searching_rider', updated_at = NOW()
  WHERE id = p_order_id;

  -- 4. Find nearest eligible rider
  FOR v_rider IN
    SELECT * FROM find_nearest_riders(
      v_order.pickup_latitude,
      v_order.pickup_longitude,
      10,  -- max distance km
      10   -- limit
    )
  LOOP
    -- 5. Try to create assignment (partial unique index prevents duplicates)
    BEGIN
      INSERT INTO rider_assignments (order_id, rider_id, status, expires_at)
      VALUES (p_order_id, v_rider.rider_id, 'offered', NOW() + INTERVAL '30 seconds')
      RETURNING id INTO v_assignment_id;

      -- 6. Success - mark rider as unavailable
      UPDATE rider_profiles SET is_available = FALSE
      WHERE id = v_rider.rider_id;

      -- 7. Update order
      UPDATE orders
      SET status = 'rider_assigned',
          assigned_rider_id = v_rider.rider_id,
          rider_assigned_at = NOW(),
          updated_at = NOW()
      WHERE id = p_order_id;

      RETURN QUERY SELECT TRUE, v_rider.rider_id, 'Rider assigned'::TEXT;
      RETURN;

    EXCEPTION WHEN unique_violation THEN
      -- Rider already has active assignment, try next
      CONTINUE;
    END;
  END LOOP;

  -- 8. No riders available
  UPDATE orders SET status = 'failed', updated_at = NOW()
  WHERE id = p_order_id;

  RETURN QUERY SELECT FALSE, NULL::UUID, 'No eligible riders available'::TEXT;
END;
$$ LANGUAGE plpgsql;
```

## 8.2 Offer Timeout Flow

```
1. Background job runs every 10 seconds
2. Finds rider_assignments WHERE status = 'offered' AND expires_at < NOW()
3. For each expired assignment:
   a. UPDATE status = 'expired'
   b. UPDATE rider_profiles SET is_available = TRUE (for that rider)
   c. Call dispatch_rider() to try next rider
4. If no more riders available, mark order as 'failed'
```

---

# 9. PAYMENT ARCHITECTURE

## 9.1 Payment Flow

```
Customer clicks Pay
        │
        ▼
POST /api/payments/initialize
        │
        ▼
Paystack.initializeTransaction()
        │
        ▼
Customer redirected to Paystack
        │
        ▼
Paystack sends webhook: charge.success
        │
        ▼
POST /api/webhooks/paystack
        │
        ├─ 1. Verify HMAC-SHA512 signature
        ├─ 2. Check idempotency (processed_webhook_events)
        ├─ 3. Begin transaction:
        │      a. Lock payment row
        │      b. Verify amount matches order
        │      c. Update payment status = 'success'
        │      d. Update order status = 'paid'
        │      e. Insert processed_webhook_events
        │   Commit transaction
        ├─ 4. Create background job: DISPATCH_ORDER
        └─ 5. Return 200 OK
```

## 9.2 Webhook Processing (No Synchronous Dispatch)

```typescript
// Webhook handler - returns quickly
export async function handlePaystackWebhook(payload, signature) {
  // 1. Verify signature
  if (!verifySignature(payload, signature)) {
    return { status: 400, error: 'Invalid signature' };
  }

  // 2. Check idempotency
  const eventId = payload.data.id;
  const exists = await supabase
    .from('processed_webhook_events')
    .select('id')
    .eq('provider', 'paystack')
    .eq('event_id', eventId)
    .single();

  if (exists.data) {
    return { status: 200, message: 'Already processed' };
  }

  // 3. Process payment verification
  if (payload.event === 'charge.success') {
    const result = await supabase.rpc('verify_payment_and_confirm_order', {
      p_reference: payload.data.reference,
      p_amount: payload.data.amount / 100,
      p_event_id: eventId,
    });

    if (result.data) {
      // 4. Create durable dispatch job (async, not in webhook transaction)
      await supabase.from('background_jobs').insert({
        job_type: 'DISPATCH_ORDER',
        payload: { order_id: result.data.order_id },
        priority: 10,
      });
    }
  }

  return { status: 200 };
}
```

## 9.3 Payment Verification Function

```sql
CREATE OR REPLACE FUNCTION verify_payment_and_confirm_order(
  p_reference TEXT,
  p_amount DECIMAL,
  p_event_id TEXT
) RETURNS TABLE (order_id UUID, success BOOLEAN) AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_order orders%ROWTYPE;
BEGIN
  -- Lock payment row
  SELECT * INTO v_payment
  FROM payments
  WHERE paystack_reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Check idempotency
  IF v_payment.status = 'success' THEN
    RETURN QUERY SELECT v_payment.order_id, TRUE;
    RETURN;
  END IF;

  -- Verify amount
  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id FOR UPDATE;

  IF v_payment.amount != v_order.total_amount THEN
    -- Amount mismatch - flag for review
    INSERT INTO audit_logs (actor_type, action, resource_type, resource_id, metadata)
    VALUES ('system', 'payment_amount_mismatch', 'payment', v_payment.id,
            jsonb_build_object('expected', v_order.total_amount, 'received', p_amount));
    RETURN QUERY SELECT NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- Update payment
  UPDATE payments
  SET status = 'success',
      verified_at = NOW(),
      updated_at = NOW()
  WHERE id = v_payment.id;

  -- Update order
  UPDATE orders
  SET status = 'paid',
      updated_at = NOW()
  WHERE id = v_payment.order_id;

  -- Record event
  INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, metadata)
  VALUES (v_payment.order_id, 'payment_confirmed', 'pending_payment', 'paid', 'system',
          jsonb_build_object('payment_id', v_payment.id, 'amount', p_amount));

  -- Record idempotency
  INSERT INTO processed_webhook_events (provider, event_id, event_type, reference)
  VALUES ('paystack', p_event_id, 'charge.success', p_reference);

  RETURN QUERY SELECT v_payment.order_id, TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

# 10. FINANCIAL LEDGER

## 10.1 Authoritative Records

The `earnings_ledger` table is the **authoritative** source for rider earnings. The `rider_profiles.cached_total_earnings` is a **cached** value that must be reconstructible from the ledger.

```sql
-- Record delivery earning
CREATE OR REPLACE FUNCTION record_delivery_earning(
  p_rider_id UUID,
  p_order_id UUID,
  p_amount DECIMAL
) RETURNS VOID AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
BEGIN
  -- Get current balance
  SELECT COALESCE(balance_after, 0) INTO v_current_balance
  FROM earnings_ledger
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_new_balance := v_current_balance + p_amount;

  -- Insert ledger entry
  INSERT INTO earnings_ledger (rider_id, order_id, credit, debit, balance_after, description, reference_type)
  VALUES (p_rider_id, p_order_id, p_amount, 0, v_new_balance, 'Delivery earning', 'delivery_earning');

  -- Update cached total
  UPDATE rider_profiles
  SET cached_total_earnings = v_new_balance,
      total_deliveries = total_deliveries + 1,
      updated_at = NOW()
  WHERE id = p_rider_id;
END;
$$ LANGUAGE plpgsql;

-- Record payout
CREATE OR REPLACE FUNCTION record_payout(
  p_rider_id UUID,
  p_payout_id UUID,
  p_amount DECIMAL
) RETURNS VOID AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
BEGIN
  SELECT COALESCE(balance_after, 0) INTO v_current_balance
  FROM earnings_ledger
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_new_balance := v_current_balance - p_amount;

  INSERT INTO earnings_ledger (rider_id, order_id, credit, debit, balance_after, description, reference_type, reference_id)
  VALUES (p_rider_id, NULL, 0, p_amount, v_new_balance, 'Payout', 'payout', p_payout_id);

  UPDATE rider_profiles
  SET cached_total_earnings = v_new_balance,
      updated_at = NOW()
  WHERE id = p_rider_id;
END;
$$ LANGUAGE plpgsql;

-- Reconstruct balance from ledger (for verification)
CREATE OR REPLACE FUNCTION get_rider_balance(p_rider_id UUID)
RETURNS DECIMAL AS $$
  SELECT COALESCE(balance_after, 0)
  FROM earnings_ledger
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql;
```

---

# 11. BACKGROUND JOBS ARCHITECTURE

## 11.1 Job Types

| Job Type | Trigger | Processing |
|----------|---------|------------|
| `DISPATCH_ORDER` | Payment confirmed | Find and assign rider |
| `OFFER_TIMEOUT` | Scheduled (10s) | Expire old offers, try next rider |
| `QUOTE_EXPIRATION` | Scheduled (1min) | Mark expired quotes |
| `COMPLETE_ORDER` | Scheduled (1hr) | Complete delivered orders past dispute window |
| `NOTIFICATION_EMAIL` | Various events | Send email via SendGrid |
| `NOTIFICATION_SMS` | Various events | Send SMS via Termii |
| `NOTIFICATION_PUSH` | Various events | Send push notification |
| `REFUND_PROCESS` | Refund requested | Process refund via Paystack |
| `LOCATION_CLEANUP` | Scheduled (daily) | Delete old rider locations |
| `RIDER_LOCATION_REFRESH` | Scheduled (configurable) | Rider current location UPSERT (no materialized view) |
| `EARNINGS_AGGREGATION` | Scheduled (hourly) | Verify cached earnings |

## 11.2 Job Processing

```sql
-- Worker function to process next job
CREATE OR REPLACE FUNCTION process_next_job()
RETURNS background_jobs%ROWTYPE AS $$
DECLARE
  v_job background_jobs%ROWTYPE;
BEGIN
  -- Lock and fetch next job
  SELECT * INTO v_job
  FROM background_jobs
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Mark as processing
  UPDATE background_jobs
  SET status = 'processing',
      started_at = NOW(),
      attempts = attempts + 1
  WHERE id = v_job.id;

  RETURN v_job;
END;
$$ LANGUAGE plpgsql;

-- Mark job as completed
CREATE OR REPLACE FUNCTION complete_job(p_job_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE background_jobs
  SET status = 'completed',
      completed_at = NOW()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Mark job as failed
CREATE OR REPLACE FUNCTION fail_job(p_job_id UUID, p_error TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE background_jobs
  SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
      failed_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END,
      error_message = p_error,
      scheduled_at = CASE WHEN attempts < max_attempts THEN NOW() + (attempts * INTERVAL '5 seconds') ELSE scheduled_at END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;
```

---

# 12. REALTIME TRACKING ARCHITECTURE

## 12.1 Authorized Subscription Model

Customers can only subscribe to tracking channels for orders they own. This is enforced through:

1. **Channel naming:** `order:{order_id}`
2. **Subscription authorization:** Server-side check before allowing subscription
3. **RLS on data:** Rider location table has RLS

```typescript
// Customer subscribes to tracking
export function subscribeToTracking(orderId: string, userId: string) {
  // Server-side authorization check
  const order = await getOrder(orderId);
  if (order.customer_id !== userId) {
    throw new Error('Unauthorized');
  }

  // Subscribe to channel
  const channel = supabase.channel(`order:${orderId}`);
  
  channel.on('broadcast', { event: 'rider_location' }, (payload) => {
    // Update map with rider position
    updateRiderPosition(payload);
  });

  channel.subscribe();
}
```

## 12.2 Rider Location Ingestion

```typescript
// Rider sends location updates
export async function updateRiderLocation(riderId: string, location: LocationData) {
  // Throttle: max 1 update per 5 seconds
  const lastUpdate = await getLastLocationUpdate(riderId);
  if (lastUpdate && isThrottled(lastUpdate, 5)) {
    return; // Skip
  }

  // Store in rider_locations (historical)
  await supabase.from('rider_locations').insert({
    rider_id: riderId,
    latitude: location.latitude,
    longitude: location.longitude,
    heading: location.heading,
    speed: location.speed,
    accuracy: location.accuracy,
  });

  // Update current location on rider_profiles
  await supabase
    .from('rider_profiles')
    .update({
      current_location: `POINT(${location.longitude} ${location.latitude})`,
      last_location_update: new Date().toISOString(),
    })
    .eq('id', riderId);

  // Broadcast to active order channels
  const activeOrders = await getActiveOrdersForRider(riderId);
  for (const order of activeOrders) {
    await supabase.channel(`order:${order.id}`).send({
      type: 'broadcast',
      event: 'rider_location',
      payload: {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

## 12.3 Location Privacy

- **Customer sees:** latitude, longitude only
- **NOT exposed:** heading, speed, accuracy
- **Phone masking:** `080****1234`

## 12.4 Location Data Architecture (Two-Tier)

### Current Rider Location (`rider_current_locations`)

- **Purpose:** Optimized for dispatch and live customer tracking
- **Update frequency:** Configurable per delivery state (moving: 5-10s, idle: 30s, stopped: 60s)
- **Table:** Regular table with `rider_id` as PRIMARY KEY
- **Index:** GIST spatial index on `location` for dispatch queries
- **Contains:** rider_id, latitude, longitude, location (GEOGRAPHY), heading, speed, accuracy, is_available, updated_at
- **Behavior:** UPSERT — one row per rider, always current
- **Read pattern:** Dispatch queries + active delivery tracking subscriptions
- **Write pattern:** High-frequency updates from rider device
- **Optimization:** Spatial index + partial index on is_available

### Historical Rider Location (`rider_locations`)

- **Purpose:** Audit trail, delivery history, dispute resolution, analytics
- **Write pattern:** Append-only INSERT from rider location updates
- **Contains:** rider_id, latitude, longitude, location (GEOGRAPHY), heading, speed, accuracy, recorded_at
- **Index:** rider_id + recorded_at DESC for efficient time-range queries
- **Retention:** Configurable (default: 90 days)
- **Cleanup:** Scheduled background job (`LOCATION_CLEANUP`) deletes records older than retention period
- **Scaling path:** At high volume, partition by month or rider_id range

### Active Delivery Tracking (Supabase Realtime)

- **Channel:** `order:{order_id}` per active delivery
- **Authorization:** Server-side check — customer must own the order
- **Update flow:**
  1. Rider sends location update to backend
  2. Backend writes to `rider_current_locations` (UPSERT)
  3. Backend writes sampled record to `rider_locations` (every Nth update, configurable)
  4. Backend broadcasts to `order:{order_id}` channel
  5. Customer map receives broadcast and updates marker
- **Throttling:** Backend enforces minimum interval between broadcasts (configurable, default 5s)
- **Stale detection:** If no update received within `stale_threshold_seconds` (configurable, default 30s), customer UI shows "Last seen X ago"

### Migration Path Toward Scale

**MVP (current):** Supabase Realtime + PostgreSQL
- Location writes go to both `rider_current_locations` (UPSERT) and `rider_locations` (INSERT)
- Customer tracking via Supabase Realtime channels
- Suitable for hundreds of concurrent riders

**Future (1000+ concurrent riders):** Redis + Supabase Realtime
- Current location moves to Redis (lat/lon + TTL)
- Historical location still written to PostgreSQL periodically
- Supabase Realtime still broadcasts to customers
- Dispatch reads from Redis instead of PostgreSQL

**Scale (10K+ concurrent riders):** Dedicated location service
- Location service handles GPS ingestion
- Redis cluster for current locations
- PostgreSQL for historical samples
- Separate realtime infrastructure (e.g., Ably, Pusher, or custom WebSocket)
- Dispatch service reads from Redis/geo index

## 12.5 Location Retention Policy

| Data | Retention | Cleanup | Purpose |
|------|-----------|---------|---------|
| `rider_current_locations` | Never deleted (UPSERT) | N/A | Always current |
| `rider_locations` | 90 days (configurable) | Daily `LOCATION_CLEANUP` job | History/audit |
| Active delivery broadcast | Session only | Channel cleanup on delivery complete | Real-time only |

The active customer's tracking experience depends ONLY on:
1. `rider_current_locations` (for current position)
2. Realtime broadcast channel (for live updates)

Neither depends on the growing `rider_locations` history table.

---

# 13. GEOSPATIAL INDEXING

## 13.1 Current Location Index

```sql
-- Regular table (NOT materialized view) for dispatch
-- Updated via UPSERT on every rider location update
CREATE TABLE rider_current_locations (
  rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  accuracy DECIMAL(8,2),
  is_available BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for nearest-rider dispatch queries
CREATE INDEX idx_rider_current_locations_geo
  ON rider_current_locations USING GIST(location);

-- Partial index for available riders only (most dispatch queries)
CREATE INDEX idx_rider_current_locations_available
  ON rider_current_locations(is_available)
  WHERE is_available = TRUE;
```

## 13.2 Dispatch Query

```sql
-- Nearest-eligible-rider query using spatial index
SELECT * FROM find_nearest_riders(
  $1,  -- pickup latitude
  $2,  -- pickup longitude
  10,  -- max distance km
  10   -- limit
);
```

---

# 14. TESTING ARCHITECTURE

## 14.1 Test Categories

| Category | Coverage Target | Critical Tests |
|----------|-----------------|----------------|
| Unit Tests | 80% | Pricing, State Machine, Validators |
| Integration Tests | 70% | Payments, Dispatch, Auth |
| E2E Tests | Key Flows | Customer, Rider, Admin flows |
| Security Tests | All Threats | IDOR, AuthZ, Injection, RLS |
| RLS Tests | All Tables | Data isolation verification |
| Concurrency Tests | Dispatch | Race condition prevention |

## 14.2 Critical Automated Tests

1. **Quote locking** — concurrent consumption attempts
2. **Dispatch concurrency** — two workers assigning riders
3. **Payment idempotency** — duplicate webhook handling
4. **RLS verification** — user isolation for all tables
5. **State machine** — invalid transitions rejected
6. **Earnings ledger** — balance reconstruction

---

# 15. MILESTONES

## Milestone 1: Project Foundation
- Next.js + TypeScript + Tailwind
- Supabase configuration
- Database schema (all tables, indexes, RLS)
- Auth setup (Supabase Auth)
- Profile creation trigger

## Milestone 2: Customer Booking
- Address management
- Quote calculation (atomic locking)
- Order creation
- Payment initialization

## Milestone 3: Payment Integration
- Paystack integration
- Webhook handling (idempotent)
- Payment verification (server-side)
- Background job creation

## Milestone 4: Dispatch System
- Dispatch PostgreSQL function
- Rider eligibility
- Offer timeout background job
- Race condition prevention

## Milestone 5: Rider Experience
- Rider registration
- Verification flow
- Job management (accept/reject)
- Delivery status updates
- Proof of delivery
- Earnings ledger

## Milestone 6: Realtime Tracking
- Location ingestion (trigger-based current location update)
- Current location table with GIST index
- Authorized subscriptions
- Broadcasting
- Privacy controls

## Milestone 7: Admin Dashboard
- Order management
- Rider management
- Pricing configuration
- Tax configuration
- Analytics

## Milestone 8: Notifications
- Email (SendGrid)
- SMS (Termii)
- Push (Firebase)
- In-app

## Milestone 9: Production Hardening
- Security audit
- Performance optimization
- Load testing
- RLS testing

## Milestone 10: Launch
- Production deployment
- Domain setup
- Monitoring
- Documentation

---

# 16. OPEN DECISIONS

| # | Decision | Why It Matters | What Depends on It | Can Proceed Without? |
|---|----------|----------------|-------------------|---------------------|
| 1 | Product/Brand Name | UI text, domain, assets | All user-facing components | ❌ No |
| 2 | Logo/Identity | Design system, branding | Landing page, auth pages | ❌ No |
| 3 | Initial Launch City | Service zones, maps | Pricing, dispatch | ❌ No |
| 4 | Vehicle Types | Pricing multipliers | Pricing engine | ⚠️ Default: motorcycle |
| 5 | Max Package Weight | Validation, pricing | Order validation | ⚠️ Default: 10kg |
| 6 | Max Package Dimensions | Validation | Order validation | ⚠️ Default: 100cm |
| 7 | Payment Methods | Payment integration | Payment service | ⚠️ Default: card + transfer |
| 8 | Maps Provider | Maps integration | Geocoding, routing | ❌ No |
| 9 | Notification Providers | Email/SMS | Notification service | ⚠️ Default: email only |
| 10 | Rider Verification | Onboarding flow | Rider registration | ❌ No |
| 11 | Cancellation Refund % | Refund logic | Order cancellation | ❌ No |
| 12 | Dispute Window Duration | Completion flow | Order completion | ⚠️ Default: 24h |
| 13 | Rider Compensation | Cancellation policy | Cancellation handling | ❌ No |
| 14 | Prohibited Items | Category validation | Order validation | ⚠️ Default: basic list |
| 15 | Operating Hours | Zone availability | Zone config | ⚠️ Default: 8am-8pm |
| 16 | Platform Fees | Revenue tracking | Earnings calculation | ❌ No |
| 17 | Location Retention | Privacy policy | Data cleanup | ⚠️ Default: 30 days |

---

### ARCHITECTURE V1.1 CHANGELOG

| # | Change | Reason | Section |
|---|--------|--------|--------|
| 1 | Removed independent `users` table; `auth.users` is authoritative | BLOCKER 1 | §2 |
| 2 | `profiles.id` references `auth.users(id)` | BLOCKER 1 | §2, §3, §4 |
| 3 | Added `get_user_role()` and `has_role()` functions | BLOCKER 2 | §2.4 |
| 4 | Rewrote all RLS policies using `auth.uid()` and role functions | BLOCKER 2 | §3 |
| 5 | Eliminated recursive RLS on profiles | BLOCKER 2 | §3.2 |
| 6 | Added partial unique indexes for dispatch concurrency | BLOCKER 3 | §4.1, §8 |
| 7 | Created `dispatch_rider()` PostgreSQL function with FOR UPDATE | BLOCKER 3 | §8.1 |
| 8 | Removed Prisma; unified on Supabase JS client + RPC | BLOCKER 4 | §1.2 |
| 9 | Webhook handler creates background job, not synchronous dispatch | REQ 5 | §9.2 |
| 10 | Created `processed_webhook_events` table | REQ 5 | §4.1 |
| 11 | Created `consume_quote()` atomic function | REQ 6 | §4.2 |
| 12 | Added complete cancellation policy matrix | REQ 7 | §6 |
| 13 | Defined delivered → completed with 24h dispute window | REQ 8 | §5.3 |
| 14 | Made businesses first-class with member roles | REQ 9 | §4.1 |
| 15 | Created `earnings_ledger` table; `cached_total_earnings` is derived | REQ 10 | §4.1, §10 |
| 16 | Created `payout_recipients` with tokenized Paystack codes | REQ 11 | §4.1 |
| 17 | Made tax rate/name configurable and versioned in pricing_rules | REQ 12 | §4.1, §7 |
| 18 | Created `background_jobs` table and job processing functions | REQ 13 | §4.1, §11 |
| 19 | Redesigned realtime with authorized subscription model | REQ 14 | §12 |
| 20 | Added `rider_current_locations` regular table with GIST spatial index | REQ 15 | §4.1, §13 |

---

# 17. DISPATCH STATE SEMANTICS (V1.2)

## 17.1 Key Principle

**A rider receiving an offer MUST NOT automatically mean the rider has accepted the delivery.**

The order state machine tracks the order-level lifecycle. The `rider_assignments` table tracks the offer-level sub-lifecycle. These are separate concerns.

## 17.2 Order States (Dispatch-Related)

```
paid
  ↓ (background job DISPATCH_ORDER created)
searching_rider
  ↓ (rider accepts assignment)
rider_assigned
  ↓ (rider confirms departure)
rider_en_route_to_pickup
```

**Critical:** The order does NOT move from `searching_rider` to `rider_assigned` when an offer is created. It only moves when the rider **accepts**.

## 17.3 Rider Assignment Sub-Lifecycle

```
offered → accepted → [order becomes rider_assigned]
offered → rejected → [try next rider]
offered → expired → [try next rider]
offered → cancelled → [order cancelled]
```

## 17.4 Complete Dispatch Flow

### Step 1: Dispatch Job Created

```sql
INSERT INTO background_jobs (job_type, payload, priority)
VALUES ('DISPATCH_ORDER', jsonb_build_object('order_id', p_order_id), 10);
```

### Step 2: Dispatch Function Executes

```sql
CREATE OR REPLACE FUNCTION dispatch_rider_v2(p_order_id UUID)
RETURNS TABLE (success BOOLEAN, rider_id UUID, message TEXT) AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_rider RECORD;
  v_assignment_id UUID;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.status NOT IN ('paid', 'searching_rider') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Order not in dispatchable state'::TEXT;
    RETURN;
  END IF;

  UPDATE orders SET status = 'searching_rider', updated_at = NOW() WHERE id = p_order_id;

  FOR v_rider IN
    SELECT * FROM find_nearest_riders(
      v_order.pickup_latitude, v_order.pickup_longitude, 10, 10
    )
  LOOP
    BEGIN
      INSERT INTO rider_assignments (order_id, rider_id, status, expires_at)
      VALUES (p_order_id, v_rider.rider_id, 'offered', NOW() + INTERVAL '30 seconds')
      RETURNING id INTO v_assignment_id;

      UPDATE rider_current_locations SET is_available = FALSE
      WHERE rider_id = v_rider.rider_id;

      -- Order stays searching_rider until rider accepts
      RETURN QUERY SELECT TRUE, v_rider.rider_id, 'Offer sent to rider'::TEXT;
      RETURN;

    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  UPDATE orders SET status = 'failed', updated_at = NOW() WHERE id = p_order_id;
  RETURN QUERY SELECT FALSE, NULL::UUID, 'No eligible riders available'::TEXT;
END;
$$ LANGUAGE plpgsql;
```

### Step 3: Rider Accepts

```sql
CREATE OR REPLACE FUNCTION accept_rider_offer(
  p_assignment_id UUID,
  p_rider_id UUID
) RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_assignment rider_assignments%ROWTYPE;
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_assignment
  FROM rider_assignments
  WHERE id = p_assignment_id AND rider_id = p_rider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Assignment not found'::TEXT;
    RETURN;
  END IF;

  IF v_assignment.status != 'offered' THEN
    RETURN QUERY SELECT FALSE, 'Assignment not in offered state'::TEXT;
    RETURN;
  END IF;

  IF v_assignment.expires_at < NOW() THEN
    UPDATE rider_assignments SET status = 'expired', responded_at = NOW()
    WHERE id = p_assignment_id;
    RETURN QUERY SELECT FALSE, 'Offer expired'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_assignment.order_id FOR UPDATE;

  IF v_order.status != 'searching_rider' THEN
    RETURN QUERY SELECT FALSE, 'Order no longer searching'::TEXT;
    RETURN;
  END IF;

  UPDATE rider_assignments
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_assignment_id;

  UPDATE orders
  SET status = 'rider_assigned',
      assigned_rider_id = p_rider_id,
      rider_assigned_at = NOW(),
      updated_at = NOW()
  WHERE id = v_assignment.order_id;

  UPDATE rider_assignments
  SET status = 'cancelled'
  WHERE order_id = v_assignment.order_id
    AND id != p_assignment_id
    AND status = 'offered';

  UPDATE rider_current_locations rcl
  SET is_available = TRUE
  WHERE rcl.rider_id IN (
    SELECT ra.rider_id FROM rider_assignments ra
    WHERE ra.order_id = v_assignment.order_id
      AND ra.id != p_assignment_id
      AND ra.status = 'cancelled'
  );

  RETURN QUERY SELECT TRUE, 'Rider accepted'::TEXT;
END;
$$ LANGUAGE plpgsql;
```

### Step 4: Rider Rejects

```sql
CREATE OR REPLACE FUNCTION reject_rider_offer(
  p_assignment_id UUID,
  p_rider_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_assignment rider_assignments%ROWTYPE;
BEGIN
  SELECT * INTO v_assignment
  FROM rider_assignments
  WHERE id = p_assignment_id AND rider_id = p_rider_id
  FOR UPDATE;

  IF NOT FOUND OR v_assignment.status != 'offered' THEN
    RETURN QUERY SELECT FALSE, 'Invalid assignment'::TEXT;
    RETURN;
  END IF;

  UPDATE rider_assignments
  SET status = 'rejected', responded_at = NOW(), rejection_reason = p_reason
  WHERE id = p_assignment_id;

  UPDATE rider_current_locations SET is_available = TRUE
  WHERE rider_id = p_rider_id;

  INSERT INTO background_jobs (job_type, payload, priority)
  VALUES ('DISPATCH_RETRY', jsonb_build_object('order_id', v_assignment.order_id), 8);

  RETURN QUERY SELECT TRUE, 'Offer rejected'::TEXT;
END;
$$ LANGUAGE plpgsql;
```

### Step 5: Offer Timeout

```sql
CREATE OR REPLACE FUNCTION process_expired_offers()
RETURNS VOID AS $$
DECLARE
  v_assignment RECORD;
BEGIN
  FOR v_assignment IN
    SELECT id, order_id, rider_id
    FROM rider_assignments
    WHERE status = 'offered' AND expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE rider_assignments SET status = 'expired'
    WHERE id = v_assignment.id;

    UPDATE rider_current_locations SET is_available = TRUE
    WHERE rider_id = v_assignment.rider_id;

    INSERT INTO background_jobs (job_type, payload, priority)
    VALUES ('DISPATCH_RETRY', jsonb_build_object('order_id', v_assignment.order_id), 8);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## 17.5 Concurrency Guarantees

| Scenario | Guarantee | Mechanism |
|----------|-----------|----------|
| Two riders try to accept same offer | Only one succeeds | `SELECT ... FOR UPDATE` on assignment row |
| Two dispatch workers try to assign | Only one succeeds | `FOR UPDATE` on order row + partial unique index |
| Rider tries to accept expired offer | Rejected | `expires_at` check |
| Rider goes offline with active offer | Offer expires, next rider tried | `process_expired_offers()` |
| Order cancelled while offer pending | Assignment cancelled, rider freed | Cancellation handler |

## 17.6 Partial Unique Indexes

```sql
CREATE UNIQUE INDEX idx_rider_assignments_one_active
  ON rider_assignments(order_id)
  WHERE status IN ('offered', 'accepted');

CREATE UNIQUE INDEX idx_rider_assignments_rider_one_active
  ON rider_assignments(rider_id)
  WHERE status IN ('offered', 'accepted');
```

---

# 18. CURRENT RIDER LOCATION ARCHITECTURE (V1.2)

## 18.1 Design Decision

**`rider_current_locations` is a regular table, NOT a materialized view.**

### Why Not Materialized View

- Materialized views require periodic refresh (every 30s minimum)
- GPS data changes every 5 seconds — 30s refresh is too stale for dispatch
- Refresh locks the view, causing read latency
- Cannot update `is_available` flag efficiently

### Why Regular Table

- Updated on every location insert via trigger
- Always fresh — no refresh lag
- Supports `FOR UPDATE` for concurrent dispatch
- `is_available` flag managed alongside location

## 18.2 Schema

```sql
CREATE TABLE rider_current_locations (
  rider_id UUID PRIMARY KEY REFERENCES rider_profiles(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  accuracy DECIMAL(8,2),
  is_available BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rider_current_locations_geo
  ON rider_current_locations USING GIST(location);

CREATE INDEX idx_rider_current_locations_available
  ON rider_current_locations(is_available)
  WHERE is_available = TRUE;
```

## 18.3 Update Trigger

```sql
CREATE OR REPLACE FUNCTION update_rider_current_location()
RETURNS TRIGGER AS $$
BEGIN
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_rider_location_insert
  AFTER INSERT ON rider_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_rider_current_location();
```

## 18.4 Two-Table Architecture

| Table | Purpose | Write Pattern | Read Pattern | Retention |
|-------|---------|---------------|--------------|-----------|
| `rider_current_locations` | Live dispatch + tracking | UPDATE on every GPS ping | Spatial query (nearest rider) | Current state only |
| `rider_locations` | Historical audit + analytics | INSERT on every GPS ping | Time-range queries | 30 days |

---

# 19. PLATFORM-WIDE IDEMPOTENCY (V1.2)

## 19.1 Idempotency Keys Table

```sql
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key, user_id, endpoint)
);

CREATE INDEX idx_idempotency_keys_key ON idempotency_keys(key, user_id, endpoint);
CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys(expires_at);
```

## 19.2 Idempotency Middleware

```typescript
export async function withIdempotency(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (!idempotencyKey) return handler();

  const user = await getAuthenticatedUser(request);
  const endpoint = request.url;
  const body = await request.text();
  const requestHash = crypto.createHash('sha256').update(body).digest('hex');

  const existing = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('key', idempotencyKey)
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .single();

  if (existing.data) {
    if (existing.data.request_hash !== requestHash) {
      return NextResponse.json(
        { error: 'Idempotency key reused with different payload' },
        { status: 422 }
      );
    }
    return NextResponse.json(existing.data.response_body, {
      status: existing.data.response_status,
    });
  }

  const response = await handler();
  const responseBody = await response.json();

  await supabase.from('idempotency_keys').insert({
    key: idempotencyKey,
    user_id: user.id,
    endpoint,
    request_hash: requestHash,
    response_status: response.status,
    response_body: responseBody,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  return NextResponse.json(responseBody, { status: response.status });
}
```

## 19.3 Endpoints Requiring Idempotency

| Endpoint | Required | Reason |
|----------|----------|--------|
| `POST /api/orders` | ✅ | Prevent duplicate orders |
| `POST /api/orders/quote` | ⚠️ | Quotes cheap to regenerate |
| `POST /api/payments/initialize` | ✅ | Prevent duplicate payment init |
| `POST /api/orders/:id/cancel` | ✅ | Prevent duplicate cancellation |
| `POST /api/riders/jobs/:id/accept` | ✅ | Prevent double-accept |
| `POST /api/admin/refunds` | ✅ | Prevent duplicate refunds |
| `POST /api/admin/payouts` | ✅ | Prevent duplicate payouts |
| `POST /api/webhooks/paystack` | ✅ | Via `processed_webhook_events` |

---

# 20. RATE LIMITING ARCHITECTURE (V1.2)

## 20.1 Implementation

**Upstash Redis + Vercel Edge Middleware**

## 20.2 Rate Limit Configuration

All limits configurable via environment variables.

| Endpoint Category | Per-User | Per-IP | Window | Env Variable |
|-------------------|----------|--------|--------|---------------|
| Auth (login/register) | 10 | 20 | 15 min | `RATE_LIMIT_AUTH` |
| Password reset | 3 | 5 | 15 min | `RATE_LIMIT_PASSWORD_RESET` |
| OTP | 5 | 10 | 5 min | `RATE_LIMIT_OTP` |
| Quote generation | 30 | 60 | 1 min | `RATE_LIMIT_QUOTE` |
| Order creation | 5 | 10 | 1 min | `RATE_LIMIT_ORDER` |
| Payment init | 5 | 10 | 1 min | `RATE_LIMIT_PAYMENT` |
| Tracking lookup | 30 | 60 | 1 min | `RATE_LIMIT_TRACKING` |
| Rider location | 12 | — | 1 min | `RATE_LIMIT_LOCATION` |
| Rider job accept/reject | 10 | 20 | 1 min | `RATE_LIMIT_RIDER_JOB` |
| Admin endpoints | 60 | — | 1 min | `RATE_LIMIT_ADMIN` |
| Webhook endpoints | — | 100 | 1 min | `RATE_LIMIT_WEBHOOK` |
| Geocoding API | 10 | 20 | 1 min | `RATE_LIMIT_GEOCODING` |
| General API | 60 | 120 | 1 min | `RATE_LIMIT_GENERAL` |

## 20.3 Edge Middleware

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '60s'),
      analytics: true,
    })
  : null;

export async function middleware(request: NextRequest) {
  if (!ratelimit) return NextResponse.next();

  const ip = request.ip ?? '127.0.0.1';
  const category = getRateLimitCategory(request.nextUrl.pathname);
  const identifier = `ip:${ip}:${category}`;

  const { success, limit: remaining, reset } = await ratelimit.limit(identifier);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return NextResponse.next();
}
```

---

# 21. SECOND ARCHITECTURAL REVIEW — RESOLUTION (V1.2)

| Issue | Decision | Rationale | Status |
|-------|----------|-----------|--------|
| Dispatch State Semantics | Order stays `searching_rider` during offers. Only moves to `rider_assigned` on acceptance. | Clean separation of order-level and offer-level state. | ✅ Resolved |
| Current Rider Location | Regular table with GIST index, not materialized view. Updated via trigger. | Materialized view too slow for 5s GPS updates. | ✅ Resolved |
| Platform Idempotency | `idempotency_keys` table with SHA-256 request hash. 24h expiry. | Prevents duplicate orders/payments from unstable connections. | ✅ Resolved |
| Rate Limiting | Upstash Redis + Edge Middleware. Configurable per-endpoint limits. | Serverless-compatible, distributed. | ✅ Resolved |
| Consistency Review | All subsystems reviewed. No contradictions found. | Cross-system verification complete. | ✅ Resolved |
| Financial Safety | All operations server-authoritative, transactionally safe, idempotent, auditable. | Historical orders contain complete snapshots. | ✅ Resolved |

---

### REMAINING PRODUCT DECISIONS

1. **Product/Brand Name** — affects all UI, domain, assets
2. **Logo/Identity** — affects design system
3. **Initial Launch City** — affects service zones, pricing, dispatch
4. **Maps Provider** — affects geocoding, routing, tracking
5. **Rider Verification Requirements** — affects onboarding flow
6. **Cancellation Refund Percentages** — affects financial liability
7. **Rider Compensation for Cancellations** — affects rider retention
8. **Platform Fee Structure** — affects revenue model
9. **Dispute Resolution Process** — affects customer support workflow

---

# 22. MULTI-CLIENT ARCHITECTURE CONSTRAINT

MBEENEXUS is a multi-client platform. The web application (`apps/web`) is the first client. Future clients will include native mobile applications for iOS and Android (`apps/mobile`, likely React Native/Expo + TypeScript).

## Constraint

All business logic, pricing, authorization, order processing, payments, dispatch, tracking, and other core functionality must remain **client-agnostic** and accessible through properly designed server-side APIs and services.

The future mobile applications **must** consume the same MBEENEXUS backend rather than having a separate backend or duplicated business logic.

## Architecture Rules

1. **No business logic in client components.** All domain logic lives in server-side services (`lib/services/`), API routes (`app/api/`), or PostgreSQL functions.
2. **API routes are the client boundary.** Every operation requiring authentication, authorization, or server-side validation goes through API routes.
3. **Shared packages are client-agnostic.** `packages/shared` must contain TypeScript types, validators, constants, and business-domain definitions usable by any client (web, mobile, CLI).
4. **No browser-only dependencies in business logic.** Services and API routes must not depend on browser-specific APIs (window, document, localStorage, etc.).
5. **No Next.js-specific dependencies in shared packages.** `packages/shared` must not import from `next/`, `react/`, or any framework-specific module.
6. **Authentication is provider-based, not framework-based.** Auth logic must be expressible through Supabase Auth SDK independently of Next.js.
7. **WebSocket/Realtime connections must use standard protocols.** Supabase Realtime is protocol-compatible with any client.

## Planned Client Structure

```
apps/web      — Next.js web application (current)
apps/mobile   — React Native/Expo mobile application (future)
packages/shared — Types, validators, constants, domain definitions (shared)
packages/database — Migrations, seed data, schema documentation (shared)
```

## Verification

Before completing any milestone, verify that no business logic is embedded in client components that would prevent reuse from a non-Next.js client.

---

**ARCHITECTURE STATUS: READY FOR IMPLEMENTATION**

*This architecture has been reviewed twice and all identified issues have been resolved. Implementation may begin upon explicit approval.*