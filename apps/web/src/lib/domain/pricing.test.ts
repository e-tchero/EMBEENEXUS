import { describe, expect, it } from 'vitest';

import {
  MAX_DISTANCE_METRES,
  founderPricingConfigV1,
  quoteForDistance,
  roadDistanceKmToMetres,
  validatePricingConfig,
} from './pricing';

/** Expect an ok result and return the breakdown (narrows for assertions). */
function expectOk<T, E>(result: { ok: boolean; value?: T; error?: E }): T {
  if (!result.ok) throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  return result.value as T;
}

/** Expect an error result and return the error (narrows for assertions). */
function expectErr<T, E>(result: { ok: boolean; value?: T; error?: E }): E {
  if (result.ok) throw new Error('expected error, got ok');
  return result.error as E;
}

describe('pricing domain — founder configuration v1', () => {
  const config = founderPricingConfigV1();

  it('is structurally valid', () => {
    expect(validatePricingConfig(config)).toEqual([]);
  });

  it('prices 0 m at the minimum band (₦2,200)', () => {
    const price = expectOk(quoteForDistance(config, 0));
    expect(price.customerPriceKobo).toBe(220_000n);
  });

  it('prices exactly 5,000 m in the lower band (boundary belongs to the lower band)', () => {
    const price = expectOk(quoteForDistance(config, 5_000));
    expect(price.customerPriceKobo).toBe(220_000n);
    expect(price.bandMaxDistanceMetres).toBe(5_000);
  });

  it('prices 5,001 m in the >5–10 km band (₦2,600)', () => {
    const price = expectOk(quoteForDistance(config, 5_001));
    expect(price.customerPriceKobo).toBe(260_000n);
  });

  it('prices exactly 10,000 m in the >5–10 km band (₦2,600)', () => {
    const price = expectOk(quoteForDistance(config, 10_000));
    expect(price.customerPriceKobo).toBe(260_000n);
  });

  it('prices 10,001 m in the >10–15 km band (₦3,000)', () => {
    const price = expectOk(quoteForDistance(config, 10_001));
    expect(price.customerPriceKobo).toBe(300_000n);
  });

  it('prices exactly 15,000 m in the >10–15 km band (₦3,000)', () => {
    const price = expectOk(quoteForDistance(config, 15_000));
    expect(price.customerPriceKobo).toBe(300_000n);
  });

  it('prices 15,001 m in the >15–25 km band (₦3,600)', () => {
    const price = expectOk(quoteForDistance(config, 15_001));
    expect(price.customerPriceKobo).toBe(360_000n);
  });

  it('prices exactly 25,000 m in the >15–25 km band (₦3,600)', () => {
    const price = expectOk(quoteForDistance(config, 25_000));
    expect(price.customerPriceKobo).toBe(360_000n);
  });

  it('prices 25,001 m in the >25–35 km band (₦4,300)', () => {
    const price = expectOk(quoteForDistance(config, 25_001));
    expect(price.customerPriceKobo).toBe(430_000n);
  });

  it('prices exactly 35,000 m at the maximum band (₦4,300)', () => {
    const price = expectOk(quoteForDistance(config, 35_000));
    expect(price.customerPriceKobo).toBe(430_000n);
    expect(price.bandMaxDistanceMetres).toBe(MAX_DISTANCE_METRES);
  });

  it('rejects any distance above 35 km without pricing it', () => {
    const error = expectErr(quoteForDistance(config, 35_001));
    expect(error.code).toBe('distance_exceeds_maximum');
    if (error.code === 'distance_exceeds_maximum') {
      expect(error.maxDistanceMetres).toBe(35_000);
    }
  });

  it('rejects negative and non-integer distances', () => {
    expect(expectErr(quoteForDistance(config, -1)).code).toBe('invalid_distance');
    expect(expectErr(quoteForDistance(config, 1.5)).code).toBe('invalid_distance');
    expect(expectErr(quoteForDistance(config, Number.NaN)).code).toBe('invalid_distance');
  });

  it('returns the founder 70/30 split for every band', () => {
    for (const metres of [0, 5_000, 5_001, 10_000, 15_000, 25_000, 35_000]) {
      const price = expectOk(quoteForDistance(config, metres));
      expect(price.riderShareKobo * 10n).toBe(price.customerPriceKobo * 7n);
      expect(price.riderShareKobo + price.platformShareKobo).toBe(price.customerPriceKobo);
    }
  });

  it('asserts exact founder split figures per band', () => {
    const expectations: Array<[number, bigint, bigint]> = [
      // [metres, rider kobo, platform kobo]
      [0, 154_000n, 66_000n],
      [7_500, 182_000n, 78_000n],
      [12_500, 210_000n, 90_000n],
      [20_000, 252_000n, 108_000n],
      [30_000, 301_000n, 129_000n],
    ];
    for (const [metres, rider, platform] of expectations) {
      const price = expectOk(quoteForDistance(config, metres));
      expect(price.riderShareKobo).toBe(rider);
      expect(price.platformShareKobo).toBe(platform);
    }
  });

  it('keeps all arithmetic in bigint (no float drift)', () => {
    const price = expectOk(quoteForDistance(config, 30_000));
    expect(typeof price.customerPriceKobo).toBe('bigint');
    expect(price.customerPriceKobo).toBe(430_000n);
  });
});

describe('pricing domain — configuration validation', () => {
  it('rejects an empty band list', () => {
    const problems = validatePricingConfig({ version: 1, bands: [] });
    expect(problems.length).toBeGreaterThan(0);
  });

  it('requires the first band to start at 0', () => {
    const config = founderPricingConfigV1();
    const bands = config.bands.map((b, i) =>
      i === 0 ? { ...b, minDistanceMetres: 1 } : b,
    );
    expect(validatePricingConfig({ version: 1, bands }).some((p) => p.includes('0 m'))).toBe(
      true,
    );
  });

  it('requires contiguity between bands', () => {
    const config = founderPricingConfigV1();
    const bands = config.bands.map((b, i) =>
      i === 1 ? { ...b, minDistanceMetres: b.minDistanceMetres + 1 } : b,
    );
    expect(
      validatePricingConfig({ version: 1, bands }).some((p) => p.includes('contiguous')),
    ).toBe(true);
  });

  it('requires the final band to end at the 35 km maximum', () => {
    const config = founderPricingConfigV1();
    const bands = config.bands.map((b, i) =>
      i === config.bands.length - 1 ? { ...b, maxDistanceMetres: 34_000 } : b,
    );
    expect(validatePricingConfig({ version: 1, bands }).some((p) => p.includes('maximum'))).toBe(
      true,
    );
  });

  it('rejects quoting against a configuration whose split invariant is broken', () => {
    const config = founderPricingConfigV1();
    const broken = config.bands.map((b, i) =>
      i === 0 ? { ...b, riderShareKobo: 100_000n, platformShareKobo: 120_000n } : b,
    );
    const error = expectErr(quoteForDistance({ version: 1, bands: broken }, 1_000));
    expect(error.code).toBe('invalid_config');
  });

  it('rejects quoting when no band covers a distance (gap)', () => {
    const config = founderPricingConfigV1();
    const gapped = config.bands.map((b, i) =>
      i === 1 ? { ...b, minDistanceMetres: 6_000 } : b,
    );
    const error = expectErr(quoteForDistance({ version: 1, bands: gapped }, 5_500));
    expect(error.code).toBe('no_band_for_distance');
  });
});

describe('pricing domain — road distance conversion', () => {
  it('converts fractional km to integer metres, rounding half-up', () => {
    expect(expectOk(roadDistanceKmToMetres(12.345)).toString()).toBe('12345');
    expect(expectOk(roadDistanceKmToMetres(0.0005)).toString()).toBe('1');
    expect(expectOk(roadDistanceKmToMetres(35)).toString()).toBe('35000');
  });

  it('rejects negative, infinite, and NaN km', () => {
    expect(expectErr(roadDistanceKmToMetres(-0.1)).code).toBe('invalid_distance');
    expect(expectErr(roadDistanceKmToMetres(Number.POSITIVE_INFINITY)).code).toBe(
      'invalid_distance',
    );
    expect(expectErr(roadDistanceKmToMetres(Number.NaN)).code).toBe('invalid_distance');
  });
});
