'use client';

import { useEffect, useState } from 'react';

/**
 * Payment callback client (M4).
 *
 * Reads the Flutterwave `tx_ref` from the redirect query string, then polls
 * the server status endpoint until the payment settles or the attempt times
 * out. Every renderable fact (status text, next step) comes from the server
 * response — the redirect parameters and this component are never trusted
 * as proof of payment.
 */

type Phase = 'resolving' | 'successful' | 'failed' | 'pending' | 'stalled';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 40; // ~2 minutes before advising refresh/return.

function phaseFromStatus(status: string): Exclude<Phase, 'resolving' | 'stalled'> {
  switch (status) {
    case 'successful':
      return 'successful';
    case 'failed':
    case 'cancelled':
    case 'verification_failed':
      return 'failed';
    default:
      // initiated / redirected / pending — keep waiting.
      return 'pending';
  }
}

const COPY: Record<Exclude<Phase, 'resolving' | 'stalled'>, { title: string; body: string }> = {
  successful: {
    title: 'Payment confirmed',
    body: 'Your delivery is confirmed. We are finding you a rider.',
  },
  failed: {
    title: 'Payment not completed',
    body: 'You were not charged for this delivery. You can retry payment from your order.',
  },
  pending: {
    title: 'Confirming your payment…',
    body: 'This usually takes a few seconds. Keep this page open.',
  },
};

export function PaymentCallbackClient() {
  const [phase, setPhase] = useState<Phase>('resolving');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get('tx_ref');
    if (!txRef || !txRef.startsWith('ENX-')) {
      // No recognizable reference: nothing to resolve server-side.
      setPhase('stalled');
      return;
    }

    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      polls += 1;
      try {
        // The server resolves the payment by ownership + reference; the
        // reference itself is only used to locate the polling session.
        const res = await fetch('/api/payments/status/poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ transactionReference: txRef }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { ok: boolean; payment?: { status: string } };
        if (json.ok && json.payment) {
          const next = phaseFromStatus(json.payment.status);
          setPhase(next);
          if (next === 'pending' && polls < MAX_POLLS) {
            timer = setTimeout(tick, POLL_INTERVAL_MS);
          }
          return;
        }
        if (polls < MAX_POLLS) timer = setTimeout(tick, POLL_INTERVAL_MS);
        else setPhase('stalled');
      } catch {
        // Network blips are normal on mobile networks: retry with backoff-ish.
        if (polls < MAX_POLLS) timer = setTimeout(tick, POLL_INTERVAL_MS);
        else setPhase('stalled');
      }
    };

    void tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (phase === 'resolving') {
    return (
      <>
        <p className="text-sm text-neutral-500">Checking payment…</p>
        <div className="h-1 w-full overflow-hidden rounded bg-neutral-200">
          <div className="h-full w-1/3 animate-pulse rounded bg-neutral-400" />
        </div>
      </>
    );
  }

  if (phase === 'stalled') {
    return (
      <>
        <h1 className="text-xl font-semibold">Still checking…</h1>
        <p className="text-sm text-neutral-500">
          We could not confirm your payment just yet. If you were debited, your order will update
          automatically — check again shortly.
        </p>
      </>
    );
  }

  const copy = COPY[phase];
  return (
    <>
      <h1 className="text-xl font-semibold">{copy.title}</h1>
      <p className="text-sm text-neutral-500">{copy.body}</p>
    </>
  );
}
