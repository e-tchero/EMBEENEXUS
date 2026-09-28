import type { Metadata } from 'next';

import { requireRole } from '@/lib/auth/guards';

import { NewOrderWizard } from './wizard';

export const metadata: Metadata = {
  title: 'New delivery',
  robots: { index: false },
};

/**
 * Customer new-delivery page. Server-side role gate: customers only
 * (operators/riders are redirected; unauthenticated users go to login).
 * The journey itself is the client wizard: locations → parcels → quote →
 * payment, backed entirely by the authoritative server APIs.
 */
export default async function NewOrderPage() {
  await requireRole(['customer']);
  return <NewOrderWizard />;
}
