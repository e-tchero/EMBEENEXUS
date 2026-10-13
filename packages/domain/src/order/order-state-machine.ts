/**
 * Order state machine — strict transition guards over the 15 OrderStatus values.
 *
 * Forward edges are taken verbatim from 04_STATE_MACHINES_AND_WORKFLOWS.md §1
 * and the exception rule in §2.1.
 *
 * Cancellation edges are the one inference in this file. The canonical
 * documents list CANCELLED as a state but do not enumerate its inbound edges,
 * and the refund schedule that would pin the cut-off is still open
 * (13_OPEN_DECISIONS_REGISTER.md Item 05; return-handoff in Item 10). The rule
 * encoded here is therefore kept in a single named constant:
 *
 *   an order may be cancelled only while the parcel is NOT yet in rider
 *   custody — i.e. everything up to and including ARRIVED_AT_PICKUP.
 *
 * Once PARCEL_COLLECTED has happened the parcel is the rider's responsibility,
 * so the only documented exit is the exception path through
 * RECIPIENT_UNAVAILABLE to RETURN_TO_SENDER. When Item 05 is resolved, only
 * CANCELLABLE_ORDER_STATUSES needs to change.
 *
 * This module contains no framework, database, or vendor imports.
 */

import {
  OrderStatus,
  isTerminalOrderStatus,
  type OrderStatus as OrderStatusValue,
} from './order-status.js';

export class IllegalOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatusValue,
    readonly to: OrderStatusValue,
  ) {
    super(`Illegal order transition: ${from} -> ${to}.`);
    this.name = 'IllegalOrderTransitionError';
  }
}

/**
 * An order may be cancelled up to the moment the rider takes custody.
 * INFERRED — see the file header; tied to open register Item 05.
 */
export const CANCELLABLE_ORDER_STATUSES: ReadonlySet<OrderStatusValue> = new Set([
  OrderStatus.CREATED,
  OrderStatus.QUOTE_GENERATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAYMENT_CONFIRMED,
  OrderStatus.DISPATCHING,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.EN_ROUTE_TO_PICKUP,
  OrderStatus.ARRIVED_AT_PICKUP,
]);

const CANCELLATION_EDGE: readonly OrderStatusValue[] = [OrderStatus.CANCELLED];

function cancellableFrom(status: OrderStatusValue): readonly OrderStatusValue[] {
  return CANCELLABLE_ORDER_STATUSES.has(status) ? CANCELLATION_EDGE : [];
}

/**
 * The complete, authoritative transition table. Every OrderStatus appears as a
 * key; a terminal state maps to an empty list.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatusValue, readonly OrderStatusValue[]>> = {
  [OrderStatus.CREATED]: [OrderStatus.QUOTE_GENERATED, ...cancellableFrom(OrderStatus.CREATED)],
  [OrderStatus.QUOTE_GENERATED]: [
    OrderStatus.PAYMENT_PENDING,
    ...cancellableFrom(OrderStatus.QUOTE_GENERATED),
  ],
  [OrderStatus.PAYMENT_PENDING]: [
    OrderStatus.PAYMENT_CONFIRMED,
    ...cancellableFrom(OrderStatus.PAYMENT_PENDING),
  ],
  [OrderStatus.PAYMENT_CONFIRMED]: [
    OrderStatus.DISPATCHING,
    ...cancellableFrom(OrderStatus.PAYMENT_CONFIRMED),
  ],
  // Self-edge: the order stays DISPATCHING while an offer is OFFERED. The 04 §1
  // RIDER_OFFER_ACTIVE branch is represented on DispatchOffer, not here.
  [OrderStatus.DISPATCHING]: [
    OrderStatus.DISPATCHING,
    OrderStatus.RIDER_ASSIGNED,
    ...cancellableFrom(OrderStatus.DISPATCHING),
  ],
  [OrderStatus.RIDER_ASSIGNED]: [
    OrderStatus.EN_ROUTE_TO_PICKUP,
    ...cancellableFrom(OrderStatus.RIDER_ASSIGNED),
  ],
  [OrderStatus.EN_ROUTE_TO_PICKUP]: [
    OrderStatus.ARRIVED_AT_PICKUP,
    ...cancellableFrom(OrderStatus.EN_ROUTE_TO_PICKUP),
  ],
  [OrderStatus.ARRIVED_AT_PICKUP]: [
    OrderStatus.PARCEL_COLLECTED,
    ...cancellableFrom(OrderStatus.ARRIVED_AT_PICKUP),
  ],
  // Parcel is in rider custody: no cancellation edge, per the inferred rule.
  [OrderStatus.PARCEL_COLLECTED]: [OrderStatus.EN_ROUTE_TO_DELIVERY],
  [OrderStatus.EN_ROUTE_TO_DELIVERY]: [OrderStatus.ARRIVED_AT_DELIVERY],
  [OrderStatus.ARRIVED_AT_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.RECIPIENT_UNAVAILABLE],
  [OrderStatus.RECIPIENT_UNAVAILABLE]: [OrderStatus.RETURN_TO_SENDER],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURN_TO_SENDER]: [],
};

export function nextStates(from: OrderStatusValue): readonly OrderStatusValue[] {
  return ORDER_TRANSITIONS[from];
}

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatusValue): boolean {
  return isTerminalOrderStatus(status) || ORDER_TRANSITIONS[status].length === 0;
}

/** Throw unless `from -> to` is legal. */
export function assertTransition(from: OrderStatusValue, to: OrderStatusValue): void {
  if (!canTransition(from, to)) {
    throw new IllegalOrderTransitionError(from, to);
  }
}

/** Apply a transition, returning the resulting status; throws when illegal. */
export function transition(from: OrderStatusValue, to: OrderStatusValue): OrderStatusValue {
  assertTransition(from, to);
  return to;
}

/**
 * Drive an order through a sequence of intended transitions, stopping (and
 * throwing) at the first illegal hop.
 */
export function transitionAll(
  from: OrderStatusValue,
  path: readonly OrderStatusValue[],
): OrderStatusValue {
  return path.reduce<OrderStatusValue>((current, next) => transition(current, next), from);
}
