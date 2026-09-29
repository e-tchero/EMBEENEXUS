import Link from 'next/link';

import { requireRole } from '@/lib/auth/guards';
import { getOperatorOrderDetail } from '@/lib/services/operator-service';
import { describeAttentionReasons } from '@/lib/domain/operator-attention';
import {
  statusLabel,
  triggerLabel,
  PAYMENT_STATUS_LABELS,
  PHOTO_KIND_LABELS,
  formatNairaFromKobo,
  formatTimestamp,
} from '@/lib/domain/operator-labels';

import { OperatorActionButtons } from './action-buttons';
import { EvidenceViewer } from './evidence-viewer';

/**
 * Operator order detail — answers "what happened to this order, and when"
 * from the authoritative event history, with payment, dispatch, evidence,
 * and controlled interventions alongside.
 */
export default async function OperatorOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireRole(['operator']);
  const { orderId } = await params;
  const result = await getOperatorOrderDetail(orderId);

  if (!result.ok || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Order not found or unavailable.
      </p>
    );
  }
  const { detail } = result;
  const { order } = detail;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-neutral-500">{order.id}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            {statusLabel(order.status)}
            <span className="ml-3 text-sm font-normal text-neutral-500">
              {formatNairaFromKobo(order.customerPriceKobo)}
            </span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {order.pickupAddress} → {order.dropoffAddress} · {order.roadDistanceM} m
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Customer {order.customerName} · Rider {order.riderName ?? 'not assigned'} · created{' '}
            {formatTimestamp(order.createdAt)} · updated {formatTimestamp(order.updatedAt)}
          </p>
        </div>
        <Link href="/operator/orders" className="text-xs text-neutral-500 hover:text-neutral-800">
          ← Order monitor
        </Link>
      </header>

      {detail.attention.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Attention: {describeAttentionReasons(detail.attention)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Event timeline</h2>
            <ol className="mt-3 space-y-3">
              {detail.events.map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="border-l-2 border-neutral-200 pl-3">
                  <p className="text-sm font-medium text-neutral-900">{triggerLabel(event.trigger)}</p>
                  <p className="text-xs text-neutral-500">
                    <span className="font-mono">{event.previousStatus || 'none'}</span> →{' '}
                    <span className="font-mono">{event.newStatus}</span> · {event.actorRole} ·{' '}
                    {formatTimestamp(event.createdAt)}
                  </p>
                  {event.notes ? <p className="mt-0.5 text-xs text-neutral-600">{event.notes}</p> : null}
                </li>
              ))}
              {detail.events.length === 0 ? (
                <li className="text-sm text-neutral-500">No events recorded.</li>
              ) : null}
            </ol>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Dispatch</h2>
            {detail.dispatch === null || detail.dispatch.offers.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                No dispatch offers recorded for this order.
              </p>
              ) : (
                <table className="mt-2 min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="py-1">Rider</th>
                      <th className="py-1">Status</th>
                      <th className="py-1">Offered</th>
                      <th className="py-1">Expiry</th>
                      <th className="py-1">Responded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {detail.dispatch.offers.map((offer) => (
                      <tr key={offer.id}>
                        <td className="py-1.5 text-xs">{offer.riderName ?? offer.id.slice(0, 8)}</td>
                        <td className="py-1.5 text-xs">{offer.status}</td>
                        <td className="py-1.5 text-xs text-neutral-500">{formatTimestamp(offer.offeredAt)}</td>
                        <td className="py-1.5 text-xs text-neutral-500">{formatTimestamp(offer.expiresAt)}</td>
                        <td className="py-1.5 text-xs text-neutral-500">{formatTimestamp(offer.respondedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            {detail.dispatch !== null ? (
              <p className="mt-2 text-xs text-neutral-500">
                Attempts: {detail.dispatch.attemptCount} · assigned rider: {detail.dispatch.assignedRiderName ?? 'none'}
              </p>
            ) : null}
          </section>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Payment</h2>
            {detail.payment ? (
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Status</dt>
                  <dd>{PAYMENT_STATUS_LABELS[detail.payment.status] ?? detail.payment.status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Expected</dt>
                  <dd className="tabular-nums">{formatNairaFromKobo(detail.payment.expectedAmountKobo)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Verified</dt>
                  <dd className="tabular-nums">
                    {detail.payment.verifiedAmountKobo === null
                      ? '—'
                      : formatNairaFromKobo(detail.payment.verifiedAmountKobo)}
                  </dd>
                </div>
                {detail.payment.verifiedAt ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-500">Verified at</dt>
                    <dd className="text-xs">{formatTimestamp(detail.payment.verifiedAt)}</dd>
                  </div>
                ) : null}
                {detail.payment.failureReason ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-500">Failure reason</dt>
                    <dd className="text-xs">{detail.payment.failureReason}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">No payment recorded.</p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Evidence</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {detail.evidence.map((photo) => (
                <li key={photo.kind} className="flex justify-between gap-2">
                  <span>{PHOTO_KIND_LABELS[photo.kind] ?? photo.kind}</span>
                  <span className="text-xs text-neutral-500">
                    {photo.contentType} · {Math.ceil(Number(photo.sizeBytes) / 1024)} KB ·{' '}
                    {photo.uploadedByRole}
                  </span>
                </li>
              ))}
              {detail.evidence.length === 0 ? (
                <li className="text-sm text-neutral-500">No evidence uploaded.</li>
              ) : null}
            </ul>
            <div className="mt-3">
              <EvidenceViewer orderId={order.id} kinds={detail.evidence.map((photo) => photo.kind)} />
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Lifecycle facts</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Split</dt>
                <dd className="text-xs tabular-nums">
                  rider {formatNairaFromKobo(order.riderShareKobo)} / platform{' '}
                  {formatNairaFromKobo(order.platformShareKobo)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Waiting started</dt>
                <dd className="text-xs">{formatTimestamp(order.waitingStartedAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Waiting charge</dt>
                <dd className="text-xs tabular-nums">{formatNairaFromKobo(order.waitingChargeKobo)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-neutral-500">Return initiated</dt>
                <dd className="text-xs">{formatTimestamp(order.returnInitiatedAt)}</dd>
              </div>
              {order.cancellationReason ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Cancellation reason</dt>
                  <dd className="text-xs">{order.cancellationReason}</dd>
                </div>
              ) : null}
              {order.failureReason ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Failure reason</dt>
                  <dd className="text-xs">{order.failureReason}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <OperatorActionButtons orderId={order.id} status={order.status} />
        </aside>
      </div>
    </div>
  );
}
