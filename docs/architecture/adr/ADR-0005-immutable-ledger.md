# ADR-0005 — Immutable Financial Ledger

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0 (recorded), M8 (implemented)

## Context

Historical earnings must never be recomputed from mutable order records.
Financial history must be auditable, reconcilable, and tamper-evident.

## Decision

All money movements are recorded in an append-only ledger:

- **Integer minor units (kobo) only.** Floats are forbidden for money.
- Entries are immutable: no updates, no deletes; corrections are new
  contra-entries.
- Every entry carries: type, reference (order/payment/payout), actor,
  and a corresponding audit event.
- Balances are derived from entries; rider earnings (70%) and platform
  revenue (30%) post on delivery completion, per the pricing snapshot.
- Daily payouts debit rider balances via payout batches
  (cutoff/approval/failed-payout handling pending decisions D13–D15).
- Refunds (pending D06/D17/D18) post as contra-entries with approval
  metadata.

## Consequences

- Every financial mutation is authorized, idempotent, auditable.
- Reconciliation compares gateway records against ledger entries.
- The ledger subsystem ships with transactional tests before launch.
