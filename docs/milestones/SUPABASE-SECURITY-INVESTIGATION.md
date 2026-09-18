# SUPABASE SECURITY INVESTIGATION — RLS ADVISORY

**Date:** August 28, 2026
**Project:** `dlvdpmmaanrsiriarqqc`
**HEAD:** `54b4e84`
**Scope:** Security investigation only. No source code, database, or migration changes.

---

## Finding 1 — `public.prohibited_items`

### Current State

| Property | Value |
|----------|-------|
| **Created by** | `20240101000000_initial_schema.sql` (line 216) |
| **RLS enabled** | **NO** — no `ALTER TABLE prohibited_items ENABLE ROW LEVEL SECURITY` exists in any migration |
| **RLS policies** | **ZERO** — no `CREATE POLICY` targeting this table exists |
| **anon SELECT** | **YES** — granted in `20260820001609_grant_permissions.sql` line 144 |
| **authenticated SELECT** | **YES** — same grant |
| **service_role SELECT** | **YES** — same grant |
| **service_role INSERT/UPDATE/DELETE** | **YES** — line 145 |
| **Application code usage** | **ZERO** — no TypeScript/JavaScript file references `prohibited_items` |
| **Data API exposure** | **YES** — accessible via PostgREST with anon key |

### Schema

```sql
CREATE TABLE prohibited_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES delivery_categories(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Risk Assessment

| Risk | Severity | Detail |
|------|----------|--------|
| Anon can read all prohibited items | **MEDIUM** | Data is non-sensitive (delivery category restrictions), but any client with the anon key can enumerate all prohibited items via `GET /rest/v1/prohibited_items` |
| Anon cannot modify | **LOW** | INSERT/UPDATE/DELETE restricted to `service_role` |
| No authorization model | **MEDIUM** | Table exists but has no RLS, no policies, no application integration |
| Information disclosure | **LOW** | Prohibited item descriptions and reasons are operational data, not PII or credentials |

### Actual Risk: **MEDIUM**

The table contains delivery category restriction data (which items cannot be delivered). While not highly sensitive, the complete absence of RLS means:
- Any anonymous client can enumerate all prohibited items
- This violates the Supabase security principle that every public-schema table should have RLS enabled
- The Supabase Security Advisor correctly flags this

### Recommended Remediation

**Enable RLS with a service-role-only policy.**

Since the table is only used through server-side privileged access (no application code references it), the correct remediation is:

```sql
ALTER TABLE prohibited_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages prohibited items"
  ON prohibited_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

This will:
- Block all anon/authenticated Data API access (SELECT, INSERT, UPDATE, DELETE)
- Allow service_role full access through the Supabase client with service key
- Preserve the existing grant structure
- Not break any application code (none references this table)

**Risk of remediation:** NEGLIGIBLE — no application code reads or writes this table directly.

---

## Finding 2 — `public.spatial_ref_sys`

### Current State

| Property | Value |
|----------|-------|
| **Created by** | PostGIS extension (`CREATE EXTENSION IF NOT EXISTS "postgis"` in `20240101000000_initial_schema.sql` line 8) |
| **Owner** | `supabase_admin` (extension-managed) |
| **RLS enabled** | **NO** — cannot be enabled by the project owner |
| **RLS policies** | N/A — cannot create policies on extension-owned tables |
| **Content** | EPSG coordinate reference system definitions (SRIDs, proj4 text, WKT) |
| **Application queries** | **ZERO** — no application code queries `spatial_ref_sys` |
| **Data API exposure** | Technically accessible via PostgREST with anon key |

### Why This Is a Known False Positive

1. **Supabase Issue #47206** (June 2026) — Confirmed as a bug in the Security Advisor. The table is owned by `supabase_admin` and users receive `ERROR: 42501: must be owner of table spatial_ref_sys` when attempting to enable RLS.

2. **Table contents** — Only EPSG coordinate system definitions (SRID numbers, projection parameters). No application data, no PII, no secrets.

3. **Supabase PR #157** (splinter) — A fix is in progress to exclude PostGIS system tables (`spatial_ref_sys`, `geometry_columns`, `raster_columns`, etc.) from the RLS check.

4. **PostGIS requirement** — The application actively uses PostGIS functions (`ST_Distance`, `ST_Contains`, `ST_MakePoint`, `ST_GeographyFromText`) across 6+ migrations for service zone boundary checks and rider proximity calculations.

### Application PostGIS Usage

PostGIS is actively required by the application:

| Migration | Usage |
|-----------|-------|
| `20240101000000_initial_schema.sql` | `ST_SetSRID(ST_MakePoint(...))` for rider locations, `ST_Distance` for distance calculation |
| `20260820012100_create_is_in_service_zone.sql` | `ST_Contains` for service zone boundary checks |
| `20260820012200_fix_is_in_service_zone_types.sql` | Fix for `ST_Contains` geography/geometry casting |
| `20260820011300_seed_abuja_pricing.sql` | `ST_GeographyFromText` for zone boundary seeding |
| `20260823020000_phase2_location.sql` | `ST_Distance` for nearby rider queries |

Removing PostGIS or moving the extension would break all of these.

### Risk Assessment

| Risk | Severity | Detail |
|------|----------|--------|
| Anon can read EPSG definitions | **INFORMATIONAL** | Public coordinate system data, no security value |
| Cannot enable RLS | N/A | Extension-managed table, owner is `supabase_admin` |
| Cannot create policies | N/A | Same reason |
| False positive | **CONFIRMED** | Supabase GitHub #47206, PR #157 |

### Actual Risk: **INFORMATIONAL / FALSE POSITIVE**

This is a confirmed Supabase Security Advisor bug. The table contains no application data and poses no security risk.

### Recommended Remediation

**Option A (Preferred): Revoke Data API access**

```sql
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
```

This removes the table from the Data API while preserving PostGIS functionality (PostGIS functions access the table through internal extension permissions, not through GRANTs).

**Option B: Acknowledge as false positive**

Document the finding and wait for Supabase to fix the advisor (PR #157 in progress). No action required.

**Option C: Move PostGIS to a dedicated schema**

```sql
-- NOT recommended — breaks existing migrations
CREATE SCHEMA IF NOT EXISTS gis;
ALTER EXTENSION postgis SET SCHEMA gis;
```

This would require updating all existing migrations that reference PostGIS functions and would be a high-risk change.

**Recommended: Option A** — Revoke Data API grants. This is safe, minimal, and immediately resolves the advisory without breaking any functionality.

---

## Migration Analysis

| Object | Migration | Year |
|--------|-----------|------|
| `prohibited_items` table | `20240101000000_initial_schema.sql` | 2024 |
| PostGIS extension | `20240101000000_initial_schema.sql` | 2024 |
| `prohibited_items` grants | `20260820001609_grant_permissions.sql` | 2026 |
| No RLS migration for `prohibited_items` | N/A | N/A |
| No `spatial_ref_sys` migration | N/A | Extension-managed |

---

## Recommended Remediation Summary

### MUST FIX

| Item | Change | Risk | Impact |
|------|--------|------|--------|
| `prohibited_items` RLS | Enable RLS + service-role-only policy | NEGLIGIBLE | No application code uses this table |
| `prohibited_items` Data API | RLS blocks anon/authenticated access automatically | NONE | Table becomes service-role-only |

### SHOULD FIX

| Item | Change | Risk | Impact |
|------|--------|------|--------|
| `spatial_ref_sys` grants | `REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated` | LOW | Table removed from Data API; PostGIS functions unaffected |

### DO NOT CHANGE

| Item | Reason |
|------|--------|
| PostGIS extension schema | Moving to `gis` schema would break 6+ existing migrations |
| `prohibited_items` application code | No code exists; table is server-only |
| `prohibited_items` grants for `service_role` | Must remain for server-side access |
| Any other tables | Out of scope for this investigation |

---

## Verification

| Check | Result |
|-------|--------|
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Database modified | ✅ NONE |
| Dependencies modified | ✅ NONE |
| Git history modified | ✅ NONE |
| Attribution scan | ✅ ZERO |
| Working tree | ✅ Clean |

---

## Status

**SUPABASE SECURITY INVESTIGATION COMPLETE — AWAITING REMEDIATION AUTHORIZATION**
