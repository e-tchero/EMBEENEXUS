# EMBEE NEXUS — FIGMA SCREEN REQUIREMENTS

**Authority:** LEVEL 2 — Checklist for Claude's Figma design
**Date:** September 1, 2026

---

## Public / Marketing

| # | Screen | Priority | Responsive | Notes |
|---|--------|----------|------------|-------|
| 1 | Homepage / Landing | MUST | Mobile + Desktop | Hero, value prop, CTA |
| 2 | Login | MUST | Mobile + Desktop | Email/password form |
| 3 | Signup | MUST | Mobile + Desktop | Registration form |
| 4 | 404 Not Found | SHOULD | Mobile + Desktop | Helpful error page |
| 5 | Forgot Password | SHOULD | Mobile + Desktop | Password reset flow |

---

## Customer

| # | Screen | Priority | Responsive | Notes |
|---|--------|----------|------------|-------|
| 6 | Dashboard Home | MUST | Mobile + Desktop | Recent orders, quick actions |
| 7 | Address List | MUST | Mobile + Desktop | Saved addresses |
| 8 | Add/Edit Address | MUST | Mobile + Desktop | Search + map + form (REDESIGN) |
| 9 | New Booking — Step 1: Addresses | MUST | Mobile + Desktop | Pickup + destination selection |
| 10 | New Booking — Step 2: Package | MUST | Mobile + Desktop | Category, weight, description |
| 11 | New Booking — Step 3: Quote | MUST | Mobile + Desktop | Price breakdown, confirm |
| 12 | New Booking — Step 4: Payment | MUST | Mobile + Desktop | Paystack checkout |
| 13 | Order List | MUST | Mobile + Desktop | All orders with status |
| 14 | Order Detail | MUST | Mobile + Desktop | Full order info |
| 15 | Order Tracking (Map) | MUST | Mobile + Desktop | Real-time rider location |
| 16 | Order Cancellation | SHOULD | Mobile + Desktop | Confirm cancellation |
| 17 | Delivery Proof View | SHOULD | Mobile + Desktop | Photo + text proof |
| 18 | Rating Form | SHOULD | Mobile + Desktop | 1-5 stars + comment |
| 19 | Refund Status | SHOULD | Mobile + Desktop | Refund tracking |
| 20 | Notification List | MUST | Mobile + Desktop | All notifications |
| 21 | Profile/Settings | SHOULD | Mobile + Desktop | Account info |

---

## Rider

| # | Screen | Priority | Responsive | Notes |
|---|--------|----------|------------|-------|
| 22 | Rider Registration | MUST | Mobile + Desktop | Sign up as rider |
| 23 | Rider Onboarding | MUST | Mobile + Desktop | Document upload |
| 24 | Rider Dashboard | MUST | Mobile | Main rider view |
| 25 | Availability Toggle | MUST | Mobile | Online/offline switch |
| 26 | Offer Card/Modal | MUST | Mobile | Incoming delivery offer |
| 27 | Active Delivery | MUST | Mobile | Current delivery workflow |
| 28 | Delivery Progress Steps | MUST | Mobile | Step-by-step progress |
| 29 | Proof Submission | MUST | Mobile | Photo + text upload |
| 30 | Earnings Summary | SHOULD | Mobile | Total earnings |
| 31 | Earnings History | SHOULD | Mobile | Transaction list |
| 32 | Vehicle Management | SHOULD | Mobile + Desktop | Add/edit vehicles |

---

## Admin

| # | Screen | Priority | Responsive | Notes |
|---|--------|----------|------------|-------|
| 33 | Admin Dashboard | MUST | Desktop | Stats overview |
| 34 | Order List (Admin) | MUST | Desktop | All orders, filters |
| 35 | Order Detail (Admin) | MUST | Desktop | Full order + actions |
| 36 | Rider List (Admin) | MUST | Desktop | All riders, status |
| 37 | Rider Detail (Admin) | MUST | Desktop | Profile + verification |
| 38 | Document Verification | MUST | Desktop | Approve/reject docs |
| 39 | Customer List (Admin) | SHOULD | Desktop | All customers |
| 40 | Notification Bell | MUST | Mobile + Desktop | Persistent in nav |

---

## Shared / Cross-Role

| # | Screen | Priority | Responsive | Notes |
|---|--------|----------|------------|-------|
| 41 | Notification Panel | MUST | Mobile + Desktop | Dropdown/overlay |
| 42 | Error Page | SHOULD | Mobile + Desktop | Generic error |
| 43 | Loading State | MUST | Mobile + Desktop | Skeleton screens |
| 44 | Empty State | MUST | Mobile + Desktop | No data messages |

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| MUST | 30 | Must be designed for launch |
| SHOULD | 14 | Should be designed, can be simplified |

---

## Design Notes

1. **Address page (Screen 8) is the primary UX redesign target.** Current implementation requires manual lat/lng. New design must use search + map pin.
2. **Tracking (Screen 15) is the hero experience.** Make it feel real-time and trustworthy.
3. **Rider workflow (Screens 24–29) must be thumb-friendly.** Riders use phones while on the move.
4. **Admin (Screens 33–39) is desktop-first.** Data-dense, efficient, professional.
5. **Every screen needs mobile + desktop variants** unless explicitly mobile-only.
