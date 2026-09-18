/**
 * Coverage domain rules — domain foundation (M2).
 *
 * Pure and deterministic. Zone membership itself is determined by PostGIS in
 * the database (`is_point_covered`, migration 0004) — this module evaluates
 * the delivery-level rules once endpoint membership facts are established
 * server-side.
 *
 * M2 rule (documented in ADR-0003 / ARCHITECTURE-V2): a delivery is coverable
 * only when BOTH the pickup and the dropoff point lie inside active zones.
 * Cross-zone or one-endpoint-outside deliveries are outside launch scope;
 * this is an operational launch rule, not an unresolved P0 business decision.
 */

export type DeliveryEndpoint = 'pickup' | 'dropoff';

export interface DeliveryCoverageInput {
  /** Server-established: is the pickup point inside an active zone? */
  readonly pickupCovered: boolean;
  /** Server-established: is the dropoff point inside an active zone? */
  readonly dropoffCovered: boolean;
}

export type DeliveryCoverageDecision =
  | { status: 'covered' }
  | { status: 'outside_coverage'; uncoveredEndpoints: readonly DeliveryEndpoint[] };

export function evaluateDeliveryCoverage(input: DeliveryCoverageInput): DeliveryCoverageDecision {
  const uncovered: DeliveryEndpoint[] = [];
  if (!input.pickupCovered) uncovered.push('pickup');
  if (!input.dropoffCovered) uncovered.push('dropoff');

  if (uncovered.length === 0) return { status: 'covered' };
  return { status: 'outside_coverage', uncoveredEndpoints: uncovered };
}
