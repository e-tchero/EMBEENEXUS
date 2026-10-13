/**
 * MapsProvider port.
 *
 * 05 §1.1 step 3: pricing asks the provider for the actual road route distance.
 * 06 §2.1: GPS updates must never trigger a routing call, and all provider
 * traffic is funnelled through a single caching/throttling module — that is
 * why the port is deliberately small. The adapter (Stadia Maps) lives outside
 * this package.
 *
 * This module contains no framework, database, or vendor imports.
 */

import type { Coordinates, GeoPoint } from '../value-objects/coordinates.js';

export interface RoadDistance {
  /** Actual road-route distance in kilometres. */
  readonly kilometres: number;
}

export interface GeocodeResult {
  readonly formattedAddress: string;
  readonly point: GeoPoint;
}

export interface MapsProvider {
  /** Road-route distance between two validated points. */
  getRoadDistance(from: Coordinates, to: Coordinates): Promise<RoadDistance>;

  /** Address -> coordinates; `null` when the address cannot be resolved. */
  geocode(address: string): Promise<GeocodeResult | null>;

  /** Coordinates -> address; `null` when no address is available. */
  reverseGeocode(point: Coordinates): Promise<GeocodeResult | null>;
}
