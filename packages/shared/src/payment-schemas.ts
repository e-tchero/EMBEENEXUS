import { z } from 'zod';

/**
 * Payment input/output schemas (M4) shared by route handlers and services.
 * Clients never supply amounts, currency, or payment status — only opaque
 * identifiers. The server derives every money value from the order's
 * immutable financial snapshot.
 */

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

/** Safe checkout payload returned to the client (no provider internals). */
export const checkoutResponseSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  transactionReference: z.string().min(1),
  amountKobo: z.bigint().or(z.string().regex(/^\d+$/)),
  currency: z.enum(['NGN']),
  checkoutUrl: z.string().url(),
  reused: z.boolean(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/** Minimal safe payment-status payload for client polling. */
export const paymentStatusSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum([
    'initiated',
    'redirected',
    'pending',
    'successful',
    'failed',
    'cancelled',
    'verification_failed',
  ]),
  checkoutUrl: z.string().url().nullable(),
});

export type PaymentStatusResponse = z.infer<typeof paymentStatusSchema>;

/**
 * Callback-page polling input (POST /api/payments/status/poll). The client
 * supplies ONLY the opaque server-generated transaction reference it was
 * redirected with — never amounts, statuses, or order ids.
 */
export const paymentPollSchema = z.object({
  transactionReference: z
    .string()
    .regex(/^ENX-[0-9A-HJKMNP-TV-Z]{20}$/, 'Invalid transaction reference'),
});

export type PaymentPollInput = z.infer<typeof paymentPollSchema>;
