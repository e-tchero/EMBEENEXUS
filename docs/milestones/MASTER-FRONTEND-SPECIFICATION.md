# EMBEE NEXUS — MASTER FRONTEND SPECIFICATION

**Document Status:** Authoritative frontend specification
**Date:** September 1, 2026
**Authority:** LEVEL 1 — Governs all frontend implementation
**Repository HEAD:** `640af0db62377619b5fe2e981514eadb38e4793a`

---

## TABLE OF CONTENTS

1. Executive Summary
2. Authority Hierarchy
3. Route Inventory
4. Page Inventory
5. Component Architecture
6. Design System
7. Color Accessibility
8. Customer Experience
9. Rider Experience
10. Admin Experience
11. Location & Map Architecture
12. Order State Machine
13. Navigation Architecture
14. States — Mandatory
15. Accessibility Specification
16. Responsive System
17. Homepage Specification
18. Notification UX
19. Tracking UX
20. Empty / Loading / Error Design
21. Security UX
22. Performance
23. SEO
24. Implementation Boundaries
25. Implementation Order
26. File-Level Implementation Map
27. Testing Specification
28. UUPM Reconciliation Table
29. Design Decision Register
30. Risks
31. Final Acceptance Criteria

---

## 1. EXECUTIVE SUMMARY

This document is the **authoritative master specification** for the Embee Nexus frontend redesign. It governs all frontend implementation decisions and must be followed precisely.

### What This Specification Covers

- Complete route, page, and component inventory
- Design system (colors, typography, spacing, elevation, motion)
- Customer, rider, and admin experience specifications
- Location and map architecture
- Order state machine mapping to UI
- Navigation architecture (mobile + desktop)
- Mandatory state definitions (loading, empty, error, etc.)
- Accessibility (WCAG 2.2 AA)
- Responsive behavior (375px → 1440px+)
- Performance requirements
- File-level implementation plan

### What This Specification Does NOT Cover

- Backend changes (marked as `BACKEND GAP` where applicable)
- Database migrations
- API design changes
- Figma design files
- Business decisions (marked as `PRODUCT DECISION REQUIRED`)

---

## 2. AUTHORITY HIERARCHY

All frontend decisions must follow this order:

```
1. Product requirements
2. Security requirements
3. Backend/API contracts
4. Database/state-machine contracts
5. Existing EMBEE brand system
6. Existing UX/product specifications
7. Existing frontend architecture
8. UI UX Pro Max recommendations
9. Implementation preferences
```

**If UI UX Pro Max conflicts with an authoritative EMBEE requirement: EMBEE wins.**

---

## 3. ROUTE INVENTORY

### Public Routes

| Route | File | Purpose | Auth |
|-------|------|---------|------|
| `/` | `app/page.tsx` | Homepage / marketing | No |
| `/login` | `app/login/page.tsx` | Customer login | No |
| `/signup` | `app/signup/page.tsx` | Customer signup | No |
| `/rider/register` | `app/rider/register/page.tsx` | Rider registration | No |

### Customer Routes (authenticated)

| Route | File | Purpose | Auth |
|-------|------|---------|------|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Customer home | Yes (customer) |
| `/addresses` | `app/(dashboard)/addresses/page.tsx` | Address management | Yes (customer) |
| `/orders` | `app/(dashboard)/orders/page.tsx` | Order list | Yes (customer) |
| `/orders/[id]` | `app/(dashboard)/orders/[id]/page.tsx` | Order detail + tracking | Yes (customer) |

### Rider Routes (authenticated)

| Route | File | Purpose | Auth |
|-------|------|---------|------|
| `/rider/onboarding` | `app/rider/onboarding/page.tsx` | Document upload | Yes (rider) |
| `/rider/dashboard` | `app/rider/dashboard/page.tsx` | Rider home + deliveries | Yes (rider) |

### Admin Routes (authenticated, admin role)

| Route | File | Purpose | Auth |
|-------|------|---------|------|
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | Admin overview | Yes (admin) |
| `/admin/orders` | `app/admin/orders/page.tsx` | Order management | Yes (admin) |
| `/admin/orders/[id]` | `app/admin/orders/[id]/page.tsx` | Admin order detail | Yes (admin) |
| `/admin/riders` | `app/admin/riders/page.tsx` | Rider management | Yes (admin) |
| `/admin/riders/[id]` | `app/admin/riders/[id]/page.tsx` | Rider detail | Yes (admin) |
| `/admin/customers` | `app/admin/customers/page.tsx` | Customer list | Yes (admin) |

### Error Routes

| Route | File | Purpose |
|-------|------|---------|
| `/error` | `app/error.tsx` | Root error boundary |
| `/not-found` | `app/not-found.tsx` | 404 page |
| `/loading` | `app/loading.tsx` | Root loading state |

---

## 4. PAGE INVENTORY

### Component Action Matrix

| Component | Action | Reason |
|-----------|--------|--------|
| `logo.tsx` | REPLACE | Text fallback needs actual SVG logo assets |
| `app-nav.tsx` | IMPROVE | Add notification count, visual polish |
| `mobile-nav.tsx` | REPLACE | Convert to bottom tab navigation |
| `page-header.tsx` | KEEP | Clean, functional |
| `status-badge.tsx` | IMPROVE | Add more status colors, animations |
| `empty-state.tsx` | IMPROVE | Add illustrations, better actions |
| `loading-state.tsx` | REPLACE | Convert to skeleton screens |
| `error-boundary.tsx` | KEEP | Functional |
| `create-address-form.tsx` | REPLACE | Remove lat/lng, add search + map |
| `address-list.tsx` | IMPROVE | Add visual cards, swipe actions |
| `booking-form.tsx` | IMPROVE | Add progress indicator, better UX |
| `quote-display.tsx` | IMPROVE | Add visual breakdown, animations |
| `tracking-map.tsx` | IMPROVE | Make more prominent, add controls |
| `order-tracking.tsx` | IMPROVE | Redesign around map + status |
| `order-timeline.tsx` | IMPROVE | Add animations, better visual |
| `rider-card.tsx` | IMPROVE | Add rating, vehicle info |
| `offer-card.tsx` | IMPROVE | Larger touch targets, countdown |
| `active-delivery-card.tsx` | IMPROVE | Better progress visualization |
| `delivery-progress-steps.tsx` | IMPROVE | Add animations, visual feedback |
| `earnings-panel.tsx` | IMPROVE | Add charts, trends |
| `admin-sidebar.tsx` | IMPROVE | Add collapse, active states |
| `notification-bell.tsx` | IMPROVE | Add dropdown panel |

### New Components Required

| Component | Purpose | Priority |
|-----------|---------|----------|
| `CustomerBottomNav` | Mobile customer navigation | MUST |
| `RiderBottomNav` | Mobile rider navigation | MUST |
| `AddressSearch` | Search + autocomplete + map | MUST |
| `LocationPicker` | Map pin selection | MUST |
| `BookingProgress` | Multi-step progress indicator | MUST |
| `SkeletonCard` | Card skeleton loader | MUST |
| `SkeletonList` | List skeleton loader | MUST |
| `Toast` | Success/error notifications | MUST |
| `BottomSheet` | Mobile action sheets | SHOULD |
| `ConfirmationDialog` | Destructive action confirm | MUST |
| `StatCard` | Dashboard statistic card | SHOULD |
| `NotificationPanel` | Notification dropdown | MUST |
| `NotificationItem` | Notification list item | MUST |

---

## 5. COMPONENT ARCHITECTURE

### Foundation Layer

```
FOUNDATION
├── Button (Primary, Secondary, Destructive, Ghost; sm, md, lg)
├── Input (Text, Password, Email, Phone, Number, Search)
├── Select (Single, Multi)
├── Checkbox
├── Radio
├── Switch
├── Badge (Success, Warning, Error, Info, Neutral; sm, md)
├── Avatar (Image, Initials, Icon)
├── Spinner (sm, md, lg)
├── Skeleton (Rectangle, Circle, Text)
└── Tooltip
```

### Feedback Layer

```
FEEDBACK
├── Toast (Success, Error, Warning, Info)
├── Alert (Error, Warning, Success, Info)
├── Dialog (Confirmation, Destructive, Information)
├── Sheet (bottom sheet for mobile)
├── ErrorState (Page-level, Section-level, Inline)
├── EmptyState (With illustration, Minimal)
└── LoadingState (Skeleton screen, Spinner, Progress bar)
```

### Navigation Layer

```
NAVIGATION
├── CustomerTopNav (desktop)
├── CustomerBottomNav (mobile) — NEW
├── RiderTopNav (desktop)
├── RiderBottomNav (mobile) — NEW
├── AdminSidebar (desktop)
├── AdminMobileNav (mobile) — NEW
└── Pagination
```

### Delivery Layer

```
DELIVERY
├── AddressSearch — NEW (search + autocomplete)
├── LocationPicker — NEW (map + pin)
├── MapContainer — NEW (reusable map wrapper)
├── AddressCard
├── AddressList
├── QuoteCard
├── BookingProgress — NEW (step indicator)
├── BookingForm
├── OrderCard
├── OrderTimeline
├── DeliveryStatus
├── TrackingMap
├── RiderCard
├── OfferCard
├── ActiveDeliveryCard
├── DeliveryProgressSteps
├── ProofOfDelivery
├── RatingForm
└── RefundStatus
```

### Admin Layer

```
ADMIN
├── DashboardMetric — NEW (stat card)
├── Chart — NEW (data visualization)
├── DataTable — NEW (sortable table)
├── OrderTable
├── RiderTable
├── CustomerTable
├── VerificationPanel
├── DocumentCard
├── VerificationHistory
└── VerifyActions
```

---

## 6. DESIGN SYSTEM

### 6.1 Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Embee Blue | `#147BFF` | Primary brand, CTAs, active states |
| Digital Cyan | `#38BDF8` | Accents, highlights, "NEXUS" |
| Embee Navy | `#0B1220` | Dark backgrounds, hero |
| Embee Charcoal | `#111827` | Primary text |
| Embee Slate | `#64748B` | Secondary text, muted |
| Embee White | `#F5F7FA` | Light backgrounds |

### 6.2 Semantic Color Tokens (Light Mode)

| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| `--background` | `210 20% 98%` | `#F5F7FA` | Page background |
| `--foreground` | `222 47% 11%` | `#111827` | Primary text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card background |
| `--primary` | `213 94% 53%` | `#147BFF` | Primary actions |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `210 40% 96%` | `#F1F5F9` | Secondary actions |
| `--muted` | `210 40% 96%` | `#F1F5F9` | Muted backgrounds |
| `--muted-foreground` | `215 16% 47%` | `#94A3B8` | Muted text |
| `--accent` | `199 89% 60%` | `#38BDF8` | Accent elements |
| `--destructive` | `0 84% 60%` | `#EF4444` | Errors, delete |
| `--success` | `142 71% 45%` | `#22C55E` | Success states |
| `--warning` | `38 92% 50%` | `#F59E0B` | Warning states |
| `--border` | `214 32% 91%` | `#E2E8F0` | Borders |
| `--ring` | `213 94% 53%` | `#147BFF` | Focus rings |

### 6.3 Typography

**Font Family:** Manrope (Google Fonts)

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display` | 36px | 800 | 1.2 | Hero headline |
| `h1` | 30px | 700 | 1.25 | Page title |
| `h2` | 24px | 700 | 1.3 | Section heading |
| `h3` | 20px | 600 | 1.35 | Card title |
| `h4` | 18px | 600 | 1.4 | Sub-card title |
| `body` | 16px | 400 | 1.5 | Body text |
| `body-small` | 14px | 400 | 1.5 | Secondary text |
| `caption` | 12px | 500 | 1.4 | Labels, metadata |
| `button` | 16px | 600 | 1.25 | Button text |
| `numeric` | 16px | 500 | 1.5 | Prices, counts (tabular-nums) |

### 6.4 Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing |
| `space-2` | 8px | Compact spacing |
| `space-3` | 12px | Default spacing |
| `space-4` | 16px | Comfortable spacing |
| `space-6` | 24px | Spacious spacing |
| `space-8` | 32px | Section gap |
| `space-12` | 48px | Major section gap |
| `space-16` | 64px | Page-level gap |

### 6.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Badges, tags |
| `radius-md` | 8px | Cards, inputs, buttons |
| `radius-lg` | 12px | Modals, panels |
| `radius-full` | 9999px | Avatars, pills |

### 6.6 Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-none` | none | Flat elements |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Cards at rest |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.07)` | Card hover, dropdowns |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Elevated panels |
| `shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Modals, overlays |

### 6.7 Motion

| Token | Value | Usage |
|-------|-------|-------|
| `duration-fast` | 150ms | Hover, focus |
| `duration-normal` | 200ms | Transitions |
| `duration-slow` | 300ms | Page transitions |
| `easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing |
| `easing-out` | `cubic-bezier(0, 0, 0.2, 1)` | Enter animations |

**Reduced Motion:** All animations respect `prefers-reduced-motion: reduce`.

---

## 7. COLOR ACCESSIBILITY

### WCAG 2.2 AA Compliance

| Combination | Contrast Ratio | Pass/Fail |
|-------------|---------------|-----------|
| `#147BFF` on `#FFFFFF` | 4.56:1 | ✅ PASS (large text) |
| `#0C5ED9` on `#FFFFFF` | 7.12:1 | ✅ PASS (all text) |
| `#111827` on `#FFFFFF` | 17.37:1 | ✅ PASS |
| `#64748B` on `#FFFFFF` | 4.65:1 | ✅ PASS |
| `#FFFFFF` on `#147BFF` | 4.56:1 | ✅ PASS (large text) |
| `#FFFFFF` on `#0B1220` | 17.37:1 | ✅ PASS |
| `#38BDF8` on `#0B1220` | 9.72:1 | ✅ PASS |
| `#22C55E` on `#FFFFFF` | 2.85:1 | ❌ FAIL (use dark text) |
| `#F59E0B` on `#FFFFFF` | 2.14:1 | ❌ FAIL (use dark text) |

### Rule

For text-bearing controls with `#147BFF` background:
- **Large text (≥18px bold or ≥24px):** `#FFFFFF` is acceptable
- **Small text:** Use `#0C5ED9` background OR `#FFFFFF` on `#0C5ED9`

For status badges:
- Success badge: `#22C55E` background + `#052E16` text
- Warning badge: `#F59E0B` background + `#451A03` text

---

## 8. CUSTOMER EXPERIENCE

### 8.1 Complete Customer Journey

```
Landing Page → Auth → Dashboard → Address Management → New Booking
    → Step 1: Select Pickup → Step 2: Select Destination
    → Step 3: Package Details → Step 4: Review Quote → Step 5: Payment
    → Order Confirmed → Dispatch → Rider Assigned → Live Tracking
    → Delivery Proof → Rating → Order History
```

### 8.2 Screen Specifications

#### Homepage (`/`)
- **Purpose:** Marketing landing — convert visitors to signups
- **Primary CTA:** "Send a Package" → `/signup`
- **Secondary CTA:** "Become a Rider" → `/rider/register`
- **Sections:** Hero → How It Works → Features → For Riders → Trust → CTA → Footer

#### Login (`/login`)
- **Fields:** Email, Password
- **Primary CTA:** "Sign in"
- **Loading:** Button spinner
- **Error:** Inline error message
- **Success:** Redirect to `/dashboard`

#### Signup (`/signup`)
- **Fields:** Full name, Email, Password, Confirm password
- **Primary CTA:** "Create account"
- **Loading:** Button spinner
- **Error:** Inline field errors
- **Success:** Redirect to `/dashboard`

#### Dashboard (`/dashboard`)
- **Content:** Welcome message, recent orders, quick actions
- **Primary CTA:** "New Delivery"
- **Empty state:** "No deliveries yet" + action button
- **Loading:** Skeleton cards

#### Addresses (`/addresses`)
- **Content:** List of saved addresses with edit/delete
- **Primary CTA:** "Add Address"
- **CRITICAL:** Address creation must use search + map + pin (NOT manual lat/lng)

#### Add/Edit Address
- **Step 1:** Search for location (autocomplete)
- **Step 2:** Confirm on map (interactive pin)
- **Step 3:** Confirm address details (Label, Street, City, State, Landmark, Instructions)
- **Step 4:** Save
- **Backend:** POST `/api/addresses` with `{ label, street_address, city, state, latitude, longitude }`
- **CRITICAL:** Latitude/longitude auto-resolved from search/map, NEVER manually entered

#### Order List (`/orders`)
- **Content:** Order cards with status, date, pickup/destination
- **Empty state:** "No deliveries yet" + action button
- **Loading:** Skeleton cards

#### Order Detail (`/orders/[id]`)
- **Content:** Order info, status timeline, tracking map, rider info, actions
- **Loading:** Skeleton layout
- **Responsive:** Mobile: stacked. Desktop: side-by-side (map + info)

---

## 9. RIDER EXPERIENCE

### 9.1 Complete Rider Journey

```
Registration → Onboarding (Document Upload) → Verification Pending
    → Approved → Dashboard → Availability Toggle → Receive Offer
    → Accept/Reject → Active Delivery → Pickup → Transit → Proof
    → Completed → Earnings Updated
```

### 9.2 Screen Specifications

#### Rider Dashboard (`/rider/dashboard`)
- **Primary element:** Availability toggle (prominent)
- **Secondary:** Active delivery card, offer cards, earnings summary
- **Empty state:** "Waiting for offers..."
- **Loading:** Skeleton cards

#### Offer Card
- **Content:** Pickup, destination, distance, payment, countdown
- **Actions:** Accept (green), Reject (outline)
- **Timer:** Countdown with color change (green → yellow → red)
- **Touch targets:** ≥ 44px

#### Active Delivery Card
- **Content:** Progress steps, pickup/destination, next action button
- **Actions:** Context-dependent (Start, Arrive, Pickup, Complete, etc.)

---

## 10. ADMIN EXPERIENCE

### 10.1 Screen Specifications

#### Admin Dashboard (`/admin/dashboard`)
- **Content:** Total orders, active deliveries, revenue, rider count
- **Loading:** Skeleton stat cards

#### Admin Orders (`/admin/orders`)
- **Content:** Sortable table with filters
- **Filters:** Status, date range, customer
- **Pagination:** Server-side

#### Admin Riders (`/admin/riders`)
- **Content:** Sortable table with filters
- **Filters:** Verification status, city

#### Admin Rider Detail (`/admin/riders/[id]`)
- **Content:** Profile info, documents, verification status
- **Actions:** Verify rider, verify/reject documents
- **Confirmation:** Destructive actions require confirmation dialog

---

## 11. LOCATION & MAP ARCHITECTURE

### 11.1 Provider Architecture

```
lib/maps/
├── types.ts           # MapsProvider interface (abstract)
├── index.ts           # Provider factory
├── stadia.ts          # Stadia Maps implementation (CURRENT)
├── mapbox.ts          # Mapbox (UNUSED)
└── google-maps.ts     # Google Maps (UNUSED)
```

**Provider-Neutral:** Yes — interface-based abstraction
**Current Provider:** Stadia Maps
**DO NOT REPLACE** with Mapbox or Google Maps

### 11.2 Address Creation UX (CRITICAL REDESIGN)

**Current (UNACCEPTABLE):**
```
Manual latitude entry: [____]
Manual longitude entry: [____]
```

**Required (NEW):**
```
Step 1: Search for location
    └── Autocomplete search input
    └── Search results list
    └── "Use my current location" button

Step 2: Confirm on map
    └── Interactive map with draggable pin
    └── Pin automatically placed at selected location

Step 3: Confirm address details
    └── Resolved address (from reverse geocoding)
    └── Label (Home/Work/Other)
    └── Street Address (pre-filled, editable)
    └── City (pre-filled, editable)
    └── State (pre-filled, editable)
    └── Landmark (optional)
    └── Delivery Instructions (optional)

Step 4: Save
    └── POST /api/addresses with auto-resolved coordinates
```

### 11.3 Coordinate Flow

```
Customer searches address
    → MapsProvider.searchAddresses(query)
    → Results displayed
    → Customer selects result
    → MapsProvider.geocode(address) → { lat, lng }
    → Map displays with pin
    → Customer confirms/adjusts pin
    → MapsProvider.reverseGeocode(lat, lng) → resolved address
    → Customer confirms details
    → POST /api/addresses { street_address, city, state, latitude, longitude }
```

---

## 12. ORDER STATE MACHINE

### 12.1 State → UI Mapping

| Order State | Customer UI | Rider UI | Status Badge |
|-------------|-------------|----------|--------------|
| `draft` | Booking form | — | Gray |
| `pending_payment` | Payment prompt | — | Amber |
| `paid` | "Searching for rider..." | — | Blue |
| `searching_rider` | "Finding rider..." | — | Blue (pulse) |
| `rider_assigned` | Tracking map + ETA | Active delivery card | Blue |
| `rider_en_route_to_pickup` | Tracking map + ETA | "Heading to pickup" | Blue |
| `arrived_at_pickup` | "Rider at pickup" | "Confirm pickup" button | Cyan |
| `picked_up` | "Package picked up" | "In transit" button | Cyan |
| `in_transit` | Tracking map + ETA | "Arrived at destination" button | Blue |
| `arrived_at_destination` | "Rider at destination" | "Submit proof" button | Green |
| `delivered` | "Delivery complete" + Rate | "Completed" | Green |
| `completed` | "Order complete" + Rating | "Completed" | Green (solid) |
| `cancelled` | "Order cancelled" + Refund | "Cancelled" | Red |
| `failed` | "Delivery failed" + Support | "Failed" | Red |
| `expired` | "No rider found" + Rebook | — | Gray |

### 12.2 Allowed Customer Actions

| State | Can Cancel | Can Rate | Can View Tracking |
|-------|-----------|----------|-------------------|
| `draft` | ✅ | ❌ | ❌ |
| `pending_payment` | ✅ | ❌ | ❌ |
| `paid` | ✅ | ❌ | ❌ |
| `searching_rider` | ✅ | ❌ | ❌ |
| `rider_assigned` | ✅ | ❌ | ✅ |
| `rider_en_route_to_pickup` | ✅ | ❌ | ✅ |
| `arrived_at_pickup` | ❌ | ❌ | ✅ |
| `picked_up` | ❌ | ❌ | ✅ |
| `in_transit` | ❌ | ❌ | ✅ |
| `arrived_at_destination` | ❌ | ❌ | ✅ |
| `delivered` | ❌ | ❌ | ✅ |
| `completed` | ❌ | ✅ | ✅ |

---

## 13. NAVIGATION ARCHITECTURE

### 13.1 Customer Navigation

#### Mobile (0–639px): Bottom Tab Bar

| Tab | Icon | Route | Badge |
|-----|------|-------|-------|
| Home | House | `/dashboard` | — |
| Orders | Package | `/orders` | Order count |
| New Delivery | Plus (FAB) | booking | — |
| Notifications | Bell | notifications | Unread count |
| Profile | User | profile | — |

**Minimum touch target:** 44 × 44 px
**Active state:** Embee Blue icon + label

#### Desktop (1024px+): Top Navigation Bar

| Element | Position | Content |
|---------|----------|---------|
| Logo | Left | EMBEE NEXUS wordmark |
| Links | Center | Dashboard, Addresses, Orders |
| Notifications | Right | Bell + unread count |
| User | Right | Name + Sign out |

### 13.2 Rider Navigation

#### Mobile: Bottom Tab Bar

| Tab | Icon | Route |
|-----|------|-------|
| Dashboard | House | `/rider/dashboard` |
| Offers | Gift | `/rider/offers` |
| Deliveries | Truck | `/rider/deliveries` |
| Earnings | Wallet | `/rider/earnings` |
| Profile | User | `/rider/profile` |

### 13.3 Admin Navigation

#### Desktop: Sidebar

| Section | Items |
|---------|-------|
| Overview | Dashboard |
| Operations | Orders, Riders, Customers |

**Collapsible:** Yes — icon-only mode
**Active state:** Embee Blue background

---

## 14. STATES — MANDATORY

Every page/component must define:

| State | Definition |
|-------|-----------|
| `DEFAULT` | Normal content display |
| `LOADING` | Data being fetched — skeleton/spinner |
| `EMPTY` | No data — helpful message + action |
| `ERROR` | Something went wrong — message + retry |
| `SUCCESS` | Action completed — confirmation |
| `DISABLED` | Interactive element not available |
| `UNAUTHORIZED` | Not logged in — redirect to login |
| `FORBIDDEN` | Logged in but no access |
| `NOT_FOUND` | Resource doesn't exist |
| `OFFLINE` | Network unavailable |

---

## 15. ACCESSIBILITY SPECIFICATION

**Target: WCAG 2.2 AA**

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | All interactive elements focusable via Tab |
| Visible focus | `ring-2 ring-embee-blue ring-offset-2` |
| Focus trapping | Dialogs/sheets trap focus, restore on close |
| Skip navigation | "Skip to main content" link |
| Semantic HTML | Proper headings, landmarks |
| ARIA only where necessary | `aria-label`, `aria-describedby`, `aria-live` |
| Form error association | `aria-describedby` linking input to error |
| Error focus | Focus moves to first error on submission |
| Screen reader labels | All icons have `aria-label` or hidden text |
| Reduced motion | `prefers-reduced-motion: reduce` |
| Contrast | ≥ 4.5:1 normal text, ≥ 3:1 large text |
| Touch targets | ≥ 44 × 44 px |
| Zoom/reflow | Content readable at 200% zoom |

---

## 16. RESPONSIVE SYSTEM

| Breakpoint | Width | Target |
|------------|-------|--------|
| Mobile | 0–639px | Primary — delivery is mobile-first |
| Tablet | 640–1023px | Secondary |
| Desktop | 1024–1439px | Admin, marketing |
| Large Desktop | 1440px+ | Wide screens |

### Behavior by Breakpoint

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| Navigation | Bottom tab bar | Bottom tab or top nav | Top nav / Sidebar |
| Grid | 1 column | 2 columns | 3–4 columns |
| Cards | Full-width | 2 columns | 3 columns |
| Tables | Card list | Scrollable table | Full table |
| Map | Full-width, short | Full-width, medium | Side panel, tall |
| Modals | Bottom sheet | Centered modal | Centered modal |
| Forms | Full-width, stacked | Side-by-side where logical | Side-by-side |

---

## 17. HOMEPAGE SPECIFICATION

### Sections

| # | Section | Purpose |
|---|---------|---------|
| 1 | Header | Navigation + CTA |
| 2 | Hero | Value proposition |
| 3 | How It Works | Education (3 steps) |
| 4 | Features | Value demonstration (6 cards) |
| 5 | For Riders | Rider acquisition |
| 6 | Trust | Credibility (4 signals) |
| 7 | Final CTA | Conversion |
| 8 | Footer | Navigation + legal |

### Hero

| Element | Specification |
|---------|--------------|
| Background | Embee Navy with decorative blurs |
| Badge | "Modern Logistics Platform" pill |
| Headline | "You want it delivered. Embee Nexus is the right platform for the job." |
| Primary CTA | "Send a Package" → `/signup` |
| Secondary CTA | "Become a Rider" → `/rider/register` |

---

## 18. NOTIFICATION UX

### Notification Bell
- **Position:** Top navigation bar (right side)
- **Badge:** Unread count (red circle with number)
- **Click:** Opens notification panel

### Notification Panel
- **Display:** Dropdown on desktop, full panel on mobile
- **Content:** List of recent notifications
- **Each item:** Title, message, time, read/unread indicator
- **Actions:** Mark as read, Mark all as read
- **Empty state:** "All caught up!"
- **Loading:** Skeleton list items

---

## 19. TRACKING UX

### Primary Layout

```
┌─────────────────────────────────┐
│           MAP (primary)         │
│   [Pickup] ──── Route ──── [Dest] │
│        [Rider marker]           │
├─────────────────────────────────┤
│  Status: In Transit             │
│  ETA: ~15 minutes               │
│  Rider: Adebayo K. ★4.8        │
├─────────────────────────────────┤
│  Timeline:                      │
│  ● Order placed                 │
│  ● Rider assigned               │
│  ● Package picked up            │
│  ○ In transit (current)         │
│  ○ Delivered                    │
└─────────────────────────────────┘
```

### Map Behaviors

| Scenario | Behavior |
|----------|----------|
| Rider location updating | Smooth marker movement |
| Rider location stale (>30s) | "Location updating..." |
| Delivery delayed | "Delivery delayed" + updated ETA |
| Completed | Full route with completion marker |
| Map unavailable | Fallback to status-only view |

---

## 20. EMPTY / LOADING / ERROR DESIGN

### Loading

| Pattern | Usage |
|---------|-------|
| Skeleton screen | Page content, cards, lists |
| Spinner | Button actions, form submissions |
| Progress bar | Multi-step processes |

### Empty States

Every empty state must answer: What happened? What can I do? What next?

| Context | Message | Action |
|---------|---------|--------|
| No orders | "No deliveries yet" | "Start your first delivery" |
| No addresses | "No saved addresses" | "Add your first address" |
| No notifications | "All caught up!" | — |
| No offers (rider) | "Waiting for offers..." | Availability toggle |

### Error States

| Error Type | Display | Action |
|------------|---------|--------|
| Network error | "Connection lost" | Retry button |
| Server error | "Something went wrong" | Retry + support |
| Auth error | "Session expired" | Redirect to login |
| Validation error | Inline field errors | Fix and resubmit |
| Not found | "Page not found" | Go home |
| Permission denied | "Access denied" | Go back |

**Never expose technical errors to customers.**

---

## 21. SECURITY UX

| Scenario | UX |
|----------|-----|
| Unauthorized | Redirect to `/login` |
| Forbidden | "Access Denied" page |
| Expired session | "Session expired" + redirect |
| Sensitive action | Confirmation dialog |
| Destructive action | "Are you sure?" with typed confirmation |
| Payment failure | "Payment failed — please try again" |

---

## 22. PERFORMANCE

| Requirement | Target |
|-------------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Cumulative Layout Shift | < 0.1 |
| First Input Delay | < 100ms |

### Rules

- Code splitting with dynamic imports for map
- Skeleton-first rendering
- Server Components by default
- Server-side pagination for lists
- Lazy load map library

---

## 23. SEO

### Public Pages

| Page | Title |
|------|-------|
| Homepage | "Embee Nexus — Delivery Platform" |
| Login | "Sign In — Embee Nexus" |
| Signup | "Sign Up — Embee Nexus" |
| Rider Register | "Become a Rider — Embee Nexus" |

Authenticated pages: Noindex recommended.

---

## 24. IMPLEMENTATION BOUNDARIES

### FRONTEND-ONLY (Can implement now)

- Design system tokens
- Skeleton screens
- Bottom navigation
- Toast system
- Address search + map
- Booking progress indicator
- Visual polish
- Responsive improvements
- Accessibility improvements

### BACKEND-DEPENDENT (Existing API supports it)

- Address search → MapsProvider.searchAddresses()
- Geocoding → MapsProvider.geocode()
- Quote generation → POST /api/orders/quote
- Order tracking → Supabase Realtime
- Notifications → GET /api/notifications

### BACKEND GAP (Requires backend work)

- Admin analytics charts (no chart data API)
- Notification preferences (no preferences API)
- Customer search (no search API)

### PRODUCT DECISION REQUIRED

- Dark mode toggle (user preference or system?)
- Notification preferences (opt-in/opt-out?)
- Address labels (fixed list or custom?)
- Service area validation (warn or block?)

---

## 25. IMPLEMENTATION ORDER

### Phase 1: Foundation (Days 1–2)
- Update Tailwind config with design tokens
- Update CSS variables for accessibility
- Add skeleton components
- Add toast component
- Add confirmation dialog
- Update logo component

### Phase 2: Navigation (Days 3–4)
- Build CustomerBottomNav
- Build RiderBottomNav
- Update customer layout
- Update rider layout
- Update admin sidebar

### Phase 3: Address Redesign (Days 5–7)
- Build AddressSearch component
- Build LocationPicker component
- Build AddressCreateFlow
- Replace create-address-form
- Update addresses page

### Phase 4: Customer Flow (Days 8–11)
- Build BookingProgress
- Update booking form
- Update quote display
- Update order list
- Update order detail
- Update tracking components
- Update rating form
- Build notification panel
- Update dashboard

### Phase 5: Rider Flow (Days 12–14)
- Update rider dashboard
- Update offer card
- Update active delivery card
- Update delivery progress
- Update earnings panel
- Update rider registration
- Update rider onboarding

### Phase 6: Admin Flow (Days 15–17)
- Update admin dashboard
- Update admin orders
- Update admin riders
- Update admin customers
- Update verification components

### Phase 7: Authentication (Day 18)
- Update login page
- Update signup page
- Update error/not-found pages

### Phase 8: Homepage (Day 19)
- Update homepage
- Polish hero section

### Phase 9: QA (Days 20–21)
- Responsive testing (375px, 768px, 1024px, 1440px)
- Accessibility testing
- Visual QA

---

## 26. FILE-LEVEL IMPLEMENTATION MAP

### New Files

| File | Purpose | Risk |
|------|---------|------|
| `components/ui/skeleton.tsx` | Skeleton loader | LOW |
| `components/ui/toast.tsx` | Toast notifications | LOW |
| `components/ui/confirmation-dialog.tsx` | Destructive action confirm | LOW |
| `components/ui/bottom-sheet.tsx` | Mobile action sheet | LOW |
| `components/navigation/customer-bottom-nav.tsx` | Mobile customer nav | LOW |
| `components/navigation/rider-bottom-nav.tsx` | Mobile rider nav | LOW |
| `components/addresses/address-search.tsx` | Search + autocomplete | MEDIUM |
| `components/addresses/location-picker.tsx` | Map + draggable pin | MEDIUM |
| `components/addresses/address-create-flow.tsx` | Multi-step address creation | MEDIUM |
| `components/booking/booking-progress.tsx` | Step indicator | LOW |
| `components/notifications/notification-panel.tsx` | Notification dropdown | LOW |
| `components/notifications/notification-item.tsx` | Notification list item | LOW |

### Modified Files

| File | Action | Risk |
|------|--------|------|
| `tailwind.config.ts` | UPDATE | LOW |
| `app/globals.css` | UPDATE | LOW |
| `app/layout.tsx` | UPDATE | LOW |
| `components/shared/logo.tsx` | REPLACE | LOW |
| `components/shared/app-nav.tsx` | UPDATE | LOW |
| `components/shared/mobile-nav.tsx` | REPLACE | LOW |
| `components/shared/empty-state.tsx` | UPDATE | LOW |
| `components/shared/loading-state.tsx` | REPLACE | LOW |
| `components/shared/status-badge.tsx` | UPDATE | LOW |
| `components/addresses/create-address-form.tsx` | REPLACE | MEDIUM |
| `components/addresses/address-list.tsx` | UPDATE | LOW |
| `components/booking/booking-form.tsx` | UPDATE | MEDIUM |
| `components/booking/quote-display.tsx` | UPDATE | LOW |
| `components/tracking/tracking-map.tsx` | UPDATE | LOW |
| `components/tracking/order-tracking.tsx` | UPDATE | MEDIUM |
| `components/tracking/order-timeline.tsx` | UPDATE | LOW |
| `components/rider/offer-card.tsx` | UPDATE | LOW |
| `components/rider/active-delivery-card.tsx` | UPDATE | LOW |
| `components/rider/delivery-progress-steps.tsx` | UPDATE | LOW |
| `components/rider/earnings-panel.tsx` | UPDATE | LOW |
| `components/admin/admin-sidebar.tsx` | UPDATE | LOW |
| `components/notifications/notification-bell.tsx` | UPDATE | LOW |
| `app/(dashboard)/layout.tsx` | UPDATE | LOW |
| `app/rider/layout.tsx` | UPDATE | LOW |
| `app/admin/layout.tsx` | UPDATE | LOW |
| `app/page.tsx` | UPDATE | LOW |
| `app/login/page.tsx` | UPDATE | LOW |
| `app/signup/page.tsx` | UPDATE | LOW |
| `app/(dashboard)/dashboard/page.tsx` | UPDATE | LOW |
| `app/(dashboard)/addresses/page.tsx` | UPDATE | MEDIUM |
| `app/(dashboard)/orders/page.tsx` | UPDATE | LOW |
| `app/(dashboard)/orders/[id]/page.tsx` | UPDATE | MEDIUM |
| `app/rider/dashboard/page.tsx` | UPDATE | LOW |
| `app/admin/dashboard/page.tsx` | UPDATE | LOW |
| `app/admin/orders/page.tsx` | UPDATE | LOW |
| `app/admin/riders/page.tsx` | UPDATE | LOW |

---

## 27. TESTING SPECIFICATION

### Unit Tests
- Button, Input, Badge, Skeleton, Toast, AddressSearch, LocationPicker, BookingProgress

### Integration Tests
- Address creation flow, Booking flow, Order tracking, Rider offer, Admin verification

### E2E Tests (Critical Journeys)
- Customer booking: Signup → address → book → pay → track → rate
- Rider delivery: Login → online → accept → deliver → proof → earnings
- Admin verification: Login → rider → documents → verify

### Accessibility Tests
- Keyboard navigation, Screen reader, Focus management, Contrast, Reduced motion

### Responsive Tests
- 375px, 768px, 1024px, 1440px+

---

## 28. UUPM RECONCILIATION TABLE

| UUPM Recommendation | EMBEE Requirement | Decision | Reason |
|---------------------|-------------------|----------|--------|
| Inter font | Manrope (founder-approved) | **REJECT** | Manrope matches brand |
| Orange accent (#EA580C) | Digital Cyan (#38BDF8) | **REJECT** | Cyan is official accent |
| Blue primary (#2563EB) | Embee Blue (#147BFF) | **REJECT** | Blue is official primary |
| Minimalism & Swiss Style | Professional, trustworthy | **ADOPT** | Aligns |
| Real-Time / Operations pattern | Map-centric tracking | **ADOPT** | Aligns |
| Bottom navigation (mobile) | Mobile-first | **ADOPT** | Aligns |
| Skeleton loading | Loading states | **ADOPT** | Aligns |
| Inline form validation | Form validation | **ADOPT** | Aligns |
| 8dp spacing rhythm | Consistent spacing | **ADOPT** | Standard |
| Touch target minimum (44px) | Mobile-first, accessible | **ADOPT** | WCAG |
| Focus visible indicators | Accessibility | **ADOPT** | WCAG 2.2 AA |
| aria-live for status updates | Accessibility | **ADOPT** | Screen reader |
| Skip navigation links | Accessibility | **ADOPT** | Keyboard |
| No emoji as icons | Vector icons | **ADOPT** | Already done |
| Reduced motion support | Accessibility | **ADOPT** | WCAG |
| Dark mode support | Existing CSS variables | **DEFER** | Post-launch |
| GSAP animations | CSS transitions | **REJECT** | Unnecessary complexity |
| Chart recommendations | Admin dashboard | **DEFER** | Backend gap |

---

## 29. DESIGN DECISION REGISTER

| ID | Decision | Reason | Authority | Impact |
|----|----------|--------|-----------|--------|
| FE-001 | Keep Manrope font | Founder-approved | EMBEE brand | Global typography |
| FE-002 | Keep Embee Blue (#147BFF) | Official brand primary | EMBEE brand | Global color |
| FE-003 | Keep Digital Cyan (#38BDF8) | Official brand accent | EMBEE brand | Global color |
| FE-004 | Keep Embee Navy (#0B1220) | Official brand dark | EMBEE brand | Global color |
| FE-005 | Use skeleton screens | Better loading UX | UUPM + EMBEE | Loading states |
| FE-006 | Bottom nav for mobile | Thumb-friendly | UUPM + EMBEE | Mobile nav |
| FE-007 | Address search + map | Remove manual lat/lng | EMBEE product | Address creation |
| FE-008 | Provider-agnostic maps | Architecture requirement | EMBEE architecture | Map integration |
| FE-009 | WCAG 2.2 AA target | Accessibility standard | EMBEE UX | All components |
| FE-010 | Mobile-first responsive | Delivery is mobile-primary | EMBEE product | All layouts |
| FE-011 | No GSAP | CSS transitions sufficient | Simplicity | Animations |
| FE-012 | No dark mode toggle yet | Defer to post-launch | Product decision | Theme |
| FE-013 | Server Components by default | Next.js best practice | UUPM stack | Performance |
| FE-014 | Client Components as leaf nodes | Next.js best practice | UUPM stack | Performance |
| FE-015 | 44px touch targets minimum | WCAG + mobile UX | Accessibility | All interactive |
| FE-016 | Confirmation dialogs for destructive | Safety requirement | EMBEE security | Delete, cancel |
| FE-017 | Toast for success/error feedback | Standard UX pattern | UUPM | User feedback |
| FE-018 | No AI attribution | Project rule | EMBEE project rules | All files |

---

## 30. RISKS

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| Map loading performance | MEDIUM | MapLibre GL JS ~500KB | Lazy load, skeleton fallback |
| Address search accuracy | MEDIUM | Stadia Maps geocoding imperfect | Allow manual adjustment |
| Realtime stability | MEDIUM | Supabase Realtime may disconnect | Reconnect logic |
| Mobile Safari quirks | LOW | 100vh, safe areas, keyboard | Use dvh, safe-area-inset |
| Backend gaps | MEDIUM | No chart data API | Defer charts to post-launch |

---

## 31. FINAL ACCEPTANCE CRITERIA

The specification is complete when another engineer could implement the frontend without guessing:

- ✅ What screens exist
- ✅ What components exist
- ✅ What states exist
- ✅ What API each screen consumes
- ✅ What actions are allowed
- ✅ What the design system is
- ✅ What mobile behavior is
- ✅ What desktop behavior is
- ✅ What accessibility requirements apply
- ✅ What is frontend-only
- ✅ What requires backend work
- ✅ What requires product approval
- ✅ What must not be changed

---

*Specification completed: September 1, 2026*
*Repository HEAD: `640af0db62377619b5fe2e981514eadb38e4793a`*
*Application source code: UNTOUCHED*
*Database migrations: UNTOUCHED*
*Dependencies: UNTOUCHED*
