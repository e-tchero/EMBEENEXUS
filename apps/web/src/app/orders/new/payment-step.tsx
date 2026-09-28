'use client';

import { useEffect, useState } from 'react';

import { formatNairaFromKobo } from '@embee/shared';

import { ApiError, apiFetch, apiErrorMessage } from './api-helpers';
import type { ParcelEntry } from './parcels';

/**
 * Payment step of the new-order wizard.
 *
 * Sequence: POST /api/orders (server consumes the quote; if the quote
 * expired meanwhile, the server rejects and we surface a clean re-quote
 * path) → POST /api/orders/[id]/transition `order_submitted` (the
 * canonical draft → awaiting_payment step; payment requires it) →
 * POST /api/payments (server creates/reuses the hosted checkout with the
 * SERVER-derived amount) → browser redirect to Flutterwave.
 *
 * The browser never determines the payable amount, payment success,
 * transaction identity, or order completion. After paying, Flutterwave
 * lands on /payments/callback which polls the authoritative status.
 */

interface OrderConfirmationStepProps {
  quoteId: string;
  priceKobo: string;
  pickupAddress: string;
  dropoffAddress: string;
  parcels: ParcelEntry[];
  onBack: () => void;
  onQuoteExpired: () => void;
}

interface CheckoutPayload {
  readonly ok: true;
  readonly checkout: {
    readonly paymentId: string;
    readonly orderId: string;
    readonly transactionReference: string;
    readonly amountKobo: string;
    readonly currency: 'NGN';
    readonly checkoutUrl: string;
    readonly reused: boolean;
  };
}

export function PaymentStep(props: OrderConfirmationStepProps) {
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      // 1. Order creation from the accepted quote (server re-validates
      //    expiry/state; one order per quote, idempotent on retry).
      const order = await apiFetch<{ ok: true; order: { id: string; status: string } }>(
        '/api/orders',
        { method: 'POST', body: { quoteId: props.quoteId } },
      );

      // 2. Submit the order (canonical draft → awaiting_payment customer
      //    transition). Payment initiation rejects a draft order.
      await apiFetch<{ ok: true; order: { id: string; status: string } }>(
        `/api/orders/${order.order.id}/transition`,
        { method: 'POST', body: { trigger: 'order_submitted' } },
      );

      // 3. Hosted checkout with the server-derived amount.
      const checkout = await apiFetch<CheckoutPayload>('/api/payments', {
        method: 'POST',
        body: { orderId: order.order.id },
      });
      setStarting(false);
      setRedirecting(true);
      window.location.assign(checkout.checkout.checkoutUrl);
    } catch (err) {
      setStarting(false);
      setRedirecting(false);
      if (err instanceof ApiError && (err.code === 'quote_expired' || err.code === 'quote_not_active')) {
        setQuoteExpired(true);
      }
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    void start();
    // Mount-only: the step owns the full create-order + checkout sequence.
  }, []);

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Delivery summary
        </p>
        <div>
          <p className="text-xs text-neutral-500">Pickup</p>
          <p className="text-sm font-medium">{props.pickupAddress}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Destination</p>
          <p className="text-sm font-medium">{props.dropoffAddress}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Amount</p>
          <p className="text-lg font-semibold">{formatNairaFromKobo(BigInt(props.priceKobo))}</p>
        </div>
      </section>

      {starting && !error ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-neutral-500">
            Preparing your order and secure payment…
          </p>
          <div className="h-1 w-full overflow-hidden rounded bg-neutral-200">
            <div className="h-full w-1/3 animate-pulse rounded bg-neutral-400" />
          </div>
        </div>
      ) : null}

      {redirecting ? (
        <p className="text-center text-sm text-neutral-500">
          Taking you to secure payment…
        </p>
      ) : null}

      {error ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
          {quoteExpired ? (
            <button
              type="button"
              onClick={props.onQuoteExpired}
              className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Get a fresh quote
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={props.onBack}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void start()}
                className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
