import Link from 'next/link';

import { requireRole } from '@/lib/auth/guards';
import { listOperatorRiders } from '@/lib/services/operator-service';
import { statusLabel } from '@/lib/domain/operator-labels';
import { formatTimestamp } from '@/lib/domain/operator-labels';

/**
 * Rider visibility for dispatch operations: identity, verification state,
 * availability/queue clock, committed order, and current offer. GPS/location
 * tracking does not exist in the domain and is not shown.
 */
export default async function OperatorRidersPage() {
  await requireRole(['operator']);
  const result = await listOperatorRiders();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Riders</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Verification, availability, and dispatch state. No location tracking exists or is shown.
          </p>
        </div>
        <Link
          href="/operator/riders/review"
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Verification review queue
        </Link>
      </header>

      {!result.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Rider visibility unavailable ({result.error}).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Rider</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Availability</th>
                <th className="px-3 py-2">Queue clock</th>
                <th className="px-3 py-2">Committed order</th>
                <th className="px-3 py-2">Current offer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {result.riders.map((rider) => (
                <tr key={rider.id}>
                  <td className="px-3 py-2">
                    <p className="text-sm font-medium text-neutral-900">{rider.name}</p>
                    <p className="font-mono text-xs text-neutral-400">{rider.id}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">{rider.verificationStatus}</td>
                  <td className="px-3 py-2 text-xs">{rider.isActive ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 text-xs">
                    {rider.available === null ? 'no record' : rider.available ? 'available' : 'paused'}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{formatTimestamp(rider.availableSince)}</td>
                  <td className="px-3 py-2 text-xs">
                    {rider.activeOrder ? (
                      <Link href={`/operator/orders/${rider.activeOrder.id}`} className="text-blue-700 hover:underline">
                        {statusLabel(rider.activeOrder.status)}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {rider.currentOffer ? (
                      <span className="font-mono text-xs">
                        offered · expires {formatTimestamp(rider.currentOffer.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {result.riders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-neutral-500">
                    No riders registered.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
