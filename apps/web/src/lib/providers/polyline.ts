import type { LatLng } from './maps-provider';

/**
 * Google-encoded polyline decoder with Valhalla's default precision (1e-6).
 *
 * Pure and deterministic; exists so the Stadia adapter needs no third-party
 * geometry dependency. Decoding follows the standard algorithm: each value is
 * variable-length chunked (5 bits per chunk, continuation bit 0x20),
 * zigzag-decoded, then delta-accumulated.
 *
 * Throws Error on malformed input (truncated sequence or out-of-range
 * coordinates) — callers validate provider responses and translate failures
 * into MapsProviderError('invalid_response').
 */

const PRECISION = 1e6;

export function decodePolyline6(encoded: string): Array<LatLng> {
  const points: Array<LatLng> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const length = encoded.length;

  /** Decodes one zigzag-encoded value from the stream. */
  function readValue(): number {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      if (index >= length) {
        throw new Error('Malformed polyline: truncated value sequence.');
      }
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (index < length) {
    lat += readValue();
    lng += readValue();

    const pointLat = lat / PRECISION;
    const pointLng = lng / PRECISION;
    if (pointLat < -90 || pointLat > 90 || pointLng < -180 || pointLng > 180) {
      throw new Error('Malformed polyline: coordinate out of range.');
    }
    points.push({ lat: pointLat, lng: pointLng });
  }

  return points;
}
