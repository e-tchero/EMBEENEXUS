import Link from 'next/link';

import { signOutAction } from '@/lib/auth/actions';

import { ORDER_STATUS_COPY } from '@/app/orders/[orderId]/status-copy';

/**
 * Customer dashboard content (pilot scope).
 *
 * Renders the server-fetched list of the customer's deliveries with their
 * authoritative statuses (RLS-scoped read in the server page), links into
 * the tracking-lite order pages, and is the entry point for starting a new
 * delivery. No fabricated data: an empty list means no deliveries exist
 * for this account yet.
 */

export interface OrderListItem {
  readonly id: string;
  readonly status: string;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly customerPriceKobo: string;
  readonly createdAt: string;
}

function nairaFromKoboString(kobo: string): string {
  const value = Number(kobo);
  if (!Number.isFinite(value)) return '—';
  return `₦${(value / 100).toLocaleString('en-NG')}`;
}

function shortDate(iso: string): string {
  const date = Date.parse(iso);
  if (Number.isNaN(date)) return '';
  return new Date(date).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DashboardClient({
  orders,
  email,
}: {
  orders: OrderListItem[];
  email: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Embee Nexus</h1>
        <form action={signOutAction}>
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <Link
        href="/orders/new"
        className="block rounded-xl bg-neutral-900 px-4 py-4 text-center text-sm font-semibold text-white hover:bg-neutral-700"
      >
        Start a delivery
      </Link>

      {orders.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No deliveries yet. Start your first delivery above.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const copy = ORDER_STATUS_COPY[order.status as keyof typeof ORDER_STATUS_COPY] ?? null;
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="block space-y-1 rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{copy ? copy.label : order.status}</p>
                    <p className="text-sm font-medium">
                      {nairaFromKoboString(order.customerPriceKobo)}
                    </p>
                  </div>
                  <p className="truncate text-xs text-neutral-600">
                    {order.pickupAddress} → {order.dropoffAddress}
                  </p>
                  <p className="text-xs text-neutral-600">{shortDate(order.createdAt)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {email !== null && email !== '' ? (
        <p className="text-center text-xs text-neutral-600">Signed in as {email}</p>
      ) : null}
    </div>
  );
}
