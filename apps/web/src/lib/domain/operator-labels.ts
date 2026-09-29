/**
 * Operator console presentation labels. Canonical domain vocabulary only —
 * no status or trigger is invented here; unknown backend values fall through
 * to their canonical identity so the console can never rename reality.
 */

import type { OrderStatus } from './order-state';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  payment_verified: 'Payment verified',
  searching_rider: 'Searching rider',
  rider_assigned: 'Rider assigned',
  en_route_pickup: 'En route to pickup',
  arrived_pickup: 'Arrived at pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  arrived_destination: 'Arrived at destination',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  under_review: 'Under review',
};

export const TRIGGER_LABELS: Record<string, string> = {
  order_submitted: 'Order submitted',
  payment_verified: 'Payment verified',
  dispatch_started: 'Dispatch started',
  rider_accepted_offer: 'Rider accepted offer',
  rider_departed: 'Rider departed',
  rider_arrived_pickup: 'Rider arrived at pickup',
  pickup_confirmed: 'Pickup confirmed (OTP)',
  rider_arrived_destination: 'Rider arrived at destination',
  delivery_confirmed: 'Delivery confirmed (OTP)',
  receipt_confirmed: 'Receipt confirmed by recipient',
  delivery_failed: 'Delivery failed',
  return_initiated: 'Return initiated (waiting maximum)',
  return_completed: 'Return completed',
  cancel: 'Cancelled',
  order_created: 'Order created',
};

export function triggerLabel(trigger: string): string {
  return TRIGGER_LABELS[trigger] ?? trigger;
}

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  initiated: 'Initiated',
  redirected: 'Redirected to provider',
  pending: 'Pending at provider',
  successful: 'Verified successful',
  failed: 'Failed',
  cancelled: 'Cancelled',
  verification_failed: 'Verification failed',
};

export const PHOTO_KIND_LABELS: Record<string, string> = {
  customer_parcel: 'Customer parcel',
  rider_pickup: 'Rider pickup',
  rider_delivery: 'Rider delivery',
};

/** Kobo → "₦1,234.56" display string (kobo is 1/100 naira). */
export function formatNairaFromKobo(kobo: string | number): string {
  const value = typeof kobo === 'string' ? Number(kobo) : kobo;
  if (!Number.isFinite(value)) return `₦${kobo}`;
  return `₦${(value / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
