/**
 * Pure dispatch-domain rules (M5).
 *
 * The database RPCs (migration 0007) enforce these rules authoritatively;
 * this module is the typed mirror used by services and routes so domain and
 * SQL stay aligned, and so the canonical constants have a single testable
 * home. All functions are pure and deterministic.
 */

/** Canonical offer TTL (founder rule): 20 seconds. */
export const OFFER_TTL_SECONDS = 20;

/** Canonical offer lifecycle. No other states exist. */
export type DispatchOfferStatus = 'offered' | 'accepted' | 'declined' | 'expired';

/** The single active status; everything else is terminal. */
export const ACTIVE_OFFER_STATUSES: readonly DispatchOfferStatus[] = ['offered'] as const;
export const TERMINAL_OFFER_STATUSES: readonly DispatchOfferStatus[] = [
  'accepted',
  'declined',
  'expired',
] as const;

/** Structural shape of an offer as surfaced to the rider. */
export interface OfferView {
  readonly offerId: string;
  readonly orderId: string;
  readonly status: DispatchOfferStatus;
  readonly offeredAt: Date;
  readonly expiresAt: Date;
  /** Limited delivery information shown BEFORE acceptance (founder rule). */
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly roadDistanceM: number;
  /** Rider earnings from the immutable order snapshot (kobo). */
  readonly riderShareKobo: bigint;
}

/** Structural validity of an offer row's TTL (mirrors the DB CHECK). */
export function isValidOfferTtl(offeredAt: Date, expiresAt: Date): boolean {
  return (
    expiresAt.getTime() - offeredAt.getTime() === OFFER_TTL_SECONDS * 1_000
  );
}

/** An offer is due for expiry strictly past its TTL. */
export function isOfferDueForExpiry(offer: { status: string; expiresAt: Date }, now: Date): boolean {
  return offer.status === 'offered' && offer.expiresAt.getTime() <= now.getTime();
}

/**
 * Whether an offer can currently be accepted — the pure preconditions only.
 * Ownership, rider eligibility, and order state are database-enforced
 * (dispatch_accept RPC); this gate exists for typed service-level checks and
 * tests so the 20-second rule is pinned in the domain.
 */
export function canOfferBeAccepted(
  offer: { status: string; expiresAt: Date },
  now: Date,
): { readonly ok: boolean; readonly reason?: 'not_active' | 'expired' } {
  if (offer.status !== 'offered') {
    return { ok: false, reason: 'not_active' };
  }
  if (offer.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

/**
 * Queue ordering comparator: longest-available first. `available_since` asc —
 * riders who became available earlier are offered first. This is the ONLY
 * authorized ordering; no distance/rating/priority ranking exists.
 */
export function compareQueueOrder(
  a: { availableSince: Date },
  b: { availableSince: Date },
): number {
  return a.availableSince.getTime() - b.availableSince.getTime();
}

/** Statuses of an order that mean a rider is committed to it. */
export const RIDER_COMMITTED_ORDER_STATUSES: readonly string[] = [
  'rider_assigned',
  'en_route_pickup',
  'arrived_pickup',
  'picked_up',
  'in_transit',
  'arrived_destination',
] as const;
