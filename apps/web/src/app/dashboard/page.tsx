import type { Metadata } from 'next';

import { requireUser } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/db/client-server';

import { DashboardClient, type OrderListItem } from './dashboard-client';

export const metadata: Metadata = {
  title: 'Your deliveries',
  robots: { index: false },
};

interface OrderRow {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  customer_price_kobo: string | number;
  created_at: string;
}

/**
 * Customer dashboard (pilot scope).
 *
 * Server component: the RLS-bound client reads only the signed-in
 * customer's own orders — an invisible row is indistinguishable from a
 * missing one. The dashboard is the customer's landing surface after
 * sign-in: start a delivery, or track an existing one.
 */
export default async function DashboardPage() {
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select(
      'id, status, pickup_address, dropoff_address, customer_price_kobo, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  const orders: OrderListItem[] = ((data ?? []) as OrderRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    pickupAddress: row.pickup_address,
    dropoffAddress: row.dropoff_address,
    customerPriceKobo: String(row.customer_price_kobo),
    createdAt: row.created_at,
  }));

  // Re-resolve the session for the email display (requireUser already
  // verified it exists).
  const current = await getSession();

  return <DashboardClient orders={orders} email={current?.email ?? null} />;
}
