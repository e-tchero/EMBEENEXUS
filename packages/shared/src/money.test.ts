import { describe, expect, it } from 'vitest';

import { formatNairaFromKobo } from './money';

describe('formatNairaFromKobo', () => {
  it('formats the founder prices correctly', () => {
    expect(formatNairaFromKobo(220_000n)).toBe('₦2,200');
    expect(formatNairaFromKobo(260_000n)).toBe('₦2,600');
    expect(formatNairaFromKobo(300_000n)).toBe('₦3,000');
    expect(formatNairaFromKobo(360_000n)).toBe('₦3,600');
    expect(formatNairaFromKobo(430_000n)).toBe('₦4,300');
  });

  it('formats rider and platform shares without loss', () => {
    expect(formatNairaFromKobo(154_000n)).toBe('₦1,540');
    expect(formatNairaFromKobo(66_000n)).toBe('₦660');
  });

  it('truncates display at whole naira (kobo are internal precision only)', () => {
    expect(formatNairaFromKobo(220_050n)).toBe('₦2,200');
  });

  it('rejects negative amounts', () => {
    expect(() => formatNairaFromKobo(-1n)).toThrow(RangeError);
  });
});
