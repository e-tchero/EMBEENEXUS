import { describe, expect, it, vi } from 'vitest';

import { fetchWithRetry, isRetryableStatus, validateBoundedText } from './http-resilience';

describe('isRetryableStatus', () => {
  it.each([408, 429, 500, 502, 503, 504])('treats %i as retryable', (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 501])('treats %i as non-retryable', (status) => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('validateBoundedText', () => {
  it('accepts text within the bound', () => {
    expect(validateBoundedText('abc', 5, 'x').ok).toBe(true);
  });

  it('rejects text beyond the bound', () => {
    expect(validateBoundedText('abcdef', 5, 'x').ok).toBe(false);
  });
});

describe('fetchWithRetry', () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const options = {
    maxAttempts: 3,
    backoffMs: 10,
    isSuccess: (r: { status: number }) => r.status === 200,
    shouldRetry: (r: { status: number }) => r.status >= 500,
    sleep,
  };

  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200 });
    const outcome = await fetchWithRetry(fn, options);
    expect(outcome).toMatchObject({ ok: true, attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries retryable failures within budget and sleeps between attempts', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValue({ status: 200 });
    const outcome = await fetchWithRetry(fn, options);
    expect(outcome).toMatchObject({ ok: true, attempts: 3 });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('stops immediately on a non-retryable failure (ok: false)', async () => {
    const fn = vi.fn().mockResolvedValue({ status: 400 });
    const outcome = await fetchWithRetry(fn, options);
    expect(outcome).toMatchObject({ ok: false, attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts the budget on persistent failures (no unbounded retries)', async () => {
    const fn = vi.fn().mockResolvedValue({ status: 503 });
    const outcome = await fetchWithRetry(fn, options);
    expect(outcome).toMatchObject({ ok: false, attempts: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('propagates network errors after the budget is exhausted', async () => {
    const failing = {
      ...options,
      maxAttempts: 2,
      shouldRetry: () => false,
    };
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const outcome = await fetchWithRetry(fn, failing);
    expect(outcome.ok).toBe(false);
    expect(outcome.networkError).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
