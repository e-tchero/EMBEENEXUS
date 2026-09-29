import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/db/client-server';
import { getCurrentOffer } from '@/lib/services/dispatch-service';

/**
 * GET /api/rider/state — one authoritative snapshot of the rider's
 * operational position, every fact server-derived under RLS:
 *
 *   - verification status (rider_profiles)
 *   - availability declaration + queue clock (rider_availability)
 *   - the single active dispatch offer with its TTL (dispatch_offers)
 *   - the committed active order, if any (orders + rider assignment)
 *
 * The rider home renders from this alone; there is no client-side state
 * machine. Sensitive fields (OTPs, customer contact, financial splits) are
 * never selected here.
 */

interface OfferPayload {
  readonly offerId: string;
  readonly orderId: string;
  readonly expiresAt: string;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly roadDistanceM: number;
  readonly riderShareKobo: string;
}

interface ActiveOrderPayload {
  readonly orderId: string;
  readonly status: string;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly pickupLat: number;
  readonly pickupLng: number;
  readonly dropoffLat: number;
  readonly dropoffLng: number;
  readonly returnInitiated: boolean;
  readonly waitingStartedAt: string | null;
  readonly waitingChargeKobo: string;
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  const supabase = await createClient();

  // Role gate (customer navigating here gets forbidden, not rider data).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.userId)
    .maybeSingle();
  if ((profile as { role: string } | null)?.role !== 'rider') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  // Verification + availability (own rows; RLS-scoped).
  const [profileRow, availabilityRow] = await Promise.all([
    supabase
      .from('rider_profiles')
      .select('verification_status, verification_notes')
      .eq('id', session.userId)
      .maybeSingle(),
    supabase
      .from('rider_availability')
      .select('is_available, available_since')
      .eq('rider_id', session.userId)
      .maybeSingle(),
  ]);

  const verificationStatus =
    (profileRow.data as { verification_status: string } | null)?.verification_status ?? 'pending';
  const verificationNotes =
    (profileRow.data as { verification_notes: string | null } | null)?.verification_notes ?? null;
  const availability = availabilityRow.data as
    | { is_available: boolean; available_since: string | null }
    | null;

  // Active offer (service derives it with live TTL semantics; not_found ==
  // "no offer right now", which is a normal state).
  let offer: OfferPayload | null = null;
  const offerResult = await getCurrentOffer();
  if (offerResult.ok && offerResult.offer) {
    offer = {
      offerId: offerResult.offer.offerId,
      orderId: offerResult.offer.orderId,
      expiresAt: offerResult.offer.expiresAt,
      pickupAddress: offerResult.offer.pickupAddress,
      dropoffAddress: offerResult.offer.dropoffAddress,
      roadDistanceM: offerResult.offer.roadDistanceM,
      riderShareKobo: offerResult.offer.riderShareKobo,
    };
  } else if (offerResult.error && offerResult.error !== 'not_found') {
    const code = offerResult.error;
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }

  // Committed active order, if any (execution-window statuses).
  const ACTIVE_STATUSES = [
    'rider_assigned',
    'en_route_pickup',
    'arrived_pickup',
    'picked_up',
    'in_transit',
    'arrived_destination',
  ] as const;
  let activeOrder: ActiveOrderPayload | null = null;
  const { data: orderRow } = await supabase
    .from('orders')
    .select(
      'id, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, return_initiated_at, waiting_started_at, waiting_charge_kobo',
    )
    .eq('rider_id', session.userId)
    .in('status', [...ACTIVE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (orderRow as
    | Array<{
        id: string;
        status: string;
        pickup_address: string;
        dropoff_address: string;
        pickup_lat: number;
        pickup_lng: number;
        dropoff_lat: number;
        dropoff_lng: number;
        return_initiated_at: string | null;
        waiting_started_at: string | null;
        waiting_charge_kobo: string | number;
      }>
    | null)?.[0];
  if (row) {
    activeOrder = {
      orderId: row.id,
      status: row.status,
      pickupAddress: row.pickup_address,
      dropoffAddress: row.dropoff_address,
      pickupLat: row.pickup_lat,
      pickupLng: row.pickup_lng,
      dropoffLat: row.dropoff_lat,
      dropoffLng: row.dropoff_lng,
      returnInitiated: row.return_initiated_at !== null,
      waitingStartedAt: row.waiting_started_at,
      waitingChargeKobo: String(row.waiting_charge_kobo),
    };
  }

  return NextResponse.json(
    {
      ok: true,
      rider: {
        verificationStatus,
        verificationNotes,
        isAvailable: availability?.is_available ?? false,
        availableSince: availability?.available_since ?? null,
      },
      offer,
      activeOrder,
    },
    { status: 200 },
  );
}
