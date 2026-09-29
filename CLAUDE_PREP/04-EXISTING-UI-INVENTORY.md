# EMBEE NEXUS — EXISTING UI INVENTORY (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE (derived from actual codebase) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Only routes that actually exist are listed. There is no shared component
library; components are co-located with their routes. State coverage
(loading/empty/error) is documented per surface.

## Pages

| Route | Files | Purpose | Notes |
|---|---|---|---|
| `/` | `page.tsx` | Landing | Hero, value prop, CTAs (44px targets) |
| `(auth)/login` | `page.tsx` | Customer/rider/operator login | `role="alert"` error region |
| `(auth)/signup` | `page.tsx` | Account creation | `role="alert"` error region |
| `/dashboard` | `page.tsx`, `dashboard-client.tsx` | Role fork + customer home | rider → `/rider/home`, operator → `/operator` |
| `/orders/new` | `page.tsx`, `wizard.tsx`, `locations-form.tsx`, `parcels-form.tsx`, `quote-form.tsx`, `payment-step.tsx` | Booking wizard (4 steps) | server geocode search; quote validity; "Secure checkout" payment step |
| `/orders/[orderId]` | `page.tsx`, `order-status-client.tsx`, `status-copy.ts` | Customer tracking | canonical status vocabulary, OTP issue entry, confirm receipt, cancel where permitted |
| `/payments/callback` | `page.tsx`, `callback-client.tsx` | Flutterwave return | polling via `/api/payments/status/poll` |
| `/rider/home` | `page.tsx`, `home-client.tsx`, `offer-card.tsx`, `order-card.tsx`, `error-copy.ts` | Rider console | verification gate, availability toggle, 20 s offer countdown, status progression, OTP entry, waiting banner, return confirm |
| `/rider/verification` | `page.tsx` | Verification status + guidance | links to console |
| `/operator` | `layout.tsx` (server gate), `page.tsx` | Operator overview | attention queue from real state |
| `/operator/orders` | `page.tsx` | Order monitor | canonical-status filter tabs, attention indicator |
| `/operator/orders/[orderId]` | `page.tsx`, `action-buttons.tsx`, `evidence-viewer.tsx` | Order detail | timeline, dispatch state, payment state, evidence (signed URLs), typed-confirm cancel |
| `/operator/riders` | `page.tsx` | Rider visibility | verification, availability, committed order, current offer |
| `/operator/riders/review` | `page.tsx`, `review-form.tsx` | Verification review | approve/reject with notes |
| `/operator/jobs` | `page.tsx` | Jobs/health | real job endpoints + `/api/health` signals |

Shared chrome: `error.tsx`, `global-error.tsx`, `not-found.tsx` (all styled per
the design contract).

## Component ownership

| Concern | Owner | Notes |
|---|---|---|
| Status copy (customer) | `orders/[orderId]/status-copy.ts` | single source |
| Error copy (rider) | `rider/error-copy.ts` | maps business codes |
| Operator labels | `lib/domain/operator-labels.ts` | statuses, events, actions |
| Attention derivation | `lib/domain/operator-attention.ts` | real-state only, unit-tested |
| Rider flow view model | `lib/domain/rider-flow.ts` | next-step mapping, unit-tested |
| Waiting math | `lib/domain/waiting.ts` | D05 caps/fees |
| OTP entry | `rider/order-card.tsx` | `font-mono` boxes |
| Evidence viewer | `operator/orders/[orderId]/evidence-viewer.tsx` | per-kind signed URLs (300 s) |
| Action buttons (operator) | `operator/orders/[orderId]/action-buttons.tsx` | typed `CANCEL` confirmation |

## Design-system state

- Tokens: `globals.css` `@theme inline` (light + dark values) documented in
  `apps/web/DESIGN.md` v0.1.
- No logo, favicon, or brand assets are wired into the app yet
  (`apps/web/public/` does not exist) — integration is a subsequent phase.
- Typeface: system stack; Manrope integration approved for the next
  implementation phase.

## Historical note

The V1 inventory (shadcn primitives, `components/*` tree, `admin/*` pages,
notification bell, tracking map) is preserved in
`archive/v1/04-EXISTING-UI-INVENTORY.md` and does not describe V2.
