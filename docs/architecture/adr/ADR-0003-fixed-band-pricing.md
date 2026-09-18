# ADR-0003 — Fixed-Band Distance Pricing

**Status:** Accepted · **Date:** 2026-09-18 · **Milestone:** M0 (recorded), M2 (implemented)

## Context

V1 priced deliveries with per-km + weight + urgency + VAT rules. The V2
founder model is a fixed 5-band table over actual road distance with no
hidden customer fees.

## Decision

Price deliveries from a server-authoritative, versioned, configurable band
table. The customer price includes everything; the rider/platform split is
derived per band. V1's VAT line item is dropped.

| Road distance | Customer price | Rider 70% | Embee 30% |
|---------------|---------------:|----------:|----------:|
| 0–5 km        |     ₦2,200     |  ₦1,540   |   ₦660    |
| >5–10 km      |     ₦2,600     |  ₦1,820   |   ₦780    |
| >10–15 km     |     ₦3,000     |  ₦2,100   |   ₦900    |
| >15–25 km     |     ₦3,600     |  ₦2,520   |  ₦1,080   |
| >25–35 km     |     ₦4,300     |  ₦3,010   |  ₦1,290   |

## Rules

- Stored and computed in integer kobo; floats are forbidden for money.
- Distance input comes from the maps abstraction (authoritative road
  distance, not straight-line).
- The applied band and amounts are snapshotted onto the order/quote;
  later pricing changes never alter existing orders.
- Pricing is never computed or trusted client-side.
- Maximum delivery distance for the MVP is 35 km; coverage zones are
  separately controlled data.

## Consequences

- M2 implements `pricing_bands` as operational data with validity windows
  and audit trail.
- The waiting charge (decision D05) remains unresolved and must be
  configurable when decided — it is NOT silently invented.
