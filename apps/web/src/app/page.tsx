import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      {/* Founder-supplied primary mark (public/brand/FULL_COLOR.png), rendered at display size. */}
      <img
        src="/brand/FULL_COLOR.png"
        alt="Embee Nexus logo"
        width={64}
        height={64}
        className="rounded-(--radius-control)"
      />
      <h1 className="text-3xl font-extrabold tracking-tight">
        <span className="font-extrabold">EMBEE</span>{' '}
        <span className="font-light tracking-[0.28em]">NEXUS</span>
      </h1>
      <p className="max-w-md text-sm text-(--foreground-muted)">
        Motorcycle delivery for Abuja: verified riders, OTP-secured handovers,
        photo evidence, and the full price before you pay.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="min-h-11 rounded-lg bg-(--action-ink) px-4 py-2 text-sm font-medium text-white hover:bg-(--action-ink-hover)"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="min-h-11 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
