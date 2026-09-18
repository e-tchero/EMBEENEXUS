import { describe, expect, it } from 'vitest';

import {
  ALL_STATUSES,
  canHoldForReview,
  canReleaseFromReview,
  findTransition,
  isTerminalOrderStatus,
  releaseFromReviewStatus,
} from './order-state';

describe('under_review exceptional state', () => {
  it('is part of the status set but not terminal', () => {
    expect(ALL_STATUSES).toContain('under_review');
    expect(isTerminalOrderStatus('under_review')).toBe(false);
  });

  it('has no static outgoing transitions (hold/release are dynamic)', () => {
    expect(findTransition('under_review', 'cancelled')).toBeUndefined();
    expect(findTransition('under_review', 'failed')).toBeUndefined();
  });

  it('cannot be entered via any static transition (RPC handles holds)', () => {
    expect(findTransition('draft', 'under_review')).toBeUndefined();
  });
});

describe('operator review hold rules', () => {
  it('permits holding any active-lifecycle status', () => {
    for (const status of [
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
    ] as const) {
      expect(canHoldForReview(status)).toBe(true);
    }
  });

  it('forbids holding terminal statuses and completed orders', () => {
    for (const status of ['cancelled', 'failed', 'completed'] as const) {
      expect(canHoldForReview(status)).toBe(false);
    }
  });

  it('forbids holding an already-held order', () => {
    expect(canHoldForReview('under_review')).toBe(false);
  });
});

describe('operator review release rules', () => {
  it('permits release back to a valid pre-hold status', () => {
    expect(canReleaseFromReview('under_review', 'in_transit')).toBe(true);
    expect(releaseFromReviewStatus('in_transit')).toBe('in_transit');
  });

  it('forbids release when there is no pre-hold status', () => {
    expect(canReleaseFromReview('under_review', null)).toBe(false);
    expect(() => releaseFromReviewStatus(null as never)).toThrow();
  });

  it('forbids release to terminal statuses or completed', () => {
    for (const preHold of ['cancelled', 'failed', 'completed'] as const) {
      expect(canReleaseFromReview('under_review', preHold)).toBe(false);
    }
  });

  it('forbids release when the order is not under review', () => {
    expect(canReleaseFromReview('in_transit', 'in_transit')).toBe(false);
  });
});
