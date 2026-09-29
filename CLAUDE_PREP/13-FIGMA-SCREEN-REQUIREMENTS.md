# EMBEE NEXUS — FIGMA SCREEN REQUIREMENTS (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

**Figma is not yet the approved visual source of truth.** No Figma file has
been approved by the founder; when one is, `14-FIGMA-HANDOFF-RULES.md`
activates as the constraint set. This catalog maps the actual V2 product —
screens are not invented to complete the catalog.

## Public / shared

| # | Screen | Priority | Responsive | Notes |
|---|---|---|---|---|
| 1 | Landing | MUST | Mobile + Desktop | Hero, value prop, CTAs |
| 2 | Login | MUST | Mobile + Desktop | Email/password |
| 3 | Signup | MUST | Mobile + Desktop | |
| 4 | 404 Not Found | SHOULD | Mobile + Desktop | exists (`not-found.tsx`) |
| 5 | Error page | SHOULD | Mobile + Desktop | exists (`error.tsx`, `global-error.tsx`) |

## Customer

| # | Screen | Priority | Responsive | Notes |
|---|---|---|---|---|
| 6 | Dashboard home (customer) | MUST | Mobile + Desktop | role-forked |
| 7 | New booking — locations | MUST | Mobile + Desktop | server geocode search; no coordinates shown |
| 8 | New booking — parcels | MUST | Mobile + Desktop | motorcycle-sized categories |
| 9 | New booking — quote | MUST | Mobile + Desktop | price breakdown + validity window |
| 10 | New booking — payment | MUST | Mobile + Desktop | "Secure checkout" step |
| 11 | Payment callback | MUST | Mobile + Desktop | polling return surface |
| 12 | Order tracking (status timeline) | MUST | Mobile + Desktop | no map — status/timeline is the tracking surface |
| 13 | Order OTP display | MUST | Mobile + Desktop | customer-side pickup/delivery OTP, shown once |
| 14 | Confirm receipt | MUST | Mobile + Desktop | `recipient_confirmed` |
| 15 | Cancellation confirmation | SHOULD | Mobile + Desktop | where state permits |
| 16 | Waiting/return state view | SHOULD | Mobile + Desktop | waiting banner + return notice copy |

## Rider

| # | Screen | Priority | Responsive | Notes |
|---|---|---|---|---|
| 17 | Rider home (verification gate) | MUST | Mobile | approved/pending/rejected states |
| 18 | Availability toggle state | MUST | Mobile | explicit on/off |
| 19 | Offer card (20 s TTL) | MUST | Mobile | countdown, accept/decline |
| 20 | Active delivery (status progression) | MUST | Mobile | thumb-friendly, one-handed |
| 21 | Photo evidence capture/upload | MUST | Mobile | three-kind custody chain |
| 22 | OTP verification entry | MUST | Mobile | mono boxes |
| 23 | Waiting banner + return confirm | MUST | Mobile | D05 cap flow |

## Operator (desktop-primary, mobile-usable)

| # | Screen | Priority | Responsive | Notes |
|---|---|---|---|---|
| 24 | Overview + attention queue | MUST | Desktop | real-state attention only |
| 25 | Order monitor + filters | MUST | Desktop | canonical-status tabs |
| 26 | Order detail (timeline, dispatch, payment, evidence) | MUST | Desktop | signed-URL evidence viewing |
| 27 | Operator cancel (typed confirm) | MUST | Desktop | destructive confirmation pattern |
| 28 | Dispatch trigger/recovery | MUST | Desktop | outcome surfaced |
| 29 | Rider visibility list | MUST | Desktop | verification/availability/offers |
| 30 | Rider verification review | MUST | Desktop | approve/reject + notes |
| 31 | Jobs/health | SHOULD | Desktop | real signals only |

## Removed from the V1 catalog (obsolete for V2)

Address CRUD (no addresses table in pilot), real-time tracking map, ratings,
refund status, notification bell/panel, rider earnings screens, admin sidebar
screens, GPS/vehicle management, forgot-password screens beyond current auth
scope. These exist in `archive/v1/13-FIGMA-SCREEN-REQUIREMENTS.md` as history.

## Design notes (retained)

1. Booking flow is the money flow — frictionless.
2. Status/timeline presentation is the trust surface (until map milestones).
3. Rider screens are thumb-friendly, one-handed, large targets.
4. Operator is desktop-first, data-dense, efficient.
5. Every screen defines loading, empty, and error states — missing any fails
   design review.
