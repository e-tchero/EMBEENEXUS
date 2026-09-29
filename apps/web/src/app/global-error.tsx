'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white p-6 text-center text-neutral-900">
        <h1 className="text-2xl font-semibold">Application error</h1>
        <p className="text-sm text-(--foreground-muted)">
          The application failed to start correctly. Please try again.
        </p>
        <button
          onClick={reset}
          className="min-h-11 rounded-lg bg-(--action-ink) px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        {error.digest ? (
          <p className="text-xs text-(--foreground-muted)">Reference: {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
