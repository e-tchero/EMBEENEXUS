import { describe, expect, it } from 'vitest';

import { decodePolyline6 } from './polyline';

/**
 * Reference encoder implementing the standard Google/Valhalla polyline
 * algorithm (precision 1e-6) — used to generate vectors for the decoder.
 * The single fixed vector at the top is the published canonical example.
 */

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

function encodePolyline6(points: Array<{ lat: number; lng: number }>): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  for (const p of points) {
    const lat = Math.round(p.lat * 1e6);
    const lng = Math.round(p.lng * 1e6);
    out += encodeValue(lat - prevLat);
    out += encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

describe('polyline6 decoding', () => {
  it('round-trips points through the reference encoder (single chunk deltas)', () => {
    const original = [
      { lat: 9.0765, lng: 7.4788 },
      { lat: 9.0123, lng: 7.4321 },
    ];
    const decoded = decodePolyline6(encodePolyline6(original));
    expect(decoded).toEqual(original);
  });

  it('round-trips deltas large enough to require multi-chunk encoding', () => {
    const original = [
      { lat: 9.0, lng: 7.4 },
      { lat: 38.5, lng: -120.2 }, // huge delta — exercises multi-chunk paths
      { lat: -33.86, lng: 151.21 },
    ];
    const decoded = decodePolyline6(encodePolyline6(original));
    expect(decoded).toEqual(original);
  });

  it('round-trips the first point from an origin of (0,0)', () => {
    const decoded = decodePolyline6(encodePolyline6([{ lat: -89.9, lng: 179.9 }]));
    expect(decoded).toEqual([{ lat: -89.9, lng: 179.9 }]);
  });

  it('returns an empty array for empty input', () => {
    expect(decodePolyline6('')).toEqual([]);
  });

  it('throws on truncated input', () => {
    expect(() => decodePolyline6('_p~iF')).toThrow(/truncated/i);
  });

  it('throws on a lone continuation marker (truncated value)', () => {
    expect(() => decodePolyline6('?')).toThrow(/truncated/i);
  });

  it('throws on out-of-range coordinates', () => {
    // 90.000001° exceeds the valid latitude range.
    expect(() => decodePolyline6(encodePolyline6([{ lat: 90.000001, lng: 0 }]))).toThrow(
      /range/i,
    );
  });
});
