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
