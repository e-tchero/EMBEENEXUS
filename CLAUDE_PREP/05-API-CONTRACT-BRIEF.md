# EMBEE NEXUS — API CONTRACT BRIEF

**Authority:** LEVEL 1 — Derived from actual API routes + ARCHITECTURE.md
**Date:** September 1, 2026

---

## Authentication

All authenticated endpoints use Supabase Auth. The frontend must:
1. Include Supabase session cookies in requests
2. Handle 401 responses by redirecting to login
3. Handle 403 responses by showing authorization errors

---

## Customer APIs

### Addresses

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/addresses` | GET | — | `{ addresses: Address[] }` |
| `/api/addresses` | POST | `{ label, street_address, city, state, latitude, longitude }` | `{ address: Address }` |
| `/api/addresses/[id]` | PUT | `{ label?, street_address?, city?, state?, latitude?, longitude? }` | `{ address: Address }` |
| `/api/addresses/[id]` | DELETE | — | `{ success: true }` |
| `/api/addresses/[id]/default` | PUT | — | `{ success: true }` |

### Orders

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/orders` | GET | `?page=&limit=` | `{ orders: Order[], total: number }` |
| `/api/orders` | POST | `{ pickup_address_id, destination_address_id, category_id, package_description, package_weight_kg?, quantity?, urgency_level? }` | `{ order: Order }` |
| `/api/orders/[id]` | GET | — | `{ order: Order }` |
| `/api/orders/[id]/cancel` | POST | `{ reason? }` | `{ order: Order }` |

### Quotes

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/orders/quote` | POST | `{ pickup_latitude, pickup_longitude, destination_latitude, destination_longitude, category_id, weight_kg?, urgency_level? }` | `{ quote: Quote }` |

### Payments

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/payments/initialize` | POST | `{ order_id }` | `{ authorization_url, access_code, reference }` |

### Ratings

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/orders/[id]/rating` | POST | `{ rating: 1-5, comment? }` | `{ rating: Rating }` |

### Delivery Proof

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/orders/[id]/proof` | GET | — | `{ proof: Proof }` |
| `/api/orders/[id]/proof` | POST | `{ text, photo_url? }` | `{ proof: Proof }` |
| `/api/orders/[id]/proof/photo-url` | POST | `{ filename, content_type }` | `{ signed_url, storage_path }` |

### Refunds

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/orders/[id]/refund` | GET | — | `{ refund: Refund }` |

---

## Rider APIs

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/riders/register` | POST | `{ full_name, phone, vehicle_type, ... }` | `{ rider: RiderProfile }` |
| `/api/riders/profile` | GET | — | `{ rider: RiderProfile }` |
| `/api/riders/profile` | PUT | `{ ... }` | `{ rider: RiderProfile }` |
| `/api/riders/documents` | GET | — | `{ documents: Document[] }` |
| `/api/riders/documents` | POST | `{ document_type, file_url }` | `{ document: Document }` |
| `/api/riders/availability` | PUT | `{ is_available: boolean }` | `{ rider: RiderProfile }` |
| `/api/riders/location` | PUT | `{ latitude, longitude, heading?, speed?, accuracy? }` | `{ success: true }` |
| `/api/riders/assignments/active` | GET | — | `{ assignment: Assignment \| null }` |
| `/api/riders/offers` | GET | — | `{ offers: Offer[] }` |
| `/api/riders/offers/[id]` | GET | — | `{ offer: Offer }` |
| `/api/riders/offers/[id]/accept` | POST | — | `{ assignment: Assignment }` |
| `/api/riders/offers/[id]/reject` | POST | `{ reason? }` | `{ success: true }` |
| `/api/riders/deliveries/[orderId]/start` | POST | — | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/arrive-pickup` | POST | — | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/confirm-pickup` | POST | — | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/arrive-destination` | POST | — | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/complete` | POST | `{ text, photo_url? }` | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/fail` | POST | `{ reason }` | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/cancel` | POST | `{ reason }` | `{ order: Order }` |
| `/api/riders/deliveries/[orderId]/proof-upload` | POST | `{ filename, content_type }` | `{ signed_url }` |
| `/api/riders/earnings` | GET | `?page=&limit=` | `{ earnings: Earning[], total: number }` |
| `/api/riders/earnings/summary` | GET | — | `{ total_earnings, total_deliveries, ... }` |
| `/api/riders/verification-status` | GET | — | `{ status, notes? }` |
| `/api/riders/vehicles` | GET | — | `{ vehicles: Vehicle[] }` |
| `/api/riders/vehicles` | POST | `{ vehicle_type, make?, model?, ... }` | `{ vehicle: Vehicle }` |

---

## Admin APIs

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/admin/dashboard` | GET | — | `{ stats: DashboardStats }` |
| `/api/admin/orders` | GET | `?page=&limit=&status=` | `{ orders: Order[], total: number }` |
| `/api/admin/orders/[id]` | GET | — | `{ order: Order }` |
| `/api/admin/orders/[id]` | PUT | `{ status?, notes? }` | `{ order: Order }` |
| `/api/admin/orders/[id]/cancel` | POST | `{ reason }` | `{ order: Order }` |
| `/api/admin/riders` | GET | `?page=&limit=&status=` | `{ riders: Rider[], total: number }` |
| `/api/admin/riders/[id]` | GET | — | `{ rider: RiderDetail }` |
| `/api/admin/riders/[id]` | PUT | `{ verification_status?, notes? }` | `{ rider: Rider }` |
| `/api/admin/riders/[id]/verify` | POST | `{ status, notes? }` | `{ rider: Rider }` |
| `/api/admin/riders/[id]/documents/[docId]/verify` | POST | `{ status, notes? }` | `{ document: Document }` |
| `/api/admin/customers` | GET | `?page=&limit=` | `{ customers: Customer[], total: number }` |

---

## Notification APIs

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/notifications` | GET | `?page=&limit=` | `{ notifications: Notification[], total: number }` |
| `/api/notifications/[id]/read` | PUT | — | `{ notification: Notification }` |
| `/api/notifications/read-all` | POST | — | `{ success: true }` |
| `/api/notifications/unread-count` | GET | — | `{ count: number }` |

---

## Public APIs

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/health` | GET | — | `{ status: "healthy", ... }` |
| `/api/categories` | GET | — | `{ categories: Category[] }` |

---

## Webhook APIs (External)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/webhooks/paystack` | POST | Signature verification | Payment events |
| `/api/webhooks/resend` | POST | Signature verification | Email delivery events |

---

## Background Jobs

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/cron/process-jobs` | GET | Timing-safe auth | Process background jobs |

---

## Common Response Patterns

### Success
```json
{ "data": { ... } }
// or
{ "order": { ... } }
// or
{ "success": true }
```

### Error
```json
{ "error": "Human-readable error message" }
// HTTP status: 400, 401, 403, 404, 500
```

### Pagination
```json
{
  "orders": [...],
  "total": 42,
  "page": 1,
  "limit": 20
}
```
