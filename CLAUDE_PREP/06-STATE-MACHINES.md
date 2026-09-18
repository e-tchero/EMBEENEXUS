# EMBEE NEXUS — STATE MACHINES

**Authority:** LEVEL 1 — Derived from ARCHITECTURE.md + database schema
**Date:** September 1, 2026

---

## Order Status Machine

The order status is the central state machine. All other systems react to order state changes.

```
draft
  ↓ (customer confirms quote)
pending_payment
  ↓ (payment webhook confirms)
paid
  ↓ (dispatch system finds rider)
searching_rider
  ↓ (rider accepts offer)
rider_assigned
  ↓ (rider starts heading to pickup)
rider_en_route_to_pickup
  ↓ (rider arrives at pickup)
arrived_at_pickup
  ↓ (rider confirms pickup)
picked_up
  ↓ (rider starts transit)
in_transit
  ↓ (rider arrives at destination)
arrived_at_destination
  ↓ (rider submits proof)
delivered
  ↓ (customer confirms or auto-completed after window)
completed

CANCELLATION PATH (from any non-completed state):
  ↓ (customer/admin cancels)
cancelled
  ↓ (if payment was made)
refunded

FAILURE PATH:
  ↓ (rider reports failure)
failed

EXPIRATION PATH:
  ↓ (no rider accepted within timeout)
expired

DISPUTE PATH:
  ↓ (customer disputes delivery)
disputed
```

### Valid Transitions

| From | To | Trigger | Actor |
|------|----|---------|-------|
| `draft` | `pending_payment` | Quote confirmed | Customer |
| `pending_payment` | `paid` | Payment webhook | System |
| `pending_payment` | `cancelled` | Customer cancels | Customer |
| `paid` | `searching_rider` | Dispatch initiated | System |
| `paid` | `cancelled` | Customer/admin cancels | Customer/Admin |
| `searching_rider` | `rider_assigned` | Rider accepts | Rider |
| `searching_rider` | `expired` | No rider accepts | System |
| `searching_rider` | `cancelled` | Customer/admin cancels | Customer/Admin |
| `rider_assigned` | `rider_en_route_to_pickup` | Rider starts | Rider |
| `rider_assigned` | `cancelled` | Customer/admin cancels | Customer/Admin |
| `rider_en_route_to_pickup` | `arrived_at_pickup` | Rider arrives | Rider |
| `arrived_at_pickup` | `picked_up` | Rider confirms | Rider |
| `picked_up` | `in_transit` | Rider starts transit | Rider |
| `in_transit` | `arrived_at_destination` | Rider arrives | Rider |
| `arrived_at_destination` | `delivered` | Rider submits proof | Rider |
| `delivered` | `completed` | Customer confirms / auto | System |
| `delivered` | `disputed` | Customer disputes | Customer |
| Any (pre-pickup) | `cancelled` | Cancel | Customer/Admin |
| Any (pre-pickup) | `failed` | Rider reports | Rider |

---

## Payment Lifecycle

```
pending
  ↓ (Paystack checkout opened)
processing
  ↓ (webhook: charge.success)
success
  ↓ (refund initiated)
refunded
  OR
  ↓ (webhook: charge.failed)
failed
  OR
  ↓ (customer abandons checkout)
abandoned
```

### Payment States

| State | Meaning |
|-------|---------|
| `pending` | Payment initialized, awaiting customer action |
| `processing` | Customer completed checkout, awaiting webhook |
| `success` | Payment confirmed via webhook |
| `failed` | Payment failed (card declined, etc.) |
| `abandoned` | Customer closed checkout without paying |
| `refunded` | Full refund processed |
| `partially_refunded` | Partial refund processed |

---

## Rider Verification Status

```
pending
  ↓ (documents submitted)
under_review
  ↓ (admin approves)
approved
  OR
  ↓ (admin rejects)
rejected
  ↓ (rider resubmits)
pending (cycle repeats)
```

---

## Rider Assignment States

```
offered
  ↓ (rider accepts)
accepted
  ↓ (delivery starts)
completed
  OR
  ↓ (rider rejects)
rejected
  OR
  ↓ (timeout)
expired
  OR
  ↓ (order cancelled)
cancelled
```

### Constraints
- Only ONE active assignment per order (partial unique index)
- Only ONE active assignment per rider (partial unique index)

---

## Dispatch States

The dispatch system uses PostgreSQL functions:

1. `dispatch_rider_v2()` — Finds nearest riders and creates offers
2. `find_nearest_riders()` — Spatial query for available riders
3. `accept_rider_offer()` — Atomic rider acceptance
4. `reject_rider_offer()` — Rider rejection
5. `process_expired_offers()` — Background job for timeouts

---

## Cancellation Rules

| Order State | Customer Can Cancel | Admin Can Cancel | Refund |
|-------------|--------------------|--------------------|--------|
| `draft` | ✅ | ✅ | N/A (no payment) |
| `pending_payment` | ✅ | ✅ | N/A |
| `paid` | ✅ | ✅ | Full refund |
| `searching_rider` | ✅ | ✅ | Full refund |
| `rider_assigned` | ✅ | ✅ | Full refund |
| `rider_en_route_to_pickup` | ✅ | ✅ | Full refund |
| `arrived_at_pickup` | ❌ | ✅ | Full refund |
| `picked_up` | ❌ | ✅ | Full refund |
| `in_transit` | ❌ | ✅ | Full refund |
| `arrived_at_destination` | ❌ | ❌ | N/A |
| `delivered` | ❌ | ❌ | N/A |
| `completed` | ❌ | ❌ | N/A |

---

## Delivery Proof States

- Proof can be submitted when order is in `arrived_at_destination` or later
- Proof consists of: text (required) + photo URL (optional)
- Once submitted, order moves to `delivered`

---

## Rating Availability

- Rating becomes available after order reaches `completed` status
- One rating per order
- Rating: 1-5 stars + optional comment
