import { describe, expect, it, vi } from 'vitest';

import { createFlutterwaveProvider } from './flutterwave';
import { PaymentProviderErrorError } from './payment-provider';

/**
 * Contract tests for the Flutterwave V3 adapter — injected fetch, no network.
 * Bodies mirror the documented V3 shapes ({status, message, data}).
 */

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

function jsonResponse(body: unknown, status = 200): FetchResult {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function makeProvider(fetchImpl: ReturnType<typeof vi.fn>, opts?: { maxAttempts?: number }) {
  return createFlutterwaveProvider({
    secretKey: 'FLWSECK_TEST-never-print-values',
    baseUrl: 'https://api.test/v3',
    timeoutMs: 1_000,
    maxAttempts: opts?.maxAttempts ?? 3,
    backoffMs: 1,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
  });
}

const checkoutInput = {
  transactionReference: 'ENX-TESTREFTESTREFTEST01',
  amountKobo: 260000n,
  currency: 'NGN' as const,
  customerEmail: 'customer@example.com',
  redirectUrl: 'https://app.example.com/payments/callback',
  title: 'Embee Nexus delivery',
};

describe('flutterwave adapter — createCheckout', () => {
  it('POSTs the exact wire payload (naira major units) and returns the hosted link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'success', message: 'Hosted Link', data: { link: 'https://checkout.test/flw' } }),
    );
    const provider = makeProvider(fetchImpl);
    const session = await provider.createCheckout(checkoutInput);
    expect(session.checkoutUrl).toBe('https://checkout.test/flw');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/v3/payments');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.tx_ref).toBe(checkoutInput.transactionReference);
    // UNIT CONTRACT: Flutterwave V3 takes MAJOR units (naira). Internal kobo
    // 260000 → wire "2600". Exact integer string — never a float.
    expect(body.amount).toBe('2600');
    expect(body.currency).toBe('NGN');
    expect(body.redirect_url).toBe(checkoutInput.redirectUrl);
    // The secret key must travel only in the authorization header.
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer FLWSECK_TEST-never-print-values');
    expect(JSON.stringify(body)).not.toContain('FLWSECK');
  });

  it('rejects non-whole-naira amounts (would silently misprice on the wire)', async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.createCheckout({ ...checkoutInput, amountKobo: 260050n }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never retries checkout creation (a retry could duplicate the link)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'error' }, 500));
    const provider = makeProvider(fetchImpl);
    await expect(provider.createCheckout(checkoutInput)).rejects.toMatchObject({
      code: 'provider_error',
      status: 500,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects non-success envelopes without leaking provider payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'error', message: 'secret internal detail', data: null }, 400),
    );
    const provider = makeProvider(fetchImpl);
    const error = await provider.createCheckout(checkoutInput).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentProviderErrorError);
    expect((error as PaymentProviderErrorError).code).toBe('provider_error');
    // The safe normalized message must not embed the provider's raw message.
    expect((error as PaymentProviderErrorError).message).not.toContain('secret internal detail');
  });

  it('throws invalid_input for bounded-input violations without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.createCheckout({ ...checkoutInput, transactionReference: 'short' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      provider.createCheckout({ ...checkoutInput, redirectUrl: 'http://insecure.test' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      provider.createCheckout({ ...checkoutInput, amountKobo: 0n }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('flutterwave adapter — verifyByReference', () => {
  const verifyBody = {
    status: 'success',
    message: 'Transaction fetched successfully',
    data: {
      id: 1234567,
      tx_ref: 'ENX-TESTREFTESTREFTEST01',
      status: 'successful',
      currency: 'NGN',
      // UNIT CONTRACT: Flutterwave reports naira (major units). A ₦2,600
      // charge arrives as 2600, not 260000.
      amount: 2600,
      charged_amount: 2600,
    },
  };

  it('normalizes a successful transaction with exact kobo amount', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(verifyBody));
    const provider = makeProvider(fetchImpl);
    const tx = await provider.verifyByReference({
      transactionReference: 'ENX-TESTREFTESTREFTEST01',
    });
    // Provider naira 2600 → internal kobo 260000 (exact ×100).
    expect(tx).toEqual({
      status: 'successful',
      amountKobo: 260000n,
      currency: 'NGN',
      transactionReference: 'ENX-TESTREFTESTREFTEST01',
      providerTransactionId: '1234567',
    });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('/transactions/verify_by_reference?tx_ref=ENX-TESTREFTESTREFTEST01');
  });

  it('fails closed on fractional-naira provider amounts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: { ...verifyBody.data, amount: 2600.5, charged_amount: 2600.5 },
      }),
    );
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps a provider not-found to a typed not_found error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'error', message: 'No transaction was found for this id' }, 404));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('retries transient verification failures within the budget then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValue(jsonResponse(verifyBody));
    const provider = makeProvider(fetchImpl);
    const tx = await provider.verifyByReference({
      transactionReference: 'ENX-TESTREFTESTREFTEST01',
    });
    expect(tx.status).toBe('successful');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops after the bounded retry budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const provider = makeProvider(fetchImpl, { maxAttempts: 3 });
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('treats a malformed verification body as invalid_response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ totally: 'wrong' }));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('treats a successful envelope with null data as not_found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'success', data: null }));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('classifies aborted requests as timeouts', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);
    const provider = makeProvider(fetchImpl, { maxAttempts: 1 });
    await expect(
      provider.verifyByReference({ transactionReference: 'ENX-TESTREFTESTREFTEST01' }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('normalizes failed/pending provider statuses without inventing success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        data: { ...verifyBody.data, status: 'failed' },
      }),
    );
    const provider = makeProvider(fetchImpl);
    const tx = await provider.verifyByReference({
      transactionReference: 'ENX-TESTREFTESTREFTEST01',
    });
    expect(tx.status).toBe('failed');
  });
});

describe('flutterwave adapter — construction', () => {
  it('refuses to construct without a secret key', () => {
    expect(() =>
      createFlutterwaveProvider({ secretKey: '' }),
    ).toThrow(/secret key is required/);
  });
});
