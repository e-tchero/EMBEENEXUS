import Link from 'next/link';

import { requireRole } from '@/lib/auth/guards';

import type { ReactNode } from 'react';

/**
 * Operator console shell. Server-side authorization happens here and is
 * re-verified per page/action — navigation is never the security boundary.
 */
export default async function OperatorLayout({ children }: { children: ReactNode }) {
  await requireRole(['operator']);

  const links = [
    { href: '/operator', label: 'Overview' },
    { href: '/operator/orders', label: 'Orders' },
    { href: '/operator/riders', label: 'Riders' },
    { href: '/operator/jobs', label: 'Jobs & health' },
  ];

  return (
    <div className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Embee Operations</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-neutral-600 hover:text-neutral-900">
                {link.label}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className="ml-auto text-xs text-neutral-400 hover:text-neutral-600">
            Exit console
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
