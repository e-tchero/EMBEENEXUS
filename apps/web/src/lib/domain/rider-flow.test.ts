import { describe, expect, it } from 'vitest';

import {
  isRiderCommitted,
  nextRiderStep,
  waitingViewModel,
} from './rider-flow';

describe('rider execution flow', () => {
  it('maps each committed status to the correct next action', () => {
    expect(nextRiderStep('rider_assigned', false).action).toBe('head_to_pickup');
    expect(nextRiderStep('en_route_pickup', false).action).toBe('arrive_pickup');
    expect(nextRiderStep('arrived_pickup', false).action).toBe('verify_pickup_otp');
    expect(nextRiderStep('picked_up', false).action).toBe('head_to_destination');
    expect(nextRiderStep('in_transit', false).action).toBe('arrive_destination');
    expect(nextRiderStep('arrived_destination', false).action).toBe('await_recipient');
    expect(nextRiderStep('delivered', false).action).toBe('await_recipient_confirmation');
  });

  it('marks collect_parcels guidance inside the arrived_pickup detail', () => {
    const step = nextRiderStep('arrived_pickup', false);
    expect(step.label).toMatch(/Collect/i);
    expect(step.detail).toMatch(/pickup code/i);
  });

  it('overrides to the return path once a return is initiated', () => {
    const step = nextRiderStep('arrived_destination', true);
    expect(step.action).toBe('handle_return');
    expect(step.detail).toMatch(/30-minute maximum/);
  });

  it('treats only execution statuses as committed', () => {
    expect(isRiderCommitted('rider_assigned')).toBe(true);
    expect(isRiderCommitted('arrived_destination')).toBe(true);
    expect(isRiderCommitted('searching_rider')).toBe(false);
    expect(isRiderCommitted('delivered')).toBe(false);
    expect(isRiderCommitted('cancelled')).toBe(false);
    expect(isRiderCommitted('failed')).toBe(false);
  });
});

describe('waiting display model', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('returns null without a server clock start', () => {
    expect(waitingViewModel(null, now)).toBeNull();
  });

  it('shows the free window inside 10 minutes', () => {
    const started = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const view = waitingViewModel(started, now);
    expect(view?.freeWindow).toBe(true);
    expect(view?.label).toMatch(/first 10 minutes free/);
  });

  it('shows billable minutes after the free window (per started minute)', () => {
    // 10 min + 1 s ⇒ 1 billable minute = N700.
    const started = new Date(now.getTime() - (10 * 60 + 1) * 1000).toISOString();
    const view = waitingViewModel(started, now);
    expect(view?.freeWindow).toBe(false);
    expect(view?.withinMaximum).toBe(true);
    expect(view?.label).toContain('₦700');
  });

  it('reports the maximum reached at 30 minutes', () => {
    const started = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const view = waitingViewModel(started, now);
    expect(view?.withinMaximum).toBe(false);
    expect(view?.label).toMatch(/maximum reached/);
  });

  it('never shows a negative clock', () => {
    const started = new Date(now.getTime() + 60_000).toISOString();
    const view = waitingViewModel(started, now);
    expect(view?.label).toContain('00:00');
  });
});
