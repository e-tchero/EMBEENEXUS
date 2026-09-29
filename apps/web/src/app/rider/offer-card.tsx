'use client';

import { useEffect, useState } from 'react';

import { formatNairaFromKobo } from '@embee/shared';

/**
 * Rider offer card.
 *
 * Presents the single authoritative offer from GET /api/rider/state and its
 * 20-second TTL. Accept/decline call the existing endpoints; the response is
 * the truth (a raced expiry returns offer_expired and the card clears).
 * Expiry at zero is display-only anticipation — the backend's tick owns the
 * real expiration, and the next state poll reconciles the view.
 */

interface OfferView {
  readonly offerId: string;
  readonly orderId: string;
  readonly expiresAt: string;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly roadDistanceM: number;
  readonly riderShareKobo: string;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function RiderOfferCard(props: {
  offer: OfferView;
  onResolved: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, Date.parse(props.offer.expiresAt) - Date.now()),
  );
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRemainingMs(Math.max(0, Date.parse(props.offer.expiresAt) - Date.now()));
    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, Date.parse(props.offer.expiresAt) - Date.now()));
    }, 250);
    return () => clearInterval(timer);
  }, [props.offer.expiresAt]);

  const expired = remainingMs <= 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const urgent = secondsLeft <= 7;

  async function respond(action: 'accept' | 'decline') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/dispatch/offers/${props.offer.offerId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        if (body?.error === 'offer_expired' || body?.error === 'offer_not_active') {
          // The backend decided: this offer is gone. Refresh to reconcile.
          props.onResolved();
          return;
        }
        setError(messageForOfferError(body?.error));
        setBusy(null);
        return;
      }
      props.onResolved();
    } catch {
      setError('Network problem, try again.');
      setBusy(null);
    }
  }

  return (
    <section
      className={`rounded-xl border-2 p-4 ${
        expired ? 'border-neutral-300 bg-neutral-50' : urgent ? 'border-red-400 bg-red-50' : 'border-(--line-strong) bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-(--foreground-muted)">
          New delivery offer
        </p>
        <p
          className={`font-mono text-lg font-bold tabular-nums ${
            expired ? 'text-neutral-400' : urgent ? 'text-red-700' : 'text-neutral-900'
          }`}
        >
          {expired ? '0s' : `${secondsLeft}s`}
        </p>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-sm"><span className="text-(--foreground-muted)">Pickup:</span> {props.offer.pickupAddress}</p>
        <p className="text-sm"><span className="text-(--foreground-muted)">Drop-off:</span> {props.offer.dropoffAddress}</p>
        <p className="text-sm">
          <span className="text-(--foreground-muted)">Distance:</span> {formatDistance(props.offer.roadDistanceM)}
          <span className="mx-2 text-neutral-300">·</span>
          <span className="text-(--foreground-muted)">Your earnings:</span>{' '}
          <span className="font-semibold">
            {formatNairaFromKobo(BigInt(props.offer.riderShareKobo))}
          </span>
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {expired ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-(--foreground-muted)">
            This offer window has closed. The next offer will appear here automatically.
          </p>
          <button
            type="button"
            onClick={() => props.onResolved()}
            className="w-full min-h-11 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void respond('decline')}
            className="min-h-12 rounded-lg border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void respond('accept')}
            className="min-h-12 rounded-lg bg-(--action-ink) px-4 py-3 text-sm font-semibold text-white hover:bg-(--action-ink-hover) disabled:opacity-40"
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      )}
    </section>
  );
}

function messageForOfferError(code: string | undefined): string {
  switch (code) {
    case 'rider_busy':
      return 'You are already committed to a delivery.';
    case 'rider_not_approved':
    case 'rider_ineligible':
      return 'Your account is not eligible for this offer.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Your session expired. Sign in again.';
    default:
      return 'The offer could not be processed. It may have expired.';
  }
}
