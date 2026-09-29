'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Controlled operator interventions. Every action goes through the
 * server-authoritative API (the RPC re-validates actor + state); destructive
 * actions require typed confirmation and can never fire on a single tap.
 */
export function OperatorActionButtons({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'cancel' | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const cancellable = !['completed', 'cancelled', 'failed', 'under_review'].includes(status);

  async function call(path: string, body?: unknown): Promise<{ ok: boolean; error?: string; outcome?: string }> {
    const response = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; outcome?: string }
      | null;
    return { ok: response.ok && (json?.ok ?? false), error: json?.error, outcome: json?.outcome };
  }

  async function run() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await call(`/api/orders/${orderId}/dispatch`);
    setBusy(false);
    if (result.ok) {
      setNotice(result.outcome ? `Dispatch outcome: ${result.outcome}` : 'Dispatch triggered');
      startTransition(() => router.refresh());
    } else {
      setError(result.error ?? 'unknown_error');
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await call(`/api/orders/${orderId}/transition`, { trigger: 'cancel', notes: 'Operator cancel from console' });
    setBusy(false);
    setConfirming(null);
    setConfirmText('');
    if (result.ok) {
      setNotice('Order cancelled');
      startTransition(() => router.refresh());
    } else {
      setError(result.error ?? 'unknown_error');
    }
  }

  const inputDisabled = busy || pending;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Operator actions</h2>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={inputDisabled}
          onClick={() => run()}
          className="rounded-lg bg-(--action-ink) px-3 py-1.5 text-xs font-medium text-white hover:bg-(--action-ink-hover) disabled:opacity-50"
        >
          Trigger / recover dispatch
        </button>
        {cancellable ? (
          <button
            type="button"
            disabled={inputDisabled}
            onClick={() => setConfirming('cancel')}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Cancel order…
          </button>
        ) : null}
      </div>

      {confirming === 'cancel' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">
            Cancel this order? This cannot be undone.
          </p>
          <p className="mt-1 text-xs text-red-700">
            Type <span className="font-mono font-semibold">CANCEL</span> to confirm.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="w-32 rounded border border-red-300 px-2 py-1 font-mono text-sm"
              aria-label="Type CANCEL to confirm"
            />
            <button
              type="button"
              disabled={confirmText !== 'CANCEL' || inputDisabled}
              onClick={cancel}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              Confirm cancel
            </button>
            <button
              type="button"
              disabled={inputDisabled}
              onClick={() => {
                setConfirming(null);
                setConfirmText('');
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700"
            >
              Keep order
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
