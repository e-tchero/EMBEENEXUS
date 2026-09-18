# ADR-0004 — Rider Dispatch: Queue with Atomic Claim

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0 (recorded), M5 (implemented)

## Context

Rider assignment must be fair, race-free, and server-authoritative. V1's
nearest-rider model does not match the V2 business rules.

## Decision

Dispatch is a server-controlled availability queue:

1. Rider manually becomes `Available`.
2. Eligible riders enter the queue ordered by longest availability.
3. The longest-available eligible rider receives the offer first.
4. Exactly one rider is offered an order at a time.
5. An offer expires after **20 seconds**.
6. Limited information is shown before acceptance; full details after.
7. Declined/expired offers return the rider to the eligible queue.
8. Double assignment must be impossible.

## Implementation direction

- `rider_offers` with partial unique indexes: at most one active offer per
  order AND per rider — DB-enforced, race-free.
- Offer creation and acceptance are single atomic PostgreSQL RPCs
  (`SECURITY DEFINER`, locked `search_path`, caller authorization checked);
  the pure ordering logic is mirrored in `lib/domain` for testability.
- Expiry handled by a durable background job, not client timers.
- Concurrency safety: `SELECT ... FOR UPDATE SKIP LOCKED` /
  advisory locks at the claim point.

## Consequences

- No simple frontend query can assign riders; assignment is RPC-only.
- V1's `find_nearest_riders()` proximity dispatch is retired.
