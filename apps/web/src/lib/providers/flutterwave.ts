import { z } from 'zod';

import type { VerifiedTransaction } from '@/lib/domain/payment';
import { logger } from '@/lib/logging/logger';

import {
  PaymentProviderErrorError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentProvider,
  type VerifyByReferenceInput,
} from './payment-provider';
import { isRetryableStatus } from './http-resilience';

/**
 * Flutterwave V3 adapter — implements PaymentProvider against the documented
 * REST API (https://api.flutterwave.com/v3).
 *
 * Security properties:
 *   - The secret key is supplied at construction and used ONLY as a Bearer
 *     header on server-side requests; it is never logged or serialized.
 *   - Responses are zod-validated before use; unknown fields are dropped.
 *   - Provider errors are normalized to typed internal errors; raw provider
 *     payloads are never surfaced to callers (safe message strings only).
 *   - Retries are bounded and only on retryable HTTP statuses (408/429/5xx-501).
 *   - POST /v3/payments (Standard checkout) is treated as NOT retry-safe by
 *     default unless the caller opted in — a retried call could create a
 *     second payment link. Verification (GET) is idempotent and retryable.
 */

const DEFAULT_BASE_URL = 'https://api.flutterwave.com/v3';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 400;

export interface FlutterwaveConfig {
  readonly secretKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly backoffMs?: number;
  /** Injectable fetch for deterministic tests. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable sleep for deterministic retry tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Response schemas (only the fields we consume; unknown fields are ignored)
// ---------------------------------------------------------------------------

const apiEnvelopeSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

const checkoutDataSchema = z.object({
  link: z.string().url(),
});

const transactionSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  tx_ref: z.string().min(1),
  status: z.string().min(1),
  currency: z.string().min(1),
  /** Flutterwave returns a number; parse exactly, never via float math. */
  amount: z.number().nonnegative(),
  /** Amount actually charged when present (charges may split fees). */
  charged_amount: z.number().nonnegative().optional(),
});

const verifyEnvelopeSchema = apiEnvelopeSchema.extend({
  data: transactionSchema.nullable().optional(),
});

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createFlutterwaveProvider(config: FlutterwaveConfig): PaymentProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = logger.child({ provider: 'flutterwave' });

  if (!config.secretKey) {
    throw new PaymentProviderErrorError('invalid_input', 'Flutterwave secret key is required.');
  }

  function authHeaders(): HeadersInit {
    // The secret key travels ONLY in this header, on server-side requests.
    return {
      authorization: `Bearer ${config.secretKey}`,
      'content-type': 'application/json',
    };
  }

  async function attempt(
    path: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null; // malformed body → handled by callers as invalid_response
    }
    return { ok: response.ok, status: response.status, body };
  }

  function classify(error: { status: number }): PaymentProviderErrorError {
    if (error.status === 401 || error.status === 403) {
      return new PaymentProviderErrorError('auth_failed', 'Provider rejected credentials.', error.status);
    }
    if (error.status === 404) {
      return new PaymentProviderErrorError('not_found', 'Provider resource not found.', error.status);
    }
    if (error.status === 429) {
      return new PaymentProviderErrorError('rate_limited', 'Provider rate limit reached.', error.status);
    }
    return new PaymentProviderErrorError('provider_error', 'Provider request failed.', error.status);
  }

  /**
   * Runs one provider operation with bounded retries.
   * `retryable` gates whether non-network failures earn another attempt
   * (POST checkout creation: no; GET verification: yes on 408/429/5xx).
   */
  async function run(
    path: string,
    init: RequestInit,
    options: { retryable: boolean },
  ): Promise<{ ok: true; body: unknown } | { ok: false; error: PaymentProviderErrorError }> {
    for (let i = 1; i <= maxAttempts; i++) {
      let result: { ok: boolean; status: number; body: unknown };
      try {
        result = await attempt(path, init);
      } catch (error) {
        // Network/timeout — retry within budget.
        if (i === maxAttempts) {
          const aborted = error instanceof Error && error.name === 'TimeoutError';
          log.warn('payments.provider.network', { path, attempts: i });
          return {
            ok: false,
            error: new PaymentProviderErrorError(
              aborted ? 'timeout' : 'network',
              'Provider request did not complete.',
            ),
          };
        }
        await sleep(backoffMs);
        continue;
      }

      if (result.ok) {
        return { ok: true, body: result.body };
      }

      const retryable = options.retryable && isRetryableStatus(result.status);
      if (!retryable || i === maxAttempts) {
        log.warn('payments.provider.http', { path, status: result.status, attempts: i });
        return { ok: false, error: classify(result) };
      }
      await sleep(backoffMs);
    }
    // Unreachable.
    return {
      ok: false,
      error: new PaymentProviderErrorError('provider_error', 'Provider request failed.'),
    };
  }

  function parseEnvelope(body: unknown): z.infer<typeof apiEnvelopeSchema> {
    const parsed = apiEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PaymentProviderErrorError('invalid_response', 'Provider response failed validation.');
    }
    return parsed.data;
  }

  return {
    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
      // Bounded input validation before any network call.
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.transactionReference)) {
        throw new PaymentProviderErrorError('invalid_input', 'Invalid transaction reference.');
      }
      if (input.amountKobo <= 0n) {
        throw new PaymentProviderErrorError('invalid_input', 'Invalid amount.');
      }
      if (!input.customerEmail.includes('@') || input.customerEmail.length > 200) {
        throw new PaymentProviderErrorError('invalid_input', 'Invalid customer email.');
      }
      if (!input.redirectUrl.startsWith('https://')) {
        throw new PaymentProviderErrorError('invalid_input', 'Redirect URL must be HTTPS.');
      }
      if (input.title.length > 100) {
        throw new PaymentProviderErrorError('invalid_input', 'Title too long.');
      }

      // UNIT CONTRACT (verified against Flutterwave docs + live TEST API):
      // Flutterwave V3 amounts are in MAJOR units (naira for NGN), NOT kobo.
      // Evidence: official webhook sample shows amount=100 NGN with app_fee=1.4
      // (1.4% of 100 naira); the verification guide compares data.amount ===
      // expectedAmount where the merchant charges whole naira. Our internal
      // representation is kobo, so the wire amount is the exact integer
      // division kobo/100 — valid because every Embee price is a whole-naira
      // amount (fixed-band pricing), making this division lossless.
      if (input.amountKobo % 100n !== 0n) {
        throw new PaymentProviderErrorError(
          'invalid_input',
          'Amount must be a whole naira value (Embee prices are whole-naira).',
        );
      }
      const wireAmount = (input.amountKobo / 100n).toString();
      const payload = {
        tx_ref: input.transactionReference,
        amount: wireAmount, // exact integer string in naira — no float math
        currency: input.currency,
        redirect_url: input.redirectUrl,
        customizations: {
          title: input.title,
          description: input.description?.slice(0, 200) ?? 'Delivery payment',
        },
        customer: { email: input.customerEmail },
        // Standard checkout: hosted page; no raw card data ever touches us.
      };

      // POST /v3/payments — deliberately NOT retried (a retry could create a
      // second payment link for the same tx_ref; reconciliation handles the
      // timeout-after-success case instead).
      const outcome = await run('/payments', { method: 'POST', body: JSON.stringify(payload) }, {
        retryable: false,
      });

      if (!outcome.ok) {
        throw outcome.error;
      }

      const envelope = parseEnvelope(outcome.body);
      if (envelope.status !== 'success') {
        throw new PaymentProviderErrorError(
          'provider_error',
          'Provider did not accept the checkout request.',
        );
      }

      const data = checkoutDataSchema.safeParse(envelope.data);
      if (!data.success) {
        throw new PaymentProviderErrorError('invalid_response', 'Checkout link missing from response.');
      }

      log.info('payments.checkout.created', { reference: input.transactionReference });
      return { checkoutUrl: data.data.link };
    },

    async verifyByReference(input: VerifyByReferenceInput): Promise<VerifiedTransaction> {
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.transactionReference)) {
        throw new PaymentProviderErrorError('invalid_input', 'Invalid transaction reference.');
      }

      const path = `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
        input.transactionReference,
      )}`;

      // GET verification is idempotent — bounded retries on transient failures.
      const outcome = await run(path, { method: 'GET' }, { retryable: true });
      if (!outcome.ok) {
        throw outcome.error;
      }

      const envelope = verifyEnvelopeSchema.safeParse(outcome.body);
      if (!envelope.success) {
        throw new PaymentProviderErrorError('invalid_response', 'Verification response failed validation.');
      }

      const txn = envelope.data.data;
      if (!txn) {
        throw new PaymentProviderErrorError('not_found', 'No transaction found for reference.');
      }

      log.info('payments.verify.completed', {
        reference: txn.tx_ref,
        providerStatus: txn.status,
      });

      // UNIT CONTRACT: Flutterwave reports amount/charged_amount in MAJOR
      // units (naira). Convert to our internal kobo representation exactly:
      // naira × 100 via BigInt integer math. Fractional-naira provider amounts
      // are impossible for whole-naira charges; anything else fails closed.
      const wireAmount = txn.charged_amount ?? txn.amount;
      if (!Number.isInteger(wireAmount)) {
        throw new PaymentProviderErrorError(
          'invalid_response',
          'Provider amount is not a whole naira value.',
        );
      }

      return {
        status:
          txn.status === 'successful' ? 'successful' : txn.status === 'pending' ? 'pending' : 'failed',
        amountKobo: BigInt(wireAmount) * 100n,
        currency: txn.currency,
        transactionReference: txn.tx_ref,
        providerTransactionId: txn.id,
      };
    },
  };
}
