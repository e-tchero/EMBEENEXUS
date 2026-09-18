import { NextResponse } from 'next/server';

import { createClient } from '@/lib/db/client-server';
import { getSession } from '@/lib/auth/session';

/**
 * GET /api/orders/[orderId] — order retrieval.
 * RLS enforces participant visibility (customer owner, assigned rider,
 * operator); an invisible order is indistinguishable from a missing one.
 */

interface OrderRow {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  customer_price_kobo: string | number;
  rider_share_kobo: string | number;
  platform_share_kobo: string | number;
  created_at: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select(
      'id, status, pickup_address, dropoff_address, customer_price_kobo, rider_share_kobo, platform_share_kobo, created_at',
    )
    .eq('id', orderId)
    .maybeSingle();

  const order = data as OrderRow | null;
  if (!order) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      status: order.status,
      pickupAddress: order.pickup_address,
      dropoffAddress: order.dropoff_address,
      customerPriceKobo: String(order.customer_price_kobo),
      riderShareKobo: String(order.rider_share_kobo),
      platformShareKobo: String(order.platform_share_kobo),
      createdAt: order.created_at,
    },
  });
}
