import { describe, expect, it } from 'vitest';

import { evaluateDeliveryCoverage } from './coverage';

describe('evaluateDeliveryCoverage', () => {
  it('accepts a delivery when both endpoints are covered', () => {
    const decision = evaluateDeliveryCoverage({ pickupCovered: true, dropoffCovered: true });
    expect(decision.status).toBe('covered');
  });

  it('flags only the pickup when only it is uncovered', () => {
    const decision = evaluateDeliveryCoverage({ pickupCovered: false, dropoffCovered: true });
    expect(decision.status).toBe('outside_coverage');
    if (decision.status === 'outside_coverage') {
      expect(decision.uncoveredEndpoints).toEqual(['pickup']);
    }
  });

  it('flags only the dropoff when only it is uncovered', () => {
    const decision = evaluateDeliveryCoverage({ pickupCovered: true, dropoffCovered: false });
    expect(decision.status).toBe('outside_coverage');
    if (decision.status === 'outside_coverage') {
      expect(decision.uncoveredEndpoints).toEqual(['dropoff']);
    }
  });

  it('flags both endpoints when both are uncovered', () => {
    const decision = evaluateDeliveryCoverage({ pickupCovered: false, dropoffCovered: false });
    expect(decision.status).toBe('outside_coverage');
    if (decision.status === 'outside_coverage') {
      expect(decision.uncoveredEndpoints).toEqual(['pickup', 'dropoff']);
    }
  });
});
