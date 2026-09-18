# EMBEE NEXUS — PRODUCT UX BRIEF

**Authority:** LEVEL 2 — Product context for design decisions
**Date:** September 1, 2026

---

## Product Overview

Embee Nexus is a **delivery platform** connecting customers who need items delivered with verified riders who carry them. Think of it as a Nigerian logistics platform — like Uber for package delivery.

### Core Value Proposition
"You want it delivered. Embee Nexus is the right platform for the job."

### Market
Nigeria — primarily Abuja initially, expanding to other cities.

---

## CUSTOMER EXPERIENCE

### 1. Authentication
- **Entry:** `/login` or `/signup`
- **Goal:** Create account or sign in
- **Actions:** Email/password signup, login
- **Backend:** Supabase Auth → profile auto-created via trigger
- **Role assigned:** `customer` by default

### 2. Dashboard Home
- **Entry:** `/dashboard`
- **Goal:** See recent orders, quick actions
- **States:** Empty (no orders), Active (has orders)
- **Actions:** Start new booking, view orders, manage addresses

### 3. Address Management
- **Entry:** `/addresses`
- **Goal:** Add/edit/delete delivery addresses
- **Current UX Issue:** Requires manual latitude/longitude entry (being redesigned)
- **Fields:** Label (Home/Work/Other), Street Address, City, State, Latitude, Longitude
- **Actions:** Create address, set default, edit, delete
- **Backend:** `addresses` table with PostGIS geography column

### 4. Booking Flow
- **Entry:** Dashboard → "New Delivery"
- **Goal:** Create a delivery order
- **Steps:**
  1. Select/create pickup address
  2. Select/create delivery address
  3. Choose delivery category
  4. Enter package details (description, weight)
  5. Select urgency level (standard/express/urgent)
  6. Review quote (price breakdown)
  7. Confirm and pay
- **Backend:** Quote generation → order creation → payment initialization
- **Quote components:** base_fee, distance_fee, weight_fee, tax (7.5% VAT), total

### 5. Payment
- **Entry:** After quote confirmation
- **Goal:** Pay for delivery
- **Provider:** Paystack (card, bank transfer, USSD)
- **Flow:** Initialize → Paystack checkout → Webhook verification → Order state update
- **States:** pending → processing → success/failed

### 6. Order Tracking
- **Entry:** `/orders/[id]`
- **Goal:** Track delivery in real-time
- **Features:**
  - Map showing rider location (real-time)
  - Order status timeline
  - Rider info card
  - Estimated arrival
- **Realtime:** Supabase Realtime subscription for rider location

### 7. Order Cancellation
- **Entry:** Order detail page
- **Goal:** Cancel an order
- **Rules:** Allowed before rider pickup (state-dependent)
- **Refund:** Automatic refund via Paystack if payment was made

### 8. Delivery Proof
- **Entry:** Order detail (after delivery)
- **Goal:** View proof of delivery
- **Types:** Text-only or Photo + Text
- **Photo:** Uploaded to Supabase Storage (private bucket)

### 9. Rating
- **Entry:** After order completion
- **Goal:** Rate the delivery experience
- **Fields:** Rating (1-5 stars), optional comment
- **Timing:** Available after `completed` status

### 10. Notifications
- **Entry:** Notification bell icon
- **Goal:** View order updates, system messages
- **Features:** In-app notifications, unread count, mark as read
- **Email:** Transactional emails via Resend (order confirmations, etc.)

---

## RIDER EXPERIENCE

### 1. Registration
- **Entry:** `/rider/register`
- **Goal:** Apply to become a rider
- **Fields:** Full name, phone, vehicle info
- **Backend:** Creates rider profile with `pending` verification

### 2. Onboarding
- **Entry:** `/rider/onboarding`
- **Goal:** Upload verification documents
- **Documents:** Driver's license, vehicle registration, insurance
- **Storage:** Supabase Storage (private bucket)
- **Status:** `pending` → `under_review` → `approved`/`rejected`

### 3. Dashboard
- **Entry:** `/rider/dashboard`
- **Goal:** See available offers, active deliveries, earnings
- **Features:**
  - Availability toggle (online/offline)
  - Offer cards (accept/reject)
  - Active delivery card with progress steps
  - Earnings summary

### 4. Delivery Offers
- **Source:** Dispatch system sends offers to nearest available riders
- **Display:** Offer cards showing pickup, destination, distance, payment
- **Actions:** Accept or Reject (with timeout)
- **Timeout:** Offers expire after configured duration

### 5. Active Delivery Workflow
- **States:**
  1. `rider_assigned` — Rider accepted offer
  2. `rider_en_route_to_pickup` — Rider heading to pickup
  3. `arrived_at_pickup` — Rider at pickup location
  4. `picked_up` — Package collected
  5. `in_transit` — En route to destination
  6. `arrived_at_destination` — At delivery location
  7. `delivered` — Proof submitted
  8. `completed` — Customer confirmed or auto-completed

### 6. Delivery Proof Submission
- **Entry:** Active delivery card
- **Goal:** Prove delivery completion
- **Fields:** Photo (optional), text description (required)
- **Upload:** Photo → Supabase Storage → signed URL

### 7. Earnings
- **Entry:** Earnings panel on dashboard
- **Goal:** View earnings history and summary
- **Data:** Earnings ledger (credits from completed deliveries)
- **Backend:** `earnings_ledger` table, `earnings_ledger_summary` view

---

## ADMIN EXPERIENCE

### 1. Dashboard
- **Entry:** `/admin/dashboard`
- **Goal:** System overview
- **Stats:** Total orders, active deliveries, revenue, rider count

### 2. Order Management
- **Entry:** `/admin/orders`
- **Goal:** View and manage all orders
- **Actions:** View details, cancel order (admin cancellation)

### 3. Rider Management
- **Entry:** `/admin/riders`
- **Goal:** Manage rider fleet
- **Features:**
  - Rider list with status
  - Rider detail with verification status
  - Document verification (approve/reject)
  - Verification history

### 4. Customer Management
- **Entry:** `/admin/customers`
- **Goal:** View customer list
- **Read-only** — admin can view but not modify customer profiles

---

## CROSS-CUTTING UX CONCERNS

### Loading States
- Skeleton loaders for data-dependent pages
- Button loading spinners for async actions
- Page-level loading states

### Error States
- Error boundaries per section (customer, rider, admin)
- API error handling with user-friendly messages
- Network failure handling

### Empty States
- No orders → "Start your first delivery"
- No addresses → "Add your first address"
- No offers → "Waiting for delivery offers"
- No deliveries → "No active deliveries"

### Responsive Design
- Mobile-first approach
- Desktop sidebar navigation (admin)
- Mobile bottom navigation (customer, rider)
- Touch-friendly controls
