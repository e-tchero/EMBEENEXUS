import { requireRole } from '@/lib/auth/guards';
import { getOperatorJobs } from '@/lib/services/operator-service';

/**
 * Jobs & health — background-job visibility and the real application health
 * check. No fabricated indicators: a value shown here was returned by the
 * health endpoint; absence is shown as absence.
 */
export default async function OperatorJobsPage() {
  await requireRole(['operator']);
  const result = await getOperatorJobs();

  const configuredLabels: Record<string, string> = {
    supabase: 'Supabase',
    serviceRole: 'Service-role DB operations',
    payments: 'Payments integration',
    maps: 'Maps integration',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Jobs &amp; health</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Background jobs run from an external scheduler through token/operator-gated, idempotent
          routes. No separate scheduler exists; this page is visibility only.
        </p>
      </header>

      {!result.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Job visibility unavailable ({result.error}).
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-700">Application health</h2>
            {result.jobs.appHealth ? (
              <>
                <p className="mt-2 text-sm">
                  Status:{' '}
                  <span className={result.jobs.appHealth.ok ? 'text-green-700' : 'text-red-700'}>
                    {result.jobs.appHealth.ok ? 'ok' : 'degraded / unreachable'}
                  </span>
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(result.jobs.appHealth.configured).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-neutral-200 p-2">
                      <dt className="text-xs text-neutral-500">{configuredLabels[key] ?? key}</dt>
                      <dd className={`text-sm font-medium ${value ? 'text-green-700' : 'text-red-700'}`}>
                        {value ? 'configured' : 'not configured'}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-neutral-500">
                  Booleans only — never configuration values or secrets.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Health check did not return.</p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-neutral-700">Background jobs</h2>
            {result.jobs.jobs.map((job) => (
              <div key={job.job} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="font-mono text-xs text-neutral-500">{job.route}</p>
                <p className="mt-1 text-sm text-neutral-900">{job.job}</p>
                <p className="mt-0.5 text-sm text-neutral-600">{job.purpose}</p>
                <p className="mt-1 text-xs text-neutral-500">{job.lastObservedSignal}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
