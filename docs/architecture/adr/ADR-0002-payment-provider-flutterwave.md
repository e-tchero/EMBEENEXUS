# ADR-0002 — Payment Provider: Flutterwave

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0 (recorded), M4 (implemented)

## Context

V1 used Paystack. The founder business decisions for V2 designate
**Flutterwave** as the primary payment gateway for the Nigerian launch:
card + bank transfer + USSD coverage, NGN settlement, webhook support.

## Decision

Adopt Flutterwave as the initial payment provider, behind a server-side
payment provider abstraction. Future providers/currencies must remain
architecturally possible without domain changes.

## Rules (business authority)

- No cash. Customer pays before order confirmation.
- Backend independently verifies payment; frontend success callbacks are
  never authoritative.
- Rider assignment cannot occur before server-verified payment.
- Payment failure never creates a confirmed delivery.
- `Under Review` may hold a delivery where payment state needs investigation.
- Funds remain under Embee financial control until completion; gateway fees
  are borne by Embee (recorded for reconciliation).

## Consequences

- Webhook processing uses `webhook_events` idempotency
  (`UNIQUE (provider, provider_event_id)`), signature verification on the raw
  body inside server-only code, and amount cross-checks against the
  server-computed order snapshot.
- The payment states (`initiated → pending_verification → verified | failed |
  under_review`) are a separate axis from the order state machine.
- V1 Paystack material is historical input only.
