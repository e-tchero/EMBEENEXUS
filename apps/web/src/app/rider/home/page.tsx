import type { Metadata } from 'next';

import { requireRole } from '@/lib/auth/guards';

import { RiderHomeClient } from '../home-client';

export const metadata: Metadata = {
  title: 'Rider console',
  robots: { index: false },
};

/**
 * Rider operational home. Server-side gate: riders only — customers,
 * operators, and unauthenticated users never reach the console (the state
 * API re-checks the role independently; the UI is not the boundary).
 */
export default async function RiderHomePage() {
  await requireRole(['rider']);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-4">
      <h1 className="text-xl font-semibold tracking-tight">Rider console</h1>
      <RiderHomeClient />
    </main>
  );
}
