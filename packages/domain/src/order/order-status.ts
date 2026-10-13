/**
 * OrderStatus — the canonical 15-value order lifecycle.
 *
 * Membership is locked to the directive's state list, which matches the union
 * of the documented lifecycle (04 §1) and the exception state (04 §2.1):
 *
 *   CREATED, QUOTE_GENERATED, PAYMENT_PENDING, PAYMENT_CONFIRMED, DISPATCHING,
 *   RIDER_ASSIGNED, EN_ROUTE_TO_PICKUP, ARRIVED_AT_PICKUP, PARCEL_COLLECTED,
 *   EN_ROUTE_TO_DELIVERY, ARRIVED_AT_DELIVERY, RECIPIENT_UNAVAILABLE,
 *   DELIVERED, CANCELLED, RETURN_TO_SENDER
 *
 * `RIDER_OFFER_ACTIVE` from the 04 §1 diagram is deliberately NOT an Order
 * status: it lives on the DispatchOffer / DispatchAttempt entity as status
 * `OFFERED`, and the parent order stays `DISPATCHING` for the whole offer
 * cascade. See ../dispatch/dispatch-offer.ts.
 *
 * Note on the source documents: 03_DOMAIN_MODEL.md §2.2 says "15 values" while
 * enumerating 14 — RECIPIENT_UNAVAILABLE is the missing one. It is included
 * here as a first-class member, which resolves that counting gap without
 * changing any documented transition.
 */

export const OrderStatus = {
  CREATED: 'CREATED',
  QUOTE_GENERATED: 'QUOTE_GENERATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  DISPATCHING: 'DISPATCHING',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  EN_ROUTE_TO_PICKUP: 'EN_ROUTE_TO_PICKUP',
  ARRIVED_AT_PICKUP: 'ARRIVED_AT_PICKUP',
  PARCEL_COLLECTED: 'PARCEL_COLLECTED',
  EN_ROUTE_TO_DELIVERY: 'EN_ROUTE_TO_DELIVERY',
  ARRIVED_AT_DELIVERY: 'ARRIVED_AT_DELIVERY',
  RECIPIENT_UNAVAILABLE: 'RECIPIENT_UNAVAILABLE',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_TO_SENDER: 'RETURN_TO_SENDER',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Every status, in lifecycle order. */
export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.QUOTE_GENERATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAYMENT_CONFIRMED,
  OrderStatus.DISPATCHING,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.EN_ROUTE_TO_PICKUP,
  OrderStatus.ARRIVED_AT_PICKUP,
  OrderStatus.PARCEL_COLLECTED,
  OrderStatus.EN_ROUTE_TO_DELIVERY,
  OrderStatus.ARRIVED_AT_DELIVERY,
  OrderStatus.RECIPIENT_UNAVAILABLE,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.RETURN_TO_SENDER,
];

/** 15 — asserted by the test suite so a silent omission cannot ship. */
export const ORDER_STATUS_COUNT = ALL_ORDER_STATUSES.length;

/** The happy-path spine, from creation to a completed delivery. */
export const HAPPY_PATH: readonly OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.QUOTE_GENERATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAYMENT_CONFIRMED,
  OrderStatus.DISPATCHING,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.EN_ROUTE_TO_PICKUP,
  OrderStatus.ARRIVED_AT_PICKUP,
  OrderStatus.PARCEL_COLLECTED,
  OrderStatus.EN_ROUTE_TO_DELIVERY,
  OrderStatus.ARRIVED_AT_DELIVERY,
  OrderStatus.DELIVERED,
];

/**
 * Terminal states — no outgoing transitions.
 * RECIPIENT_UNAVAILABLE is excluded: it is non-terminal because 04 §2.1 gives
 * it exactly one outgoing edge, to RETURN_TO_SENDER.
 */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.RETURN_TO_SENDER,
]);

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ALL_ORDER_STATUSES as readonly string[]).includes(value);
}

export function assertOrderStatus(value: unknown): asserts value is OrderStatus {
  if (!isOrderStatus(value)) {
    throw new RangeError(`Not a known OrderStatus: ${String(value)}.`);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.has(status);
}
