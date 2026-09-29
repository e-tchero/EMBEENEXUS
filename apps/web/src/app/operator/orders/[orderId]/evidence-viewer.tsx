'use client';

import { useState } from 'react';

/**
 * Evidence viewer. Each view request mints a SHORT-LIVED signed URL through
 * the authorized evidence route (participants/operators only; RLS-checked).
 * The bucket never becomes public and no permanent URL is produced or stored
 * by the console — the link opens provider-hosted, provider-expiring content.
 */
export function EvidenceViewer({
  orderId,
  kinds,
}: {
  orderId: string;
  kinds: readonly string[];
}) {
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function view(photoKind: string) {
    setLoading(true);
    setError(null);
    setUrl(null);
    setOpenKind(photoKind);
    try {
      const response = await fetch(`/api/orders/${orderId}/evidence/${photoKind}`);
      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; photo?: { signedUrl: string }; error?: string }
        | null;
      if (response.ok && json?.photo?.signedUrl) {
        setUrl(json.photo.signedUrl);
      } else {
        setError(json?.error ?? 'not_found');
      }
    } catch {
      setError('unknown_error');
    } finally {
      setLoading(false);
    }
  }

  if (kinds.length === 0) {
    return <p className="text-xs text-neutral-500">No evidence recorded for this order.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {kinds.map((photoKind) => (
          <button
            key={photoKind}
            type="button"
            disabled={loading}
            onClick={() => view(photoKind)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:border-neutral-500 disabled:opacity-50"
          >
            View {photoKind}
          </button>
        ))}
      </div>
      {loading ? <p className="text-xs text-neutral-500">Minting authorized link…</p> : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Evidence unavailable: {error}
        </p>
      ) : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Open {openKind} photo (short-lived link)
        </a>
      ) : null}
    </div>
  );
}
