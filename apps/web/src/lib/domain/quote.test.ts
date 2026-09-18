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

describe('quote validity default (founder-pending)', () => {
  it('is the documented 45-minute implementation default', () => {
    expect(QUOTE_VALIDITY_MINUTES).toBe(45);
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
