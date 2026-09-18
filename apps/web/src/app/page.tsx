import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Embee Nexus</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Motorcycle delivery platform for Abuja. The V2 foundation is being built — authentication
        and domain services land first.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
