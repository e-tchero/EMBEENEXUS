# ADR-0001 — V2 Reset and Modular Monolith

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0

## Context

The V1 repository (MBEENEXUS) reached feature completeness but accumulated
spec bloat (38+ tables, 46+ routes) and provider decisions superseded by
current founder business rules. V2 intentionally starts from a clean
baseline (`caeaeb2`) without importing V1 git history.

## Decision

- V2 is a **modular monolith**: one Next.js 15 application with explicit
  domain module boundaries (`lib/domain`, `lib/services`, `lib/providers`),
  not microservices. Domain boundaries stay sharp so extraction remains
  possible later if scale ever demands it.
- PostgreSQL functions (RPCs) own complex transactional invariants;
  route handlers stay thin.
- V1 documents are historical input, not authority. Where they conflict
  with current founder business decisions, the founder decisions win.
- `supabase/migrations` is the only path to schema change; no manual
  production database edits.

## Consequences

- The M0 schema contains only foundation tables (profiles, audit, jobs,
  webhook idempotency) — the full 30–40 table V1 schema is NOT carried over.
- Domain logic is pure and unit-tested before persistence exists
  (`lib/domain/order-state.ts`), so later PostgreSQL RPCs mirror tested
  domain rules rather than ad-hoc SQL.
