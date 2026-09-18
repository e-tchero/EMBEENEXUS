import 'server-only';

import { serverEnv } from '@/lib/env/server';

import { createStadiaMapsProvider, type StadiaMapsConfig } from './stadia-maps';
import type { MapsProvider } from './maps-provider';

/**
 * Maps provider factory (M2).
 *
 * The application depends on the `MapsProvider` interface only; this is the
 * single place where the concrete provider (Stadia Maps) is chosen and its
 * secret is injected. Swapping or adding providers touches this file alone
 * (ADR-0006).
 *
 * The provider is a stateless HTTP client — a module-level singleton avoids
 * re-reading env on every call without caching any provider payloads.
 */

let instance: MapsProvider | null = null;

function providerConfig(): StadiaMapsConfig {
  return {
    apiKey: serverEnv.STADIA_MAPS_API_KEY,
    // Defaults (timeout 8s, 3 attempts, 400ms backoff) live in the adapter;
    // overrides belong here if operational tuning is ever needed.
  };
}

export function getMapsProvider(): MapsProvider {
  if (!instance) {
    instance = createStadiaMapsProvider(providerConfig());
  }
  return instance;
}

/** Test-only: reset the singleton between tests. */
export function resetMapsProviderForTests(): void {
  instance = null;
}
