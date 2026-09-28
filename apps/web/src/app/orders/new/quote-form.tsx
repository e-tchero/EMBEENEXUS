'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatNairaFromKobo } from '@embee/shared';

import { apiFetch, apiErrorMessage } from './api-helpers';
import type { ParcelEntry } from './parcels';

/**
 * Quote step of the new-order wizard.
 *
 * Sends pickup/destination to POST /api/quotes; the SERVER measures road
 * distance (Stadia), validates coverage (PostGIS) and prices the delivery
 * (five-band pricing). The displayed amount is always the authoritative
 * server quote — nothing is computed locally.
 *
 * Expiry: the server returns a 10-minute `expiresAt`. A live countdown
 * shows remaining time; at zero, payment is prevented and the customer
 * gets a clean one-tap path to request a fresh quote. The countdown is
 * display-only — the SERVER re-validates expiry again at order creation.
 */

interface ServerQuote {
  readonly id: string;
  readonly roadDistanceMetres: number;
  readonly customerPriceKobo: string;
  readonly expiresAt: string;
}

interface QuoteFormProps {
  pickup: { address: string; lat: number | null; lng: number | null };
  dropoff: { address: string; lat: number | null; lng: number | null };
  parcels: ParcelEntry[];
  onBack: () => void;
  onQuoteAccepted: (quote: ServerQuote) => void;
}

/** Milliseconds of warning before hard expiry. */
const EXPIRY_WARNING_MS = 60_000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  const km = metres / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function parcelSummary(parcels: ParcelEntry[]): string {
  const count = parcels.length;
  const totalKg = parcels.reduce((sum, p) => sum + (p.weightKg ?? 0), 0);
  const noun = count === 1 ? 'parcel' : 'parcels';
  const kgText = totalKg % 1 === 0 ? String(totalKg) : totalKg.toFixed(1);
  return `${count} ${noun} · up to ${kgText} kg total`;
}

export function QuoteForm(props: QuoteFormProps) {
  const [quote, setQuote] = useState<ServerQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bumping this counter re-runs the quote request ("get a fresh quote").
  const [attempt, setAttempt] = useState(0);

  const [now, setNow] = useState(() => Date.now());
  const expiryMs = useMemo(() => (quote ? Date.parse(quote.expiresAt) : null), [quote]);
  const remainingMs = expiryMs === null ? null : expiryMs - now;
  const expired = remainingMs !== null && remainingMs <= 0;
  const expiringSoon = remainingMs !== null && remainingMs <= EXPIRY_WARNING_MS;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuote(null);

    const pickupPoint =
      props.pickup.lat !== null && props.pickup.lng !== null
        ? { lat: props.pickup.lat, lng: props.pickup.lng }
        : null;
    const dropoffPoint =
      props.dropoff.lat !== null && props.dropoff.lng !== null
        ? { lat: props.dropoff.lat, lng: props.dropoff.lng }
        : null;

    (async () => {
      try {
        // Coordinates arrive from the geocoder or manual entry; when either
        // endpoint lacks them, the typed address is geocoded server-side.
        let pickup = pickupPoint;
        let dropoff = dropoffPoint;
        if (!pickup || !dropoff) {
          const geo = await apiFetch<{
            ok: true;
            pickup: { lat: number; lng: number };
            dropoff: { lat: number; lng: number };
          }>('/api/geo/geocode', {
            method: 'POST',
            body: {
              pickupAddress: props.pickup.address,
              dropoffAddress: props.dropoff.address,
            },
          });
          pickup = geo.pickup;
          dropoff = geo.dropoff;
        }
        const result = await apiFetch<{ ok: true; quote: ServerQuote }>('/api/quotes', {
          method: 'POST',
          body: {
            pickupLat: pickup!.lat,
            pickupLng: pickup!.lng,
            pickupAddress: props.pickup.address,
            dropoffLat: dropoff!.lat,
            dropoffLng: dropoff!.lng,
            dropoffAddress: props.dropoff.address,
          },
        });
        if (!cancelled) setQuote(result.quote);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.pickup, props.dropoff, attempt]);

  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote]);

  function requestFreshQuote() {
    setAttempt((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Trip</p>
        <div>
          <p className="text-xs text-neutral-500">Pickup</p>
          <p className="text-sm font-medium">{props.pickup.address}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Destination</p>
          <p className="text-sm font-medium">{props.dropoff.address}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Parcel</p>
          <p className="text-sm font-medium">{parcelSummary(props.parcels)}</p>
        </div>
        {quote ? (
          <div>
            <p className="text-xs text-neutral-500">Distance</p>
            <p className="text-sm font-medium">{formatDistance(quote.roadDistanceMetres)}</p>
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-neutral-500">Measuring the trip and preparing your price…</p>
          <div className="h-1 w-full overflow-hidden rounded bg-neutral-200">
            <div className="h-full w-1/3 animate-pulse rounded bg-neutral-400" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
          <button
            type="button"
            onClick={props.onBack}
            className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
          >
            Change addresses
          </button>
        </div>
      ) : null}

      {quote && !expired ? (
        <section className="space-y-3">
          <div
            className={`rounded-xl border p-4 text-center ${
              expiringSoon ? 'border-amber-300 bg-amber-50' : 'border-neutral-200'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Delivery price
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              {formatNairaFromKobo(BigInt(quote.customerPriceKobo))}
            </p>
            <p
              className={`mt-2 text-xs ${
                expiringSoon ? 'font-medium text-amber-700' : 'text-neutral-500'
              }`}
            >
              {expiringSoon
                ? `Expires in ${formatRemaining(remainingMs ?? 0)} — pay before it expires`
                : `Guaranteed for ${formatRemaining(remainingMs ?? 0)}`}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={props.onBack}
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => props.onQuoteAccepted(quote)}
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Continue to payment
            </button>
          </div>
        </section>
      ) : null}

      {quote && expired ? (
        <section className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700">Quote expired</p>
            <p className="mt-1 text-xs text-red-600">
              Prices are guaranteed for 10 minutes. Get a fresh quote to continue — nothing has
              been charged.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={props.onBack}
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
            >
              Change addresses
            </button>
            <button
              type="button"
              onClick={requestFreshQuote}
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Get a fresh quote
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
