# EMBEE NEXUS — PRODUCT UX BRIEF (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Product overview

Embee Nexus is a motorcycle delivery platform for Abuja, Nigeria: customers
book deliveries, verified riders execute them, operators supervise the closed
pilot. Core promise: *"You want it delivered. Embee Nexus is the right
platform for the job."*

**Absent by founder decision** (do not design for them in the web pilot):
realtime tracking, GPS/rider location, rider earnings/payouts UI, ratings,
notifications, seller features, addresses CRUD. Where the V1 brief described
these (`archive/v1/03-PRODUCT-UX-BRIEF.md`), they are historical.

## Roles

| Role | Entry | Capabilities (actual) |
|---|---|---|
| Customer | `(auth)/login` · `(auth)/signup` | Book (4-step wizard), pay (Flutterwave), track by status timeline, confirm receipt, cancel where permitted |
| Rider | `/rider/home` | Verification gate, availability toggle, receive/accept/decline one offer at a time (20 s TTL), execute delivery with OTP + photo evidence, waiting state, confirm return |
| Operator | `/operator` | Overview, order monitor, order detail (timeline/dispatch/payment/evidence/actions), rider visibility + verification review, jobs/health view |

## Customer journey (actual)

1. **Auth** — email/password; role defaults to customer.
2. **Booking wizard** `/orders/new` — locations (server geocode search → pick
   from results) → parcels → quote (server-priced, validity window) → payment.
   The customer never enters or sees coordinates.
3. **Payment** — Flutterwave via provider abstraction; return lands on
   `/payments/callback`; state is confirmed by backend verification only
   ("Secure checkout" copy; no provider branding).
4. **Tracking** `/orders/[orderId]` — canonical status vocabulary rendered from
   server truth; OTP issued to the customer for pickup and delivery handover.
5. **Completion** — explicit recipient confirmation (`recipient_confirmed`);
   no auto-completion timer exists.
6. **Cancellation** — customer may cancel through `en_route_pickup`; after
   arrival only operators may cancel (refund treatment is D06, founder-gated).

## Rider journey (actual)

1. **Verification gate** — approval required before dispatch eligibility;
   status surfaced at `/rider/home` with a link to `/rider/verification`.
2. **Availability** — explicit toggle; the longest-available eligible rider
   receives the next offer; availability is consumed when an offer is created.
3. **Offer** — single live offer with 20-second TTL countdown; accept or
   decline (decline restores availability with the queue clock reset).
4. **Execution** — status progression `rider_assigned → en_route_pickup →
   arrived_pickup → picked_up (pickup OTP + rider_pickup photo) → in_transit →
   arrived_destination → delivered (delivery OTP + rider_delivery photo)`.
5. **Waiting & return** — waiting is free for 10 minutes, then ₦700 per
   started minute to the 30-minute cap; at the cap the system initiates the
   return and the rider completes it; the order closes `failed`.
6. **After completion** — availability is NOT auto-restored; the rider
   re-declares it.

## Operator journey (actual)

1. **Overview** — what deliveries exist, what needs attention, payment
   progression, rider availability; attention flags derive only from real
   backend state (no invented SLAs).
2. **Order monitor** — canonical-status filters, attention indicator, last
   meaningful event.
3. **Order detail** — authoritative event timeline, dispatch state (current
   offer, TTL, attempts), payment state (initiated → redirected → pending →
   successful/failed/…), evidence via short-lived signed URLs (300 s),
   controlled actions: dispatch trigger/recovery, cancel with typed
   confirmation.
4. **Riders** — verification status, availability/queue clock, committed
   order, current offer; verification review at `/operator/riders/review`.
5. **Jobs** — the three real job endpoints with their observable effects;
   health from the real `/api/health` checks. No fabricated indicators.

## Cross-cutting UX (actual)

- Backend truth rendered verbatim; status copy single-sourced per role
  (`status-copy.ts`, `error-copy.ts`, `operator-labels.ts`).
- Explicit loading, empty, and error states on every data view.
- `role="alert"` / `role="status"` regions for errors and progress.
- 44px minimum touch targets on all primary/secondary interactive controls.
- Destructive actions require explicit confirmation (typed where operator).
- Whole-naira `₦` formatting; distances in km; no internal jargon in
  customer copy (e.g., "quote" presented as price with validity).
