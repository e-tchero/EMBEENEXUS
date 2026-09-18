/**
 * Fixed-band pricing engine — domain foundation (M2).
 *
 * This module is the single authoritative implementation of the V2 pricing
 * model. It is pure and deterministic: no I/O, no clocks, no floating-point
 * money. The database (`pricing_configs` / `pricing_bands`, migration 0004)
 * holds the active configuration; future quotes/orders store an immutable
 * snapshot of the selected band and are never altered retroactively.
 *
 * Business rules encoded here (founder-decided, ADR-0003):
 *  - five fixed distance bands, priced per the founder table;
 *  - road distance in metres is the only pricing input;
 *  - no weight pricing, no urgency multiplier, no hidden fees, no VAT;
 *  - maximum supported delivery distance is 35 km — anything above is
 *    rejected, never priced;
 *  - 70/30 rider/platform split, enforced arithmetically;
 *  - all money in integer kobo (bigint). Never float.
 *
 * Interval semantics: bands are (min, max] — a boundary distance belongs to
 * the LOWER-priced band ('0–5 km' includes exactly 5 km; '>5–10 km' starts
 * strictly above it). The first band includes 0 m; the final band includes
 * 35,000 m.
 */

import { err, ok, type Result } from '@embee/shared';

/** Maximum delivery distance the platform prices (metres). */
export const MAX_DISTANCE_METRES = 35_000;

export interface PricingBand {
  readonly minDistanceMetres: number;
  readonly maxDistanceMetres: number;
  readonly customerPriceKobo: bigint;
  readonly riderShareKobo: bigint;
  readonly platformShareKobo: bigint;
}

/** The active pricing configuration as loaded from the database. */
export interface ActivePricingConfig {
  readonly version: number;
  /** Bands sorted ascending by minDistanceMetres. */
  readonly bands: readonly PricingBand[];
}

export interface PriceBreakdown {
  readonly configVersion: number;
  /** The band that priced this distance. */
  readonly bandMinDistanceMetres: number;
  readonly bandMaxDistanceMetres: number;
  readonly customerPriceKobo: bigint;
  readonly riderShareKobo: bigint;
  readonly platformShareKobo: bigint;
}

export type PricingError =
  | { code: 'empty_band_list' }
  | { code: 'invalid_config'; problems: readonly string[] }
  | { code: 'invalid_distance'; message: string }
  | { code: 'distance_exceeds_maximum'; maxDistanceMetres: number }
  | { code: 'no_band_for_distance'; distanceMetres: number };

export type PricingResult = Result<PriceBreakdown, PricingError>;

// ---------------------------------------------------------------------------
// Configuration validation — structural invariants of the fixed-band model.
// ---------------------------------------------------------------------------

/**
 * Validates that a configuration covers exactly [0, MAX_DISTANCE_METRES] with
 * contiguous, non-overlapping (min, max] bands. Returns problems; an empty
 * list means the configuration is structurally sound.
 */
export function validatePricingConfig(config: ActivePricingConfig): readonly string[] {
  const problems: string[] = [];

  if (config.bands.length === 0) {
    problems.push('Configuration has no bands.');
    return problems;
  }

  const sorted = [...config.bands].sort((a, b) => a.minDistanceMetres - b.minDistanceMetres);

  const first = sorted[0];
  if (first && first.minDistanceMetres !== 0) {
    problems.push(`First band must start at 0 m (got ${first.minDistanceMetres}).`);
  }

  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    if (!band) continue;

    if (band.maxDistanceMetres <= band.minDistanceMetres) {
      problems.push(`Band ${i} has max <= min.`);
      continue;
    }

    const previous = i > 0 ? sorted[i - 1] : undefined;
    if (previous && band.minDistanceMetres !== previous.maxDistanceMetres) {
      problems.push(
        `Band ${i} starts at ${band.minDistanceMetres} but previous band ends at ${previous.maxDistanceMetres} (bands must be contiguous).`,
      );
    }
  }

  const last = sorted[sorted.length - 1];
  if (last && last.maxDistanceMetres !== MAX_DISTANCE_METRES) {
    problems.push(
      `Final band must end at the ${MAX_DISTANCE_METRES} m maximum (got ${last.maxDistanceMetres}).`,
    );
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Distance handling
// ---------------------------------------------------------------------------

/**
 * Deterministically converts a provider road distance (km, possibly
 * fractional) to integer metres, rounding half-up. All band arithmetic
 * downstream uses integer metres only.
 */
export function roadDistanceKmToMetres(distanceKm: number): Result<number, PricingError> {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return err({ code: 'invalid_distance', message: `Road distance must be a finite, non-negative number of kilometres (got ${distanceKm}).` });
  }
  return ok(Math.round(distanceKm * 1000));
}

// ---------------------------------------------------------------------------
// Band selection
// ---------------------------------------------------------------------------

function bandCoversDistance(band: PricingBand, distanceMetres: number): boolean {
  if (distanceMetres > band.maxDistanceMetres) return false;
  if (band.minDistanceMetres === 0) return distanceMetres >= 0; // first band includes 0
  return distanceMetres > band.minDistanceMetres; // (min, max]
}

export function selectBand(
  config: ActivePricingConfig,
  distanceMetres: number,
): Result<PricingBand, PricingError> {
  if (config.bands.length === 0) {
    return err({ code: 'empty_band_list' });
  }
  const sorted = [...config.bands].sort((a, b) => a.minDistanceMetres - b.minDistanceMetres);
  for (const band of sorted) {
    if (bandCoversDistance(band, distanceMetres)) return ok(band);
  }
  return err({ code: 'no_band_for_distance', distanceMetres });
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

/**
 * Prices a road distance against the given active configuration.
 * The split is taken verbatim from the band (the database constraint
 * `pricing_bands_split_70_30` guarantees the 70/30 invariant; this function
 * additionally re-checks it so a corrupted row can never produce a quote).
 */
export function quoteForDistance(
  config: ActivePricingConfig,
  distanceMetres: number,
): PricingResult {
  if (!Number.isSafeInteger(distanceMetres) || distanceMetres < 0) {
    return err({
      code: 'invalid_distance',
      message: `Distance must be a non-negative integer number of metres (got ${distanceMetres}).`,
    });
  }

  if (distanceMetres > MAX_DISTANCE_METRES) {
    return err({ code: 'distance_exceeds_maximum', maxDistanceMetres: MAX_DISTANCE_METRES });
  }

  const selected = selectBand(config, distanceMetres);
  if (!selected.ok) return selected;

  const band = selected.value;
  if (
    band.riderShareKobo + band.platformShareKobo !== band.customerPriceKobo ||
    band.riderShareKobo * 10n !== band.customerPriceKobo * 7n
  ) {
    return err({
      code: 'invalid_config',
      problems: [`Band ${band.minDistanceMetres}-${band.maxDistanceMetres} m violates the 70/30 split invariant.`],
    });
  }

  return ok({
    configVersion: config.version,
    bandMinDistanceMetres: band.minDistanceMetres,
    bandMaxDistanceMetres: band.maxDistanceMetres,
    customerPriceKobo: band.customerPriceKobo,
    riderShareKobo: band.riderShareKobo,
    platformShareKobo: band.platformShareKobo,
  });
}

// ---------------------------------------------------------------------------
// Founding configuration (mirrors migration 0004 seed) — used for tests and
// as a reference; the live configuration always comes from the database.
// ---------------------------------------------------------------------------

export function founderPricingConfigV1(): ActivePricingConfig {
  return {
    version: 1,
    bands: [
      { minDistanceMetres: 0, maxDistanceMetres: 5_000, customerPriceKobo: 220_000n, riderShareKobo: 154_000n, platformShareKobo: 66_000n },
      { minDistanceMetres: 5_000, maxDistanceMetres: 10_000, customerPriceKobo: 260_000n, riderShareKobo: 182_000n, platformShareKobo: 78_000n },
      { minDistanceMetres: 10_000, maxDistanceMetres: 15_000, customerPriceKobo: 300_000n, riderShareKobo: 210_000n, platformShareKobo: 90_000n },
      { minDistanceMetres: 15_000, maxDistanceMetres: 25_000, customerPriceKobo: 360_000n, riderShareKobo: 252_000n, platformShareKobo: 108_000n },
      { minDistanceMetres: 25_000, maxDistanceMetres: 35_000, customerPriceKobo: 430_000n, riderShareKobo: 301_000n, platformShareKobo: 129_000n },
    ],
  };
}
