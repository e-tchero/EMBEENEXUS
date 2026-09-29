import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/guards';
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
 * Post-sign-in landing, role-forked server-side: riders go to their
 * operational console; everyone else gets the customer dashboard. The
 * RLS-bound read below returns only the signed-in user's own orders.
 */
export default async function DashboardPage() {
  const session = await requireUser();
  if (session.role === 'rider') redirect('/rider/home');
  if (session.role === 'operator') redirect('/operator');

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

  return <DashboardClient orders={orders} email={session.email} />;
}
