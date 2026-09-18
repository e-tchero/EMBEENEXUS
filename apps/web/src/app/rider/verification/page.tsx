import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/db/client-server';

import { AddVehicleForm, VerificationActions } from './rider-forms';

/**
 * Rider verification (M1). Server-rendered state; actions are server actions
 * enforced by RPC + RLS. Availability/dispatch is intentionally absent —
 * verification alone never makes a rider operationally eligible.
 */
export default async function RiderVerificationPage() {
  const session = await requireRole(['rider']);
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('rider_profiles')
    .select('verification_status, verification_notes')
    .eq('id', session.userId)
    .maybeSingle();

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, make, model, year, plate_number')
    .eq('rider_id', session.userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const status = profile?.verification_status ?? 'pending';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Rider verification</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Verification is separate from availability. You become operationally eligible only
          after approval and, later, explicit availability (dispatch arrives in a future milestone).
        </p>
      </header>

      <section className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm">
          Status: <span className="font-mono text-xs">{status}</span>
        </p>
        {profile?.verification_notes ? (
          <p className="mt-2 text-sm text-neutral-500">Notes: {profile.verification_notes}</p>
        ) : null}
        <div className="mt-4">
          <VerificationActions status={status} />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold">Your motorcycle</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Independent riders own/operate their motorcycles (motorcycle-only MVP).
        </p>
        <ul className="mt-3 space-y-2">
          {(vehicles ?? []).map((vehicle) => (
            <li key={vehicle.id} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              {vehicle.make} {vehicle.model}
              {vehicle.year ? ` (${vehicle.year})` : ''} — <span className="font-mono text-xs">{vehicle.plate_number}</span>
            </li>
          ))}
          {(vehicles ?? []).length === 0 ? (
            <li className="text-sm text-neutral-500">No motorcycle recorded yet.</li>
          ) : null}
        </ul>
        <div className="mt-4">
          <AddVehicleForm />
        </div>
      </section>
    </main>
  );
}
