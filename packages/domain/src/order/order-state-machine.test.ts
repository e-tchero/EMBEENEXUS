import { describe, expect, it } from 'vitest';

import {
  ALL_ORDER_STATUSES,
  HAPPY_PATH,
  ORDER_STATUS_COUNT,
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  isOrderStatus,
  isTerminalOrderStatus,
} from './order-status.js';
import {
  IllegalOrderTransitionError,
  ORDER_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
  nextStates,
  transition,
  transitionAll,
} from './order-state-machine.js';

describe('OrderStatus — state set', () => {
  it('has exactly 15 states', () => {
    expect(ORDER_STATUS_COUNT).toBe(15);
    expect(ALL_ORDER_STATUSES).toHaveLength(15);
  });

  it('contains no duplicates', () => {
    expect(new Set(ALL_ORDER_STATUSES).size).toBe(ALL_ORDER_STATUSES.length);
  });

  it('includes every state named in the directive', () => {
    const required = [
      'CREATED',
      'QUOTE_GENERATED',
      'PAYMENT_PENDING',
      'PAYMENT_CONFIRMED',
      'DISPATCHING',
      'RIDER_ASSIGNED',
      'EN_ROUTE_TO_PICKUP',
      'ARRIVED_AT_PICKUP',
      'PARCEL_COLLECTED',
      'EN_ROUTE_TO_DELIVERY',
      'ARRIVED_AT_DELIVERY',
      'RECIPIENT_UNAVAILABLE',
      'DELIVERED',
      'CANCELLED',
      'RETURN_TO_SENDER',
    ];
    for (const state of required) {
      expect(isOrderStatus(state)).toBe(true);
    }
  });

  it('does not carry RIDER_OFFER_ACTIVE as an order status', () => {
    expect(isOrderStatus('RIDER_OFFER_ACTIVE')).toBe(false);
  });
});

describe('Order state machine — transition table', () => {
  it('defines an entry for every status', () => {
    for (const status of ALL_ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('only ever targets a known status', () => {
    for (const status of ALL_ORDER_STATUSES) {
      for (const target of ORDER_TRANSITIONS[status]) {
        expect(isOrderStatus(target)).toBe(true);
      }
    }
  });

  it('walks the documented happy path end to end', () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i += 1) {
      expect(canTransition(HAPPY_PATH[i] as OrderStatus, HAPPY_PATH[i + 1] as OrderStatus)).toBe(
        true,
      );
    }
    expect(transitionAll(OrderStatus.CREATED, HAPPY_PATH.slice(1))).toBe(OrderStatus.DELIVERED);
  });

  it('allows DISPATCHING to stay DISPATCHING while an offer is live', () => {
    expect(canTransition(OrderStatus.DISPATCHING, OrderStatus.DISPATCHING)).toBe(true);
  });
});

describe('Order state machine — illegal jumps', () => {
  it('rejects skipping ahead in the happy path', () => {
    expect(canTransition(OrderStatus.CREATED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransition(OrderStatus.CREATED, OrderStatus.PAYMENT_CONFIRMED)).toBe(false);
    expect(canTransition(OrderStatus.QUOTE_GENERATED, OrderStatus.RIDER_ASSIGNED)).toBe(false);
    expect(canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.DISPATCHING)).toBe(false);
  });

  it('rejects moving backwards', () => {
    expect(canTransition(OrderStatus.ARRIVED_AT_PICKUP, OrderStatus.CREATED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.ARRIVED_AT_DELIVERY)).toBe(false);
  });

  it('rejects any transition out of a terminal state', () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      expect(nextStates(terminal)).toHaveLength(0);
      for (const target of ALL_ORDER_STATUSES) {
        expect(canTransition(terminal, target)).toBe(false);
      }
    }
  });

  it('rejects the offer branch as an order transition', () => {
    expect(canTransition(OrderStatus.DISPATCHING, 'RIDER_OFFER_ACTIVE' as OrderStatus)).toBe(false);
  });
});

describe('Order state machine — guards', () => {
  it('throws IllegalOrderTransitionError carrying both states', () => {
    expect(() => assertTransition(OrderStatus.CREATED, OrderStatus.DELIVERED)).toThrow(
      IllegalOrderTransitionError,
    );
    try {
      assertTransition(OrderStatus.CREATED, OrderStatus.DELIVERED);
      expect.unreachable('expected a transition error');
    } catch (error) {
      const transitionError = error as IllegalOrderTransitionError;
      expect(transitionError.from).toBe('CREATED');
      expect(transitionError.to).toBe('DELIVERED');
    }
  });

  it('returns the destination state on a legal transition', () => {
    expect(transition(OrderStatus.CREATED, OrderStatus.QUOTE_GENERATED)).toBe('QUOTE_GENERATED');
  });

  it('stops a sequence at the first illegal hop', () => {
    expect(() =>
      transitionAll(OrderStatus.PAYMENT_PENDING, [
        OrderStatus.PAYMENT_CONFIRMED,
        OrderStatus.DELIVERED,
      ]),
    ).toThrow(IllegalOrderTransitionError);
  });
});

describe('Order state machine — exception paths', () => {
  it('routes recipient-unavailable to return-to-sender', () => {
    expect(canTransition(OrderStatus.ARRIVED_AT_DELIVERY, OrderStatus.RECIPIENT_UNAVAILABLE)).toBe(
      true,
    );
    expect(canTransition(OrderStatus.RECIPIENT_UNAVAILABLE, OrderStatus.RETURN_TO_SENDER)).toBe(
      true,
    );
  });

  it('treats RECIPIENT_UNAVAILABLE as non-terminal', () => {
    expect(isTerminalOrderStatus(OrderStatus.RECIPIENT_UNAVAILABLE)).toBe(false);
    expect(nextStates(OrderStatus.RECIPIENT_UNAVAILABLE)).toEqual([OrderStatus.RETURN_TO_SENDER]);
  });

  it('cannot be cancelled after the rider takes custody', () => {
    expect(canTransition(OrderStatus.ARRIVED_AT_PICKUP, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransition(OrderStatus.PARCEL_COLLECTED, OrderStatus.CANCELLED)).toBe(false);
    expect(canTransition(OrderStatus.EN_ROUTE_TO_DELIVERY, OrderStatus.CANCELLED)).toBe(false);
  });

  it('treats the three documented terminal states as terminal', () => {
    for (const terminal of [
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.RETURN_TO_SENDER,
    ]) {
      expect(isTerminal(terminal)).toBe(true);
    }
    expect(isTerminal(OrderStatus.DISPATCHING)).toBe(false);
  });
});
