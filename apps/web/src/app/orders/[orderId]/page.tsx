import type { Metadata } from 'next';

import { requireUser } from '@/lib/auth/guards';

import { OrderStatusClient } from './order-status-client';

export const metadata: Metadata = {
  title: 'Your delivery',
  robots: { index: false },
};

/**
 * Customer order status page (tracking-lite).
 *
 * The server page gates authentication; the client polls the authoritative
 * order endpoint and renders real status progression only. Order data is
 * never manufactured client-side, and there is no GPS/rider-map simulation.
 */
export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireUser();
  const { orderId } = await params;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold tracking-tight">Your delivery</h1>
      <OrderStatusClient orderId={orderId} />
    </main>
  );
}
