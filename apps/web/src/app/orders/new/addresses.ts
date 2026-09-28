'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from './api-helpers';

/** A resolved address candidate from the server-side geocoder. */
export interface AddressCandidate {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Debounced address autocomplete backed by /api/geo/search (Stadia via the
 * server — the API key never reaches the browser). Falls back gracefully:
 * the customer can always submit a typed address with manual coordinates
 * when the geocoder has no results or is unavailable.
 */
export function useAddressSearch(query: string): {
  candidates: AddressCandidate[];
  searching: boolean;
  unavailable: boolean;
  onSelection: () => void;
} {
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const latestQuery = useRef(query);

  useEffect(() => {
    latestQuery.current = query;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setCandidates([]);
      setSearching(false);
      setUnavailable(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<{ ok: true; candidates: AddressCandidate[] }>('/api/geo/search', {
        method: 'POST',
        body: { query: trimmed },
        signal: controller.signal,
      })
        .then((result) => {
          if (latestQuery.current === query) {
            setCandidates(result.candidates);
            setUnavailable(false);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (latestQuery.current !== query) return;
          // Geocoder unavailable: surface the fallback instead of blocking.
          setCandidates([]);
          setUnavailable(true);
          void error;
        })
        .finally(() => {
          if (latestQuery.current === query) setSearching(false);
        });
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const onSelection = useCallback(() => {
    setCandidates([]);
  }, []);

  return { candidates, searching, unavailable, onSelection };
}
