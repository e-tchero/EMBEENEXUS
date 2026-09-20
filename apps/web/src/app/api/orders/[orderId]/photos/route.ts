import { NextResponse } from 'next/server';

import {
  getOrderPhotoUrl,
  uploadOrderPhoto,
  type CustodyServiceError,
} from '@/lib/services/custody-service';

/**
 * /api/orders/[orderId]/photos — three-photo evidence chain (M6).
 *
 * POST (multipart/form-data: kind, file) — server-mediated upload into the
 * PRIVATE order-evidence bucket: session + ownership/state validation first,
 * order/kind-scoped object path, metadata registered under the caller's
 * authority. Clients never touch Storage directly (no client Storage
 * policies exist).
 *
 * GET (?kind=…) — short-lived signed URL for participants/operators, minted
 * by the service role only AFTER an RLS-bound authorization read. No public
 * bucket access ever exists.
 */

const STATUS: Record<CustodyServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_order_state: 409,
  otp_not_issued: 409,
  otp_invalid: 400,
  otp_expired: 410,
  otp_locked: 423,
  otp_already_used: 409,
  otp_issue_limit: 429,
  evidence_missing: 409,
  photo_exists: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  storage_error: 500,
  unknown_error: 500,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const { orderId } = await params;
  const kind = form.get('kind');
  const file = form.get('file');

  if (typeof kind !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadOrderPhoto(orderId, kind, {
    bytes,
    contentType: file.type,
    size: file.size,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, photo: result.photo }, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await params;
  const kind = new URL(request.url).searchParams.get('kind');

  if (!kind) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await getOrderPhotoUrl(orderId, kind);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json({ ok: true, photo: result.photo });
}
