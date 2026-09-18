import 'server-only';

import { createQuoteSchema, type CreateQuoteInput } from '@embee/shared';

import { assertRole, AuthorizationError } from '@/lib/auth/rbac';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/db/client-server';
import { roadDistanceKmToMetres } from '@/lib/domain/pricing';
import { logger } from '@/lib/logging/logger';
import { getMapsProvider } from '@/lib/providers/maps';
import { MapsProviderError } from '@/lib/providers/maps-provider';

/**
 * Quote service (M3) — the thin composition layer.
 *
 * Flow: getSession + assertRole('customer') → zod re-validation → maps road
 * distance (server-side) → create_quote RPC (coverage + pricing + snapshot
 * authority in PostgreSQL).
 *
 * The client never supplies distance, price, or coverage — the server
 * measures, derives, and verifies. Nothing here trusts client assertions.
 */

export type QuoteServiceError =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid_input'
  | 'out_of_coverage'
  | 'distance_exceeds_maximum'
  | 'pricing_unavailable'
  | 'maps_unavailable'
  | 'unknown_error';

export interface QuoteRequestResult {
  readonly ok: boolean;
  readonly quote?: {
    readonly id: string;
    readonly roadDistanceMetres: number;
    readonly customerPriceKobo: string;
    readonly riderShareKobo: string;
    readonly platformShareKobo: string;
    readonly expiresAt: string;
  };
  readonly error?: QuoteServiceError;
}

interface QuoteRow {
  quote_id: string;
  road_distance_m: number;
  customer_price_kobo: string | number;
  rider_share_kobo: string | number;
  platform_share_kobo: string | number;
  expires_at: string;
}

export async function requestQuote(
  input: CreateQuoteInput,
): Promise<QuoteRequestResult> {
  // 1. Authorization — role re-derived from the database, never client input.
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: 'unauthenticated' };
    }
    await assertRole(session, ['customer']);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: 'forbidden' };
    }
    throw error;
  }

  // 2. Re-validate (shared schema; client validation is UX only).
  const parsed = createQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }

  // 3. Server-side road distance from the maps provider.
  const maps = getMapsProvider();
  let distanceKm: number;
  try {
    const result = await maps.getRoadDistance(
      { lat: parsed.data.pickupLat, lng: parsed.data.pickupLng },
      { lat: parsed.data.dropoffLat, lng: parsed.data.dropoffLng },
    );
    distanceKm = result.distanceKm;
  } catch (error) {
    if (error instanceof MapsProviderError) {
      logger.warn('quote.maps_failed', { code: error.code });
      return { ok: false, error: 'maps_unavailable' };
    }
    logger.error('quote.maps_unexpected', {});
    return { ok: false, error: 'maps_unavailable' };
  }

  // 4. Deterministic integer metres; 35 km ceiling (defense in depth — the
  // RPC and the table CHECK enforce it too).
  const metres = roadDistanceKmToMetres(distanceKm);
  if (!metres.ok) {
    return { ok: false, error: 'maps_unavailable' };
  }
  if (metres.value > 35_000) {
    return { ok: false, error: 'distance_exceeds_maximum' };
  }

  // 5. Database authority: coverage + pricing + snapshot in one RPC.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_quote', {
    p_pickup_lat: parsed.data.pickupLat,
    p_pickup_lng: parsed.data.pickupLng,
    p_pickup_address: parsed.data.pickupAddress,
    p_dropoff_lat: parsed.data.dropoffLat,
    p_dropoff_lng: parsed.data.dropoffLng,
    p_dropoff_address: parsed.data.dropoffAddress,
    p_road_distance_m: metres.value,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('quote.rpc_failed', { code });
    if (code === 'OUT_OF_COVERAGE') return { ok: false, error: 'out_of_coverage' };
    if (code === 'INVALID_INPUT') return { ok: false, error: 'invalid_input' };
    if (code === 'NO_BAND_FOR_DISTANCE') return { ok: false, error: 'distance_exceeds_maximum' };
    if (code === 'PRICING_UNAVAILABLE') return { ok: false, error: 'pricing_unavailable' };
    if (code === 'FORBIDDEN') return { ok: false, error: 'forbidden' };
    if (code === 'NOT_AUTHENTICATED') return { ok: false, error: 'unauthenticated' };
    return { ok: false, error: 'unknown_error' };
  }

  const quote = (Array.isArray(data) ? data[0] : data) as QuoteRow | null;
  if (!quote) {
    return { ok: false, error: 'unknown_error' };
  }

  logger.info('quote.created', { quoteId: quote.quote_id });

  return {
    ok: true,
    quote: {
      id: quote.quote_id,
      roadDistanceMetres: quote.road_distance_m,
      customerPriceKobo: String(quote.customer_price_kobo),
      riderShareKobo: String(quote.rider_share_kobo),
      platformShareKobo: String(quote.platform_share_kobo),
      expiresAt: quote.expires_at,
    },
  };
}

export interface QuoteRetrievalResult {
  readonly ok: boolean;
  readonly quote?: {
    readonly id: string;
    readonly customerId: string;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly roadDistanceMetres: number;
    readonly pricingVersion: number;
    readonly customerPriceKobo: string;
    readonly riderShareKobo: string;
    readonly platformShareKobo: string;
    readonly status: string;
    readonly expiresAt: string;
    readonly createdAt: string;
  };
  readonly error?: 'unauthenticated' | 'not_found' | 'unknown_error';
}

/**
 * Fetches a quote by id. Visibility is enforced by RLS (owner or operator);
 * an invisible quote is indistinguishable from a missing one.
 */
export async function getQuote(quoteId: string): Promise<QuoteRetrievalResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return { ok: false, error: 'not_found' };

  const supabase = await createClient();
  const { data } = await supabase
    .from('quotes')
    .select(
      'id, customer_id, pickup_address, dropoff_address, road_distance_m, pricing_version, customer_price_kobo, rider_share_kobo, platform_share_kobo, status, expires_at, created_at',
    )
    .eq('id', quoteId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'not_found' };

  return {
    ok: true,
    quote: {
      id: data.id,
      customerId: data.customer_id,
      pickupAddress: data.pickup_address,
      dropoffAddress: data.dropoff_address,
      roadDistanceMetres: data.road_distance_m,
      pricingVersion: data.pricing_version,
      customerPriceKobo: String(data.customer_price_kobo),
      riderShareKobo: String(data.rider_share_kobo),
      platformShareKobo: String(data.platform_share_kobo),
      status: data.status,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    },
  };
}
