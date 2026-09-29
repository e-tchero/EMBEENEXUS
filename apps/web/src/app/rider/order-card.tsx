'use client';

import { useRef, useState } from 'react';

import { isValidOtpCode } from '@/lib/domain/custody';
import type { OrderStatus } from '@/lib/domain/order-state';
import type { RiderNextStep, WaitingViewModel } from '@/lib/domain/rider-flow';

import { messageForOtpError, messageForTransitionError } from './error-copy';

/**
 * Rider active-order card.
 *
 * Every action calls an existing server-authoritative endpoint and the view
 * always re-renders from the response's order status. Transitions allowed
 * here are exactly the rider's from the domain machine: rider_departed,
 * rider_arrived_pickup, rider_arrived_destination, plus OTP verification,
 * evidence upload, return completion, and delivery_failed. The customer owns
 * OTP display and receipt confirmation; the rider types the code the
 * customer shows them.
 */

interface ActiveOrderView {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly returnInitiated: boolean;
  readonly waitingStartedAt: string | null;
  readonly waitingChargeKobo: string;
}

const OTP_INPUT_CLASS =
  'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-center font-mono text-xl tracking-[0.5em] focus:border-neutral-900 focus:outline-none';

export function RiderOrderCard(props: {
  order: ActiveOrderView;
  step: RiderNextStep;
  waiting: WaitingViewModel | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const order = props.order;

  async function transition(trigger: string) {
    setBusy(trigger);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/orders/${order.orderId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trigger }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(messageForTransitionError(body?.error));
        return;
      }
      props.onChanged();
    } catch {
      setError('Network problem — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function verifyOtp(kind: 'pickup' | 'delivery') {
    if (!isValidOtpCode(otp.trim())) {
      setOtpError('Enter the 6-digit code.');
      return;
    }
    setBusy(`otp-${kind}`);
    setError(null);
    setOtpError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/orders/${order.orderId}/otp/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId: order.orderId, kind, code: otp.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setOtp(messageForOtpErrorReset(kind, body?.error));
        setError(null);
        setOtpError(messageForOtpError(body?.error));
        return;
      }
      setOtp('');
      props.onChanged();
    } catch {
      setOtpError('Network problem — try again.');
    } finally {
      setBusy(null);
    }
  }

  function messageForOtpErrorReset(kind: 'pickup' | 'delivery', code: string | undefined): string {
    void kind;
    void code;
    // Keep whatever the rider typed so they can correct a single digit;
    // clearing on failure would slow the retry under time pressure.
    return otp;
  }

  async function uploadEvidence(kind: 'rider_pickup' | 'rider_delivery') {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError('Choose the photo first.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Photo is larger than 10 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Photos must be JPEG, PNG, or WebP.');
      return;
    }
    setBusy(`photo-${kind}`);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('kind', kind);
      form.set('file', file);
      const res = await fetch(`/api/orders/${order.orderId}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(messageForTransitionError(body?.error));
        return;
      }
      if (fileInput.current) fileInput.current.value = '';
      setNotice('Photo uploaded.');
      props.onChanged();
    } catch {
      setError('Upload failed — check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function completeReturn() {
    setBusy('return');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/orders/${order.orderId}/complete-return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(messageForTransitionError(body?.error));
        return;
      }
      props.onChanged();
    } catch {
      setError('Network problem — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function failDelivery() {
    const confirmed = window.confirm(
      'Mark this delivery as failed? Use only when the delivery cannot be completed.',
    );
    if (!confirmed) return;
    setBusy('delivery_failed');
    setError(null);
    try {
      await transition('delivery_failed');
    } finally {
      setBusy(null);
    }
  }

  const atPickup = order.status === 'arrived_pickup';
  const atDestination = order.status === 'arrived_destination';

  return (
    <section className="space-y-4 rounded-xl border-2 border-neutral-900 p-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Current delivery
        </p>
        <p className="mt-0.5 font-mono text-xs text-neutral-400">{order.orderId}</p>
      </header>

      <div className="space-y-1.5">
        <p className="text-sm"><span className="text-neutral-500">Pickup:</span> {order.pickupAddress}</p>
        <p className="text-sm"><span className="text-neutral-500">Drop-off:</span> {order.dropoffAddress}</p>
      </div>

      {props.waiting ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            props.waiting.withinMaximum ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {props.waiting.label}
        </p>
      ) : null}

      <div className="rounded-lg bg-neutral-100 px-3 py-2.5">
        <p className="text-sm font-semibold">{props.step.label}</p>
        <p className="mt-0.5 text-xs text-neutral-600">{props.step.detail}</p>
      </div>

      {/* Progression actions per authoritative status. */}
      {order.status === 'rider_assigned' ? (
        <ActionButton busy={busy} label="rider_departed" onClick={() => void transition('rider_departed')}>
          I'm on my way to pick up
        </ActionButton>
      ) : null}

      {order.status === 'en_route_pickup' ? (
        <ActionButton busy={busy} label="rider_arrived_pickup" onClick={() => void transition('rider_arrived_pickup')}>
          I've arrived at pickup
        </ActionButton>
      ) : null}

      {atPickup ? (
        <div className="space-y-3">
          <EvidenceUpload
            busy={busy}
            kind="rider_pickup"
            inputRef={fileInput}
            onUpload={() => void uploadEvidence('rider_pickup')}
          />
          <OtpEntry
            otp={otp}
            setOtp={setOtp}
            error={otpError}
            busy={busy === 'otp-pickup'}
            hint="Ask the customer for their pickup code"
            onSubmit={() => void verifyOtp('pickup')}
          />
        </div>
      ) : null}

      {order.status === 'picked_up' ? (
        <ActionButton busy={busy} label="rider_departed" onClick={() => void transition('rider_departed')}>
          I'm on my way to the destination
        </ActionButton>
      ) : null}

      {order.status === 'in_transit' ? (
        <ActionButton busy={busy} label="rider_arrived_destination" onClick={() => void transition('rider_arrived_destination')}>
          I've arrived at the destination
        </ActionButton>
      ) : null}

      {atDestination && !order.returnInitiated ? (
        <div className="space-y-3">
          <EvidenceUpload
            busy={busy}
            kind="rider_delivery"
            inputRef={fileInput}
            onUpload={() => void uploadEvidence('rider_delivery')}
          />
          <OtpEntry
            otp={otp}
            setOtp={setOtp}
            error={otpError}
            busy={busy === 'otp-delivery'}
            hint="Ask the recipient for their delivery code"
            onSubmit={() => void verifyOtp('delivery')}
          />
        </div>
      ) : null}

      {atDestination && order.returnInitiated ? (
        <div className="space-y-2">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Waiting time reached the 30-minute maximum. The order is now a return: take the parcel
            back to the pickup customer, then confirm the return below.
          </p>
          <ActionButton busy={busy} label="return" onClick={() => void completeReturn()}>
            Parcel returned — confirm
          </ActionButton>
        </div>
      ) : null}

      {/* Failure entry: rider-permitted from in_transit / arrived_destination. */}
      {(order.status === 'in_transit' || (atDestination && !order.returnInitiated)) ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void failDelivery()}
          className="w-full min-h-11 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          Report delivery failed…
        </button>
      ) : null}

      {notice ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  );
}

function ActionButton(props: {
  busy: string | null;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.busy !== null}
      onClick={props.onClick}
      className="w-full min-h-12 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
    >
      {props.busy === props.label ? 'Working…' : props.children}
    </button>
  );
}

function OtpEntry(props: {
  otp: string;
  setOtp: (value: string) => void;
  error: string | null;
  busy: boolean;
  hint: string;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="rider-otp" className="block text-xs font-medium text-neutral-500">
        {props.hint}
      </label>
      <input
        id="rider-otp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={props.otp}
        onChange={(event) => props.setOtp(event.target.value.replace(/[^0-9]/g, ''))}
        className={OTP_INPUT_CLASS}
        placeholder='· · · · · ·'
      />
      {props.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {props.error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={props.busy || props.otp.length !== 6}
        onClick={props.onSubmit}
        className="w-full min-h-12 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
      >
        {props.busy ? 'Verifying…' : 'Verify code'}
      </button>
    </div>
  );
}

function EvidenceUpload(props: {
  busy: string | null;
  kind: 'rider_pickup' | 'rider_delivery';
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: () => void;
}) {
  const label = props.kind === 'rider_pickup' ? 'Pickup evidence photo' : 'Delivery evidence photo';
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-3">
      <p className="text-xs font-medium text-neutral-500">{label} (required before the code step)</p>
      <input
        ref={props.inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
      />
      <button
        type="button"
        disabled={props.busy !== null}
        onClick={props.onUpload}
        className="w-full min-h-11 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40"
      >
        {props.busy === `photo-${props.kind}` ? 'Uploading…' : 'Upload photo'}
      </button>
    </div>
  );
}
