import { describe, expect, it, vi } from 'vitest';

import { MapsProviderError } from './maps-provider';
import { createStadiaMapsProvider } from './stadia-maps';

/**
 * Contract tests for the Stadia adapter using an injected fetch — no network.
 * Response bodies mirror the documented Pelias/Valhalla shapes.
 */

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

function jsonResponse(body: unknown, status = 200): FetchResult {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function makeProvider(fetchImpl: ReturnType<typeof vi.fn>) {
  return createStadiaMapsProvider({
    apiKey: 'test-key',
    baseUrl: 'https://maps.test',
    timeoutMs: 1_000,
    maxAttempts: 3,
    backoffMs: 1,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe('stadia adapter — geocode', () => {
  it('parses the first feature into an AddressResult', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            properties: { label: 'Plot 5, Garki, Abuja' },
            geometry: { type: 'Point', coordinates: [7.4951, 9.0129] },
          },
        ],
      }),
    );
    const provider = makeProvider(fetchImpl);
    const result = await provider.geocode('Plot 5, Garki, Abuja');
    expect(result.formattedAddress).toBe('Plot 5, Garki, Abuja');
    expect(result.lat).toBeCloseTo(9.0129, 6);
    expect(result.lng).toBeCloseTo(7.4951, 6);
    // The API key must travel as a query parameter, never in a header/body.
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('api_key=test-key');
  });

  it('throws no_results when the provider returns zero features', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    const provider = makeProvider(fetchImpl);
    await expect(provider.geocode('middle of nowhere')).rejects.toMatchObject({
      code: 'no_results',
    });
  });

  it('throws invalid_input for over-long addresses without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider(fetchImpl);
    await expect(provider.geocode('a'.repeat(301))).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('stadia adapter — reliability', () => {
  it('retries a 500 within the budget and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValue(
        jsonResponse({
          features: [
            { properties: { label: 'X' }, geometry: { type: 'Point', coordinates: [7.0, 9.0] } },
          ],
        }),
      );
    const provider = makeProvider(fetchImpl);
    const result = await provider.geocode('X');
    expect(result.lat).toBeCloseTo(9.0, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces provider_error after the retry budget is exhausted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const provider = makeProvider(fetchImpl);
    const error = await provider.geocode('X').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MapsProviderError);
    expect((error as MapsProviderError).code).toBe('provider_error');
    expect((error as MapsProviderError).status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // bounded, no unbounded retries
  });

  it('classifies an aborted request as a timeout', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const fetchImpl = vi.fn().mockRejectedValue(abort);
    const provider = createStadiaMapsProvider({
      apiKey: 'k',
      timeoutMs: 1,
      maxAttempts: 1,
      backoffMs: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.geocode('X')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('throws invalid_response when the body fails schema validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ totally: 'wrong' }));
    const provider = makeProvider(fetchImpl);
    await expect(provider.geocode('X')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('stadia adapter — route and matrix', () => {
  it('decodes the route shape and converts time to minutes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        trip: {
          summary: { length: 12.345, time: 741 },
          // precision-6 polyline for (9.0765, 7.4788) → (9.0123, 7.4321)
          shape: 'omzklAzyor~Csc~EgozE',
        },
      }),
    );
    const provider = makeProvider(fetchImpl);
    const route = await provider.getRoute({ lat: 9.0765, lng: 7.4788 }, { lat: 9.0123, lng: 7.4321 });
    expect(route.distanceKm).toBeCloseTo(12.345, 3);
    expect(route.durationMinutes).toBe(12); // round(741/60)
    expect(route.geometry).toHaveLength(2);
    // Request must use the motorcycle costing (V2 model).
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as { costing?: string };
    expect(body.costing).toBe('motorcycle');
  });

  it('returns matrix distance and time for road-distance lookups', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ sources_to_targets: [[{ distance: 8.4, time: 900 }]] }),
    );
    const provider = makeProvider(fetchImpl);
    const result = await provider.getRoadDistance(
      { lat: 9.05, lng: 7.49 },
      { lat: 9.01, lng: 7.43 },
    );
    expect(result.distanceKm).toBeCloseTo(8.4, 3);
    expect(result.durationMinutes).toBe(15);
  });

  it('throws no_results when the matrix cell has no route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ sources_to_targets: [[{ distance: null, time: null }]] }),
    );
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.getRoadDistance({ lat: 9.05, lng: 7.49 }, { lat: 9.01, lng: 7.43 }),
    ).rejects.toMatchObject({ code: 'no_results' });
  });
});
