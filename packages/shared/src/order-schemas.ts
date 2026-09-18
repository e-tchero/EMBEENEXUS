import { z } from 'zod';

/**
 * Quote/order input schemas shared by client forms and server actions (M3).
 * Client validation is UX only; the server re-validates and the database
 * (constraints + SECURITY DEFINER RPCs) remains the final authority.
 *
 * NOTE: no price fields exist here on purpose — clients never supply money
 * amounts; the server re-prices from the active configuration.
 */

const latSchema = z.coerce
  .number({ message: 'Latitude is required' })
  .min(-90, 'Latitude out of range')
  .max(90, 'Latitude out of range');

const lngSchema = z.coerce
  .number({ message: 'Longitude is required' })
  .min(-180, 'Longitude out of range')
  .max(180, 'Longitude out of range');

const addressSchema = z
  .string()
  .trim()
  .min(1, 'Address is required')
  .max(300, 'Address is too long');

export const createQuoteSchema = z.object({
  pickupLat: latSchema,
  pickupLng: lngSchema,
  pickupAddress: addressSchema,
  dropoffLat: latSchema,
  dropoffLng: lngSchema,
  dropoffAddress: addressSchema,
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const createOrderSchema = z.object({
  quoteId: z.string().uuid('Invalid quote reference'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderTransitionSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  // Client-sendable triggers only. System transitions (payment_verified,
  // dispatch_started, rider_accepted_offer) and OTP/recipient confirmations
  // arrive with M4/M6 fact sources and are never client inputs.
  trigger: z.enum([
    'order_submitted',
    'rider_departed',
    'rider_arrived_pickup',
    'rider_arrived_destination',
    'delivery_failed',
    'cancel',
    'hold_for_review',
    'release_from_review',
  ]),
  notes: z.string().trim().max(500).optional(),
});

export type OrderTransitionInput = z.infer<typeof orderTransitionSchema>;
