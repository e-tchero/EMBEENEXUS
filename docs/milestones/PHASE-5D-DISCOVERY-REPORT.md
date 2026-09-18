# PHASE 5D — DISCOVERY REPORT: Admin Rider Verification Management

## Executive Summary

Phase 5D will build the **admin rider verification management** interface. The database infrastructure is **comprehensive and complete** — RLS policies, tables, functions, and audit history already exist. What's missing is:
- Admin UI pages (none exist)
- Admin API routes (none exist)
- Admin service methods (none exist)
- Admin user role (no admin users exist in production)

## Repository Baseline

| Check | Value |
|-------|-------|
| HEAD | `8847035` |
| Branch | `master` |
| Phase 5C committed | ✅ |
| Working tree | Clean |
| Phase 1-5C | Untouched |

## Current-State Inventory

### Database Schema (COMPLETE)

| Table | Purpose | Status |
|-------|---------|--------|
| `profiles` | User accounts with `role` column | ✅ Exists |
| `rider_profiles` | Rider data with `verification_status` | ✅ Exists |
| `rider_documents` | Uploaded verification documents | ✅ Exists |
| `rider_verification_history` | Audit trail for status changes | ✅ Exists |
| `vehicles` | Rider vehicle information | ✅ Exists |

### Verification Status Values (FROM SCHEMA)

```sql
CHECK (verification_status IN ('pending', 'under_review', 'approved', 'rejected'))
```

### Document Types (FROM SCHEMA)

```sql
CHECK (document_type IN ('government_id', 'vehicle_registration', 'insurance', 'drivers_license', 'proof_of_address', 'other'))
```

### Document Status Values (FROM SCHEMA)

```sql
CHECK (status IN ('pending', 'approved', 'rejected'))
```

### User Roles (FROM SCHEMA)

```sql
CHECK (role IN ('customer', 'rider', 'business', 'support', 'operations', 'admin', 'super_admin'))
```

### RLS Policies (COMPLETE)

**rider_profiles:**
- `rider_profiles_select_own` — riders can read their own profile
- `rider_profiles_insert_own` — riders can create their own profile
- `rider_profiles_update_own` — riders can update their own profile
- `rider_profiles_select_admin` — admins can read ALL rider profiles
- `rider_profiles_update_admin` — admins can update ALL rider profiles

**rider_documents:**
- `rider_documents_select_own` — riders can read their own documents
- `rider_documents_insert_own` — riders can upload documents
- `rider_documents_select_admin` — admins can read ALL documents
- `rider_documents_update_admin` — admins can update ALL documents

**rider_verification_history:**
- `rider_verification_history_select_admin` — admins can read ALL history
- `rider_verification_history_insert_admin` — admins can insert history
- `rider_verification_history_select_own` — riders can read their own history

### PostgreSQL Functions (COMPLETE)

| Function | Purpose | Security |
|----------|---------|----------|
| `get_user_role()` | Returns `profiles.role` for `auth.uid()` | SECURITY DEFINER, STABLE |
| `has_role(required_role)` | Checks if user has specific role | SECURITY DEFINER, STABLE |

### Middleware (COMPLETE)

```typescript
// Admin routes require admin role
if (request.nextUrl.pathname.startsWith('/admin') && user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    // Redirect to dashboard
  }
}
```

### Existing APIs (PARTIAL)

| Endpoint | Method | Purpose | Admin Access |
|----------|--------|---------|--------------|
| `/api/riders/verification-status` | GET | Rider checks own status | ❌ No |
| `/api/riders/documents` | GET/POST | Rider manages own docs | ❌ No |
| `/api/riders/profile` | GET/PUT | Rider manages own profile | ❌ No |
| `/api/riders/vehicles` | GET/POST/PUT | Rider manages own vehicles | ❌ No |

### What Exists vs What's Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Database tables | ✅ COMPLETE | All 5 tables exist |
| RLS policies | ✅ COMPLETE | Admin access policies exist |
| Verification states | ✅ COMPLETE | 4 states defined |
| Document types | ✅ COMPLETE | 6 types defined |
| Audit history | ✅ COMPLETE | `rider_verification_history` exists |
| `get_user_role()` | ✅ COMPLETE | SECURITY DEFINER |
| `has_role()` | ✅ COMPLETE | SECURITY DEFINER |
| Middleware auth | ✅ COMPLETE | Admin route protection |
| Admin navigation | ✅ COMPLETE | Defined in `constants.ts` |
| Admin pages | ❌ MISSING | No `/admin/*` pages exist |
| Admin APIs | ❌ MISSING | No `/api/admin/*` routes exist |
| Admin service | ❌ MISSING | No admin service methods |
| Admin UI components | ❌ MISSING | No admin components |
| Admin user | ❌ MISSING | No admin users in production |

## Live Database State

### Users

| User ID | Role | Full Name | Created |
|---------|------|-----------|---------|
| `f9dffbc7-...` | customer | (empty) | 2026-08-22 |
| `e063ee5e-...` | customer | (empty) | 2026-08-22 |
| `8e65a61c-...` | customer | (empty) | 2026-08-20 |
| `7434367a-...` | customer | (empty) | 2026-08-20 |
| `6dcf6e7e-...` | customer | Admin User | 2026-08-20 |

### Rider Data

| Table | Count |
|-------|-------|
| rider_profiles | 0 |
| rider_documents | 0 |
| rider_verification_history | 0 |
| vehicles | 0 |

**No riders have registered yet. No admin users exist.**

## Security Analysis

### Admin Authorization Model

1. **Middleware**: Server-side check of `profiles.role` for `admin` or `super_admin`
2. **RLS**: `get_user_role()` used in RLS policies for admin access
3. **SECURITY DEFINER**: `get_user_role()` and `has_role()` are SECURITY DEFINER

### IDOR/Privilege Escalation Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| Customer accessing admin routes | Middleware redirects to `/dashboard` | ✅ Protected |
| Rider approving themselves | RLS: `rider_profiles_update_admin` checks role | ✅ Protected |
| Customer modifying rider verification | RLS: `rider_profiles_update_own` only allows own profile | ✅ Protected |
| Non-admin updating documents | RLS: `rider_documents_update_admin` checks role | ✅ Protected |
| Direct database UPDATE bypass | RLS enforced at database level | ✅ Protected |
| Client-side role manipulation | Server derives role from `auth.uid()` via `get_user_role()` | ✅ Protected |

### Recommended Security Model for Phase 5D

1. **Admin APIs must use service-role client** to bypass RLS for cross-user queries
2. **Admin identity verified server-side** via `get_user_role()` or middleware
3. **All mutations create audit records** in `rider_verification_history`
4. **No client-controlled rider IDs** for authorization
5. **Admin cannot approve themselves** (enforce in service layer)

## Required Implementation Scope

### Admin Pages

| Page | Route | Purpose |
|------|-------|---------|
| Admin Layout | `/admin/layout.tsx` | Auth guard + navigation |
| Dashboard | `/admin/dashboard` | Overview stats |
| Rider List | `/admin/riders` | List of all riders with status |
| Rider Detail | `/admin/riders/[id]` | Rider profile + documents + actions |

### Admin APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/riders` | GET | List riders with filters |
| `/api/admin/riders/[id]` | GET | Get rider detail |
| `/api/admin/riders/[id]/verify` | POST | Approve/reject rider |

### Admin Service Methods

| Method | Purpose |
|--------|---------|
| `listRiders(filters)` | List riders with pagination |
| `getRiderDetail(riderId)` | Get full rider detail |
| `approveRider(riderId, notes)` | Approve rider verification |
| `rejectRider(riderId, reason, notes)` | Reject rider verification |

### Database Changes

**NONE REQUIRED.** All tables, RLS policies, functions, and audit infrastructure already exist.

### Migration Changes

**NONE REQUIRED.** Phase 5D is purely application-layer work.

## Proposed Implementation Sequence

### Step 1: Admin Service
Create `apps/web/lib/services/admin.service.ts` with:
- `listRiders(filters)`
- `getRiderDetail(riderId)`
- `approveRider(riderId, notes)`
- `rejectRider(riderId, reason, notes)`

### Step 2: Admin APIs
Create:
- `GET /api/admin/riders`
- `GET /api/admin/riders/[id]`
- `POST /api/admin/riders/[id]/verify`

### Step 3: Admin UI Components
Create:
- `apps/web/components/admin/rider-list.tsx`
- `apps/web/components/admin/rider-detail.tsx`
- `apps/web/components/admin/verify-actions.tsx`

### Step 4: Admin Pages
Create:
- `apps/web/app/admin/layout.tsx`
- `apps/web/app/admin/dashboard/page.tsx`
- `apps/web/app/admin/riders/page.tsx`
- `apps/web/app/admin/riders/[id]/page.tsx`

### Step 5: Tests
Add comprehensive tests covering:
- Admin authorization
- Rider listing/filtering
- Approval workflow
- Rejection workflow
- Audit trail creation
- IDOR protection
- Privilege escalation prevention

### Step 6: Verification
- Typecheck
- Lint
- Unit tests
- Production build
- Security scan
- Attribution scan

## Product Decisions Required

1. **Admin user creation**: How to create the first admin user?
   - Option A: Manual database UPDATE
   - Option B: Seed migration
   - Option C: Admin invite flow (deferred)
   - **Recommended**: Manual UPDATE for MVP

2. **Approval requirements**: Must all document types be approved before rider can go online?
   - Currently: System checks `verification_status === 'approved'`
   - Does `approved` require all documents approved? Or just certain types?

3. **Rejection granularity**: Can admin reject individual documents, or only the entire rider?
   - **Recommended**: Individual document rejection for MVP

4. **Re-review flow**: When a rider is rejected and re-submits, what happens?
   - Currently: `submitDocument()` sets status to `under_review` if `pending`
   - After rejection: Rider would need to re-submit documents
   - **Recommended**: Rejected riders can re-submit, status goes to `under_review`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| No admin users exist | Cannot test admin flow | Create admin user via manual UPDATE |
| No riders exist | Cannot test verification flow | Register test rider |
| Document URLs point to storage | Storage bucket may not exist | Use placeholder URLs for MVP |
| Admin service bypasses RLS | Must verify authorization manually | Verify role in service layer |

## Explicit Items to Defer

- Admin invite flow
- Bulk operations
- Analytics dashboard
- Customer management
- Order management
- Pricing management
- Advanced filtering/search
- Email notifications
- Document preview/viewer

## Recommendation

**PHASE 5D DISCOVERY — COMPLETE**

The database infrastructure is comprehensive. Phase 5D requires only application-layer work: admin service, APIs, and UI. No database migrations are needed.

**READY FOR ARCHITECTURE REVIEW**
