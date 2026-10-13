/**
 * TrackingToken — the high-entropy public identifier for order tracking.
 *
 * 03_DOMAIN_MODEL.md §2.2 requires `PublicTrackingToken` to be a high-entropy
 * string. This implementation is a fixed 32-character Crockford Base32 value
 * encoding 160 bits (20 bytes) of randomness from `node:crypto`.
 *
 * Crockford Base32 excludes I, L, O and U so a token can be read aloud or
 * retyped from a screenshot without transcription ambiguity.
 *
 * `node:crypto` is the Node standard library — no external dependency is used.
 */

import { randomBytes } from 'node:crypto';

export const TRACKING_TOKEN_LENGTH = 32;
export const TRACKING_TOKEN_ENTROPY_BYTES = 20;
export const TRACKING_TOKEN_ENTROPY_BITS = TRACKING_TOKEN_ENTROPY_BYTES * 8;

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TRACKING_TOKEN_PATTERN = /^[0-9A-HJKMNP-TV-Z]{32}$/;

/** Injectable randomness so token generation can be tested deterministically. */
export type RandomByteSource = (size: number) => Uint8Array;

function defaultRandomByteSource(size: number): Uint8Array {
  return new Uint8Array(randomBytes(size));
}

/** Encode bytes as Crockford Base32, most-significant bit first, no padding. */
export function encodeCrockfordBase32(bytes: Uint8Array): string {
  let accumulator = 0;
  let bitCount = 0;
  let output = '';

  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bitCount += 8;

    while (bitCount >= 5) {
      bitCount -= 5;
      output += CROCKFORD_ALPHABET[(accumulator >>> bitCount) & 0b11111];
    }
  }

  if (bitCount > 0) {
    output += CROCKFORD_ALPHABET[(accumulator << (5 - bitCount)) & 0b11111];
  }

  return output;
}

export class TrackingToken {
  private constructor(private readonly value: string) {}

  static generate(random: RandomByteSource = defaultRandomByteSource): TrackingToken {
    const bytes = random(TRACKING_TOKEN_ENTROPY_BYTES);
    if (!(bytes instanceof Uint8Array) || bytes.length !== TRACKING_TOKEN_ENTROPY_BYTES) {
      throw new TypeError(
        `TrackingToken requires exactly ${TRACKING_TOKEN_ENTROPY_BYTES} random bytes, received ${bytes?.length ?? 'nothing'}.`,
      );
    }
    return new TrackingToken(encodeCrockfordBase32(bytes));
  }

  static parse(value: string): TrackingToken {
    if (!TrackingToken.isValid(value)) {
      throw new RangeError(
        `Not a valid tracking token: expected ${TRACKING_TOKEN_LENGTH} Crockford Base32 characters.`,
      );
    }
    return new TrackingToken(value);
  }

  static isValid(value: unknown): value is string {
    return typeof value === 'string' && TRACKING_TOKEN_PATTERN.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TrackingToken): boolean {
    return this.value === other.value;
  }
}
