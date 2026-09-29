# EMBEE NEXUS — SECURITY UX BRIEF

**Authority:** LEVEL 1 — Derived from ARCHITECTURE.md + codebase
**Date:** September 1, 2026

---

## Authentication

| Aspect | Implementation |
|--------|---------------|
| Provider | Supabase Auth (GoTrue) |
| Methods | Email/password |
| Session | Cookie-based (httpOnly) |
| Middleware | Session check on all protected routes |
| Redirect | Unauthenticated → `/login` |

### Frontend Auth Rules
- Never store tokens in localStorage
- Never expose service-role keys to client
- Always use Supabase anon key for client-side
- Handle 401 by redirecting to login
- Handle 403 by showing "Access Denied"

---

## Role-Based Access

| Role | Can Access | Cannot Access |
|------|-----------|---------------|
| `customer` | Dashboard, addresses, orders, booking | Rider dashboard, admin panel |
| `rider` | Rider dashboard, deliveries, earnings | Customer dashboard, admin panel |
| `admin` | Admin panel, all data | — |
| `super_admin` | Everything | — |

### Frontend Role Rules
- Never trust client-side role checks alone
- Server validates role on every API call
- UI should hide unavailable features based on role
- Navigation should be role-appropriate

---

## Data Ownership

| Data | Owner | Can Read | Can Modify |
|------|-------|----------|------------|
| Customer profile | Customer | Customer, Admin | Customer (limited), Admin |
| Addresses | Customer | Customer only | Customer only |
| Orders (customer) | Customer | Customer, Admin | Customer (cancel only) |
| Orders (rider) | Rider | Rider, Admin | Rider (status updates) |
| Rider profile | Rider | Rider, Admin | Rider, Admin (verification) |
| Earnings | Rider | Rider, Admin | System only |
| Notifications | User | Owner only | Owner (mark as read) |
| Delivery proofs | System | Customer (own orders), Admin | System only |

---

## Sensitive Data Rules

### NEVER Display to Customer
- Supabase service-role keys
- Paystack secret keys
- Resend API keys
- Database connection strings
- Internal system IDs (use public identifiers)
- Other customers' data
- Rider's personal phone number (use masked or in-app messaging)

### NEVER Expose in Client Bundle
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `RESEND_API_KEY`
- Any `NEXT_PUBLIC_*` that shouldn't be public

### Safe to Display
- Order number
- Tracking code
- Estimated delivery time
- Price breakdown
- Rider first name
- Vehicle type
- Rating

---

## Webhook Security

| Webhook | Verification | Notes |
|---------|-------------|-------|
| Paystack | HMAC-SHA512 signature | Raw body verification |
| Resend | Svix signature | Raw body verification |

### Frontend Implications
- Webhook endpoints are server-only
- No frontend interaction with webhooks
- Payment status updates come via polling or realtime

---

## Input Validation

### Client-Side
- Form validation (required fields, formats)
- Phone number format
- Email format
- Address completeness
- Package weight/dimensions

### Server-Side (Authoritative)
- All API routes validate input
- UUID format validation
- Authorization checks
- State machine validation
- Rate limiting

---

## Error Messages

### Safe Error Messages
- "Invalid email or password" (don't reveal which)
- "Address not found"
- "Payment failed — please try again"
- "This order cannot be cancelled"

### Unsafe Error Messages (NEVER SHOW)
- Database error details
- Stack traces
- Internal service errors
- API key validation failures
- SQL query errors

---

## Rate Limiting

- In-memory sliding window rate limiter
- Applied to all API routes
- Returns 429 Too Many Requests
- Frontend should handle gracefully with retry UI

---

## What Claude Should Design

1. **Login/Signup Forms** — Clean, trustworthy, minimal
2. **Error States** — User-friendly, non-technical
3. **Loading States** — Don't reveal data before auth
4. **Role-Based Navigation** — Show only relevant features
5. **Sensitive Data Handling** — Never display what shouldn't be shown
6. **Session Expiry** — Graceful handling when session expires
7. **Mobile Security** — Touch targets, no accidental actions
