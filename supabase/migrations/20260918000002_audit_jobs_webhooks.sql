-- =============================================================================
-- Embee Nexus V2 — Migration 0002: Audit, Background Jobs, Webhook Idempotency
-- =============================================================================
-- Platform infrastructure shared by all later milestones:
--   * audit_logs      — append-only audit trail; readable by operators only
--   * background_jobs — durable job queue for cron-triggered workers
--   * webhook_events  — provider webhook record with DB-enforced idempotency
--
-- SECURITY MODEL
--   All three tables are written exclusively by trusted server code running
--   as the service role (webhook endpoints, background workers, privileged
--   administration). Row Level Security is forced ON with NO policies for
--   anon/authenticated users, so end users cannot read or write any of them
--   through the public API. No column grants are issued to client roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_logs — append-only audit trail
-- -----------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text check (actor_role in ('customer', 'rider', 'seller', 'operator', 'system')),
  action text not null check (char_length(action) <= 120),
  resource_type text not null check (char_length(resource_type) <= 80),
  -- text (rather than uuid) so non-uuid external references can be audited too
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail. Written only by trusted server code; readable only by operators. Never exposed to ordinary users.';

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Only operators may read audit logs. No insert/update/delete policies exist:
-- even operators cannot mutate the trail from the client surface.
create policy audit_logs_select_operator
  on public.audit_logs for select
  to authenticated
  using (public.has_role('operator'));

revoke all on public.audit_logs from anon, authenticated;

-- -----------------------------------------------------------------------------
-- background_jobs — durable job queue (processed by server workers)
-- -----------------------------------------------------------------------------

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (char_length(job_type) <= 120),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  priority smallint not null default 0,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  -- Optional idempotency key: prevents duplicate enqueue of the same logical job
  dedupe_key text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.background_jobs is
  'Durable job queue. Workers claim jobs with FOR UPDATE SKIP LOCKED in a later milestone.';

-- Work-ready queue scan.
create index background_jobs_queue_idx
  on public.background_jobs (priority desc, run_after)
  where status = 'pending';
-- Stale processing detection (crashed worker recovery).
create index background_jobs_processing_idx
  on public.background_jobs (started_at)
  where status = 'processing';
-- Idempotent enqueue: only one active job per (type, dedupe key).
create unique index background_jobs_dedupe_idx
  on public.background_jobs (job_type, dedupe_key)
  where dedupe_key is not null and status in ('pending', 'processing');

alter table public.background_jobs enable row level security;
alter table public.background_jobs force row level security;

-- No policies: jobs are invisible to all client roles.
revoke all on public.background_jobs from anon, authenticated;

-- -----------------------------------------------------------------------------
-- webhook_events — provider webhook records with enforced idempotency
-- -----------------------------------------------------------------------------

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('flutterwave')),
  event_type text not null,
  -- Provider's unique event/transaction identifier.
  provider_event_id text not null,
  -- Our internal reference (payment/order reference) when applicable.
  reference text,
  -- Set only after signature verification succeeded; rows are inserted within
  -- the same transaction that verifies the signature, so unverified rows
  -- should never exist. Kept as an explicit, auditable fact.
  signature_verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'duplicate')),
  processed_at timestamptz,
  last_error text,
  received_at timestamptz not null default now()
);

comment on table public.webhook_events is
  'Every accepted webhook delivery, exactly once per provider event. The unique constraint on (provider, provider_event_id) makes replayed webhooks a database-level no-op.';

create unique index webhook_events_provider_event_idx
  on public.webhook_events (provider, provider_event_id);
create index webhook_events_reference_idx on public.webhook_events (reference);
create index webhook_events_unprocessed_idx
  on public.webhook_events (received_at)
  where processing_status in ('received', 'processing', 'failed');

alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;

-- No policies: webhook payloads are sensitive and never client-readable.
revoke all on public.webhook_events from anon, authenticated;
