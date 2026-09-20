import { describe, expect, it } from 'vitest';

import {
  QUOTE_VALIDITY_MINUTES,
  checkQuoteUsable,
  isQuoteDueForExpiry,
  isQuoteOrderable,
} from './quote';

const T0 = new Date('2026-09-18T12:00:00Z');
const at = (ms: number) => () => new Date(T0.getTime() + ms);

function quote(status: 'active' | 'consumed' | 'expired', expiresAt: Date) {
  return { status, expiresAt };
}

describe('quote validity (founder D09)', () => {
  it('is the founder-approved 10 minutes', () => {
    expect(QUOTE_VALIDITY_MINUTES).toBe(10);
  });

  it('gives a 10-minute window: orderable just inside, expired at the boundary', () => {
    const expiresAt = new Date(T0.getTime() + QUOTE_VALIDITY_MINUTES * 60_000);
    expect(isQuoteOrderable(quote('active', expiresAt), at(9 * 60_000 + 59_999)).orderable).toBe(
      true,
    );
    expect(isQuoteOrderable(quote('active', expiresAt), at(10 * 60_000))).toEqual({
      orderable: false,
      reason: 'expired',
    });
  });
});

describe('isQuoteOrderable', () => {
  it('accepts an active, unexpired quote', () => {
    const verdict = isQuoteOrderable(
      quote('active', new Date(T0.getTime() + 45 * 60_000)),
      at(0),
    );
    expect(verdict.orderable).toBe(true);
  });

  it('rejects an active quote exactly at expiry (boundary)', () => {
    const verdict = isQuoteOrderable(
      quote('active', T0),
      at(0),
    );
    expect(verdict).toEqual({ orderable: false, reason: 'expired' });
  });

  it('rejects an active quote one millisecond past expiry', () => {
    const verdict = isQuoteOrderable(
      quote('active', new Date(T0.getTime() - 1)),
      at(0),
    );
    expect(verdict).toEqual({ orderable: false, reason: 'expired' });
  });

  it('rejects a consumed quote', () => {
    const verdict = isQuoteOrderable(
      quote('consumed', new Date(T0.getTime() + 45 * 60_000)),
      at(0),
    );
    expect(verdict).toEqual({ orderable: false, reason: 'not_active' });
  });

  it('rejects an expired quote', () => {
    const verdict = isQuoteOrderable(
      quote('expired', new Date(T0.getTime() - 1)),
      at(0),
    );
    expect(verdict).toEqual({ orderable: false, reason: 'not_active' });
  });
});

describe('isQuoteDueForExpiry', () => {
  it('marks an active past-expiry quote due', () => {
    const check = isQuoteDueForExpiry(
      quote('active', new Date(T0.getTime() - 1)),
      at(0),
    );
    expect(check.dueForExpiry).toBe(true);
  });

  it('does not mark an active future-expiry quote due', () => {
    const check = isQuoteDueForExpiry(
      quote('active', new Date(T0.getTime() + 60_000)),
      at(0),
    );
    expect(check.dueForExpiry).toBe(false);
  });

  it('never re-marks consumed quotes', () => {
    const check = isQuoteDueForExpiry(
      quote('consumed', new Date(T0.getTime() - 60_000)),
      at(0),
    );
    expect(check.dueForExpiry).toBe(false);
  });

  it('never re-marks expired quotes', () => {
    const check = isQuoteDueForExpiry(
      quote('expired', new Date(T0.getTime() - 60_000)),
      at(0),
    );
    expect(check.dueForExpiry).toBe(false);
  });
});

describe('checkQuoteUsable', () => {
  it('returns ok for an orderable quote', () => {
    const result = checkQuoteUsable(
      quote('active', new Date(T0.getTime() + 45 * 60_000)),
      at(0),
    );
    expect(result.ok).toBe(true);
  });

  it('returns expired at/after the expiry boundary', () => {
    const result = checkQuoteUsable(quote('active', T0), at(0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('expired');
  });

  it('returns not_active for consumed quotes', () => {
    const result = checkQuoteUsable(
      quote('consumed', new Date(T0.getTime() + 45 * 60_000)),
      at(0),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_active');
  });
});
