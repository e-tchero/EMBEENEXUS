# ADR-0006 — Provider Abstractions

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0 (recorded), adapters M2/M4+

## Context

V1's maps abstraction proved its worth (Paystack→n/a, provider swap without
domain changes). V2 must avoid permanent coupling to Stadia Maps,
Flutterwave, or any SMS provider.

## Decision

Domain services depend on provider-neutral interfaces, never provider SDKs:

- `lib/providers/maps-provider.ts` — geocoding, reverse geocoding, search,
  routes, road distance, ETA (M0 defines the contract).
- `lib/providers/payment-provider.ts` — payment initialization, verification,
  webhook normalization (M4).
- Notification channels (SMS + in-app first, event-driven) are abstracted
  when implemented; providers remain swappable.

Concrete adapters: Stadia Maps (M2), Flutterwave (M4).

## Rules

- Provider secrets live only in `lib/env/server.ts` (never client bundles).
- Adapters implement retries, timeouts, and caching where appropriate.
- Road distance for pricing always comes from the abstraction, never
  straight-line math.

## Consequences

- Swapping a provider = new adapter + env change; no domain rewrites.
