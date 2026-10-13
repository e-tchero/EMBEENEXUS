/**
 * Coordinates — a validated WGS-84 latitude/longitude pair.
 *
 * Canonical rule (03_DOMAIN_MODEL.md §1, EN_Pricing_Spec.docx §4): coordinates
 * MUST be validated inside latitude -90..+90 and longitude -180..+180 before
 * they reach a geofence test or a map provider.
 *
 * This module contains no framework, database, or vendor imports.
 */

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_LATITUDE &&
    value <= MAX_LATITUDE
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_LONGITUDE &&
    value <= MAX_LONGITUDE
  );
}

export function assertLatitude(value: unknown): asserts value is number {
  if (!isValidLatitude(value)) {
    throw new RangeError(
      `Latitude must be a finite number between ${MIN_LATITUDE} and ${MAX_LATITUDE}, received ${String(value)}.`,
    );
  }
}

export function assertLongitude(value: unknown): asserts value is number {
  if (!isValidLongitude(value)) {
    throw new RangeError(
      `Longitude must be a finite number between ${MIN_LONGITUDE} and ${MAX_LONGITUDE}, received ${String(value)}.`,
    );
  }
}

export class Coordinates implements GeoPoint {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static create(latitude: number, longitude: number): Coordinates {
    assertLatitude(latitude);
    assertLongitude(longitude);
    return new Coordinates(latitude, longitude);
  }

  equals(other: Coordinates): boolean {
    return this.latitude === other.latitude && this.longitude === other.longitude;
  }

  toGeoPoint(): GeoPoint {
    return { latitude: this.latitude, longitude: this.longitude };
  }

  toString(): string {
    return `${this.latitude},${this.longitude}`;
  }
}
