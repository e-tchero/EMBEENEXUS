import { describe, expect, it } from 'vitest';

import {
  Coordinates,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  isValidLatitude,
  isValidLongitude,
} from './coordinates.js';

describe('Coordinates', () => {
  it('accepts a valid Abuja point', () => {
    const point = Coordinates.create(9.05785, 7.49508);
    expect(point.latitude).toBe(9.05785);
    expect(point.longitude).toBe(7.49508);
  });

  it('accepts the inclusive boundaries', () => {
    expect(Coordinates.create(MIN_LATITUDE, MIN_LONGITUDE).latitude).toBe(-90);
    expect(Coordinates.create(MAX_LATITUDE, MAX_LONGITUDE).longitude).toBe(180);
  });

  it('rejects latitude outside -90..90', () => {
    expect(() => Coordinates.create(90.0001, 0)).toThrow(RangeError);
    expect(() => Coordinates.create(-90.0001, 0)).toThrow(RangeError);
  });

  it('rejects longitude outside -180..180', () => {
    expect(() => Coordinates.create(0, 180.0001)).toThrow(RangeError);
    expect(() => Coordinates.create(0, -180.0001)).toThrow(RangeError);
  });

  it('rejects non-finite coordinates', () => {
    expect(() => Coordinates.create(Number.NaN, 0)).toThrow(RangeError);
    expect(() => Coordinates.create(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('validates ranges without constructing', () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude('0')).toBe(false);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(181)).toBe(false);
  });

  it('compares by value', () => {
    expect(Coordinates.create(9.05, 7.49).equals(Coordinates.create(9.05, 7.49))).toBe(true);
    expect(Coordinates.create(9.05, 7.49).equals(Coordinates.create(9.05, 7.5))).toBe(false);
  });

  it('projects to a plain geo point', () => {
    expect(Coordinates.create(9.05, 7.49).toGeoPoint()).toEqual({
      latitude: 9.05,
      longitude: 7.49,
    });
  });
});
