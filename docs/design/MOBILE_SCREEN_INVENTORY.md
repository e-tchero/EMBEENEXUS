# Embee Nexus — Mobile Screen Inventory

**Status:** Design reconnaissance — **no screens are implemented in this phase.**
**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)

Legend — Backend: `✅ implemented` (M0–M3) · `⏳ future milestone` · `🔒 founder-pending`.
Every screen lists loading/empty/error/offline states; permission and
sensitivity notes included where applicable. "Server-authoritative data" is
what the screen must render from the server, never compute.

## Customer screens

| # | Screen | Purpose | Entry → Exit | Backend data | Server-authoritative | States (L/E/Err/Off) | Notes |
|---|---|---|---|---|---|---|---|
| C1 | Onboarding / welcome | Value prop, signup/login | First launch → Home | auth (✅) | session | skeleton / first-run / auth error / n-a | public route |
| C2 | Home | Start order, active order card | Tab → Pickup or Tracking | quotes, orders (✅) | active order state | skeleton / no orders / error / cached state | recent addresses local-only |
| C3 | Pickup selection | Choose pickup point | Home → Destination | geocoding (✅ M2) | — | map tile / empty recents / geocode error / offline mode | location permission; coords never trusted for pricing |
| C4 | Destination selection | Choose destination | Pickup → Quote | geocoding (✅) | — | same as C3 | coverage validated server-side |
| C5 | Quote / price confirm | Present server snapshot | Destination → Payment | create_quote (✅) | distance, ₦, expiry, coverage | skeleton / n-a / OUT_OF_COVERAGE · NO_BAND · PRICING_UNAVAILABLE / stale-quote banner | money tabular; expiry per founder-pending validity |
| C6 | Payment | Pay via gateway | Quote → Searching | Flutterwave (⏳ M4) | payment status (server-verified) | loading / n-a / payment failure / never mark paid offline | **never** trust client callback (M4) |
| C7 | Searching for rider | Post-payment wait | Payment → Assigned | orders (✅ state), dispatch (⏳ M5) | order state | animated wait / n-a / error / cached state | cancel gated by D06 🔒 |
| C8 | Rider assigned | Confirm rider | C7 → En route | orders (✅) | rider identity (✅ once M1 rider exists) | skeleton / n-a / error / cached | no live location pre-pickup (M7) |
| C9 | En route to pickup | Watch approach | C8 → Arrived | orders (✅), tracking (⏳ M7) | order state, ETA (server) | map / n-a / map error / last-known | live map M7 |
| C10 | Arrived at pickup | OTP handoff | C9 → In transit | orders (✅), OTP (⏳ M6) | pickup OTP verification | input / n-a / wrong-OTP error / n-a | OTP secure entry; no plaintext logging |
| C11 | In transit | Track delivery | C10 → Arrived dest. | orders (✅), tracking (⏳ M7) | state, ETA, route | map / n-a / map error / last-known + age | rider location visible **only** in-transit (privacy rule) |
| C12 | Arrived at destination | Delivery verification | C11 → Delivered | orders (✅), OTP+photo (⏳ M6) | delivery OTP, recipient confirm | input / n-a / error / n-a | recipient inspection step; sender may relay OTP |
| C13 | Delivered / Completed | Receipt, re-order | C12 → Home | orders (✅) | final state, snapshot | skeleton / n-a / error / cached | proof-of-delivery photo (M6) shown when exists |
| C14 | Order history | Past orders | Tab → detail | orders (✅) | states, amounts | skeleton / empty / error / cached | — |
| C15 | Order detail / tracking link view | Full timeline, public-tracking variant | History or tracking link → actions | orders, events (✅) | timeline, snapshot | skeleton / n-a / error / cached | public variant = token-gated, no PII beyond needed (D28 🔒) |
| C16 | Profile / settings | Account, phone verify | Tab | profiles (✅) | profile | skeleton / n-a / error / cached | — |

## Rider screens

| # | Screen | Purpose | Entry → Exit | Backend data | Server-authoritative | States | Notes |
|---|---|---|---|---|---|---|---|
| R1 | Rider onboarding / signup | Role selection, account | First launch → Verification | auth, roles (✅) | role from profiles | skeleton / n-a / error / n-a | role self-elevation impossible (M0 trigger) |
| R2 | Verification status | Submit/resubmit, see decision | Onboarding → Availability | rider_profiles, events (✅ M1) | verification state | skeleton / n-a / error / cached | pending → under_review → approved/rejected |
| R3 | Vehicle registration | Motorcycle record | Verification → Availability | vehicles (✅ M1) | vehicle state | form / empty / validation error / cached | plate unique per rider; ownership doc URL (bucket = M6) |
| R4 | Availability toggle | Go online/offline | Home | readiness (✅ M1 model) | readiness state | toggle / n-a / error / cached | verification ≠ availability (M1 rule); queue = M5 🔒 not authorized |
| R5 | Delivery offer | Accept/decline 20 s offer | Availability (offer) → Navigate | dispatch (⏳ M5) | limited order info pre-accept | countdown / no offer / error / offline = unassignable | one rider at a time; limited info pre-accept |
| R6 | Navigate to pickup | Directions | R5 → Arrive | maps (✅ M2 abstraction), tracking (⏳ M7) | route from server | map / n-a / error / offline = cached route | rider app GPS duty cycle (M7) |
| R7 | Pickup verification | Photo + pickup OTP | R6 → Navigate dest. | orders (✅), M6 (⏳) | OTP state | camera+OTP / n-a / wrong OTP / retry queue | photo upload retry (M6) |
| R8 | Navigate to destination | Directions | R7 → Arrive | maps (✅), tracking (⏳) | route | map / n-a / error / cached | — |
| R9 | Delivery verification | Photo + delivery OTP + recipient | R8 → Completed | orders (✅), M6 (⏳) | verification facts | camera+OTP / n-a / error / retry queue | recipient inspection before final confirm |
| R10 | Completed / earnings summary | Trip done | R9 → Earnings | orders (✅), ledger (⏳ M8) | state; earnings from ledger only | skeleton / n-a / error / cached | no earnings math client-side, ever |
| R11 | Earnings | Daily payout view | Tab | ledger/payouts (⏳ M8) | ledger entries | skeleton / empty / error / cached | payouts daily; cutoff = D13 🔒 |
| R12 | Rider profile / vehicle status | Manage vehicle | Tab | vehicles (✅) | vehicle state | form / n-a / error / cached | — |

## Seller screens — `M9 · NOT AUTHORIZED`

Entry points only, no design work consumed: seller signup (instant account),
session-based batch creation (max 3 deliveries per session), session payment,
order management, permanent tracking-link sharing, plan status (Standard/Pro;
Pro pricing = founder-pending). Marked here so mobile IA is complete without
inventing scope.

## Operator surfaces — excluded from mobile design target

Review queue (✅ M1), order intervention (✅ M3 RPCs), zone/pricing
administration (✅ M2 RPCs, UI pending), refund/refund-authority tools
(🔒 D17/D18). Dense, desktop-first, functional; never the consumer design
reference.
