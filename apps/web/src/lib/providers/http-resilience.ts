import { err, ok, type Result } from '@embee/shared';

/**
 * Shared fetch resilience primitives (M2).
 *
 * Pure orchestration over an injected fetch-like function — no globals, no
 * I/O of its own — so retry behavior and backoff timing are unit-testable
 * deterministically with a scripted fetch and fake timers.
 *
 * Used by provider adapters (Stadia Maps in M2; Flutterwave in M4).
 */

/** Bounded-input validation for provider calls (defense in depth). */
export function validateBoundedText(
  value: string,
  maxLen: number,
  _field: string,
): Result<string, { tooLong: true }> {
  if (value.length > maxLen) return err({ tooLong: true });
  return ok(value);
}

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * HTTP status classification for retry decisions.
 * 408/429 and 5xx (minus 501) are retryable; all other statuses are not.
 */
export function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599 && status !== 501)
  );
}

export interface RetryOutcome<T> {
  readonly ok: boolean;
  /** Final response when a response was eventually received (success or not). */
  readonly response?: T;
  /** Set when no response was ever received (network failure/timeout). */
  readonly networkError?: unknown;
  readonly attempts: number;
}

/**
 * Runs `fn` up to `maxAttempts` times.
 *
 * Semantics (M2 revision): `ok` is decided by the caller's `isSuccess`
 * predicate, never by retry behavior. Retries happen only when `shouldRetry`
 * returns true (and the budget remains); a non-retryable response therefore
 * stops immediately with `ok: false` when it does not satisfy `isSuccess`.
 *
 * `sleep` is injectable for deterministic tests.
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    backoffMs: number;
    /** Determines the outcome's `ok`. */
    isSuccess: (result: T) => boolean;
    /** Decides whether a non-success result earns another attempt. */
    shouldRetry: (result: T) => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<RetryOutcome<T>> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastResult: T | undefined;
  let networkError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      lastResult = await fn();
    } catch (error) {
      networkError = error;
      if (attempt === options.maxAttempts) {
        return { ok: false, networkError, attempts: attempt };
      }
      await sleep(options.backoffMs);
      continue;
    }

    if (options.isSuccess(lastResult)) {
      return { ok: true, response: lastResult, attempts: attempt };
    }

    if (!options.shouldRetry(lastResult) || attempt === options.maxAttempts) {
      return { ok: false, response: lastResult, attempts: attempt };
    }

    await sleep(options.backoffMs);
  }

  // Unreachable (loop always returns), kept for exhaustiveness.
  return { ok: false, response: lastResult, attempts: options.maxAttempts };
}
