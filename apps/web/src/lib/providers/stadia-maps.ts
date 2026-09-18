import 'server-only';

import { z } from 'zod';

import { logger } from '@/lib/logging/logger';

import {
  MapsProviderError,
  type AddressResult,
  type LatLng,
  type MapsProvider,
  type RouteResult,
} from './maps-provider';
import {
  fetchWithRetry,
  isRetryableStatus,
  isValidLatitude,
  isValidLongitude,
  validateBoundedText,
} from './http-resilience';
import { decodePolyline6 } from './polyline';

/**
 * Stadia Maps adapter (M2) — the concrete implementation behind MapsProvider.
 *
 * Endpoints (Stadia wraps open engines):
 *  - Geocoding/search (Pelias-compatible): GET /geocoding/v1/search, /reverse
 *  - Routing (Valhalla-compatible):        POST /route/v1
 *  - Matrix (Valhalla):                    POST /time_distance_matrix/v1
 *
 * SECURITY: the API key travels only as a query parameter on server-side
 * requests and is never logged (log lines carry the pathname + status only).
 * This module is `server-only`; the key can never reach the browser bundle.
 *
 * RELIABILITY: bounded inputs, per-request timeout, capped retries with linear
 * backoff on 408/429/5xx, and zod-validated responses. Every failure mode is
 * surfaced as a typed MapsProviderError — raw network/HTTP internals never
 * escape this module.
 *
 * Costing note: routes use Valhalla's `motorcycle` costing to match the V2
 * motorcycle-only delivery model.
 */

const DEFAULT_BASE_URL = 'https://api.stadiamaps.com';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 400;

export interface StadiaMapsConfig {
  readonly apiKey: string;
  /** Override only in tests. */
  readonly baseUrl?: string;
  /** Per-attempt timeout in ms. Default 8000. */
  readonly timeoutMs?: number;
  /** Total attempt budget (first call + retries). Default 3. */
  readonly maxAttempts?: number;
  /** Linear backoff between attempts. Default 400. */
  readonly backoffMs?: number;
  /** Injectable fetch for deterministic tests. */
  readonly fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Provider response schemas (validation)
// ---------------------------------------------------------------------------

const geoJsonPointGeometry = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

const geocodeFeatureSchema = z.object({
  properties: z
    .object({
      label: z.string().optional(),
      name: z.string().optional(),
    })
    .passthrough(),
  geometry: geoJsonPointGeometry,
});

const geocodeResponseSchema = z.object({
  features: z.array(geocodeFeatureSchema),
});

const routeSummarySchema = z.object({
  /** kilometres (Valhalla `units: kilometers`) */
  length: z.number().finite().min(0),
  /** seconds */
  time: z.number().finite().min(0),
});

const routeResponseSchema = z.object({
  trip: z.object({
    summary: routeSummarySchema,
    /** Google-encoded polyline, precision 1e-6. */
    shape: z.string().min(1),
  }),
});

const matrixResponseSchema = z.object({
  sources_to_targets: z
    .array(
      z.array(
        z.object({
          distance: z.number().finite().min(0).nullable().optional(),
          time: z.number().finite().min(0).nullable().optional(),
        }),
      ),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export function createStadiaMapsProvider(config: StadiaMapsConfig): MapsProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS;
  const fetchImpl = config.fetchImpl ?? fetch;

  const log = logger.child({ provider: 'stadia-maps' });

  /** Performs one HTTP attempt with timeout; returns the raw Response. */
  async function attempt(path: string, init: RequestInit): Promise<Response> {
    const requestInit: RequestInit = {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    };
    if (timeoutMs > 0) {
      requestInit.signal = AbortSignal.timeout(timeoutMs);
    }
    return fetchImpl(`${baseUrl}${path}`, requestInit);
  }

  /**
   * Runs the request through the retry budget and classifies the outcome
   * into the typed error space. Returns the parsed JSON body on success.
   */
  async function requestJson(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const outcome = await fetchWithRetry(
      () => attempt(path, method === 'POST' ? { method, body: JSON.stringify(body) } : { method }),
      {
        maxAttempts,
        backoffMs,
        isSuccess: (response: Response) => response.ok,
        shouldRetry: (response: Response) => isRetryableStatus(response.status),
      },
    );

    if (outcome.networkError !== undefined) {
      const error = outcome.networkError;
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new MapsProviderError(
        isTimeout ? 'timeout' : 'network',
        isTimeout
          ? `Maps provider request timed out after ${timeoutMs} ms.`
          : 'Maps provider request failed at the network level.',
      );
    }

    const response = outcome.response;
    if (!response) {
      throw new MapsProviderError('network', 'Maps provider returned no response.');
    }

    if (!response.ok) {
      if (response.status === 429 || response.status === 408) {
        throw new MapsProviderError(
          response.status === 429 ? 'rate_limited' : 'timeout',
          `Maps provider request not served (HTTP ${response.status}) after ${outcome.attempts} attempt(s).`,
          response.status,
        );
      }
      throw new MapsProviderError(
        'provider_error',
        `Maps provider rejected the request (HTTP ${response.status}).`,
        response.status,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new MapsProviderError('invalid_response', 'Maps provider returned malformed JSON.');
    }

    log.debug('maps.request.ok', { path: path.split('?')[0], status: response.status });
    return parsed;
  }

  function assertProviderSchema(
    parsed: unknown,
    schema: z.ZodTypeAny,
    what: string,
  ): z.infer<typeof schema> {
    const result = schema.safeParse(parsed);
    if (!result.success) {
      log.warn('maps.response.invalid', { what, issues: result.error.issues.length });
      throw new MapsProviderError('invalid_response', `Maps provider ${what} failed validation.`);
    }
    return result.data;
  }

  function featureToAddress(feature: z.infer<typeof geocodeFeatureSchema>): AddressResult {
    const [lng, lat] = feature.geometry.coordinates;
    return {
      formattedAddress:
        feature.properties.label ?? feature.properties.name ?? 'Unknown location',
      lat,
      lng,
    };
  }

  function requirePoint(lat: number, lng: number): void {
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      throw new MapsProviderError(
        'invalid_input',
        'Latitude/longitude are outside valid ranges.',
      );
    }
  }

  function withApiKey(params: Record<string, string>): string {
    const query = new URLSearchParams({ api_key: config.apiKey, ...params });
    return `?${query.toString()}`;
  }

  return {
    async geocode(address: string): Promise<AddressResult> {
      const bounded = validateBoundedText(address, 300, 'address');
      if (!bounded.ok) {
        throw new MapsProviderError('invalid_input', 'Address exceeds the maximum length.');
      }
      const parsed = assertProviderSchema(
        await requestJson('GET', `/geocoding/v1/search${withApiKey({ text: bounded.value, size: '1' })}`),
        geocodeResponseSchema,
        'geocode response',
      );
      const feature = parsed.features[0];
      if (!feature) {
        throw new MapsProviderError('no_results', 'No geocode result for the given address.');
      }
      return featureToAddress(feature);
    },

    async reverseGeocode(lat: number, lng: number): Promise<AddressResult> {
      requirePoint(lat, lng);
      const parsed = assertProviderSchema(
        await requestJson(
          'GET',
          `/geocoding/v1/reverse${withApiKey({ 'point.lat': String(lat), 'point.lon': String(lng), size: '1' })}`,
        ),
        geocodeResponseSchema,
        'reverse geocode response',
      );
      const feature = parsed.features[0];
      if (!feature) {
        throw new MapsProviderError('no_results', 'No reverse geocode result for the given point.');
      }
      return featureToAddress(feature);
    },

    async searchAddresses(query: string, bias?: LatLng): Promise<AddressResult[]> {
      const bounded = validateBoundedText(query, 200, 'query');
      if (!bounded.ok) {
        throw new MapsProviderError('invalid_input', 'Search query exceeds the maximum length.');
      }
      const params: Record<string, string> = { text: bounded.value, size: '10' };
      if (bias) {
        requirePoint(bias.lat, bias.lng);
        params['focus.point.lat'] = String(bias.lat);
        params['focus.point.lon'] = String(bias.lng);
      }
      const parsed = assertProviderSchema(
        await requestJson('GET', `/geocoding/v1/search${withApiKey(params)}`),
        geocodeResponseSchema,
        'search response',
      );
      return parsed.features.map(featureToAddress);
    },

    async getRoute(origin: LatLng, destination: LatLng): Promise<RouteResult> {
      requirePoint(origin.lat, origin.lng);
      requirePoint(destination.lat, destination.lng);

      const parsed = assertProviderSchema(
        await requestJson('POST', `/route/v1${withApiKey({})}`, {
          locations: [
            { lat: origin.lat, lng: origin.lng },
            { lat: destination.lat, lng: destination.lng },
          ],
          costing: 'motorcycle',
          units: 'kilometers',
        }),
        routeResponseSchema,
        'route response',
      );

      let geometry: LatLng[];
      try {
        geometry = decodePolyline6(parsed.trip.shape);
      } catch (error) {
        throw new MapsProviderError(
          'invalid_response',
          error instanceof Error ? error.message : 'Route geometry could not be decoded.',
        );
      }

      return {
        distanceKm: parsed.trip.summary.length,
        durationMinutes: Math.max(1, Math.round(parsed.trip.summary.time / 60)),
        geometry,
      };
    },

    async getRoadDistance(
      origin: LatLng,
      destination: LatLng,
    ): Promise<{ distanceKm: number; durationMinutes: number }> {
      requirePoint(origin.lat, origin.lng);
      requirePoint(destination.lat, destination.lng);

      const parsed = assertProviderSchema(
        await requestJson('POST', `/time_distance_matrix/v1${withApiKey({})}`, {
          sources: [{ lat: origin.lat, lng: origin.lng }],
          targets: [{ lat: destination.lat, lng: destination.lng }],
          costing: 'motorcycle',
          units: 'kilometers',
        }),
        matrixResponseSchema,
        'matrix response',
      );

      const cell = parsed.sources_to_targets[0]?.[0];
      if (!cell || cell.distance === undefined || cell.distance === null || cell.time === undefined || cell.time === null) {
        throw new MapsProviderError('no_results', 'No route between the given points.');
      }

      return {
        distanceKm: cell.distance,
        durationMinutes: Math.max(1, Math.round(cell.time / 60)),
      };
    },
  };
}
