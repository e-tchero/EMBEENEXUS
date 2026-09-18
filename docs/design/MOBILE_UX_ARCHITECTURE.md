# Embee Nexus — Mobile UX Architecture

**Status:** PROPOSED — engineering recommendation, founder review required.
**Date:** 2026-09-18 · **Phase:** Design foundation (pre-M4)

> Mobile is the primary product experience. Hierarchy: BrandKit → Design
> Tokens → Mobile UX Architecture → Mobile experiences → Web/Operator surfaces.
> The client is never authoritative for pricing, distance, coverage, payment
> verification, order state, rider assignment, financials, or authorization.

## 1. Customer flow (information architecture)

```text
Onboarding (value prop + phone signup)
   ↓
Home  (recent addresses, active order card, price shortcut)
   ↓
Pickup selection        → map + search sheet
   ↓
Destination selection   → map + search sheet
   ↓
Quote                   → server snapshot: distance, ₦, expiry
   ↓
Payment                 → M4 gateway sheet (client never marks paid)
   ↓
Searching for rider     → status + cancel (cancellation policy = D06, FOUNDER)
   ↓
Rider assigned          → rider card, no live location before pickup (M7)
   ↓
Rider en route          → map status progression
   ↓
Arrived at pickup       → pickup OTP handoff (M6)
   ↓
In transit              → live map + ETA (M7)
   ↓
Arrived at destination  → delivery OTP + recipient inspection (M6)
   ↓
Delivered → Completed   → receipt, re-order
```

Server mapping: every named step consumes an M3 order state; the app renders
server state, it does not maintain a parallel lifecycle. Cancel affordance is
gated by the state machine's customer-cancel contract (ends at
`en_route_to_pickup`); refund rules stay D06/D17/D18 founder decisions.

## 2. Rider flow

```text
Onboarding → Verification (M1 lifecycle: pending → under_review → approved | rejected)
   ↓
Availability toggle     → readiness separate from verification (M1 rule)
   ↓
Delivery offer          → 20 s countdown, limited info (M5 — not authorized yet)
   ↓
Accept → Navigate to pickup → Arrive
   ↓
Pickup verification     → photo + OTP (M6)
   ↓
Navigate to destination → in-transit GPS duty cycle (M7)
   ↓
Delivery verification   → delivery photo + OTP + recipient confirm (M6)
   ↓
Completed → Earnings    → ledger-driven (M8)
```

M3-time reality: verification (M1) is implemented; availability, offers, and
earnings are **not authorized** — the inventory marks them future-phase.

## 3. Seller flow

Respects existing V2 seller architecture; **no seller functionality invented**.
Mobile-required later (per V2 direction, not authorized yet): session-based
batch order creation (max 3 deliveries/session), one payment per session,
permanent tracking link management. Everything seller belongs to M9; the
screen inventory lists entry points only, marked `M9 — NOT AUTHORIZED`.

## 4. Operator surface

Operator remains an **operational/admin surface, not a consumer design
target**: dense tables, wide layout, desktop-first web, all authority via
server RPCs (M1/M3 model). It is explicitly excluded from mobile design
polish; it must be functional and safe, not beautiful.

## 5. Interaction principles

| Principle | Rule |
|---|---|
| Thumb reach | Primary actions bottom-anchored; destructive actions NOT in thumb zone |
| Touch targets | ≥ 44 pt (iOS) / 48 dp (Android); expand hit area beyond visual icon |
| One-handed use | Core loops (order → track → confirm) completable one-handed |
| Bottom sheets | Nonmodal for map-context info; modal for decisions; always visible close + back-dismiss; never stacked; short interactions only (NN/g, DESIGN_RESEARCH.md §4) |
| Map interaction | One primary gesture per region; overlays never block pan/zoom; pin-drag refined location |
| Keyboard | Never over primary CTA; scroll-into-view on focus; numeric pads for OTP/phone/money |
| Loading | Skeletons matching final layout (no spinners for full screens); optimistic UI only for non-authoritative affordances |
| Error recovery | Every error names the next action; retry preserves entered data |
| Confirmation friction | Proportional: money and irreversible actions get friction; re-ordering gets none |
| Destructive actions | Explicit confirmation modal stating consequence |
| Accessibility | Contrast ≥ 4.5:1 both themes; color never sole indicator; reduced-motion honored; dynamic type never truncates financial figures |
| Network (Abuja reality) | Assume 3G-grade latency and drops: aggressive caching of last-known order state, queued actions with visible pending state, no blocking spinners on flaky links, idempotent retries (M3 RPCs are idempotency-anchored), offline banner whenever socket/state stale |

## 6. Map UX (designed around the M2 abstraction — provider untouched)

| Concern | UX rule |
|---|---|
| Pickup selection | Search-first, map-confirm second; recent addresses cached for offline |
| Destination selection | Same pattern; live distance/coverage check on confirm |
| Search | Server geocoding via `MapsProvider` (Stadia today); results always labeled with reverse-geocoded address before selection |
| Reverse geocoding | Show human-readable address + "Use my location" fallback |
| Route preview | Server-returned polyline rendered client-side; client never recalculates |
| Distance presentation | Server metres → "5.2 km"; band threshold not exposed |
| Map loading | Tile-placeholder tint + skeleton sheet; map never blank-flashes |
| Map error | Retry affordance + address-only flow still functional |
| Permission denied | Address-search-only mode; explainer; settings deep-link |
| Inaccurate GPS | Accuracy chip ("±40 m") + manual pin refine; server validates final coords |
| Coverage rejection | Inline map message naming the uncovered point; suggest adjusting pin |
| > 35 km rejection | Same treatment; copy: "This trip is beyond our current delivery area (35 km maximum)." |
| Price | Always from server quote snapshot; the client **never** computes authoritative price or distance |

## 7. Mobile technology recommendation

**Engineering recommendation — NOT a founder decision; requires ratification
before any mobile milestone is authorized.**

| Option | Fit | Verdict |
|---|---|---|
| **Expo / React Native** (recommended) | One TypeScript codebase for Android+iOS; lives in the existing pnpm monorepo and imports `@embee/shared` (zod schemas, role model); mature Expo modules for camera (M6 photos), location/background tasks (M7 GPS duty cycle), notifications (push), secure storage; Supabase JS works identically; largest hiring pool; OTA updates for rapid iteration | **Recommended** |
| Flutter | Excellent performance and maps tooling; but Dart fragments the codebase — every shared schema/validation duplicated, second language skill requirement | Not preferred |
| Native (Kotlin/Swift) | Best platform fidelity; two codebases, two teams' worth of work — unjustifiable for V2 scope and velocity | Rejected for V2 |
| PWA / Capacitor wrapper | Cheapest path; but background GPS reliability, camera/OTP UX, and offline durability on low-end Androids are materially weaker — the rider app is the core operational surface | Rejected for rider/customer apps; web remains operator/surface |

Rationale anchors: server-authoritative backend is unchanged (mobile is
another client of the same API/RPC boundary); Abuja network realities favor
the smallest bundle and shared validation code; camera + background-location +
push are hard M6/M7 requirements that Expo already solves. Risks: Expo
managed-workflow limits for heavy background GPS (mitigated by config
plugins/dev builds when M7 arrives); React Native upgrade churn.

## 8. Offline & low-connectivity behavior (global rules)

1. Last-known order state cached and labeled with its age.
2. Mutations queue with visible pending state; duplicates impossible server-side (M3 idempotency).
3. Realtime updates (M7) degrade to polling; UI must not assume push delivery.
4. Images (photos, M6) upload lazily with retry; low-data mode defers non-essential imagery.
