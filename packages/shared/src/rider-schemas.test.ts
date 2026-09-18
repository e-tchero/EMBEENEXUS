import { describe, expect, it } from 'vitest';

import { addVehicleSchema, reviewDecisionSchema } from './rider-schemas';

describe('addVehicleSchema', () => {
  it('accepts a valid motorcycle record', () => {
    const result = addVehicleSchema.parse({
      make: 'Honda',
      model: 'CG 125',
      year: 2015,
      plateNumber: 'ABC-123-XY',
    });
    expect(result.plateNumber).toBe('ABC-123-XY');
  });

  it('rejects invalid plates', () => {
    const result = addVehicleSchema.safeParse({
      make: 'Honda',
      model: 'CG 125',
      plateNumber: 'AB',
    });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range years', () => {
    const result = addVehicleSchema.safeParse({
      make: 'Honda',
      model: 'CG 125',
      year: 1500,
      plateNumber: 'ABC-123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing make/model', () => {
    const result = addVehicleSchema.safeParse({ plateNumber: 'ABC-123' });
    expect(result.success).toBe(false);
  });
});

describe('reviewDecisionSchema', () => {
  it('accepts approve/reject with uuid riderId', () => {
    expect(
      reviewDecisionSchema.safeParse({
        riderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        decision: 'approve',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown decisions', () => {
    expect(
      reviewDecisionSchema.safeParse({
        riderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        decision: 'suspend',
      }).success,
    ).toBe(false);
  });
});
