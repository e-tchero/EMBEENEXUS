import { NextResponse } from 'next/server';

import { processFlutterwaveWebhook } from '@/lib/services/payment-webhook';

/**
 * POST /api/webhooks/flutterwave — Flutterwave webhook receiver (M4).
 *
 * Authenticity: `verif-hash` header compared constant-time against the
 * configured webhook secret hash. The raw body is parsed minimally; the
 * payload is stored verbatim for audit, and NO value is granted from the
 * payload alone — the transaction is re-verified server-side first.
 *
 * Returns 200 quickly on success/duplicate; 401 on bad signature;
 * 500 signals Flutterwave to retry (safe: processing is idempotent).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const receivedHash =
    request.headers.get('verif-hash') ?? request.headers.get('verif_hash') ?? null;

  const result = await processFlutterwaveWebhook(body, receivedHash);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.httpStatus === 401 ? 'unauthorized' : 'processing_failed' },
      { status: result.httpStatus },
    );
  }
  return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false }, { status: 200 });
}
