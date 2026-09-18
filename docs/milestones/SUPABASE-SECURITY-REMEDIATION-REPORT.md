# SUPABASE SECURITY REMEDIATION — LIVE VERIFICATION

**Date:** August 28, 2026
**Project:** `dlvdpmmaanrsiriarqqc`
**HEAD:** `54b4e84`
**Status:** prohibited_items FIXED via CLI; spatial_ref_sys REQUIRES DASHBOARD ACTION

---

## 1. Executive Summary

| Finding | Table | CLI Fixable? | Status |
|---------|-------|-------------|--------|
| 1 | `public.prohibited_items` | ✅ YES | **FIXED** — RLS enabled, anon/auth blocked |
| 2 | `public.spatial_ref_sys` | ❌ NO | **PENDING** — requires Supabase Dashboard SQL Editor |

### Why `spatial_ref_sys` Cannot Be Fixed via CLI

The Supabase CLI connects as the `postgres` role, which is **NOT a superuser** (`rolsuper = false`) on Supabase-hosted projects. All grants on `spatial_ref_sys` were made by `supabase_admin` (the superuser, `rolsuper = true`). In PostgreSQL, only the grantor or a superuser can revoke grants. Since `postgres` is neither, the REVOKE statements execute without error (exit 0) but **silently fail to modify the ACL**.

---

## 2. Live Database Verification — `prohibited_items`

### RLS Status

| Property | Before | After |
|----------|--------|-------|
| RLS enabled | ❌ **false** | ✅ **true** |
| Table owner | postgres | postgres (unchanged) |

### Grants

| Role | Before | After |
|------|--------|-------|
| anon | SELECT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE | **(none)** |
| authenticated | SELECT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE | **(none)** |
| service_role | SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE | **(unchanged)** |

### Application Code References

ZERO. No TypeScript, JavaScript, or SQL file in the repository references this table.

### Security Assessment

✅ **FIXED.** The table is now protected by:
1. RLS enabled (defense-in-depth)
2. `anon` and `authenticated` have no Data API grants
3. Only `service_role` (server-side) retains access

---

## 3. Live Database Verification — `spatial_ref_sys`

### RLS Status

| Property | Value | Notes |
|----------|-------|-------|
| RLS enabled | ❌ **false** | Cannot enable — table owned by `supabase_admin` |
| Table owner | `supabase_admin` | Extension-managed |

### Grants (UNCHANGED — REVOKE failed)

| Role | Privileges | Grantor |
|------|-----------|---------|
| anon | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | supabase_admin |
| authenticated | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | supabase_admin |
| service_role | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | supabase_admin |

### Why REVOKE Failed

```
postgres (current_user) = NOT superuser
spatial_ref_sys grants = made by supabase_admin
Result: REVOKE silently succeeds but does NOT modify ACL
```

PostgreSQL requires the grantor or a superuser to revoke grants. The `postgres` role in Supabase-hosted is neither.

### Application Code References

ZERO. No TypeScript, JavaScript, or SQL file in the repository queries this table directly.

### PostGIS Compatibility

| Function | Status |
|----------|--------|
| ST_Distance | ✅ Working (verified: 15,594.93m) |
| ST_SetSRID | ✅ Working |
| ST_MakePoint | ✅ Working |
| Service zone checks | ✅ Unaffected |

**PostGIS functions access `spatial_ref_sys` through extension-internal permissions, not through PostgreSQL GRANTs.**

---

## 4. Required Manual Action

### Run this SQL in **Supabase Dashboard → SQL Editor**:

```sql
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
```

This runs as `supabase_admin` (superuser), so the REVOKE will succeed.

### After running, verify:

```sql
-- Should return zero rows for anon/authenticated
SELECT acl.grantee::regrole::text as grantee, acl.privilege_type
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN aclexplode(c.relacl) acl ON true
WHERE c.relname = 'spatial_ref_sys' AND n.nspname = 'public'
AND acl.grantee::regrole::text IN ('anon', 'authenticated');
```

### Then re-run Supabase Security Advisor

If the `spatial_ref_sys` RLS warning persists after revoking grants, it is the **known Supabase false positive** for extension-managed tables:
- GitHub issue: https://github.com/supabase/supabase/issues/47206
- The actual Data API exposure will be resolved even if the warning remains
- No application data is in this table (only EPSG coordinate reference definitions)

---

## 5. Application Table Grant Restoration

During remediation, a broad `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` was inadvertently executed. This was immediately corrected by re-granting all application table permissions according to the original `grant_permissions.sql` migration.

**Verified:** All application tables (profiles, orders, payments, rider_locations, delivery_quotes, etc.) have correct anon/authenticated/service_role grants restored.

---

## 6. Migration File

**File:** `supabase/migrations/20260828020000_security_rls_remediation.sql`

The migration has been recorded in `supabase_migrations.schema_migrations` but contains only the `prohibited_items` fix (applied via CLI). The `spatial_ref_sys` fix must be applied manually.

---

## 7. Verification Results

| Check | Result |
|-------|--------|
| `prohibited_items` RLS | ✅ **ENABLED** |
| `prohibited_items` anon/auth | ✅ **BLOCKED** |
| `spatial_ref_sys` anon/auth | ⚠️ **PENDING DASHBOARD FIX** |
| PostGIS functions | ✅ Working (ST_Distance verified) |
| Application table grants | ✅ Restored correctly |
| Typecheck | ✅ PASS — 3/3 packages |
| Tests | ✅ **438/438 PASS** |
| Production build | ✅ PASS |
| Secrets scan | ✅ CLEAN |
| Attribution scan | ✅ ZERO |
| Source code modified | ✅ NONE |
| Migrations modified | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Commit performed | ❌ NO |
| Push performed | ❌ NO |

---

## 8. Git Status

| Field | Value |
|-------|-------|
| HEAD | `54b4e84` (unchanged) |
| Branch | `master` |
| Working tree | 3 untracked files (migration, investigation doc, this report) |
| Commit | NONE |
| Push | NONE |

---

## 9. Next Steps

1. **You must run the Dashboard SQL** to fix `spatial_ref_sys` (see Section 4)
2. **Re-run Security Advisor** to confirm both findings are resolved
3. **Commit Phase 6J + security remediation** together or separately
4. **Apply the migration** via `supabase db push` or include it in the commit

---

**SUPABASE SECURITY REMEDIATION — PARTIALLY COMPLETE**
**prohibited_items: FIXED ✅**
**spatial_ref_sys: REQUIRES DASHBOARD ACTION ⚠️**
**NO GIT COMMIT AUTHORIZED**
**NO PUSH AUTHORIZED**
