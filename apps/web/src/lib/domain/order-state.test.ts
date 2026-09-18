import { describe, expect, it } from 'vitest';

import {
  activeOrderStatuses,
  actorCanTransition,
  ALL_ORDER_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  findTransition,
  isTerminalOrderStatus,
  NO_FACTS,
  reachableStatuses,
  STATUS_GRAPH,
} from '@/lib/domain/order-state';

import type { OrderStatus, OrderTransitionFacts } from '@/lib/domain/order-state';

/**
 * Facts for the standard happy path: everything required for the status's
 * onward transition is already established when the order sits at `status`.
 */
function factsFor(status: OrderStatus): OrderTransitionFacts {
  const facts: OrderTransitionFacts = { ...NO_FACTS };
  if (status !== 'draft') {
    facts.paymentVerified = true;
  }
  if (
    [
      'searching_rider',
      'rider_assigned',
      'en_route_pickup',
      'arrived_pickup',
      'picked_up',
      'in_transit',
      'arrived_destination',
      'delivered',
      'completed',
    ].includes(status)
  ) {
    facts.riderAssigned = true;
  }
  if (
    [
      'arrived_pickup',
      'picked_up',
      'in_transit',
      'arrived_destination',
      'delivered',
      'completed',
    ].includes(status)
  ) {
    facts.pickupOtpVerified = true;
  }
  if (['arrived_destination', 'delivered', 'completed'].includes(status)) {
    facts.deliveryOtpVerified = true;
  }
  if (['delivered', 'completed'].includes(status)) {
    facts.recipientConfirmed = true;
  }
  return facts;
}

const HAPPY_PATH: readonly OrderStatus[] = [
  'draft',
  'awaiting_payment',
  'payment_verified',
  'searching_rider',
  'rider_assigned',
  'en_route_pickup',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
  'delivered',
  'completed',
];

describe('order state machine — happy path', () => {
  it('allows every consecutive transition of the delivery lifecycle', () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      const from = HAPPY_PATH[i]!;
      const to = HAPPY_PATH[i + 1]!;
      expect(canTransition(from, to, factsFor(from)), `${from} -> ${to}`).toEqual({
        allowed: true,
      });
    }
  });
});

describe('order state machine — structural invariants', () => {
  it('rejects transitions that are not defined', () => {
    expect(canTransition('draft', 'payment_verified', factsFor('draft')).allowed).toBe(false);
    expect(
      canTransition('awaiting_payment', 'searching_rider', factsFor('awaiting_payment')).allowed,
    ).toBe(false);
    expect(canTransition('delivered', 'awaiting_payment', factsFor('delivered')).allowed).toBe(
      false,
    );
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const terminal of ['cancelled', 'failed'] as const) {
      expect(ALL_ORDER_TRANSITIONS.filter((t) => t.from === terminal)).toEqual([]);
      expect(reachableStatuses(terminal)).toEqual([]);
    }
  });

  it('completed is terminal for the lifecycle (no outgoing transitions)', () => {
    expect(ALL_ORDER_TRANSITIONS.filter((t) => t.from === 'completed')).toEqual([]);
  });

  it('every status appears in the graph and every transition endpoint is valid', () => {
    for (const status of ALL_STATUSES) {
      expect(Array.isArray(STATUS_GRAPH[status])).toBe(true);
    }
    for (const t of ALL_ORDER_TRANSITIONS) {
      expect(ALL_STATUSES).toContain(t.from);
      expect(ALL_STATUSES).toContain(t.to);
    }
  });

  it('transition (from,to) pairs are unique', () => {
    const keys = ALL_ORDER_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('active statuses exclude terminal ones', () => {
    for (const s of activeOrderStatuses()) {
      expect(isTerminalOrderStatus(s)).toBe(false);
    }
    expect(activeOrderStatuses()).not.toContain('cancelled');
    expect(activeOrderStatuses()).not.toContain('failed');
  });
});

describe('order state machine — guards', () => {
  it('blocks payment verification without a server-verified payment', () => {
    const result = canTransition('awaiting_payment', 'payment_verified', {
      ...NO_FACTS,
      paymentVerified: false,
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'Payment must be verified server-side first',
    });
  });

  it('blocks rider assignment without an accepted offer', () => {
    const result = canTransition('searching_rider', 'rider_assigned', {
      ...factsFor('searching_rider'),
      riderAssigned: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('blocks pickup without a verified pickup OTP', () => {
    const result = canTransition('arrived_pickup', 'picked_up', {
      ...factsFor('arrived_pickup'),
      pickupOtpVerified: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('blocks delivery without a verified delivery OTP', () => {
    const result = canTransition('arrived_destination', 'delivered', {
      ...factsFor('arrived_destination'),
      deliveryOtpVerified: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('blocks completion without recipient inspection confirmation', () => {
    const result = canTransition('delivered', 'completed', {
      ...factsFor('delivered'),
      recipientConfirmed: false,
    });
    expect(result.allowed).toBe(false);
    expect(result).toEqual({
      allowed: false,
      reason: 'Recipient inspection must be confirmed first',
    });
  });

  it('delivery OTP alone does not complete an order', () => {
    // delivered -> completed requires recipientConfirmed, not delivery OTP.
    expect(
      canTransition('delivered', 'completed', {
        ...factsFor('delivered'),
        recipientConfirmed: false,
        deliveryOtpVerified: true,
      }).allowed,
    ).toBe(false);
  });
});

describe('order state machine — actor permissions', () => {
  it('only the system may verify payment', () => {
    expect(
      actorCanTransition('awaiting_payment', 'payment_verified', 'customer', {
        ...NO_FACTS,
        paymentVerified: true,
      }),
    ).toBe(false);
    expect(
      actorCanTransition('awaiting_payment', 'payment_verified', 'rider', {
        ...NO_FACTS,
        paymentVerified: true,
      }),
    ).toBe(false);
    expect(
      actorCanTransition('awaiting_payment', 'payment_verified', 'system', {
        ...NO_FACTS,
        paymentVerified: true,
      }),
    ).toBe(true);
  });

  it('rider-only progression rejects customer and operator actors', () => {
    for (const actor of ['customer', 'operator', 'seller', 'system'] as const) {
      expect(
        actorCanTransition(
          'rider_assigned',
          'en_route_pickup',
          actor,
          factsFor('rider_assigned'),
        ),
      ).toBe(false);
    }
    expect(
      actorCanTransition(
        'rider_assigned',
        'en_route_pickup',
        'rider',
        factsFor('rider_assigned'),
      ),
    ).toBe(true);
  });

  it('customers may cancel early-stage orders', () => {
    expect(
      actorCanTransition('searching_rider', 'cancelled', 'customer', factsFor('searching_rider')),
    ).toBe(true);
    expect(
      actorCanTransition(
        'en_route_pickup',
        'cancelled',
        'customer',
        factsFor('en_route_pickup'),
      ),
    ).toBe(true);
  });

  it('customers may not cancel after the rider arrives at pickup; operators may', () => {
    expect(actorCanTransition('picked_up', 'cancelled', 'customer', factsFor('picked_up'))).toBe(
      false,
    );
    expect(actorCanTransition('picked_up', 'cancelled', 'operator', factsFor('picked_up'))).toBe(
      true,
    );
    expect(actorCanTransition('in_transit', 'cancelled', 'customer', factsFor('in_transit'))).toBe(
      false,
    );
    expect(actorCanTransition('in_transit', 'cancelled', 'operator', factsFor('in_transit'))).toBe(
      true,
    );
  });

  it('riders cannot cancel orders', () => {
    expect(
      actorCanTransition('searching_rider', 'cancelled', 'rider', factsFor('searching_rider')),
    ).toBe(false);
  });

  it('nothing can be cancelled after arrival at destination except by policy decision', () => {
    expect(
      actorCanTransition(
        'arrived_destination',
        'cancelled',
        'customer',
        factsFor('arrived_destination'),
      ),
    ).toBe(false);
    expect(
      actorCanTransition(
        'arrived_destination',
        'cancelled',
        'operator',
        factsFor('arrived_destination'),
      ),
    ).toBe(false);
    expect(findTransition('arrived_destination', 'cancelled')).toBeUndefined();
  });
});

describe('order state machine — determinism', () => {
  it('returns identical results for identical inputs', () => {
    const a = canTransition('awaiting_payment', 'payment_verified', NO_FACTS);
    const b = canTransition('awaiting_payment', 'payment_verified', NO_FACTS);
    expect(a).toEqual(b);

    const c = actorCanTransition('picked_up', 'cancelled', 'operator', factsFor('picked_up'));
    const d = actorCanTransition('picked_up', 'cancelled', 'operator', factsFor('picked_up'));
    expect(c).toBe(d);
  });

  it('does not mutate the facts passed in', () => {
    const facts: OrderTransitionFacts = { ...NO_FACTS };
    const snapshot = { ...facts };
    canTransition('arrived_pickup', 'picked_up', facts);
    actorCanTransition('arrived_pickup', 'picked_up', 'rider', facts);
    expect(facts).toEqual(snapshot);
  });
});
