import 'server-only';

import { createClient } from '@/lib/db/client-server';
import {
  validatePricingConfig,
  type ActivePricingConfig,
  type PricingBand,
} from '@/lib/domain/pricing';
import { logger } from '@/lib/logging/logger';

/**
 * Pricing service (M2) — loads the active pricing configuration.
 *
 * The active configuration is public operational data; it changes rarely.
 * A short TTL cache keeps quote intake off the database path, while the
 * structure validation ensures a bad configuration fails loudly at load
 * (never silently prices customers wrong).
 */

const CACHE_TTL_MS = 60_000; // 60s: operator pricing changes propagate ≤ 1 min

interface CacheEntry {
  config: ActivePricingConfig;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

/** Test-only: clear the cached configuration between tests. */
export function resetPricingCacheForTests(): void {
  cache = null;
}

export async function getActivePricingConfig(): Promise<ActivePricingConfig> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.config;
  }

  const supabase = await createClient();

  const { data: configRow, error: configError } = await supabase
    .from('pricing_configs')
    .select('id, version')
    .eq('is_active', true)
    .maybeSingle();

  if (configError || !configRow) {
    logger.error('pricing.config.missing', { code: configError?.code });
    throw new Error('Pricing configuration is unavailable.');
  }

  const { data: bandRows, error: bandsError } = await supabase
    .from('pricing_bands')
    .select(
      'min_distance_m, max_distance_m, customer_price_kobo, rider_share_kobo, platform_share_kobo',
    )
    .eq('pricing_config_id', configRow.id)
    .order('min_distance_m', { ascending: true });

  if (bandsError || !bandRows || bandRows.length === 0) {
    logger.error('pricing.bands.missing', { code: bandsError?.code });
    throw new Error('Pricing bands are unavailable.');
  }

  const bands: PricingBand[] = bandRows.map((row) => ({
    minDistanceMetres: row.min_distance_m,
    maxDistanceMetres: row.max_distance_m,
    customerPriceKobo: BigInt(row.customer_price_kobo),
    riderShareKobo: BigInt(row.rider_share_kobo),
    platformShareKobo: BigInt(row.platform_share_kobo),
  }));

  const config: ActivePricingConfig = { version: configRow.version, bands };

  const problems = validatePricingConfig(config);
  if (problems.length > 0) {
    problems.forEach((problem) => logger.error('pricing.config.invalid', { problem }));
    throw new Error('Active pricing configuration failed validation.');
  }

  cache = { config, loadedAt: Date.now() };
  return config;
}
