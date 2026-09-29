# EMBEE NEXUS — STATE MACHINES (V2)

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL FOR RECONSTRUCTION — derived from `apps/web/src/lib/domain/order-state.ts` and migrations 0002/0005/0007/0014 · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

The implementation is authoritative. The V1 machine in
`archive/v1/06-STATE-MACHINES.md` (`pending_payment → paid`, `expired`,
`disputed`, `refunded`, `dispatch_rider_v2()`) does not describe V2.

## Order status machine

`draft → awaiting_payment → payment_verified → searching_rider →
rider_assigned → en_route_pickup → arrived_pickup → picked_up → in_transit →
arrived_destination → delivered → completed`

- **Payment is a separate axis**, not an order state. `payment_verified` is
  reached only through backend verification (Flutterwave webhook/verification),
  never a client callback.
- **No `expired`/`disputed`/`refunded` states exist.** Returns close via
  `delivery_failed`; refunds are a financial axis (M8+, D06).
- **`under_review`** is an operator hold state (any non-terminal,
  non-completed order); release returns the order to its pre-hold status.

### Lifecycle transitions (trigger · actors)

| From → To | Trigger | Actors | Guard |
|---|---|---|---|
| `draft → awaiting_payment` | `order_submitted` | customer, seller, system | — |
| `awaiting_payment → payment_verified` | `payment_verified` | system | payment verified server-side |
| `payment_verified → searching_rider` | `dispatch_started` | system | — |
| `searching_rider → rider_assigned` | `rider_accepted_offer` | rider, system | server-recorded acceptance |
| `rider_assigned → en_route_pickup` | `rider_departed` | rider | — |
| `en_route_pickup → arrived_pickup` | `rider_arrived_pickup` | rider | — |
| `arrived_pickup → picked_up` | `pickup_otp_verified` | rider | pickup OTP verified server-side |
| `picked_up → in_transit` | `rider_departed` | rider | — |
| `in_transit → arrived_destination` | `rider_arrived_destination` | rider | — |
| `arrived_destination → delivered` | `delivery_otp_verified` | rider | delivery OTP verified server-side |
| `delivered → completed` | `recipient_confirmed` | customer, recipient, system | recipient inspection confirmed — no auto-completion exists |

### Failure & cancellation

| From → To | Trigger | Actors |
|---|---|---|
| `in_transit → failed` | `delivery_failed` | rider, operator |
| `arrived_destination → failed` | `delivery_failed` | rider, operator |
| `draft/awaiting_payment/payment_verified/searching_rider/rider_assigned/en_route_pickup → cancelled` | `cancel` | customer, seller, operator |
| `arrived_pickup/picked_up/in_transit → cancelled` | `cancel` | operator only |

Terminal outcomes: `cancelled`, `failed`. Customer cancellation is permitted
up to the point the rider arrives at pickup; refund treatment of cancellation
is D06 (founder-gated) and is deliberately not encoded.

### Custody (OTP) chain facts

- Pickup OTP requires `customer_parcel` + `rider_pickup` photos before
  verification; delivery OTP requires `rider_delivery`.
- Verification is valid exactly at `arrived_pickup` / `arrived_destination`.
- 5 incorrect attempts lock verification; plaintext OTP is shown once,
  customer-only.

## Waiting & return (not separate states — event/metadata axis)

Waiting is free for the first 10 minutes, then ₦700 per started minute,
capped at 30 minutes (migration 0014; `waiting_charge_kobo` on the order).
At the cap the waiting tick initiates the return (`return_initiated_at`); the
assigned rider completes the return via `order_complete_return`, closing the
order through the canonical `delivery_failed` path → `failed`.

## Payment lifecycle (Flutterwave axis)

`initiated → redirected → pending → successful | failed | cancelled |
verification_failed`

- Backend verification is the authority; the client never marks a payment
  successful.
- `successful` allows the `payment_verified` order transition; verification
  failure holds the order for review.

## Rider verification states

`pending → under_review → approved | rejected` (reviewer: operator; notes
recorded). Approval plus an active motorcycle vehicle row plus a declared
availability flag constitute dispatch eligibility.

## Dispatch offer states

`offered → accepted | declined | expired`

- One offer at a time; 20-second TTL (`OFFER_TTL_SECONDS`).
- Creating an offer consumes the rider's availability flag; decline restores
  it with the queue clock reset; expiry restores it with the clock preserved.
- Queue order: longest-`available_since` among eligible riders (approved +
  available + not busy + active motorcycle). Expired riders are excluded from
  immediate re-offer of the same order (anti-thrash), and the tick continues
  dispatch to the next eligible rider.
- Completion does not auto-restore availability; the rider re-declares.

## Historical note

V1 names (`pending_payment`, `paid`, `expired`, `disputed`, `refunded`,
`partially_refunded`, `abandoned`) are preserved in `archive/v1/06-STATE-MACHINES.md`.
