/**
 * Money — non-negative monetary amounts stored as integer minor units.
 *
 * Canonical rule (03_DOMAIN_MODEL.md §1): every monetary field is a
 * non-negative integer in minor currency units (Kobo for NGN), never a float,
 * so arithmetic can never invent or lose a kobo.
 *
 * The representation is a 64-bit-range `bigint` rather than a `number`, so no
 * amount can silently exceed `Number.MAX_SAFE_INTEGER`.
 *
 * This module contains no framework, database, or vendor imports.
 */

/** Minor units in one major unit of the default currency (100 Kobo = ₦1). */
export const KOBO_PER_NAIRA = 100n;

/**
 * The only revenue split approved by the founder: 70% rider, 30% Embee Nexus
 * (02 Item 19, 05 §3.1). This allocation is internal and must never be shown
 * to customers or riders (05 §3.1 confidentiality invariant).
 */
export const RIDER_SHARE_PERCENT = 70n;
export const PLATFORM_SHARE_PERCENT = 30n;

export type CurrencyCode = string;

export interface FeeSplit {
  readonly gross: Money;
  readonly rider: Money;
  readonly platform: Money;
}

export class Money {
  private constructor(
    private readonly amount: bigint,
    readonly currency: CurrencyCode,
  ) {}

  /** Amount in minor units (Kobo for NGN). Always a non-negative bigint. */
  get minorUnits(): bigint {
    return this.amount;
  }

  static fromMinorUnits(minorUnits: bigint, currency: CurrencyCode = 'NGN'): Money {
    if (typeof minorUnits !== 'bigint') {
      throw new TypeError(
        `Money must be constructed from a bigint of minor units, received ${typeof minorUnits}.`,
      );
    }
    if (minorUnits < 0n) {
      throw new RangeError(`Money must be non-negative, received ${minorUnits.toString()}.`);
    }
    if (typeof currency !== 'string' || currency.length === 0) {
      throw new TypeError('Money requires a non-empty currency code.');
    }
    return new Money(minorUnits, currency);
  }

  static zero(currency: CurrencyCode = 'NGN'): Money {
    return Money.fromMinorUnits(0n, currency);
  }

  isZero(): boolean {
    return this.amount === 0n;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract `other` from this amount. Money is non-negative by definition, so
   * a result below zero is rejected rather than clamped.
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (other.amount > this.amount) {
      throw new RangeError(
        `Subtraction would produce a negative amount: ${this.amount.toString()} - ${other.amount.toString()}.`,
      );
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Split the gross fee 70/30 (05 §3.1).
   *
   * Integer-only: the rider takes the truncated 70% and the platform absorbs
   * the remainder, so `rider + platform === gross` exactly for every gross,
   * including amounts that do not divide evenly by 100.
   */
  splitFee(): FeeSplit {
    const riderMinorUnits = (this.amount * RIDER_SHARE_PERCENT) / KOBO_PER_NAIRA;
    return {
      gross: this,
      rider: new Money(riderMinorUnits, this.currency),
      platform: new Money(this.amount - riderMinorUnits, this.currency),
    };
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  /** Serialisable projection — `bigint` is not JSON-serialisable on its own. */
  toJSON(): { minorUnits: string; currency: CurrencyCode } {
    return { minorUnits: this.amount.toString(), currency: this.currency };
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency} (minor units)`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Cannot combine amounts in different currencies: ${this.currency} and ${other.currency}.`,
      );
    }
  }
}

/**
 * Invariant guard for a split, usable at an aggregate boundary or in tests:
 * both shares are non-negative and re-sum to the gross exactly.
 */
export function isFeeSplitInvariantHeld(split: FeeSplit): boolean {
  return (
    split.rider.minorUnits >= 0n &&
    split.platform.minorUnits >= 0n &&
    split.rider.minorUnits + split.platform.minorUnits === split.gross.minorUnits &&
    split.rider.currency === split.gross.currency &&
    split.platform.currency === split.gross.currency
  );
}
