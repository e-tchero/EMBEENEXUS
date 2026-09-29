'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch, apiErrorMessage } from '@/app/orders/new/api-helpers';

import { ORDER_STATUS_COPY } from './status-copy';

/**
 * Tracking-lite order status client.
 *
 * Polls GET /api/orders/[orderId] (authoritative, RLS-scoped) and renders
 * the server's status with customer-facing copy. No fake GPS, no local
 * state machine: what is shown is exactly what the server reports.
 *
 * Real actions exposed:
 *  - awaiting_payment: retry/complete payment (server-derived checkout).
 *  - cancellable statuses (customer-cancelable per the domain machine):
 *    cancel entry point calling the transition API.
 *  - delivered: confirm receipt (recipient confirmation).
 */

type OrderStatus = keyof typeof ORDER_STATUS_COPY;

interface OrderPayload {
  readonly ok: true;
  readonly order: {
    readonly id: string;
    readonly status: OrderStatus;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly customerPriceKobo: string;
    readonly createdAt: string;
  };
}

/** Statuses where the customer may still cancel (domain machine). */
const CUSTOMER_CANCELABLE: readonly string[] = [
  'draft',
  'awaiting_payment',
  'payment_verified',
  'searching_rider',
  'rider_assigned',
  'en_route_pickup',
];

const POLL_ACTIVE_MS = 10_000;
const POLL_SETTLED_MS = 30_000;

export function OrderStatusClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderPayload['order'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'confirm' | 'pay' | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<OrderPayload>(`/api/orders/${orderId}`, { method: 'GET' });
      setOrder(result.order);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    const settled =
      order.status === 'completed' || order.status === 'cancelled' || order.status === 'failed';
    const interval = setInterval(() => void load(), settled ? POLL_SETTLED_MS : POLL_ACTIVE_MS);
    return () => clearInterval(interval);
  }, [order, load]);

  async function cancelOrder() {
    if (order === null) return;
    if (!window.confirm('Cancel this delivery? This cannot be undone.')) return;
    setBusy('cancel');
    setActionError(null);
    try {
      await apiFetch(`/api/orders/${orderId}/transition`, {
        method: 'POST',
        body: { trigger: 'cancel' },
      });
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmReceipt() {
    setBusy('confirm');
    setActionError(null);
    try {
      await apiFetch(`/api/orders/${orderId}/confirm-receipt`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function payNow() {
    setBusy('pay');
    setPayError(null);
    try {
      const checkout = await apiFetch<{
        ok: true;
        checkout: { checkoutUrl: string };
      }>('/api/payments', { method: 'POST', body: { orderId } });
      window.location.assign(checkout.checkout.checkoutUrl);
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiError && err.code === 'invalid_order_state') {
        // Payment attempt raced with another path (e.g. webhook landed);
        // refresh to pick up the server's current state.
        await load();
        return;
      }
      setPayError(apiErrorMessage(err));
    }
  }

  if (loadError !== null && order === null) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!order) {
    return <p className="text-sm text-(--foreground-muted)">Loading your delivery…</p>;
  }

  const copy = ORDER_STATUS_COPY[order.status] ?? {
    label: order.status,
    body: 'Current status of your delivery.',
    next: '',
  };
  const canCancel = CUSTOMER_CANCELABLE.includes(order.status);
  const canConfirm = order.status === 'delivered';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-(--foreground-muted)">Status</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">{copy.label}</p>
        <p className="mt-1 text-sm text-(--foreground-muted)">{copy.body}</p>
        {copy.next !== '' ? (
          <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-(--foreground-muted)">
            Next: {copy.next}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-(--foreground-muted)">Details</p>
        <div>
          <p className="text-xs text-(--foreground-muted)">Order reference</p>
          <p className="font-mono text-xs">{order.id}</p>
        </div>
        <div>
          <p className="text-xs text-(--foreground-muted)">Pickup</p>
          <p className="text-sm font-medium">{order.pickupAddress}</p>
        </div>
        <div>
          <p className="text-xs text-(--foreground-muted)">Destination</p>
          <p className="text-sm font-medium">{order.dropoffAddress}</p>
        </div>
        <div>
          <p className="text-xs text-(--foreground-muted)">Amount</p>
          <p className="text-sm font-medium">
            ₦{(Number(order.customerPriceKobo) / 100).toLocaleString('en-NG')}
          </p>
        </div>
      </section>

      {order.status === 'awaiting_payment' ? (
        <section className="space-y-3">
          {payError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {payError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void payNow()}
            disabled={busy !== null}
            className="w-full rounded-lg bg-(--action-ink) px-4 py-3 text-sm font-medium text-white hover:bg-(--action-ink-hover) disabled:opacity-50"
          >
            {busy === 'pay' ? 'Opening secure payment…' : 'Complete payment'}
          </button>
        </section>
      ) : null}

      {canConfirm ? (
        <section className="space-y-3">
          <p className="text-xs text-(--foreground-muted)">
            Received and inspected the parcel? Confirm to complete the delivery.
          </p>
          <button
            type="button"
            onClick={() => void confirmReceipt()}
            disabled={busy !== null}
            className="w-full rounded-lg bg-(--action-ink) px-4 py-3 text-sm font-medium text-white hover:bg-(--action-ink-hover) disabled:opacity-50"
          >
            {busy === 'confirm' ? 'Confirming…' : 'Confirm receipt'}
          </button>
        </section>
      ) : null}

      {canCancel ? (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => void cancelOrder()}
            disabled={busy !== null}
            className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel this delivery'}
          </button>
        </section>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
