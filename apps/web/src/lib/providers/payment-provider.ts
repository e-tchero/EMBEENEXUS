import type { VerifiedTransaction } from '@/lib/domain/payment';

/**
 * Payment provider abstraction (M4).
 *
 * The domain and service layers depend on this interface only — never on
 * Flutterwave response shapes. A future provider (founder model: the gateway
 * must be swappable without rebuilding the order system) implements the same
 * contract.
 *
 * All implementations are server-only: credentials never reach the client,
 * and no method ever trusts client-supplied payment facts.
 *
 * Reuses the M2 resilience vocabulary (MapsProviderError precedent): typed
 * error codes, normalized internal results, bounded inputs.
 */

export interface CreateCheckoutInput {
  /** Server-generated, stored-before-call transaction reference. */
  readonly transactionReference: string;
  /** Exact amount in kobo — derived from the order immutable snapshot. */
  readonly amountKobo: bigint;
  readonly currency: 'NGN';
  /** Customer email (Flutterwave Standard requires a customer email). */
  readonly customerEmail: string;
  /** Server URL the provider redirects back to after checkout. */
  readonly redirectUrl: string;
  /** Human-readable payment title shown on the hosted checkout page. */
  readonly title: string;
  /** Optional free-form description shown on checkout. */
  readonly description?: string;
}

export interface CheckoutSession {
  /** Hosted checkout URL the client must be redirected to. */
  readonly checkoutUrl: string;
  /** Provider-side link identifier when the provider issues one. */
  readonly providerLink?: string;
}

export interface VerifyByReferenceInput {
  readonly transactionReference: string;
}

export type PaymentProviderError =
  | 'invalid_input'
  | 'auth_failed'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response'
  | 'network';

export class PaymentProviderErrorError extends Error {
  readonly code: PaymentProviderError;
  readonly status?: number;

  constructor(code: PaymentProviderError, message: string, status?: number) {
    super(message);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.status = status;
  }
}

export interface PaymentProvider {
  /**
   * Creates a hosted (Standard) checkout session for the given reference.
   * Implementations must validate the response schema and must retry only
   * idempotent-safe failures within a bounded budget.
   */
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Verifies a transaction by transaction reference via the provider's
   * server API (never via redirect parameters). Returns normalized facts;
   * a transaction that does not exist maps to a `not_found` error, not a
   * fabricated result.
   */
  verifyByReference(input: VerifyByReferenceInput): Promise<VerifiedTransaction>;
}
