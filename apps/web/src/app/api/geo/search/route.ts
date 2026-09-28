import { NextResponse } from 'next/server';

import { addressSearchSchema } from '@embee/shared';

import { getSession } from '@/lib/auth/session';
import { getMapsProvider } from '@/lib/providers/maps';
import { MapsProviderError } from '@/lib/providers/maps-provider';

/**
 * POST /api/geo/search — address autocomplete for the customer wizard.
 *
 * The Stadia API key stays server-side: the browser sends a free-text query
 * and receives sanitized candidates (label + coordinates) only. This is a
 * UX convenience; the authoritative coverage/distance decision still happens
 * in the quote path (PostGIS + Stadia road distance server-side).
 *
 * Availability: the provider requires a configured key; without one the
 * route reports `unavailable` and the UI falls back to manual entry.
 */

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const parsed = addressSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const { query } = parsed.data;

  try {
    const maps = getMapsProvider();
    const results = await maps.searchAddresses(query);
    return NextResponse.json(
      {
        ok: true,
        candidates: results.slice(0, 5).map((result) => ({
          label: result.formattedAddress,
          lat: result.lat,
          lng: result.lng,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MapsProviderError) {
      // Autocomplete is a convenience: degrade to the manual-entry fallback
      // rather than surfacing provider internals to the browser.
      return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
    }
    throw error;
  }
}
