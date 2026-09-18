import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/db/client-server';

import { ReviewForm } from './review-form';

/**
 * Operator rider review (M1) — the minimum authorization surface.
 * Operators see riders whose verification is under review and approve or
 * reject via RPC. Decisions are re-authorized in the database.
 */
export default async function OperatorRidersPage() {
  await requireRole(['operator']);
  const supabase = await createClient();

  const { data: riders } = await supabase
    .from('rider_profiles')
    .select('id, verification_status, verification_notes, updated_at')
    .in('verification_status', ['under_review'])
    .order('updated_at', { ascending: true });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Rider verification review</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Approve or reject submissions. Decisions are recorded in the immutable verification
          history.
        </p>
      </header>

      <section className="space-y-3">
        {(riders ?? []).map((rider) => (
          <div key={rider.id} className="rounded-xl border border-neutral-200 p-4">
            <p className="font-mono text-xs text-neutral-500">{rider.id}</p>
            <p className="mt-1 text-sm">
              Status: <span className="font-mono text-xs">{rider.verification_status}</span>
            </p>
            {rider.verification_notes ? (
              <p className="mt-1 text-sm text-neutral-500">Notes: {rider.verification_notes}</p>
            ) : null}
            <div className="mt-3">
              <ReviewForm riderId={rider.id} />
            </div>
          </div>
        ))}
        {(riders ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">No submissions awaiting review.</p>
        ) : null}
      </section>
    </main>
  );
}
