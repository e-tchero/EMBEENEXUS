import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerEnvMock } = vi.hoisted(() => ({ getServerEnvMock: vi.fn() }));

vi.mock('@/lib/env/server', () => ({
  getServerEnv: getServerEnvMock,
  serverEnv: {},
}));

import {
  isWebhookSignatureValid,
  parsePayloadForTest,
} from '@/lib/services/payment-webhook';

/**
 * Webhook authentication security tests (M4).
 *
 * The signature gate is the single authority deciding whether a webhook
 * delivery is even considered: a missing/invalid `verif-hash` must fail
 * closed under every configuration, without leaking the expected value.
 */

describe('isWebhookSignatureValid (verif-hash gate)', () => {
  beforeEach(() => {
    getServerEnvMock.mockReset();
  });

  it('accepts an exact-match hash', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: 'secret-hash-123' });
    expect(isWebhookSignatureValid('secret-hash-123')).toBe(true);
  });

  it('rejects a missing received hash', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: 'secret-hash-123' });
    expect(isWebhookSignatureValid(null)).toBe(false);
    expect(isWebhookSignatureValid('')).toBe(false);
  });

  it('rejects when no webhook hash is configured (fail closed)', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: undefined });
    expect(isWebhookSignatureValid('anything')).toBe(false);
    expect(isWebhookSignatureValid(null)).toBe(false);
  });

  it('rejects wrong values of equal length', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: 'aaaa' });
    expect(isWebhookSignatureValid('bbbb')).toBe(false);
  });

  it('rejects prefix/suffix guesses of different length', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: 'secret-hash-123' });
    expect(isWebhookSignatureValid('secret-hash-12')).toBe(false);
    expect(isWebhookSignatureValid('secret-hash-1234')).toBe(false);
  });

  it('does not throw on non-ASCII input', () => {
    getServerEnvMock.mockReturnValue({ FLUTTERWAVE_WEBHOOK_HASH: 'hash' });
    expect(() => isWebhookSignatureValid('h\u00e1sh')).not.toThrow();
    expect(isWebhookSignatureValid('h\u00e1sh')).toBe(false);
  });
});

describe('webhook payload minimization', () => {
  it('extracts only the acted-on fields and truncates overlong strings', () => {
    const payload = parsePayloadForTest({
      event: 'charge.completed',
      data: {
        id: 12345,
        tx_ref: 'ENX-TESTREF20CHARS00000',
        status: 'successful',
        amount: 2200,
        currency: 'NGN',
        customer: { email: 'secret@example.com', name: 'Secret Person' },
        payment_type: 'card',
        card: { last_4digits: '1234', token: 'CARD-TOKEN' },
      },
      created_at: '2026-09-18T00:00:00Z',
    });
    expect(payload).toEqual({
      event: 'charge.completed',
      data: {
        id: 12345,
        tx_ref: 'ENX-TESTREF20CHARS00000',
        status: 'successful',
        amount: 2200,
        currency: 'NGN',
      },
    });
  });

  it('rejects malformed payloads (no event / non-object data)', () => {
    expect(parsePayloadForTest({ data: {} })).toBeNull();
    expect(parsePayloadForTest(null)).toBeNull();
    expect(parsePayloadForTest('charge.completed')).toBeNull();
    expect(parsePayloadForTest({ event: 'x'.repeat(101), data: {} })).toBeNull();
  });

  it('tolerates a missing data object (stored for audit, grants nothing)', () => {
    expect(parsePayloadForTest({ event: 'charge.completed' })).toEqual({
      event: 'charge.completed',
      data: null,
    });
  });
});
