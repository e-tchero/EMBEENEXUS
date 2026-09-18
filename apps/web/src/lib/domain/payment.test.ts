import { describe, expect, it } from 'vitest';

import {
  ACTIVE_PAYMENT_STATUSES,
  PAYMENT_CURRENCY,
  SETTLED_PAYMENT_STATUSES,
  classifyWebhookEvent,
  decideVerification,
  generateTransactionReference,
  isActivePaymentStatus,
  isSettledPaymentStatus,
  isValidTransactionReference,
  nairaToKobo,
} from './payment';

// Deterministic PRNG bytes for reference tests (no real crypto needed).
function fakeRandomBytes(pattern: number[]): (size: number) => Buffer {
  let i = 0;
  return (n: number) => {
    const out = Buffer.alloc(n);
    for (let j = 0; j < n; j++) {
      out[j] = pattern[(i + j) % pattern.length] ?? 0;
    }
    i += n;
    return out;
  };
}

describe('payment statuses', () => {
  it('keeps the status sets disjoint', () => {
    for (const s of ACTIVE_PAYMENT_STATUSES) {
      expect(SETTLED_PAYMENT_STATUSES).not.toContain(s);
    }
  });

  it('classifies liveness correctly', () => {
    expect(isActivePaymentStatus('initiated')).toBe(true);
    expect(isActivePaymentStatus('redirected')).toBe(true);
    expect(isActivePaymentStatus('pending')).toBe(true);
    expect(isActivePaymentStatus('successful')).toBe(false);
    expect(isActivePaymentStatus('failed')).toBe(false);
    expect(isSettledPaymentStatus('successful')).toBe(true);
    expect(isSettledPaymentStatus('verification_failed')).toBe(true);
    expect(isSettledPaymentStatus('pending')).toBe(false);
  });
});

describe('generateTransactionReference', () => {
  it('matches the required format and DB constraints', () => {
    const ref = generateTransactionReference();
    expect(ref).toMatch(/^ENX-[0-9A-HJ-NP-TV-Z]{20}$/);
    expect(isValidTransactionReference(ref)).toBe(true);
    expect(ref.length).toBe(24);
  });

  it('contains no PII or secrets (opaque alphabet only)', () => {
    const ref = generateTransactionReference();
    expect(ref).not.toMatch(/[@.:+/\\ ]/);
  });

  it('produces different references for different entropy', () => {
    const a = generateTransactionReference(fakeRandomBytes([1, 2, 3]));
    const b = generateTransactionReference(fakeRandomBytes([4, 5, 6]));
    expect(a).not.toBe(b);
  });

  it('maps identical entropy to identical output (deterministic)', () => {
    const a = generateTransactionReference(fakeRandomBytes([7]));
    const b = generateTransactionReference(fakeRandomBytes([7]));
    expect(a).toBe(b);
  });

  it('rejects structurally invalid references', () => {
    expect(isValidTransactionReference('short')).toBe(false);
    expect(isValidTransactionReference('x'.repeat(101))).toBe(false);
    expect(isValidTransactionReference('has spaces here-and-more')).toBe(false);
    expect(isValidTransactionReference('ok_reference-123')).toBe(true);
  });
});

describe('nairaToKobo', () => {
  it('converts whole naira exactly (pricing model is whole-naira)', () => {
    expect(nairaToKobo(2200)).toBe(220000n);
    expect(nairaToKobo(4300)).toBe(430000n);
    expect(nairaToKobo(1)).toBe(100n);
  });

  it('rejects non-integer, zero, and negative naira', () => {
    expect(() => nairaToKobo(2200.5)).toThrow(RangeError);
    expect(() => nairaToKobo(0)).toThrow(RangeError);
    expect(() => nairaToKobo(-100)).toThrow(RangeError);
    expect(() => nairaToKobo(Number.NaN)).toThrow(RangeError);
  });
});

describe('decideVerification', () => {
  const expected = {
    transactionReference: 'ENX-TESTREFTESTREFTEST01',
    expectedAmountKobo: 260000n,
    currency: PAYMENT_CURRENCY,
  };
  const goodTx = {
    status: 'successful' as const,
    amountKobo: 260000n,
    currency: 'NGN',
    transactionReference: 'ENX-TESTREFTESTREFTEST01',
    providerTransactionId: 'flw-txn-123',
  };

  it('grants value when every fact matches', () => {
    expect(decideVerification(goodTx, expected)).toEqual({ outcome: 'grant_value' });
  });

  it('rejects a mismatched amount', () => {
    expect(decideVerification({ ...goodTx, amountKobo: 260001n }, expected)).toEqual({
      outcome: 'no_value',
      reason: 'amount_mismatch',
    });
    // Even 1 kobo less is a mismatch — no partial value grants.
    expect(decideVerification({ ...goodTx, amountKobo: 259999n }, expected).outcome).toBe(
      'no_value',
    );
  });

  it('rejects a mismatched currency', () => {
    expect(decideVerification({ ...goodTx, currency: 'USD' }, expected)).toEqual({
      outcome: 'no_value',
      reason: 'currency_mismatch',
    });
  });

  it('rejects a mismatched reference', () => {
    expect(
      decideVerification(
        { ...goodTx, transactionReference: 'ENX-DIFFERENTREF0000001' },
        expected,
      ),
    ).toEqual({ outcome: 'no_value', reason: 'reference_mismatch' });
  });

  it('rejects non-successful status', () => {
    expect(decideVerification({ ...goodTx, status: 'pending' }, expected)).toEqual({
      outcome: 'no_value',
      reason: 'status_not_successful',
    });
    expect(decideVerification({ ...goodTx, status: 'failed' }, expected).outcome).toBe(
      'no_value',
    );
  });

  it('rejects a missing provider transaction id', () => {
    expect(decideVerification({ ...goodTx, providerTransactionId: '' }, expected)).toEqual({
      outcome: 'no_value',
      reason: 'missing_provider_transaction_id',
    });
  });
});

describe('classifyWebhookEvent', () => {
  it('classifies charge events (the only value-granting kind)', () => {
    expect(classifyWebhookEvent('charge.completed')).toBe('charge_completed');
    expect(classifyWebhookEvent('charge.failed')).toBe('charge_failed');
  });

  it('classifies transfer/refund events as non-value-granting kinds', () => {
    expect(classifyWebhookEvent('transfer.completed')).toBe('transfer');
    expect(classifyWebhookEvent('refund.processed')).toBe('refund');
  });

  it('treats unknown events as other (never grants value)', () => {
    expect(classifyWebhookEvent('something.unexpected')).toBe('other');
  });
});
