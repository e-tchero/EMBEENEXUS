# EMBEE NEXUS — EXISTING UI INVENTORY

**Authority:** LEVEL 1 — Derived from actual codebase
**Date:** September 1, 2026

---

## Pages

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/` | `app/page.tsx` | EXISTS | Homepage |
| `/login` | `app/login/page.tsx` | EXISTS | Customer login |
| `/signup` | `app/signup/page.tsx` | EXISTS | Customer signup |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | EXISTS | Customer home |
| `/addresses` | `app/(dashboard)/addresses/page.tsx` | EXISTS | Address management |
| `/orders` | `app/(dashboard)/orders/page.tsx` | EXISTS | Order list |
| `/orders/[id]` | `app/(dashboard)/orders/[id]/page.tsx` | EXISTS | Order detail + tracking |
| `/rider/register` | `app/rider/register/page.tsx` | EXISTS | Rider registration |
| `/rider/onboarding` | `app/rider/onboarding/page.tsx` | EXISTS | Rider document upload |
| `/rider/dashboard` | `app/rider/dashboard/page.tsx` | EXISTS | Rider home |
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | EXISTS | Admin overview |
| `/admin/orders` | `app/admin/orders/page.tsx` | EXISTS | Admin order list |
| `/admin/orders/[id]` | `app/admin/orders/[id]/page.tsx` | EXISTS | Admin order detail |
| `/admin/riders` | `app/admin/riders/page.tsx` | EXISTS | Admin rider list |
| `/admin/riders/[id]` | `app/admin/riders/[id]/page.tsx` | EXISTS | Admin rider detail |
| `/admin/customers` | `app/admin/customers/page.tsx` | EXISTS | Admin customer list |

---

## Layouts

| Layout | File | Status | Notes |
|--------|------|--------|-------|
| Root | `app/layout.tsx` | EXISTS | Manrope font, metadata |
| Customer Dashboard | `app/(dashboard)/layout.tsx` | EXISTS | Auth check, nav |
| Rider | `app/rider/layout.tsx` | EXISTS | Auth check, rider nav |
| Admin | `app/admin/layout.tsx` | EXISTS | Auth check, admin sidebar |

---

## Components

### UI Primitives (shadcn/ui)
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Badge | `components/ui/badge.tsx` | EXISTS | Status badges |
| Button | `components/ui/button.tsx` | EXISTS | Primary actions |
| Card | `components/ui/card.tsx` | EXISTS | Content containers |
| Input | `components/ui/input.tsx` | EXISTS | Form inputs |
| Label | `components/ui/label.tsx` | EXISTS | Form labels |
| Select | `components/ui/select.tsx` | EXISTS | Dropdowns |
| Status Badge | `components/ui/status-badge.tsx` | EXISTS | Status indicators |

### Shared
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Logo | `components/shared/logo.tsx` | EXISTS | Text-based (interim) |
| App Nav | `components/shared/app-nav.tsx` | EXISTS | Main navigation |
| Mobile Nav | `components/shared/mobile-nav.tsx` | EXISTS | Mobile navigation |
| Page Header | `components/shared/page-header.tsx` | EXISTS | Page titles |
| Status Badge | `components/shared/status-badge.tsx` | EXISTS | Order/rider status |
| Empty State | `components/shared/empty-state.tsx` | EXISTS | Empty content |
| Loading State | `components/shared/loading-state.tsx` | EXISTS | Loading spinner |
| Error Boundary | `components/shared/error-boundary.tsx` | EXISTS | Error handling |

### Customer — Addresses
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Address List | `components/addresses/address-list.tsx` | EXISTS | Displays saved addresses |
| Create Address Button | `components/addresses/create-address-button.tsx` | EXISTS | Triggers address creation |
| Create Address Form | `components/addresses/create-address-form.tsx` | EXISTS | **UX ISSUE: Requires manual lat/lng** |

### Customer — Booking
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Booking Form | `components/booking/booking-form.tsx` | EXISTS | Multi-step booking flow |
| Quote Display | `components/booking/quote-display.tsx` | EXISTS | Price breakdown |

### Customer — Orders
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Cancel Order Button | `components/order/cancel-order-button.tsx` | EXISTS | Order cancellation |
| Proof Display | `components/order/proof-display.tsx` | EXISTS | Delivery proof (text + photo) |
| Rating Form | `components/order/rating-form.tsx` | EXISTS | Post-delivery rating |
| Refund Status | `components/order/refund-status.tsx` | EXISTS | Refund tracking |

### Customer — Tracking
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Order Tracking | `components/tracking/order-tracking.tsx` | EXISTS | Main tracking view |
| Tracking Map | `components/tracking/tracking-map.tsx` | EXISTS | Map with rider location |
| Order Timeline | `components/tracking/order-timeline.tsx` | EXISTS | Status timeline |
| Rider Card | `components/tracking/rider-card.tsx` | EXISTS | Rider info display |

### Rider
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Rider Dashboard | `components/rider/rider-dashboard.tsx` | EXISTS | Main rider view |
| Active Delivery Card | `components/rider/active-delivery-card.tsx` | EXISTS | Current delivery info |
| Delivery Progress Steps | `components/rider/delivery-progress-steps.tsx` | EXISTS | Step-by-step progress |
| Offer Card | `components/rider/offer-card.tsx` | EXISTS | Delivery offer display |
| Availability Toggle | `components/rider/availability-toggle.tsx` | EXISTS | Online/offline switch |
| Earnings Panel | `components/rider/earnings-panel.tsx` | EXISTS | Earnings summary |

### Admin
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Admin Sidebar | `components/admin/admin-sidebar.tsx` | EXISTS | Admin navigation |
| Rider Detail | `components/admin/rider-detail.tsx` | EXISTS | Rider info view |
| Rider Queue | `components/admin/rider-queue.tsx` | EXISTS | Pending verifications |
| Document Card | `components/admin/document-card.tsx` | EXISTS | Document display |
| Verification History | `components/admin/verification-history.tsx` | EXISTS | Verification log |
| Verify Actions | `components/admin/verify-actions.tsx` | EXISTS | Approve/reject actions |

### Notifications
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Notification Bell | `components/notifications/notification-bell.tsx` | EXISTS | Bell icon + dropdown |
| Index | `components/notifications/index.ts` | EXISTS | Barrel export |

---

## API Routes

| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| POST | `/api/auth/login` | No | — | Customer login |
| POST | `/api/auth/signup` | No | — | Customer signup |
| POST | `/api/auth/signout` | Yes | — | Sign out |
| GET | `/api/health` | No | — | Health check |
| GET/POST | `/api/addresses` | Yes | customer | Address CRUD |
| PUT/DELETE | `/api/addresses/[id]` | Yes | customer | Address update/delete |
| PUT | `/api/addresses/[id]/default` | Yes | customer | Set default address |
| POST | `/api/orders/quote` | Yes | customer | Get delivery quote |
| GET/POST | `/api/orders` | Yes | customer | Order list/create |
| GET | `/api/orders/[id]` | Yes | customer | Order detail |
| POST | `/api/orders/[id]/cancel` | Yes | customer | Cancel order |
| POST | `/api/orders/[id]/proof` | Yes | rider | Submit delivery proof |
| POST | `/api/orders/[id]/proof/photo-url` | Yes | rider | Get signed upload URL |
| POST | `/api/orders/[id]/rating` | Yes | customer | Rate delivery |
| GET | `/api/orders/[id]/refund` | Yes | customer | Check refund status |
| POST | `/api/payments/initialize` | Yes | customer | Initialize payment |
| GET/POST | `/api/riders/profile` | Yes | rider | Rider profile |
| POST | `/api/riders/register` | Yes | — | Rider registration |
| GET/POST | `/api/riders/documents` | Yes | rider | Document upload |
| PUT | `/api/riders/availability` | Yes | rider | Toggle availability |
| PUT | `/api/riders/location` | Yes | rider | Update GPS location |
| GET | `/api/riders/assignments/active` | Yes | rider | Active delivery |
| GET | `/api/riders/offers` | Yes | rider | Pending offers |
| POST | `/api/riders/offers/[id]/accept` | Yes | rider | Accept offer |
| POST | `/api/riders/offers/[id]/reject` | Yes | rider | Reject offer |
| POST | `/api/riders/deliveries/[orderId]/start` | Yes | rider | Start delivery |
| POST | `/api/riders/deliveries/[orderId]/arrive-pickup` | Yes | rider | Arrive at pickup |
| POST | `/api/riders/deliveries/[orderId]/confirm-pickup` | Yes | rider | Confirm pickup |
| POST | `/api/riders/deliveries/[orderId]/arrive-destination` | Yes | rider | Arrive at destination |
| POST | `/api/riders/deliveries/[orderId]/complete` | Yes | rider | Complete delivery |
| POST | `/api/riders/deliveries/[orderId]/fail` | Yes | rider | Mark as failed |
| POST | `/api/riders/deliveries/[orderId]/cancel` | Yes | rider | Cancel delivery |
| POST | `/api/riders/deliveries/[orderId]/proof-upload` | Yes | rider | Upload proof photo |
| GET | `/api/riders/earnings` | Yes | rider | Earnings history |
| GET | `/api/riders/earnings/summary` | Yes | rider | Earnings summary |
| GET | `/api/riders/verification-status` | Yes | rider | Check verification |
| GET/POST | `/api/riders/vehicles` | Yes | rider | Vehicle management |
| GET | `/api/admin/dashboard` | Yes | admin | Admin stats |
| GET | `/api/admin/orders` | Yes | admin | All orders |
| GET/PUT | `/api/admin/orders/[id]` | Yes | admin | Order detail/update |
| POST | `/api/admin/orders/[id]/cancel` | Yes | admin | Admin cancel |
| GET | `/api/admin/riders` | Yes | admin | All riders |
| GET/PUT | `/api/admin/riders/[id]` | Yes | admin | Rider detail/update |
| POST | `/api/admin/riders/[id]/verify` | Yes | admin | Verify rider |
| POST | `/api/admin/riders/[id]/documents/[docId]/verify` | Yes | admin | Verify document |
| GET | `/api/admin/customers` | Yes | admin | All customers |
| GET | `/api/categories` | Yes | — | Delivery categories |
| GET/POST | `/api/notifications` | Yes | — | Notification CRUD |
| PUT | `/api/notifications/[id]/read` | Yes | — | Mark as read |
| POST | `/api/notifications/read-all` | Yes | — | Mark all as read |
| GET | `/api/notifications/unread-count` | Yes | — | Unread count |
| POST | `/api/webhooks/paystack` | No* | — | Paystack webhook |
| POST | `/api/webhooks/resend` | No* | — | Resend webhook |
| GET | `/api/cron/process-jobs` | Yes** | — | Background job processor |

*\* Webhook endpoints verify signatures internally*
*\*\* Cron endpoint uses timing-safe authentication*
