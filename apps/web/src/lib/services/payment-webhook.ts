import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/db/client-admin';
import { logger } from '@/lib/logging/logger';
import { classifyWebhookEvent } from '@/lib/domain/payment';
import { getServerEnv } from '@/lib/env/server';

import { verifyAndGrantPayment, type PaymentRecordRow } from './payment-service';

/**
 * Flutterwave webhook processing (M4).
 *
 * Flow: signature check (constant-time) → idempotent event insert
 * (unique index on provider_event_id) → verify the transaction with the
 * provider (never trusting the payload) → grant value exactly once →
 * mark the event processed.
 *
 * Every step is safe to re-run: duplicate deliveries are a database-level
 * no-op and the completion RPC is idempotent.
 */

export interface WebhookPayload {
  readonly event: string;
  readonly data: {
    readonly id?: number | string;
    readonly tx_ref?: string;
    readonly status?: string;
    readonly amount?: number;
    readonly currency?: string;
  } | null;
}

/** Constant-time secret-hash comparison (`verif-hash` header). */
export function isWebhookSignatureValid(receivedHash: string | null): boolean {
  const expected = getServerEnv().FLUTTERWAVE_WEBHOOK_HASH;
  if (!receivedHash || !expected) {
    return false;
  }
  const a = Buffer.from(receivedHash, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Length mismatch: still consume comparable work, then fail.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function parsePayload(raw: unknown): WebhookPayload | null {
  return parsePayloadForTest(raw);
}

/** Test-visible alias of the internal parser (same behavior, one source). */
export function parsePayloadForTest(raw: unknown): WebhookPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = (raw as { event?: unknown }).event;
  const data = (raw as { data?: unknown }).data;
  if (typeof event !== 'string' || event.length === 0 || event.length > 100) return null;
  if (typeof data !== 'object' || data === null) return { event, data: null };
  const d = data as Record<string, unknown>;
  return {
    event,
    data: {
      id: typeof d.id === 'number' || typeof d.id === 'string' ? d.id : undefined,
      tx_ref: typeof d.tx_ref === 'string' ? d.tx_ref.slice(0, 100) : undefined,
      status: typeof d.status === 'string' ? d.status.slice(0, 50) : undefined,
      amount: typeof d.amount === 'number' ? d.amount : undefined,
      currency: typeof d.currency === 'string' ? d.currency.slice(0, 10) : undefined,
    },
  };
}

export interface WebhookProcessResult {
  readonly ok: boolean;
  readonly httpStatus: number;
  readonly duplicate?: boolean;
}

/**
 * Processes one verified webhook delivery end-to-end.
 * Only charge events can grant value, and value is granted only after the
 * provider transaction is re-verified server-side.
 */
export async function processFlutterwaveWebhook(
  rawBody: unknown,
  receivedHash: string | null,
): Promise<WebhookProcessResult> {
  // 1. Authenticity: verif-hash, constant-time. No IP allowlisting reliance.
  if (!isWebhookSignatureValid(receivedHash)) {
    logger.warn('payments.webhook.auth_failed');
    return { ok: false, httpStatus: 401 };
  }

  // 2. Parse minimally (payload stored verbatim for audit; only these
  //    fields are acted on).
  const payload = parsePayload(rawBody);
  if (!payload) {
    return { ok: false, httpStatus: 400 };
  }

  const providerEventId = payload.data?.id !== undefined ? String(payload.data.id) : null;
  if (!providerEventId) {
    logger.warn('payments.webhook.missing_event_id', { event: payload.event });
    return { ok: false, httpStatus: 400 };
  }

  const admin = createAdminClient();

  // 3. Idempotent record: duplicate deliveries stop here (DB-level).
  const { data: eventRecord, error: recordError } = await admin.rpc('payment_record_webhook', {
    p_event_type: payload.event,
    p_provider_event_id: providerEventId,
    p_reference: payload.data?.tx_ref ?? null,
    p_payload: (rawBody ?? {}) as object,
  });
  if (recordError) {
    logger.error('payments.webhook.record_failed', {
      code: (recordError as { code?: string }).code,
    });
    return { ok: false, httpStatus: 500 };
  }
  const event = (Array.isArray(eventRecord) ? eventRecord[0] : eventRecord) as
    | { event_id: string; duplicate: boolean }
    | null;
  if (!event) {
    return { ok: false, httpStatus: 500 };
  }
  if (event.duplicate) {
    logger.info('payments.webhook.duplicate', { eventId: event.event_id });
    return { ok: true, httpStatus: 200, duplicate: true };
  }

  // 4. Classify: only charge.completed carries potential value; charge.failed
  //    records an outcome; everything else is audit-only.
  const kind = classifyWebhookEvent(payload.event);

  try {
    if (kind === 'charge_failed' && payload.data?.tx_ref) {
      await failPaymentByReference(admin, payload.data.tx_ref, providerEventId, 'provider_reported_failure');
      await markProcessed(admin, event.event_id, true);
      return { ok: true, httpStatus: 200 };
    }

    if (kind !== 'charge_completed' || !payload.data?.tx_ref) {
      // Audit-only event (transfers, refunds, subscriptions, unknowns).
      await markProcessed(admin, event.event_id, true);
      return { ok: true, httpStatus: 200 };
    }

    // 5. Resolve the payment by reference (server-stored before checkout).
    const { data: paymentRow, error: lookupError } = await admin.rpc('payment_get_by_reference', {
      p_transaction_reference: payload.data.tx_ref,
    });
    if (lookupError) {
      throw new Error(`lookup failed: ${(lookupError as { code?: string }).code}`);
    }
    const payment = paymentRow as (PaymentRecordRow & { id: string }) | null;
    if (!payment || !payment.id) {
      // Unknown reference: never grant value; keep the event for audit.
      logger.warn('payments.webhook.unknown_reference', { eventId: event.event_id });
      await markProcessed(admin, event.event_id, false, 'unknown transaction reference');
      return { ok: true, httpStatus: 200 };
    }

    // 6. Re-verify with the provider (webhook payload alone is never trusted)
    //    and grant value exactly once.
    const result = await verifyAndGrantPayment(payment);

    // If the provider still reports pending/unknown, record that outcome.
    if (!result.ok && result.error === 'verification_failed') {
      // verifyAndGrantPayment already recorded the outcome by reference.
    }

    await markProcessed(admin, event.event_id, true);
    return { ok: true, httpStatus: 200 };
  } catch (error) {
    logger.error('payments.webhook.process_error', {
      eventId: event.event_id,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
    await markProcessed(admin, event.event_id, false, 'processing error');
    // 500 tells Flutterwave to retry the delivery; our idempotency makes
    // retries safe.
    return { ok: false, httpStatus: 500 };
  }
}

async function failPaymentByReference(
  admin: ReturnType<typeof createAdminClient>,
  reference: string,
  providerEventId: string,
  reason: string,
): Promise<void> {
  const { data: paymentRow } = await admin.rpc('payment_get_by_reference', {
    p_transaction_reference: reference,
  });
  const payment = paymentRow as (PaymentRecordRow & { id: string }) | null;
  if (!payment?.id) return;
  // The provider event id is numeric, not one of our uuids, so it is passed
  // through the reason text; the full payload row stays linked via
  // webhook_events for audit.
  await admin.rpc('payment_mark_outcome', {
    p_payment_id: payment.id,
    p_status: 'failed',
    p_provider_transaction_id: null,
    p_reason: `${reason} (provider event ${providerEventId})`,
  });
}

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  await admin.rpc('payment_mark_webhook_processed', {
    p_event_id: eventId,
    p_ok: ok,
    p_error: error ?? null,
  });
}

// ---------------------------------------------------------------------------
// Reconciliation — recovery for "payment succeeded but webhook lost"
// ---------------------------------------------------------------------------

/**
 * Scans active payment attempts older than the grace window and re-verifies
 * each against the provider. Called from the operator-gated job trigger
 * (and later by the M0 background-job worker). Idempotent by construction:
 * verification grants value exactly once via the completion RPC.
 */
export async function reconcilePendingPayments(
  olderThanMinutes = 2,
  limit = 50,
): Promise<{ checked: number; granted: number; errors: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  const { data: rows, error } = await admin
    .from('payments')
    .select(
      'id, order_id, customer_id, transaction_reference, expected_amount_kobo, currency, status, checkout_url',
    )
    .in('status', ['initiated', 'redirected', 'pending'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('payments.reconcile.scan_failed', {
      code: (error as { code?: string }).code,
    });
    return { checked: 0, granted: 0, errors: 1 };
  }

  let granted = 0;
  let errors = 0;
  const payments = (rows ?? []) as Array<PaymentRecordRow & { id: string }>;

  for (const payment of payments) {
    try {
      const result = await verifyAndGrantPayment(payment);
      if (result.ok) {
        granted += 1;
      } else if (result.error === 'not_found' || result.error === 'verification_failed') {
        // Provider knows nothing / mismatch: leave for the next run; the
        // session remains active until it settles or the customer retries.
        errors += 0;
      } else {
        errors += 1;
      }
    } catch {
      errors += 1;
    }
  }

  if (payments.length > 0) {
    logger.info('payments.reconcile.run', {
      checked: payments.length,
      granted,
      errors,
    });
  }
  return { checked: payments.length, granted, errors };
}
