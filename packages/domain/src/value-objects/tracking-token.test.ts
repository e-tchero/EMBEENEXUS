import { describe, expect, it } from 'vitest';

import {
  TrackingToken,
  TRACKING_TOKEN_ENTROPY_BITS,
  TRACKING_TOKEN_LENGTH,
} from './tracking-token.js';

const CROCKFORD_PATTERN = /^[0-9A-HJKMNP-TV-Z]{32}$/;

describe('TrackingToken — generation', () => {
  it('generates a 32-character token', () => {
    expect(TrackingToken.generate().toString()).toHaveLength(TRACKING_TOKEN_LENGTH);
  });

  it('uses only unambiguous Crockford Base32 characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(CROCKFORD_PATTERN.test(TrackingToken.generate().toString())).toBe(true);
    }
  });

  it('never emits the ambiguous characters I, L, O or U', () => {
    const sample = Array.from({ length: 500 }, () => TrackingToken.generate().toString()).join('');
    expect(sample).not.toMatch(/[ILOU]/);
  });

  it('produces distinct tokens across many generations', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      tokens.add(TrackingToken.generate().toString());
    }
    expect(tokens.size).toBe(1000);
  });

  it('encodes 160 bits of entropy (20 bytes)', () => {
    expect(TRACKING_TOKEN_ENTROPY_BITS).toBe(160);
  });

  it('is deterministic given an injected byte source', () => {
    const bytes = new Uint8Array(20).fill(0);
    expect(TrackingToken.generate(() => bytes).toString()).toBe(
      TrackingToken.generate(() => bytes).toString(),
    );
  });

  it('rejects a byte source of the wrong length', () => {
    expect(() => TrackingToken.generate(() => new Uint8Array(19))).toThrow(TypeError);
  });
});

describe('TrackingToken — validation', () => {
  it('round-trips through parse', () => {
    const token = TrackingToken.generate();
    expect(TrackingToken.parse(token.toString()).equals(token)).toBe(true);
  });

  it('accepts a well-formed token', () => {
    expect(TrackingToken.isValid('0123456789ABCDEFGHJKMNPQRSTVWXYZ')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(TrackingToken.isValid('0123456789ABCDEFGHJKMNPQRSTVWXY')).toBe(false);
    expect(TrackingToken.isValid('0123456789ABCDEFGHJKMNPQRSTVWXYZ0')).toBe(false);
  });

  it('rejects lowercase and ambiguous characters', () => {
    expect(TrackingToken.isValid('0123456789abcdefghjkmnpqrstvwxyz')).toBe(false);
    expect(TrackingToken.isValid('0123456789ABCDEFGHJKMNPQRSTVWXYI')).toBe(false);
    expect(TrackingToken.isValid('0123456789ABCDEFGHJKMNPQRSTVWXYO')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(TrackingToken.isValid(undefined)).toBe(false);
    expect(TrackingToken.isValid(12345)).toBe(false);
  });

  it('throws when parsing an invalid token', () => {
    expect(() => TrackingToken.parse('nope')).toThrow(RangeError);
  });
});
