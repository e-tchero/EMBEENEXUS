# PHASE 5D — ARCHITECTURE REVIEW: Admin Rider Verification Management

## Executive Summary

Phase 5D builds the **admin rider verification management** interface. The database infrastructure is **complete** — all tables, RLS policies, functions, and audit history exist. Phase 5D requires **zero database changes** and consists entirely of application-layer work: admin service, APIs, and branded UI.

**Database changes required: NONE**

---

## 1. Current Architecture

### What Already Exists

| Component | Status | Evidence |
|-----------|--------|----------|
| `profiles.role` | ✅ | CHECK constraint: `'admin'`, `'super_admin'` supported |
| `rider_profiles.verification_status` | ✅ | CHECK: `'pending'`, `'under_review'`, `'approved'`, `'rejected'` |
| `rider_documents` | ✅ | 6 document types, status tracking, rejection reasons |
| `rider_verification_history` | ✅ | Full audit trail: `old_status`, `new_status`, `changed_by`, `reason` |
| `get_user_role()` | ✅ | SECURITY DEFINER, returns `profiles.role` for `auth.uid()` |
| `has_role()` | ✅ | SECURITY DEFINER, checks role |
| Middleware admin guard | ✅ | Redirects non-admin from `/admin/*` |
| RLS admin policies | ✅ | `*_select_admin`, `*_update_admin` on all rider tables |
| Admin navigation | ✅ | Defined in `constants.ts` |

### What's Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Admin pages | ❌ | No `/admin/*` pages exist |
| Admin APIs | ❌ | No `/api/admin/*` routes |
| Admin service | ❌ | No admin service methods |
| Admin UI components | ❌ | No admin components |
| Brand tokens | ❌ | No EMBEE NEXUS design tokens in CSS |
| Admin user | ❌ | No admin users in production |

---

## 2. Authentication & Authorization Model

### Middleware Layer (EXISTS)

```typescript
// apps/web/lib/supabase/middleware.ts
if (request.nextUrl.pathname.startsWith('/admin') && user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.redirect(url); // → /dashboard
  }
}
```

### API Authorization (REQUIRED)

Every admin API must independently verify authorization:

```typescript
// Pattern for all admin API routes:
1. Authenticate: supabase.auth.getUser()
2. Authorize: Check profiles.role via get_user_role() or direct query
3. Reject if not admin/super_admin
4. Use service-role client for cross-user queries
5. Never trust client-supplied rider_id for authorization
```

### Admin vs Super Admin

| Capability | `admin` | `super_admin` |
|------------|---------|---------------|
| View riders | ✅ | ✅ |
| Approve/reject riders | ✅ | ✅ |
| View verification history | ✅ | ✅ |
| Manage other admins | ❌ | ✅ |
| Platform settings | ❌ | ✅ |

**Phase 5D scope**: Both `admin` and `super_admin` can perform all rider verification actions.

### IDOR Protections

| Attack Vector | Mitigation |
|---------------|------------|
| Customer → admin routes | Middleware redirects |
| Rider → approve themselves | Service layer: reject if `riderId === adminUserId` |
| Cross-rider data access | Service queries by specific `rider_id`, not bulk |
| Direct API invocation | Middleware + API both verify role |
| Client role manipulation | Server derives role from `auth.uid()` via `get_user_role()` |

---

## 3. Verification Workflow

### State Transitions

```
pending → under_review (when documents submitted)
pending → approved (admin direct approval)
pending → rejected (admin rejection)
under_review → approved (admin approval)
under_review → rejected (admin rejection)
rejected → under_review (rider re-submits documents)
approved → (terminal for verification)
```

### Document-Level Actions

| Action | Behavior |
|--------|----------|
| Approve document | Set `status = 'approved'`, `reviewed_by`, `reviewed_at` |
| Reject document | Set `status = 'rejected'`, `rejection_reason`, `reviewed_by`, `reviewed_at` |
| Approve rider | Set `verification_status = 'approved'`, `verification_notes` |
| Reject rider | Set `verification_status = 'rejected'`, `verification_notes` |

### Re-Review Flow

When a rejected rider re-submits documents:
1. Rider calls `submitDocument()` 
2. System checks: if current status is `rejected`, set to `under_review`
3. Admin can then re-review

**Already implemented** in `rider.service.ts`:
```typescript
// Update rider verification status to under_review if currently pending
await serviceRole
  .from('rider_profiles')
  .update({ verification_status: 'under_review' })
  .eq('id', userId)
  .eq('verification_status', 'pending');
```

**Required change**: Also transition from `rejected` to `under_review`.

---

## 4. API Architecture

### Required Endpoints

#### `GET /api/admin/riders`

**Purpose**: List riders with filtering and pagination.

**Authentication**: Required (authenticated user)
**Authorization**: `admin` or `super_admin` role

**Query Parameters**:
- `status` — Filter by verification_status (`pending`, `under_review`, `approved`, `rejected`)
- `page` — Page number (default: 1)
- `limit` — Items per page (default: 20, max: 50)

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "full_name": "string",
      "phone": "string",
      "verification_status": "pending",
      "verification_notes": "string | null",
      "created_at": "timestamp",
      "documents": [
        {
          "document_type": "government_id",
          "status": "pending"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

**Service Method**: `adminService.listRiders(filters)`

---

#### `GET /api/admin/riders/[id]`

**Purpose**: Get full rider detail for verification review.

**Authentication**: Required
**Authorization**: `admin` or `super_admin` role

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "full_name": "string",
    "phone": "string",
    "verification_status": "pending",
    "verification_notes": "string | null",
    "created_at": "timestamp",
    "profile": {
      "role": "rider",
      "full_name": "string",
      "avatar_url": "string | null"
    },
    "documents": [
      {
        "id": "uuid",
        "document_type": "government_id",
        "file_name": "string",
        "file_url": "string",
        "mime_type": "string",
        "status": "pending",
        "rejection_reason": "string | null",
        "reviewed_by": "uuid | null",
        "reviewed_at": "timestamp | null",
        "created_at": "timestamp"
      }
    ],
    "vehicle": {
      "vehicle_type": "motorcycle",
      "make": "string",
      "model": "string",
      "year": 2024,
      "registration_number": "string"
    },
    "verification_history": [
      {
        "id": "uuid",
        "old_status": "pending",
        "new_status": "under_review",
        "changed_by": "uuid",
        "changed_by_name": "string",
        "reason": "Rider registration",
        "created_at": "timestamp"
      }
    ]
  }
}
```

**Service Method**: `adminService.getRiderDetail(riderId)`

---

#### `POST /api/admin/riders/[id]/verify`

**Purpose**: Approve or reject a rider's verification.

**Authentication**: Required
**Authorization**: `admin` or `super_admin` role

**Request Body**:
```json
{
  "action": "approve" | "reject",
  "reason": "string (required if reject)",
  "notes": "string (optional)"
}
```

**Validation**:
- `action` must be `approve` or `reject`
- `reason` required when `action = 'reject'`
- `reason` max 500 characters
- `notes` max 1000 characters

**Response (approve)**:
```json
{
  "data": {
    "id": "uuid",
    "verification_status": "approved",
    "verification_notes": "string | null"
  }
}
```

**Response (reject)**:
```json
{
  "data": {
    "id": "uuid",
    "verification_status": "rejected",
    "verification_notes": "string | null"
  }
}
```

**Service Method**: `adminService.verifyRider(riderId, action, reason?, notes?)`

**Side Effects**:
1. Update `rider_profiles.verification_status`
2. Update `rider_profiles.verification_notes`
3. Insert `rider_verification_history` record
4. Set `changed_by = auth.uid()`

---

#### `POST /api/admin/riders/[id]/documents/[docId]/verify`

**Purpose**: Approve or reject an individual document.

**Authentication**: Required
**Authorization**: `admin` or `super_admin` role

**Request Body**:
```json
{
  "action": "approve" | "reject",
  "rejection_reason": "string (required if reject)"
}
```

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "status": "approved",
    "rejection_reason": "string | null",
    "reviewed_by": "uuid",
    "reviewed_at": "timestamp"
  }
}
```

**Service Method**: `adminService.verifyDocument(docId, action, rejectionReason?)`

---

## 5. Service Architecture

### New File: `apps/web/lib/services/admin.service.ts`

```typescript
// Admin verification service
// Uses service-role client for cross-user queries
// Verifies admin authorization on every method

export class AdminService {
  // List riders with filters
  async listRiders(filters: { status?: string; page?: number; limit?: number })

  // Get full rider detail
  async getRiderDetail(riderId: string)

  // Approve/reject rider
  async verifyRider(
    riderId: string,
    action: 'approve' | 'reject',
    reason?: string,
    notes?: string
  )

  // Approve/reject individual document
  async verifyDocument(
    docId: string,
    action: 'approve' | 'reject',
    rejectionReason?: string
  )
}
```

### Authorization Pattern

Every method must:
1. Get authenticated user via `supabase.auth.getUser()`
2. Verify user has `admin` or `super_admin` role
3. Reject if not authorized
4. Prevent self-approval (admin cannot approve their own rider profile)

---

## 6. Admin UI Architecture

### Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin` | Layout | Auth guard + navigation |
| `/admin/dashboard` | DashboardPage | Overview (future) |
| `/admin/riders` | RidersPage | Rider verification queue |
| `/admin/riders/[id]` | RiderDetailPage | Rider detail + actions |

### Components

| Component | Purpose |
|-----------|---------|
| `admin-layout.tsx` | Server-side auth guard + branded navigation |
| `rider-queue.tsx` | Filterable rider list with status badges |
| `rider-detail.tsx` | Full rider detail view |
| `document-card.tsx` | Individual document display with actions |
| `verify-actions.tsx` | Approve/reject buttons with confirmation |
| `rejection-dialog.tsx` | Rejection reason form |
| `verification-history.tsx` | Audit trail display |
| `status-badge.tsx` | Reusable status indicator (extend existing) |

### Page Flow

```
/admin/riders
  ↓ (click rider)
/admin/riders/[id]
  ↓ (review documents)
  ↓ (approve/reject)
  ↓ (see verification history)
```

---

## 7. Brand Integration

### Design Tokens (CSS Variables)

Add to `apps/web/app/globals.css`:

```css
@layer base {
  :root {
    /* EMBEE NEXUS Brand Tokens */
    --embee-navy: #0B1220;
    --embee-blue: #147BFF;
    --embee-cyan: #38BDF8;
    --embee-white: #F5F7FA;
    --embee-charcoal: #111827;
    --embee-slate: #64748B;
  }
}
```

### Tailwind Extension

Add to `apps/web/tailwind.config.ts`:

```typescript
colors: {
  embee: {
    navy: '#0B1220',
    blue: '#147BFF',
    cyan: '#38BDF8',
    white: '#F5F7FA',
    charcoal: '#111827',
    slate: '#64748B',
  },
}
```

### UI Design System

| Element | Brand Treatment |
|---------|-----------------|
| **Admin sidebar** | Midnight Navy background, white text |
| **Navigation links** | Embee Blue for active, Slate for inactive |
| **Page background** | Cool White (#F5F7FA) |
| **Cards** | White background, subtle border, minimal shadow |
| **Primary buttons** | Embee Blue (#147BFF) with white text |
| **Secondary buttons** | White with Slate border |
| **Danger actions** | Red destructive color |
| **Status badges** | Text + color (never color alone) |
| **Typography** | Manrope throughout |
| **Headings** | Deep Charcoal (#111827), Bold/ExtraBold |
| **Body text** | Deep Charcoal, Regular |
| **Metadata** | Slate (#64748B) |

### Status Badge Colors

| Status | Background | Text | Label |
|--------|------------|------|-------|
| `pending` | Yellow-100 | Yellow-800 | Pending |
| `under_review` | Blue-100 | Blue-800 | Under Review |
| `approved` | Green-100 | Green-800 | Approved |
| `rejected` | Red-100 | Red-800 | Rejected |

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1024px) | Full sidebar + content |
| Tablet (768-1023px) | Collapsed sidebar, full content |
| Mobile (<768px) | Bottom nav or hamburger, stacked content |

---

## 8. Security/IDOR Analysis

### Threat Matrix

| Threat | Severity | Mitigation | Layer |
|--------|----------|------------|-------|
| Unauthenticated access | Critical | Middleware + API auth check | Both |
| Customer → admin escalation | Critical | Middleware role check | Middleware |
| Rider → admin escalation | Critical | Database role constraint | DB |
| Rider self-approval | High | Service: reject if `riderId === userId` | Service |
| Cross-rider data access | High | Service: query by specific `rider_id` | Service |
| Direct API bypass | High | API independently verifies role | API |
| Client role manipulation | High | Server derives from `auth.uid()` | Service |
| Duplicate verification | Medium | Idempotent: re-approve is safe | Service |
| Audit trail forgery | Medium | Only admins can insert, `changed_by` = auth.uid() | DB + Service |
| Document access | Medium | RLS: admin can read all, rider can read own | DB |
| Race condition | Low | Sequential verification, last-write-wins acceptable | Service |

### Self-Approval Prevention

```typescript
// In adminService.verifyRider():
if (riderId === adminUserId) {
  throw new Error('Cannot verify your own rider profile');
}
```

---

## 9. Audit Trail Design

### Events to Record

| Event | old_status | new_status | changed_by |
|-------|------------|------------|------------|
| Admin approves rider | `pending`/`under_review` | `approved` | admin user ID |
| Admin rejects rider | `pending`/`under_review` | `rejected` | admin user ID |
| Rider re-submits after rejection | `rejected` | `under_review` | rider user ID |

### Audit Record Structure

```sql
INSERT INTO rider_verification_history (
  rider_id,
  old_status,
  new_status,
  changed_by,
  reason,
  metadata
) VALUES (
  riderId,
  oldStatus,
  newStatus,
  auth.uid(),  -- via service role, but we track the actual admin
  reason,
  jsonb_build_object('notes', notes)
);
```

---

## 10. Testing Strategy

### Unit Tests

| Test | Expected |
|------|----------|
| Admin can list riders | ✅ Pass |
| Non-admin cannot list riders | 401/403 |
| Customer cannot list riders | 401/403 |
| Admin can get rider detail | ✅ Pass |
| Admin can approve rider | ✅ Pass |
| Admin can reject rider | ✅ Pass |
| Admin cannot approve themselves | Error |
| Duplicate approval is idempotent | ✅ Pass |
| Rejection requires reason | 400 |
| Audit record created on approval | ✅ Pass |
| Audit record created on rejection | ✅ Pass |

### Integration Tests

| Test | Expected |
|------|----------|
| Full approval workflow | ✅ Pass |
| Full rejection workflow | ✅ Pass |
| Re-review after rejection | ✅ Pass |
| Document-level approval | ✅ Pass |
| Document-level rejection | ✅ Pass |

### Security Tests

| Test | Expected |
|------|----------|
| Unauthenticated → 401 | ✅ Pass |
| Customer → 403 | ✅ Pass |
| Rider → 403 | ✅ Pass |
| Cross-rider IDOR → 403/empty | ✅ Pass |

---

## 11. Dependency Analysis

### New Dependencies Required

**NONE.** All existing dependencies are sufficient:
- `@supabase/supabase-js` — API client
- `zod` — Input validation
- `next` — API routes, layouts
- `react` — UI components
- `tailwindcss` — Styling
- Existing shared types from `@repo/shared`

---

## 12. File-by-File Implementation Plan

### New Files

| File | Purpose |
|------|---------|
| `apps/web/lib/services/admin.service.ts` | Admin verification service |
| `apps/web/app/api/admin/riders/route.ts` | GET: List riders |
| `apps/web/app/api/admin/riders/[id]/route.ts` | GET: Rider detail |
| `apps/web/app/api/admin/riders/[id]/verify/route.ts` | POST: Approve/reject |
| `apps/web/app/api/admin/riders/[id]/documents/[docId]/verify/route.ts` | POST: Document verify |
| `apps/web/app/admin/layout.tsx` | Admin layout with auth guard |
| `apps/web/app/admin/dashboard/page.tsx` | Dashboard placeholder |
| `apps/web/app/admin/riders/page.tsx` | Rider queue page |
| `apps/web/app/admin/riders/[id]/page.tsx` | Rider detail page |
| `apps/web/components/admin/admin-layout.tsx` | Admin sidebar component |
| `apps/web/components/admin/rider-queue.tsx` | Rider list component |
| `apps/web/components/admin/rider-detail.tsx` | Rider detail component |
| `apps/web/components/admin/document-card.tsx` | Document display component |
| `apps/web/components/admin/verify-actions.tsx` | Approve/reject buttons |
| `apps/web/components/admin/rejection-dialog.tsx` | Rejection form dialog |
| `apps/web/components/admin/verification-history.tsx` | Audit trail component |
| `packages/shared/validators/admin.test.ts` | Admin tests |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/app/globals.css` | Add EMBEE NEXUS brand tokens |
| `apps/web/tailwind.config.ts` | Add embee color palette |
| `apps/web/lib/constants.ts` | Update APP_NAME to 'Embee Nexus' |
| `apps/web/components/shared/status-badge.tsx` | Extend with brand colors |

---

## 13. Explicit Database Change Decision

**NO DATABASE CHANGES REQUIRED.**

Justification:
- All tables exist with correct schemas
- All RLS policies exist for admin access
- All audit infrastructure exists
- `get_user_role()` and `has_role()` functions exist
- Middleware admin guard exists

The only application-level change needed is in `rider.service.ts`:
```typescript
// Currently: only transitions from 'pending' to 'under_review'
// Required: also transition from 'rejected' to 'under_review'
.eq('verification_status', 'pending')
// Change to:
.in('verification_status', ['pending', 'rejected'])
```

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| No admin users exist | Cannot test | Create via manual UPDATE |
| No riders exist | Cannot test verification | Register test rider |
| Document URLs may be invalid | UI shows broken images | Handle gracefully, show placeholder |
| `rejected → under_review` transition not implemented | Re-review blocked | Modify existing service method |
| Brand tokens not yet in codebase | Inconsistent styling | Add CSS variables + Tailwind config |

---

## 15. Phase 5D Scope Boundaries

### IN SCOPE

- Admin rider verification queue
- Rider verification detail view
- Document review
- Individual document approve/reject
- Rider approve/reject
- Verification history/audit visibility
- Brand token integration
- Admin navigation
- Tests

### EXPLICITLY DEFERRED

- Admin invite flow
- Bulk operations
- Analytics dashboard
- Customer management
- Order management
- Pricing management
- Advanced search/filter
- Email notifications
- Document preview/viewer
- Admin user management

---

## 16. Implementation Sequence

### Step 1: Brand Tokens
- Add EMBEE NEXUS CSS variables to `globals.css`
- Extend Tailwind config with `embee` colors
- Update `APP_NAME` to 'Embee Nexus'

### Step 2: Admin Service
- Create `admin.service.ts` with authorization checks
- Implement `listRiders()`, `getRiderDetail()`, `verifyRider()`, `verifyDocument()`

### Step 3: Admin APIs
- Create `/api/admin/riders` (GET)
- Create `/api/admin/riders/[id]` (GET)
- Create `/api/admin/riders/[id]/verify` (POST)
- Create `/api/admin/riders/[id]/documents/[docId]/verify` (POST)

### Step 4: Admin UI Components
- Create admin layout with branded navigation
- Create rider queue component
- Create rider detail component
- Create document card component
- Create verify actions component
- Create rejection dialog component
- Create verification history component

### Step 5: Admin Pages
- Create `/admin/layout.tsx`
- Create `/admin/dashboard/page.tsx`
- Create `/admin/riders/page.tsx`
- Create `/admin/riders/[id]/page.tsx`

### Step 6: Fix Re-Review Transition
- Modify `rider.service.ts` to allow `rejected → under_review`

### Step 7: Tests
- Add comprehensive unit/integration tests

### Step 8: Verification
- Typecheck
- Lint
- Unit tests
- Production build
- Security scan
- Attribution scan

---

## 17. Final Recommendation

### Architecture Assessment

| Area | Assessment |
|------|------------|
| Database | ✅ Complete, no changes needed |
| RLS | ✅ Complete, admin policies exist |
| Functions | ✅ Complete, `get_user_role()` exists |
| Middleware | ✅ Complete, admin guard exists |
| Service pattern | ✅ Clear pattern from existing services |
| API pattern | ✅ Clear pattern from existing APIs |
| UI pattern | ✅ Clear pattern from rider layout |
| Brand integration | ✅ Tokens defined, Tailwind extendable |
| Security | ✅ All threats mitigated |
| Scope | ✅ Narrow, well-defined |

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| No admin users | Low | Manual UPDATE |
| No riders | Low | Test registration |
| Re-review transition | Low | Simple service change |

### Recommendation

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

All infrastructure exists. Phase 5D is purely application-layer work with zero database changes. The architecture is sound, the brand integration is clear, and the security model is comprehensive.

---

## Appendix: Production Configuration

### Creating the First Admin User

After Phase 5D is deployed, create an admin user via Supabase Dashboard SQL Editor:

```sql
UPDATE profiles
SET role = 'admin'
WHERE id = '<user-uuid>';
```

**Do not expose this in application code.**

---

**END OF ARCHITECTURE REVIEW**
