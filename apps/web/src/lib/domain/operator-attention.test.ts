import { describe, expect, it } from 'vitest';

import {
  operatorAttentionReasons,
  describeAttentionReasons,
  type OperatorAttentionInput,
} from './operator-attention';

const NOW = '2026-09-29T06:00:00.000Z';

function base(overrides: Partial<OperatorAttentionInput> = {}): OperatorAttentionInput {
  return {
    status: 'completed',
    events: [],
    paymentStatus: null,
    offers: [],
    returnInitiated: false,
    now: NOW,
    ...overrides,
  };
}

const minutesAgo = (n: number): string =>
  new Date(Date.parse(NOW) - n * 60_000).toISOString();

describe('operatorAttentionReasons', () => {
  it('returns no reasons for a cleanly completed order', () => {
    expect(
      operatorAttentionReasons(
        base({
          events: [{ trigger: 'order_submitted', createdAt: minutesAgo(120) }],
          paymentStatus: 'successful',
        }),
      ),
    ).toEqual([]);
  });

  it('flags payment pending beyond the processing window', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'awaiting_payment',
          events: [{ trigger: 'order_submitted', createdAt: minutesAgo(45) }],
          paymentStatus: 'initiated',
        }),
      ),
    ).toEqual(['payment_pending']);
  });

  it('does not flag payment pending inside the window', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'awaiting_payment',
          events: [{ trigger: 'order_submitted', createdAt: minutesAgo(5) }],
          paymentStatus: 'initiated',
        }),
      ),
    ).toEqual([]);
  });

  it('flags an expired latest offer on a searching order', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'searching_rider',
          offers: [{ status: 'expired', offeredAt: minutesAgo(10) }],
        }),
      ),
    ).toEqual(['offer_expired']);
  });

  it('does not flag an active offer on a searching order', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'searching_rider',
          offers: [{ status: 'offered', offeredAt: minutesAgo(1) }],
        }),
      ),
    ).toEqual([]);
  });

  it('flags searching with no offers as needs-review, not an SLA breach', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'searching_rider',
          events: [{ trigger: 'dispatch_started', createdAt: minutesAgo(90) }],
        }),
      ),
    ).toEqual(['searching_long']);
  });

  it('flags return required while the return leg is open', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'arrived_destination',
          returnInitiated: true,
          events: [{ trigger: 'return_initiated', createdAt: minutesAgo(3) }],
        }),
      ),
    ).toEqual(['return_required', 'waiting_maximum_reached']);
  });

  it('flags failed delivery and surfaces the waiting-maximum origin together', () => {
    expect(
      operatorAttentionReasons(
        base({
          status: 'failed',
          events: [
            { trigger: 'return_initiated', createdAt: minutesAgo(60) },
            { trigger: 'return_completed', createdAt: minutesAgo(30) },
          ],
        }),
      ),
    ).toEqual(['waiting_maximum_reached', 'failed_delivery']);
  });

  it('uses the neutral needs-review state for delivered orders awaiting receipt', () => {
    expect(operatorAttentionReasons(base({ status: 'delivered' }))).toEqual(['needs_review']);
  });

  it('ignores an unparseable clock rather than inventing attention', () => {
    expect(operatorAttentionReasons(base({ now: 'not-a-time', status: 'delivered' }))).toEqual([]);
  });

  it('renders human-readable descriptions', () => {
    expect(describeAttentionReasons(['failed_delivery'])).toBe('Delivery failed');
  });
});
