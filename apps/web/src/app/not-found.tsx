import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-neutral-500">The page you requested does not exist.</p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Go home
      </Link>
    </main>
  );
}
