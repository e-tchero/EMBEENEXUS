/**
 * DispatchOffer — a single 20-second offer broadcast to one rider.
 *
 * 04_STATE_MACHINES_AND_WORKFLOWS.md §1 shows DISPATCHING branching to a
 * RIDER_OFFER_ACTIVE state while an offer is live. That branch is modelled
 * HERE, on the offer entity, not on OrderStatus: the parent order remains
 * `DISPATCHING` for the whole offer cascade, and the offer carries its own
 * lifecycle (OFFERED -> ACCEPTED | REJECTED | EXPIRED). `RIDER_OFFER_ACTIVE`
 * is therefore equivalent to `status === OFFERED` and is exposed through
 * `isRiderOfferActive`.
 *
 * The window is 20 seconds (directive §2.3): `expiresAt = offeredAt + 20s`.
 * The window is half-open — [offeredAt, expiresAt) — so an offer is still
 * acceptable at +19.999s and already expired at exactly +20.000s.
 *
 * Offers are immutable: every transition returns a new DispatchOffer.
 *
 * This module contains no framework, database, or vendor imports.
 */

import { randomUUID } from 'node:crypto';

export const OFFER_WINDOW_SECONDS = 20;
export const OFFER_WINDOW_MS = OFFER_WINDOW_SECONDS * 1000;

export const DispatchOfferStatus = {
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type DispatchOfferStatus = (typeof DispatchOfferStatus)[keyof typeof DispatchOfferStatus];

export class OfferStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferStateError';
  }
}

export class OfferExpiredError extends Error {
  constructor(readonly expiresAt: Date) {
    super(`Dispatch offer expired at ${expiresAt.toISOString()}.`);
    this.name = 'OfferExpiredError';
  }
}

export interface DispatchOfferProps {
  readonly offerId: string;
  readonly orderId: string;
  readonly riderId: string;
  readonly offeredAt: Date;
  readonly expiresAt: Date;
  readonly status: DispatchOfferStatus;
}

export class DispatchOffer {
  private constructor(
    readonly offerId: string,
    readonly orderId: string,
    readonly riderId: string,
    readonly offeredAt: Date,
    readonly expiresAt: Date,
    readonly status: DispatchOfferStatus,
  ) {}

  /** Create a fresh offer, stamping `expiresAt` exactly 20 seconds ahead. */
  static create(input: {
    orderId: string;
    riderId: string;
    offeredAt: Date;
    offerId?: string;
  }): DispatchOffer {
    if (!(input.offeredAt instanceof Date) || Number.isNaN(input.offeredAt.getTime())) {
      throw new TypeError('DispatchOffer requires a valid offeredAt Date.');
    }
    return new DispatchOffer(
      input.offerId ?? randomUUID(),
      input.orderId,
      input.riderId,
      input.offeredAt,
      new Date(input.offeredAt.getTime() + OFFER_WINDOW_MS),
      DispatchOfferStatus.OFFERED,
    );
  }

  /** Rebuild an offer from persisted state without re-deriving the window. */
  static rehydrate(props: DispatchOfferProps): DispatchOffer {
    return new DispatchOffer(
      props.offerId,
      props.orderId,
      props.riderId,
      props.offeredAt,
      props.expiresAt,
      props.status,
    );
  }

  /** Always OFFER_WINDOW_MS for a created offer; persisted offers may differ. */
  get windowMillis(): number {
    return this.expiresAt.getTime() - this.offeredAt.getTime();
  }

  /** True once the clock reaches `expiresAt` (half-open window). */
  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /** True while the offer may still be accepted. */
  isOpenAt(now: Date): boolean {
    return this.status === DispatchOfferStatus.OFFERED && !this.isExpiredAt(now);
  }

  /** The 04 §1 RIDER_OFFER_ACTIVE branch, expressed on the offer. */
  isRiderOfferActive(now: Date): boolean {
    return this.isOpenAt(now);
  }

  accept(now: Date): DispatchOffer {
    this.assertOffered('accept');
    if (this.isExpiredAt(now)) {
      throw new OfferExpiredError(this.expiresAt);
    }
    return this.withStatus(DispatchOfferStatus.ACCEPTED);
  }

  reject(now: Date): DispatchOffer {
    this.assertOffered('reject');
    if (this.isExpiredAt(now)) {
      throw new OfferExpiredError(this.expiresAt);
    }
    return this.withStatus(DispatchOfferStatus.REJECTED);
  }

  /** Mark expired; only legal once the window has actually closed. */
  expire(now: Date): DispatchOffer {
    this.assertOffered('expire');
    if (!this.isExpiredAt(now)) {
      throw new OfferStateError(
        `Cannot expire an offer before ${this.expiresAt.toISOString()}; now is ${now.toISOString()}.`,
      );
    }
    return this.withStatus(DispatchOfferStatus.EXPIRED);
  }

  /**
   * Non-throwing projection for schedulers: returns an EXPIRED copy once the
   * window has closed, otherwise this offer unchanged.
   */
  refresh(now: Date): DispatchOffer {
    if (this.status === DispatchOfferStatus.OFFERED && this.isExpiredAt(now)) {
      return this.withStatus(DispatchOfferStatus.EXPIRED);
    }
    return this;
  }

  equals(other: DispatchOffer): boolean {
    return (
      this.offerId === other.offerId &&
      this.status === other.status &&
      this.expiresAt.getTime() === other.expiresAt.getTime()
    );
  }

  private withStatus(status: DispatchOfferStatus): DispatchOffer {
    return new DispatchOffer(
      this.offerId,
      this.orderId,
      this.riderId,
      this.offeredAt,
      this.expiresAt,
      status,
    );
  }

  private assertOffered(action: string): void {
    if (this.status !== DispatchOfferStatus.OFFERED) {
      throw new OfferStateError(
        `Cannot ${action} a dispatch offer in status ${this.status}; only OFFERED offers can change.`,
      );
    }
  }
}
