import Link from 'next/link';

import { requireRole } from '@/lib/auth/guards';
import { listOperatorOrders, type OperatorOrderListItem } from '@/lib/services/operator-service';
import { statusLabel, formatNairaFromKobo } from '@/lib/domain/operator-labels';

/**
 * Order monitor — the operational list. Filters use the canonical status
 * vocabulary (no invented categories); each row carries the domain facts an
 * operator scans for: reference, status, customer, rider, route, amount,
 * created, last event, attention indicator.
 */
export default async function OperatorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(['operator']);
  const { filter } = await searchParams;
  const result = await listOperatorOrders(filter ?? 'all');

  const filters: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'awaiting_payment', label: 'Awaiting payment' },
    { key: 'searching_rider', label: 'Searching rider' },
    { key: 'rider_assigned', label: 'Rider assigned' },
    { key: 'en_route_pickup', label: 'En route to pickup' },
    { key: 'picked_up', label: 'Picked up' },
    { key: 'in_transit', label: 'In transit' },
    { key: 'failed', label: 'Failed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'completed', label: 'Completed' },
  ];

  const orders: readonly OperatorOrderListItem[] = result.ok ? result.orders : [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Order monitor</h1>
        <p className="mt-1 text-sm text-(--foreground-muted)">
          Canonical statuses only; every filter maps to the database state.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Order filters">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={`/operator/orders?filter=${item.key}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              (filter ?? 'all') === item.key
                ? 'border-neutral-900 bg-(--action-ink) text-white'
                : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {!result.ok && result.error !== 'invalid_input' ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Order monitor unavailable ({result.error}).
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-(--foreground-muted)">
            <tr>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Rider</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last event</th>
              <th className="px-3 py-2">Attention</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orders.map((order) => (
              <tr key={order.id} className={order.attention.length > 0 ? 'bg-amber-50/60' : undefined}>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/operator/orders/${order.id}`} className="text-blue-700 hover:underline">
                    {order.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{statusLabel(order.status)}</td>
                <td className="px-3 py-2 text-xs">{order.customerName}</td>
                <td className="px-3 py-2 text-xs">{order.riderName ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-(--foreground-muted)">
                  {order.pickupAddress} → {order.dropoffAddress}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNairaFromKobo(order.customerPriceKobo)}</td>
                <td className="px-3 py-2 text-xs text-(--foreground-muted)">{new Date(order.createdAt).toLocaleString('en-GB')}</td>
                <td className="px-3 py-2 text-xs text-(--foreground-muted)">
                  {order.lastTrigger ? `${order.lastTrigger} · ${new Date(order.lastEventAt ?? order.createdAt).toLocaleString('en-GB')}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {order.attention.length > 0 ? (
                    <span className="rounded bg-amber-200 px-2 py-0.5 font-medium text-amber-900">attention</span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-(--foreground-muted)">
                  No orders for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
