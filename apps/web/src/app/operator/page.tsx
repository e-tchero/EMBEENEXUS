import Link from 'next/link';

import { requireRole } from '@/lib/auth/guards';
import { getOperatorOverview } from '@/lib/services/operator-service';
import { describeAttentionReasons } from '@/lib/domain/operator-attention';
import { statusLabel, formatTimestamp } from '@/lib/domain/operator-labels';

/**
 * Operator home — the first screen answers: what deliveries exist, which need
 * attention, how payments are progressing, rider availability, and where
 * intervention is required. Metrics are pilot-minimal and computed only from
 * authoritative rows.
 */
export default async function OperatorHomePage() {
  await requireRole(['operator']);
  const result = await getOperatorOverview();
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Operator overview unavailable ({result.error}).
      </p>
    );
  }
  const { overview } = result;

  const metrics: { label: string; value: string | number }[] = [
    { label: 'Total orders', value: overview.totals.orders },
    { label: 'Active', value: overview.totals.active },
    { label: 'Completed', value: overview.totals.completed },
    { label: 'Failed', value: overview.totals.failed },
    { label: 'Cancelled', value: overview.totals.cancelled },
    { label: 'Payments successful', value: overview.payments.successful },
    { label: 'Payments unresolved', value: overview.payments.failedOrStuck },
    { label: 'Riders available', value: overview.riders.available },
    { label: 'Riders committed', value: overview.riders.committed },
    { label: 'Verification reviews waiting', value: overview.riders.awaitingReview },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Operations overview</h1>
        <p className="mt-1 text-sm text-(--foreground-muted)">
          Closed Abuja pilot: live operational state, no vanity analytics.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold text-neutral-700">Needs attention</h2>
        {overview.attention.length === 0 ? (
          <p className="mt-2 text-sm text-(--foreground-muted)">No orders require attention.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {overview.attention.map((item) => (
              <li key={item.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/operator/orders/${item.id}`}
                    className="font-mono text-xs text-blue-700 hover:underline"
                  >
                    {item.id}
                  </Link>
                  <span className="font-mono text-xs text-(--foreground-muted)">{statusLabel(item.status)}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-800">{describeAttentionReasons(item.attention)}</p>
                <p className="mt-1 text-xs text-(--foreground-muted)">
                  {item.pickupAddress} → {item.dropoffAddress} · updated {formatTimestamp(item.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-700">Pilot metrics</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-neutral-200 bg-white p-3">
              <dt className="text-xs text-(--foreground-muted)">{metric.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
