import Link from 'next/link';

import { requireUser } from '@/lib/auth/guards';
import { signOutAction } from '@/lib/auth/actions';

/**
 * Authenticated landing page. M0 intentionally renders no domain data.
 * Role-scoped surfaces (customer/rider/seller/operator) are later milestones;
 * when they exist, routing forks on the server-resolved session role.
 */
export default async function DashboardPage() {
  const session = await requireUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Embee Nexus</h1>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
      </header>
      <section className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-medium">Signed in</p>
        <p className="mt-1 text-sm text-neutral-500">
          Role:{' '}
          <span className="font-mono text-xs">{session.role ?? 'unassigned'}</span>
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Role is resolved server-side from the database on every request. Role-scoped dashboards
          arrive in later milestones.
        </p>
      </section>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
    </main>
  );
}
