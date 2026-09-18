import 'server-only';

/**
 * Provider-neutral maps interface.
 *
 * The platform must not become permanently coupled to Stadia Maps. Concrete
 * adapters (Stadia first) arrive in M2; M0 fixes the contract so domain
 * services depend on this interface, never on a concrete provider SDK.
 *
 * Secrets for concrete providers live in `lib/env/server.ts` only.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AddressResult {
  /** Provider's canonical formatted address. */
  formattedAddress: string;
  lat: number;
  lng: number;
  /** Provider-specific identifiers if available. */
  providerId?: string;
}

export interface RouteResult {
  /** Road distance in kilometres. */
  distanceKm: number;
  /** Expected duration in minutes under normal traffic. */
  durationMinutes: number;
  /** Encoded polyline or raw coordinate list for display. */
  geometry: Array<LatLng>;
}

export interface MapsProvider {
  /** Forward geocoding: free text → coordinates. */
  geocode(address: string): Promise<AddressResult>;
  /** Reverse geocoding: coordinates → address. */
  reverseGeocode(lat: number, lng: number): Promise<AddressResult>;
  /** Address autocomplete/search near an optional bias location. */
  searchAddresses(query: string, bias?: LatLng): Promise<AddressResult[]>;
  /** Road route with distance/duration/geometry. */
  getRoute(origin: LatLng, destination: LatLng): Promise<RouteResult>;
  /** Road distance + duration without geometry (pricing input). */
  getRoadDistance(
    origin: LatLng,
    destination: LatLng,
  ): Promise<{ distanceKm: number; durationMinutes: number }>;
}

// ---------------------------------------------------------------------------
// Typed provider errors (M2)
// ---------------------------------------------------------------------------

export type MapsProviderErrorCode =
  /** Invalid input handed to the provider (bounded-input violation). */
  | 'invalid_input'
  /** Network failure after the retry budget was exhausted. */
  | 'network'
  /** The provider did not respond within the timeout. */
  | 'timeout'
  /** Provider answered 429 after the retry budget was exhausted. */
  | 'rate_limited'
  /** Provider answered with a non-retryable client error (4xx). */
  | 'provider_error'
  /** Provider answered 2xx but the body failed response validation. */
  | 'invalid_response'
  /** Provider answered 2xx but returned no usable result. */
  | 'no_results';

/**
 * The only error type providers may throw. Domain services catch this and
 * translate it; raw provider/network internals never leak past this type.
 */
export class MapsProviderError extends Error {
  readonly code: MapsProviderErrorCode;
  /** Provider HTTP status when applicable (undefined for network/timeout). */
  readonly status?: number;

  constructor(code: MapsProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'MapsProviderError';
    this.code = code;
    this.status = status;
  }
}
