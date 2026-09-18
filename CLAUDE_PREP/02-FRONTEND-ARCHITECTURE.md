# EMBEE NEXUS — FRONTEND ARCHITECTURE

**Authority:** LEVEL 1 — Derived from actual codebase inspection
**Date:** September 1, 2026

---

## Framework & Build

| Property | Value |
|----------|-------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Build | `pnpm build` (Turborepo) |
| Package Manager | pnpm (monorepo) |
| Styling | Tailwind CSS |
| Component Library | shadcn/ui (default style) |
| CSS Variables | Yes (HSL-based design tokens) |
| Dark Mode | Supported via `class` strategy |

---

## Application Structure

```
apps/web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Manrope font)
│   ├── page.tsx                  # Homepage
│   ├── globals.css               # Design tokens + Tailwind
│   ├── error.tsx                 # Root error boundary
│   ├── loading.tsx               # Root loading state
│   ├── not-found.tsx             # 404 page
│   ├── login/page.tsx            # Customer login
│   ├── signup/page.tsx           # Customer signup
│   ├── auth/signout/route.ts     # Sign out handler
│   ├── (dashboard)/              # Customer dashboard (route group)
│   │   ├── layout.tsx            # Dashboard layout
│   │   ├── dashboard/page.tsx    # Customer home
│   │   ├── addresses/page.tsx    # Address management
│   │   ├── orders/page.tsx       # Order list
│   │   └── orders/[id]/page.tsx  # Order detail + tracking
│   ├── rider/                    # Rider section
│   │   ├── layout.tsx            # Rider layout
│   │   ├── register/page.tsx     # Rider registration
│   │   ├── onboarding/page.tsx   # Rider onboarding
│   │   └── dashboard/page.tsx    # Rider dashboard
│   ├── admin/                    # Admin section
│   │   ├── layout.tsx            # Admin layout
│   │   ├── dashboard/page.tsx    # Admin dashboard
│   │   ├── orders/page.tsx       # Order management
│   │   ├── orders/[id]/page.tsx  # Order detail
│   │   ├── riders/page.tsx       # Rider list
│   │   ├── riders/[id]/page.tsx  # Rider detail
│   │   └── customers/page.tsx    # Customer list
│   └── api/                      # API routes
│       ├── health/route.ts       # Health check
│       ├── auth/                 # Auth endpoints
│       ├── addresses/            # Address CRUD
│       ├── orders/               # Order + quote + payment
│       ├── payments/             # Payment initialization
│       ├── riders/               # Rider operations
│       ├── admin/                # Admin operations
│       ├── notifications/        # Notification endpoints
│       ├── categories/           # Delivery categories
│       ├── cron/                 # Background jobs
│       └── webhooks/             # External webhooks
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   ├── shared/                   # Shared components
│   ├── addresses/                # Address components
│   ├── booking/                  # Booking flow
│   ├── order/                    # Order management
│   ├── tracking/                 # Tracking + maps
│   ├── rider/                    # Rider components
│   ├── admin/                    # Admin components
│   └── notifications/            # Notification components
├── hooks/                        # Custom React hooks
├── lib/                          # Utilities & services
│   ├── supabase/                 # Supabase clients
│   ├── maps/                     # Map provider abstraction
│   ├── services/                 # Backend service modules
│   ├── notifications/            # Notification system
│   └── utils.ts                  # Utility functions
├── types/                        # TypeScript types
└── public/                       # Static assets (currently empty)
```

---

## Routing Architecture

### Customer Routes (authenticated)
| Route | Page | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | Homepage / marketing |
| `/login` | `login/page.tsx` | Customer login |
| `/signup` | `signup/page.tsx` | Customer signup |
| `/dashboard` | `(dashboard)/dashboard/page.tsx` | Customer home |
| `/addresses` | `(dashboard)/addresses/page.tsx` | Address management |
| `/orders` | `(dashboard)/orders/page.tsx` | Order list |
| `/orders/[id]` | `(dashboard)/orders/[id]/page.tsx` | Order detail + tracking |

### Rider Routes (authenticated)
| Route | Page | Purpose |
|-------|------|---------|
| `/rider/register` | `rider/register/page.tsx` | Rider registration |
| `/rider/onboarding` | `rider/onboarding/page.tsx` | Document upload |
| `/rider/dashboard` | `rider/dashboard/page.tsx` | Rider home + deliveries |

### Admin Routes (authenticated, admin role)
| Route | Page | Purpose |
|-------|------|---------|
| `/admin/dashboard` | `admin/dashboard/page.tsx` | Admin overview |
| `/admin/orders` | `admin/orders/page.tsx` | Order management |
| `/admin/orders/[id]` | `admin/orders/[id]/page.tsx` | Order detail |
| `/admin/riders` | `admin/riders/page.tsx` | Rider management |
| `/admin/riders/[id]` | `admin/riders/[id]/page.tsx` | Rider detail |
| `/admin/customers` | `admin/customers/page.tsx` | Customer list |

---

## Component Architecture

### UI Primitives (shadcn/ui)
- `badge.tsx` — Status badges
- `button.tsx` — Buttons
- `card.tsx` — Cards
- `input.tsx` — Form inputs
- `label.tsx` — Form labels
- `select.tsx` — Select dropdowns
- `status-badge.tsx` — Status indicators

### Shared Components
- `logo.tsx` — Logo (text-based, awaiting SVG asset)
- `app-nav.tsx` — Navigation bar
- `mobile-nav.tsx` — Mobile navigation
- `page-header.tsx` — Page header with title
- `status-badge.tsx` — Status indicator
- `empty-state.tsx` — Empty state display
- `loading-state.tsx` — Loading spinner
- `error-boundary.tsx` — Error boundary

### Feature Components
- **Addresses:** `address-list`, `create-address-form`, `create-address-button`
- **Booking:** `booking-form`, `quote-display`
- **Orders:** `cancel-order-button`, `proof-display`, `rating-form`, `refund-status`
- **Tracking:** `order-tracking`, `tracking-map`, `order-timeline`, `rider-card`
- **Rider:** `rider-dashboard`, `active-delivery-card`, `offer-card`, `availability-toggle`, `earnings-panel`, `delivery-progress-steps`
- **Admin:** `admin-sidebar`, `rider-detail`, `rider-queue`, `document-card`, `verification-history`, `verify-actions`
- **Notifications:** `notification-bell`, `index`

---

## Supabase Integration

### Client Architecture
```
lib/supabase/
├── client.ts          # Browser client (anon key, RLS enforced)
├── server.ts          # Server client (service-role for API routes)
└── middleware.ts       # Middleware client (auth session check)
```

### Auth Flow
1. Middleware checks Supabase session via cookies
2. Unauthenticated users → redirected to `/login`
3. Authenticated users → allowed through
4. Role-based access checked in API routes

### Realtime
- Used for order tracking (customer sees rider location)
- Rider location updates broadcast to customers
- Supabase Realtime channels with authorization

---

## Maps Architecture

```
lib/maps/
├── types.ts           # MapsProvider interface
├── index.ts           # Provider factory
├── stadia.ts          # Stadia Maps implementation
├── mapbox.ts          # Mapbox implementation (unused)
└── google-maps.ts     # Google Maps implementation (unused)
```

**Current Provider:** Stadia Maps
**Provider-Neutral:** Yes — interface-based abstraction

---

## State Management

- **No global state library** (no Redux, Zustand, Jotai)
- React Server Components (RSC) for data fetching
- Client components for interactive UI
- Supabase client for realtime subscriptions
- URL state for filters/pagination

---

## Design System

### CSS Variables (HSL)
```css
--background: 210 20% 98%;       /* Cool White #F5F7FA */
--foreground: 222 47% 11%;       /* Deep Charcoal #111827 */
--primary: 213 94% 53%;          /* Embee Blue #147BFF */
--accent: 199 89% 60%;           /* Digital Cyan #38BDF8 */
--destructive: 0 84% 60%;        /* Red */
--success: 142 71% 45%;          /* Green */
--warning: 38 92% 50%;           /* Amber */
```

### Tailwind Custom Colors
```typescript
embee: {
  navy: '#0B1220',
  blue: '#147BFF',
  cyan: '#38BDF8',
  white: '#F5F7FA',
  charcoal: '#111827',
  slate: '#64748B',
}
```

### Font
- **Family:** Manrope (Google Fonts)
- **Loaded via:** `next/font/google`
- **Subsets:** Latin
