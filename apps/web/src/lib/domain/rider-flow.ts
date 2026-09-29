import type { OrderStatus } from '@/lib/domain/order-state';

/**
 * Pure rider execution-flow helpers (pilot rider UI).
 *
 * The database RPCs remain the sole authority for what may actually happen;
 * these helpers exist so the rider UI renders the next operational step from
 * the same vocabulary the backend owns, and so the mapping is unit-testable.
 * Nothing here performs or simulates a transition.
 */

/**
 * Statuses in which the rider is committed to the order (mirrors
 * RIDER_COMMITTED_ORDER_STATUSES in lib/domain/dispatch, plus the
 * waiting-window state arrived_destination).
 */
export const RIDER_ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'rider_assigned',
  'en_route_pickup',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
];

/**
 * The next operational step the rider must take, derived ONLY from the
 * authoritative server status. The customer owns OTP display and recipient
 * confirmation; the rider never sees or enters the customer's code except
 * by typing what the customer shows them at the gate.
 */
export type RiderNextStep =
  | { action: 'head_to_pickup'; label: string; detail: string }
  | { action: 'arrive_pickup'; label: string; detail: string }
  | { action: 'collect_parcels'; label: string; detail: string }
  | { action: 'verify_pickup_otp'; label: string; detail: string }
  | { action: 'head_to_destination'; label: string; detail: string }
  | { action: 'arrive_destination'; label: string; detail: string }
  | { action: 'await_recipient'; label: string; detail: string }
  | { action: 'verify_delivery_otp'; label: string; detail: string }
  | { action: 'await_recipient_confirmation'; label: string; detail: string }
  | { action: 'handle_return'; label: string; detail: string };

export function nextRiderStep(status: OrderStatus, returnInitiated: boolean): RiderNextStep {
  if (returnInitiated) {
    return {
      action: 'handle_return',
      label: 'Return the parcel',
      detail: 'Waiting time reached the 30-minute maximum. Take the parcel back to the pickup customer and confirm the return.',
    };
  }
  switch (status) {
    case 'rider_assigned':
      return {
        action: 'head_to_pickup',
        label: 'Head to pickup',
        detail: 'Travel to the pickup location. Mark en route when you set off.',
      };
    case 'en_route_pickup':
      return {
        action: 'arrive_pickup',
        label: 'Arriving at pickup',
        detail: 'When you reach the pickup location, mark that you have arrived.',
      };
    case 'arrived_pickup':
      return {
        action: 'verify_pickup_otp',
        label: 'Collect the parcel',
        detail: 'Photograph your pickup evidence, take the parcel, then ask the customer for their pickup code and enter it.',
      };
    case 'picked_up':
      return {
        action: 'head_to_destination',
        label: 'Head to the destination',
        detail: 'Travel to the destination. Mark en route when you set off.',
      };
    case 'in_transit':
      return {
        action: 'arrive_destination',
        label: 'Arriving at destination',
        detail: 'When you reach the destination, mark that you have arrived.',
      };
    case 'arrived_destination':
      return {
        action: 'await_recipient',
        label: 'Hand over the parcel',
        detail: 'Ask the recipient for their delivery code, photograph your delivery evidence, then enter the code.',
      };
    case 'delivered':
      return {
        action: 'await_recipient_confirmation',
        label: 'Awaiting receipt confirmation',
        detail: 'The customer confirms receipt after inspecting the parcel.',
      };
    default:
      return {
        action: 'await_recipient_confirmation',
        label: 'Order updating',
        detail: 'Wait for the order status to update.',
      };
  }
}

/** Is the rider committed to this order (active execution window)? */
export function isRiderCommitted(status: OrderStatus): boolean {
  return RIDER_ACTIVE_ORDER_STATUSES.includes(status);
}

/** Waiting-clock display model (mirrors the D05 convention). */
export const WAITING_FREE_MINUTES = 10;
export const WAITING_MAX_MINUTES = 30;

export interface WaitingViewModel {
  readonly label: string;
  readonly freeWindow: boolean;
  readonly withinMaximum: boolean;
}

/**
 * Builds the waiting display from the server clock start. All charging
 * remains database-authoritative (waiting_charge_kobo); this is presentational.
 */
export function waitingViewModel(
  waitingStartedAt: string | null,
  now: Date,
): WaitingViewModel | null {
  if (!waitingStartedAt) return null;
  const started = Date.parse(waitingStartedAt);
  if (Number.isNaN(started)) return null;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - started) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (elapsedSeconds >= WAITING_MAX_MINUTES * 60) {
    return {
      label: `Waiting maximum reached (${clock})`,
      freeWindow: false,
      withinMaximum: false,
    };
  }
  if (elapsedSeconds >= WAITING_FREE_MINUTES * 60) {
    const billable = Math.ceil((elapsedSeconds - WAITING_FREE_MINUTES * 60) / 60);
    return {
      label: `Waiting ${clock} — ₦700 per extra minute (₦${(billable * 700).toLocaleString('en-NG')} so far)`,
      freeWindow: false,
      withinMaximum: true,
    };
  }
  return {
    label: `Waiting ${clock} — first 10 minutes free`,
    freeWindow: true,
    withinMaximum: true,
  };
}
