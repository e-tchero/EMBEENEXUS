/**
 * Order state machine — domain foundation (M0).
 *
 * This module is the single authoritative definition of the delivery order
 * lifecycle for V2. It is pure and deterministic: no I/O, no persistence,
 * no clocks. Persistence, RLS and transition enforcement in PostgreSQL are
 * later milestones; when they land, they must mirror this table exactly.
 *
 * Design notes:
 * - Payment state is deliberately NOT part of this machine. Payment is a
 *   separate axis (Flutterwave verification) with its own states; order
 *   transitions may reference payment facts only through guard inputs.
 * - `cancelled` and `failed` are explicit terminal outcomes so that the
 *   type system can distinguish them from the active lifecycle.
 * - Every guard consults only facts the server can independently establish
 *   (webhook verification, server-side OTP checks) — never client assertions.
 * - Cancellation is structurally permitted, but the refund/financial
 *   treatment of cancellation is decision D06 (unresolved) and is NOT
 *   encoded here.
 */

export type OrderStatus =
  // lifecycle
  | 'draft'
  | 'awaiting_payment'
  | 'payment_verified'
  | 'searching_rider'
  | 'rider_assigned'
  | 'en_route_to_pickup'
  | 'arrived_at_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_at_destination'
  | 'delivered'
  | 'completed'
  // terminal outcomes
  | 'cancelled'
  | 'failed';

export const ALL_STATUSES: readonly OrderStatus[] = [
  'draft',
  'awaiting_payment',
  'payment_verified',
  'searching_rider',
  'rider_assigned',
  'en_route_to_pickup',
  'arrived_at_pickup',
  'picked_up',
  'in_transit',
  'arrived_at_destination',
  'delivered',
  'completed',
  'cancelled',
  'failed',
];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['cancelled', 'failed'];

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/**
 * Actors permitted to initiate a transition. The server must verify both
 * the actor's identity AND that the actor is permitted for this specific
 * transition on this specific order before applying it.
 */
export type OrderActor = 'customer' | 'seller' | 'recipient' | 'rider' | 'operator' | 'system';

/** Facts a guard may consult. All of them must be server-established. */
export interface OrderTransitionFacts {
  /** Payment verified by backend via payment webhook — never a client callback. */
  paymentVerified: boolean;
  /** A rider has accepted an offer (server-recorded). */
  riderAssigned: boolean;
  /** Pickup OTP verified server-side. */
  pickupOtpVerified: boolean;
  /** Delivery OTP verified server-side. */
  deliveryOtpVerified: boolean;
  /** Recipient inspection confirmed (final confirmation gate). */
  recipientConfirmed: boolean;
}

/** Facts that are typically unknown before payment/dispatch default to false. */
export const NO_FACTS: OrderTransitionFacts = {
  paymentVerified: false,
  riderAssigned: false,
  pickupOtpVerified: false,
  deliveryOtpVerified: false,
  recipientConfirmed: false,
};

export type GuardCheck = { allowed: true } | { allowed: false; reason: string };

export type TransitionGuard = (facts: OrderTransitionFacts) => GuardCheck;

export interface OrderTransition {
  from: OrderStatus;
  to: OrderStatus;
  trigger: string;
  /** Actors allowed to initiate; 'system' means server-initiated only. */
  actors: readonly OrderActor[];
  guards: readonly TransitionGuard[];
}

const guard = (
  condition: (facts: OrderTransitionFacts) => boolean,
  reason: string,
): TransitionGuard => (facts) => (condition(facts) ? { allowed: true } : { allowed: false, reason });

export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  {
    from: 'draft',
    to: 'awaiting_payment',
    trigger: 'order_submitted',
    actors: ['customer', 'seller', 'system'],
    guards: [],
  },
  {
    from: 'awaiting_payment',
    to: 'payment_verified',
    trigger: 'payment_verified',
    actors: ['system'],
    guards: [guard((f) => f.paymentVerified, 'Payment must be verified server-side first')],
  },
  {
    from: 'payment_verified',
    to: 'searching_rider',
    trigger: 'dispatch_started',
    actors: ['system'],
    guards: [],
  },
  {
    from: 'searching_rider',
    to: 'rider_assigned',
    trigger: 'rider_accepted_offer',
    actors: ['rider', 'system'],
    guards: [guard((f) => f.riderAssigned, 'A rider offer must be accepted first')],
  },
  {
    from: 'rider_assigned',
    to: 'en_route_to_pickup',
    trigger: 'rider_departed',
    actors: ['rider'],
    guards: [],
  },
  {
    from: 'en_route_to_pickup',
    to: 'arrived_at_pickup',
    trigger: 'rider_arrived_pickup',
    actors: ['rider'],
    guards: [],
  },
  {
    from: 'arrived_at_pickup',
    to: 'picked_up',
    trigger: 'pickup_otp_verified',
    actors: ['rider'],
    guards: [guard((f) => f.pickupOtpVerified, 'Pickup OTP must be verified first')],
  },
  {
    from: 'picked_up',
    to: 'in_transit',
    trigger: 'rider_departed',
    actors: ['rider'],
    guards: [],
  },
  {
    from: 'in_transit',
    to: 'arrived_at_destination',
    trigger: 'rider_arrived_destination',
    actors: ['rider'],
    guards: [],
  },
  {
    from: 'arrived_at_destination',
    to: 'delivered',
    trigger: 'delivery_otp_verified',
    actors: ['rider'],
    guards: [guard((f) => f.deliveryOtpVerified, 'Delivery OTP must be verified first')],
  },
  {
    from: 'delivered',
    to: 'completed',
    trigger: 'recipient_inspection_confirmed',
    actors: ['customer', 'recipient', 'system'],
    guards: [guard((f) => f.recipientConfirmed, 'Recipient inspection must be confirmed first')],
  },
  {
    from: 'in_transit',
    to: 'failed',
    trigger: 'delivery_failed',
    actors: ['rider', 'operator'],
    guards: [],
  },
  {
    from: 'arrived_at_destination',
    to: 'failed',
    trigger: 'delivery_failed',
    actors: ['rider', 'operator'],
    guards: [],
  },
];

/**
 * Customer cancellation is permitted up to the point the rider arrives at
 * the pickup location; after that only operators may cancel, pending D06.
 */
const CUSTOMER_CANCELABLE: readonly OrderStatus[] = [
  'draft',
  'awaiting_payment',
  'payment_verified',
  'searching_rider',
  'rider_assigned',
  'en_route_to_pickup',
];

const OPERATOR_CANCELABLE: readonly OrderStatus[] = [
  ...CUSTOMER_CANCELABLE,
  'arrived_at_pickup',
  'picked_up',
  'in_transit',
];

const CANCEL_TRANSITIONS: readonly OrderTransition[] = [
  ...CUSTOMER_CANCELABLE.map(
    (from): OrderTransition => ({
      from,
      to: 'cancelled',
      trigger: 'cancel',
      actors: ['customer', 'seller', 'operator'],
      guards: [],
    }),
  ),
  ...OPERATOR_CANCELABLE.filter((s) => !CUSTOMER_CANCELABLE.includes(s)).map(
    (from): OrderTransition => ({
      from,
      to: 'cancelled',
      trigger: 'cancel',
      actors: ['operator'],
      guards: [],
    }),
  ),
];

export const ALL_ORDER_TRANSITIONS: readonly OrderTransition[] = [
  ...ORDER_TRANSITIONS,
  ...CANCEL_TRANSITIONS,
];

const TRANSITION_INDEX: ReadonlyMap<string, OrderTransition> = new Map(
  ALL_ORDER_TRANSITIONS.map((t) => [`${t.from}->${t.to}`, t]),
);

export function findTransition(from: OrderStatus, to: OrderStatus): OrderTransition | undefined {
  return TRANSITION_INDEX.get(`${from}->${to}`);
}

/** Guard-only check: is the transition valid given the established facts? */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  facts: OrderTransitionFacts,
): GuardCheck {
  const transition = TRANSITION_INDEX.get(`${from}->${to}`);
  if (!transition) {
    return { allowed: false, reason: `No transition from ${from} to ${to}` };
  }
  for (const guardFn of transition.guards) {
    const check = guardFn(facts);
    if (!check.allowed) return check;
  }
  return { allowed: true };
}

/** Full authorization-aware check: actor + guards. */
export function actorCanTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
  facts: OrderTransitionFacts,
): boolean {
  const transition = TRANSITION_INDEX.get(`${from}->${to}`);
  if (!transition) return false;
  if (!transition.actors.includes(actor)) return false;
  return canTransition(from, to, facts).allowed;
}

/** Reachable statuses from a given status (ignoring guards/actors). */
export function reachableStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALL_ORDER_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

/** All statuses that are not terminal (the active lifecycle). */
export function activeOrderStatuses(): OrderStatus[] {
  return ALL_STATUSES.filter((s) => !isTerminalOrderStatus(s));
}

/** Adjacency graph for validation and tooling. */
export const STATUS_GRAPH: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = (() => {
  const graph = {} as Record<OrderStatus, readonly OrderStatus[]>;
  for (const status of ALL_STATUSES) graph[status] = [];
  for (const t of ALL_ORDER_TRANSITIONS) {
    if (!graph[t.from].includes(t.to)) graph[t.from] = [...graph[t.from], t.to];
  }
  return graph;
})();
