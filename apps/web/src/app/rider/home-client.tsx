'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { signOutAction } from '@/lib/auth/actions';
import {
  nextRiderStep,
  waitingViewModel,
} from '@/lib/domain/rider-flow';
import type { OrderStatus } from '@/lib/domain/order-state';

import { RiderOfferCard } from './offer-card';
import { RiderOrderCard } from './order-card';

/**
 * Rider operational home (pilot).
 *
 * Renders ONLY what GET /api/rider/state reports — verification gate,
 * availability declaration, the single active offer with its TTL, and the
 * committed active order with its next action. There is no client-side
 * dispatch logic: the backend decides eligibility, offers, and state; this
 * screen answers "what do I need to do right now?" in one view.
 */

interface RiderState {
  readonly rider: {
    readonly verificationStatus: string;
    readonly verificationNotes: string | null;
    readonly isAvailable: boolean;
    readonly availableSince: string | null;
  };
  readonly offer: {
    readonly offerId: string;
    readonly orderId: string;
    readonly expiresAt: string;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly roadDistanceM: number;
    readonly riderShareKobo: string;
  } | null;
  readonly activeOrder: {
    readonly orderId: string;
    readonly status: OrderStatus;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly returnInitiated: boolean;
    readonly waitingStartedAt: string | null;
    readonly waitingChargeKobo: string;
  } | null;
}

type LoadPhase = 'loading' | 'ready' | 'error';

const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 12_000;

export function RiderHomeClient() {
  const [state, setState] = useState<RiderState | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rider/state', { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `status ${res.status}`);
      }
      const json = (await res.json()) as RiderState & { ok: boolean };
      setState({ rider: json.rider, offer: json.offer ?? null, activeOrder: json.activeOrder ?? null });
      setLoadError(null);
      setPhase('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your rider state.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const busy = state?.activeOrder !== null || state?.offer !== null;
    const interval = setInterval(() => void load(), busy ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => clearInterval(interval);
  }, [phase, state, load]);

  async function setAvailability(isAvailable: boolean) {
    setAvailabilityBusy(true);
    setAvailabilityError(null);
    try {
      const res = await fetch('/api/rider/availability', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isAvailable }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        const message = messageForAvailabilityError(body?.error);
        setAvailabilityError(message);
      }
    } catch {
      setAvailabilityError('Network problem, try again.');
    } finally {
      setAvailabilityBusy(false);
      await load();
    }
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError ?? 'Could not load your rider state.'}
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

  if (phase === 'loading' || !state) {
    return <p className="text-sm text-neutral-600">Loading your rider console…</p>;
  }

  const { rider, offer, activeOrder } = state;

  // Verification gate: mirror the backend's rider_not_approved posture.
  if (rider.verificationStatus !== 'approved') {
    return <VerificationGate status={rider.verificationStatus} notes={rider.verificationNotes} />;
  }

  const step = activeOrder ? nextRiderStep(activeOrder.status, activeOrder.returnInitiated) : null;
  const waiting = activeOrder
    ? waitingViewModel(activeOrder.waitingStartedAt, new Date())
    : null;

  return (
    <div className="space-y-5">
      {/* Availability — real backend declaration, not a local toggle. */}
      <section className="rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
              Availability
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {rider.isAvailable ? 'Available for deliveries' : 'Unavailable'}
            </p>
          </div>
          <button
            type="button"
            disabled={availabilityBusy || activeOrder !== null}
            onClick={() => void setAvailability(!rider.isAvailable)}
            className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${
              rider.isAvailable
                ? 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                : 'bg-neutral-900 text-white hover:bg-neutral-700'
            }`}
          >
            {rider.isAvailable ? 'Go unavailable' : 'Go available'}
          </button>
        </div>
        {activeOrder !== null ? (
          <p className="mt-2 text-xs text-neutral-600">
            You are committed to a delivery, so availability is controlled by the dispatch system
            until it completes.
          </p>
        ) : null}
        {availabilityError ? (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {availabilityError}
          </p>
        ) : null}
      </section>

      {/* Active offer with TTL. */}
      {offer ? (
        <RiderOfferCard offer={offer} onResolved={() => void load()} />
      ) : null}

      {/* Committed active order. */}
      {activeOrder && step ? (
        <RiderOrderCard
          order={activeOrder}
          step={step}
          waiting={waiting}
          onChanged={() => void load()}
        />
      ) : null}

      {/* Dispatch waiting state. */}
      {!offer && !activeOrder ? (
        <section className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
          <p className="text-sm font-medium">
            {rider.isAvailable ? 'Waiting for the next delivery offer…' : 'You are unavailable.'}
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            {rider.isAvailable
              ? 'Offers go to available riders in order of availability. Keep this screen open.'
              : 'Go available to start receiving delivery offers.'}
          </p>
        </section>
      ) : null}

      <section className="rounded-lg bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
        <p>
          Earnings and payouts arrive in a later milestone. This screen shows only operational
          state.
        </p>
        <p className="mt-1">
          <Link href="/rider/verification" className="underline underline-offset-4">
            Verification &amp; motorcycle details
          </Link>
        </p>
      </section>

      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

function VerificationGate({ status, notes }: { status: string; notes: string | null }) {
  const copy: Record<string, { title: string; body: string }> = {
    pending: {
      title: 'Verification not started',
      body: 'Submit your details for approval before you can receive delivery offers.',
    },
    under_review: {
      title: 'Verification under review',
      body: 'Our team is reviewing your details. You will be able to go available once approved.',
    },
    rejected: {
      title: 'Verification was not approved',
      body: 'Check your review notes, update your details, and resubmit.',
    },
    withdrawn: {
      title: 'Verification withdrawn',
      body: 'Resubmit your verification to start receiving offers again.',
    },
  };
  const view = copy[status] ?? {
    title: `Verification: ${status}`,
    body: 'You cannot receive offers until verification is approved.',
  };
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">{view.title}</p>
        <p className="mt-1 text-sm text-amber-800">{view.body}</p>
        {notes ? <p className="mt-2 text-xs text-amber-700">Reviewer notes: {notes}</p> : null}
        <Link
          href="/rider/verification"
          className="mt-3 inline-block min-h-11 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          Go to verification
        </Link>
      </section>
      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

function messageForAvailabilityError(code: string | undefined): string {
  switch (code) {
    case 'rider_not_approved':
      return 'Your verification is not approved yet.';
    case 'rider_busy':
      return 'You are still committed to a delivery.';
    case 'rider_ineligible':
      return 'You are not eligible for dispatch right now.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Your session expired. Sign in again.';
    default:
      return 'Could not update availability. Try again.';
  }
}
