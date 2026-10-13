import { describe, expect, it } from 'vitest';

import {
  Money,
  isFeeSplitInvariantHeld,
  KOBO_PER_NAIRA,
  PLATFORM_SHARE_PERCENT,
  RIDER_SHARE_PERCENT,
} from './money.js';

describe('Money — construction', () => {
  it('accepts non-negative bigint minor units', () => {
    expect(Money.fromMinorUnits(0n).minorUnits).toBe(0n);
    expect(Money.fromMinorUnits(2200n).minorUnits).toBe(2200n);
  });

  it('rejects a negative amount', () => {
    expect(() => Money.fromMinorUnits(-1n)).toThrow(RangeError);
  });

  it('rejects a non-bigint amount', () => {
    expect(() => Money.fromMinorUnits(1.5 as unknown as bigint)).toThrow(TypeError);
    expect(() => Money.fromMinorUnits(100 as unknown as bigint)).toThrow(TypeError);
  });

  it('rejects an empty currency', () => {
    expect(() => Money.fromMinorUnits(100n, '')).toThrow(TypeError);
  });

  it('reports zero', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.fromMinorUnits(1n).isZero()).toBe(false);
  });
});

describe('Money — arithmetic', () => {
  it('adds amounts', () => {
    expect(Money.fromMinorUnits(2200n).add(Money.fromMinorUnits(600n)).minorUnits).toBe(2800n);
  });

  it('subtracts amounts', () => {
    expect(Money.fromMinorUnits(2200n).subtract(Money.fromMinorUnits(200n)).minorUnits).toBe(2000n);
  });

  it('refuses a subtraction that would go negative', () => {
    expect(() => Money.fromMinorUnits(100n).subtract(Money.fromMinorUnits(101n))).toThrow(
      RangeError,
    );
  });

  it('refuses to combine different currencies', () => {
    expect(() => Money.fromMinorUnits(100n, 'NGN').add(Money.fromMinorUnits(100n, 'USD'))).toThrow(
      TypeError,
    );
  });

  it('compares by amount and currency', () => {
    expect(Money.fromMinorUnits(100n).equals(Money.fromMinorUnits(100n))).toBe(true);
    expect(Money.fromMinorUnits(100n).equals(Money.fromMinorUnits(101n))).toBe(false);
  });
});

describe('Money — 70/30 split (05 §3.1)', () => {
  it('splits a round amount exactly', () => {
    const split = Money.fromMinorUnits(1000n).splitFee();
    expect(split.rider.minorUnits).toBe(700n);
    expect(split.platform.minorUnits).toBe(300n);
  });

  it('keeps the invariant when the gross does not divide evenly', () => {
    const split = Money.fromMinorUnits(1001n).splitFee();
    expect(split.rider.minorUnits).toBe(700n);
    expect(split.platform.minorUnits).toBe(301n);
    expect(split.rider.minorUnits + split.platform.minorUnits).toBe(1001n);
  });

  it('splits the ₦2,200 base fare band', () => {
    const split = Money.fromMinorUnits(2200n).splitFee();
    expect(split.rider.minorUnits).toBe(1540n);
    expect(split.platform.minorUnits).toBe(660n);
  });

  it('holds the invariant for every gross from 0 to 500 Kobo', () => {
    for (let gross = 0n; gross <= 500n; gross += 1n) {
      const split = Money.fromMinorUnits(gross).splitFee();
      expect(isFeeSplitInvariantHeld(split)).toBe(true);
      expect(split.rider.minorUnits + split.platform.minorUnits).toBe(gross);
    }
  });

  it('never invents or loses a kobo for a gross of 1 Kobo', () => {
    const split = Money.fromMinorUnits(1n).splitFee();
    expect(split.rider.minorUnits).toBe(0n);
    expect(split.platform.minorUnits).toBe(1n);
  });

  it('uses the approved 70/30 percentages', () => {
    expect(RIDER_SHARE_PERCENT).toBe(70n);
    expect(PLATFORM_SHARE_PERCENT).toBe(30n);
    expect(RIDER_SHARE_PERCENT + PLATFORM_SHARE_PERCENT).toBe(KOBO_PER_NAIRA);
  });

  it('preserves the gross currency on both shares', () => {
    const split = Money.fromMinorUnits(1000n, 'NGN').splitFee();
    expect(split.gross.currency).toBe('NGN');
    expect(split.rider.currency).toBe('NGN');
    expect(split.platform.currency).toBe('NGN');
  });
});

describe('Money — 64-bit range', () => {
  it('handles amounts far beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 100_000_000_000_000_000_000n; // 10^20, ~11x MAX_SAFE_INTEGER
    const split = Money.fromMinorUnits(huge).splitFee();
    expect(split.rider.minorUnits).toBe(70_000_000_000_000_000_000n);
    expect(split.platform.minorUnits).toBe(30_000_000_000_000_000_000n);
    expect(split.rider.minorUnits + split.platform.minorUnits).toBe(huge);
  });
});

describe('Money — serialisation', () => {
  it('stringifies bigint minor units for JSON', () => {
    expect(Money.fromMinorUnits(2200n).toJSON()).toEqual({ minorUnits: '2200', currency: 'NGN' });
  });
});
