import { NextResponse } from 'next/server';

import { geocodePairSchema } from '@embee/shared';

import { getSession } from '@/lib/auth/session';
import { getMapsProvider } from '@/lib/providers/maps';
import { MapsProviderError } from '@/lib/providers/maps-provider';

/**
 * POST /api/geo/geocode — resolve typed pickup/destination addresses to
 * coordinates for the customer wizard.
 *
 * Used when the customer continues without geocoder suggestions or manual
 * coordinates (e.g. the search service was unavailable). The Stadia API key
 * stays server-side. This is a UX convenience; the authoritative
 * coverage/distance decision still happens in the quote path (PostGIS +
 * Stadia road distance server-side).
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

  const parsed = geocodePairSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const pickup = { address: parsed.data.pickupAddress };
  const dropoff = { address: parsed.data.dropoffAddress };

  const maps = getMapsProvider();
  try {
    const [pickupResult, dropoffResult] = await Promise.all([
      maps.geocode(pickup.address),
      maps.geocode(dropoff.address),
    ]);
    return NextResponse.json(
      {
        ok: true,
        pickup: { lat: pickupResult.lat, lng: pickupResult.lng },
        dropoff: { lat: dropoffResult.lat, lng: dropoffResult.lng },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MapsProviderError) {
      // Distinguish "we couldn't understand the address" from provider
      // outages so the customer knows whether re-typing can help.
      const code =
        error.code === 'no_results' || error.code === 'invalid_input'
          ? 'address_not_found'
          : 'unavailable';
      return NextResponse.json({ ok: false, error: code }, { status: 422 });
    }
    throw error;
  }
}
