import type { OrderStatus } from '@/lib/domain/order-state';

/**
 * Customer-facing copy for the authoritative order statuses.
 *
 * Labels and next-step text only — the status itself always comes from the
 * server (GET /api/orders/[orderId]); nothing here determines state. The
 * vocabulary is exactly the domain state machine's (lib/domain/order-state).
 */

export interface OrderStatusCopy {
  readonly label: string;
  readonly body: string;
  /** What the customer should expect to happen next. */
  readonly next: string;
}

export const ORDER_STATUS_COPY: Record<OrderStatus, OrderStatusCopy> = {
  draft: {
    label: 'Draft',
    body: 'This order has not been submitted yet.',
    next: 'Submit the order to continue.',
  },
  awaiting_payment: {
    label: 'Awaiting payment',
    body: 'Your delivery is reserved at the quoted price.',
    next: 'Complete payment to confirm the delivery.',
  },
  payment_verified: {
    label: 'Payment confirmed',
    body: 'Your payment has been verified.',
    next: 'We are preparing to find you a rider.',
  },
  searching_rider: {
    label: 'Finding a rider',
    body: 'We are offering your delivery to approved riders nearby.',
    next: 'This usually resolves within a couple of minutes.',
  },
  rider_assigned: {
    label: 'Rider assigned',
    body: 'A rider has accepted your delivery.',
    next: 'The rider is preparing to head to the pickup location.',
  },
  en_route_pickup: {
    label: 'Rider on the way to pickup',
    body: 'Your rider is heading to the pickup location.',
    next: 'Have the parcel ready for handover.',
  },
  arrived_pickup: {
    label: 'Rider at pickup',
    body: 'Your rider is at the pickup location.',
    next: 'Hand over the parcel and share the pickup code with the rider.',
  },
  picked_up: {
    label: 'Picked up',
    body: 'Your parcel is with the rider.',
    next: 'The rider is setting off towards the destination.',
  },
  in_transit: {
    label: 'In transit',
    body: 'Your parcel is on the way to the destination.',
    next: 'You will see updates as the rider progresses.',
  },
  arrived_destination: {
    label: 'Rider at destination',
    body: 'Your rider has arrived at the destination.',
    next: 'Share the delivery code and inspect the parcel on arrival.',
  },
  delivered: {
    label: 'Delivered',
    body: 'The parcel has been handed over and the delivery code verified.',
    next: 'Confirm receipt after inspecting the parcel.',
  },
  completed: {
    label: 'Completed',
    body: 'This delivery is complete. Thank you for riding with Embee.',
    next: 'Nothing further is needed from you.',
  },
  cancelled: {
    label: 'Cancelled',
    body: 'This delivery was cancelled.',
    next: 'You can place a new delivery at any time.',
  },
  failed: {
    label: 'Delivery failed',
    body: 'The delivery could not be completed.',
    next: 'Our team will follow up on this delivery.',
  },
  under_review: {
    label: 'Under review',
    body: 'This delivery is temporarily held for review by our team.',
    next: 'We will update the order once the review is complete.',
  },
};
