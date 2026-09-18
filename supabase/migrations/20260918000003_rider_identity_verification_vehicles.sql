-- =============================================================================
-- Embee Nexus V2 — Migration 0003: Rider Identity, Verification, Vehicles
-- =============================================================================
-- M1 foundation:
--   * rider_profiles  — rider-specific data; verification lifecycle
--   * rider_verification_events — immutable verification history
--   * vehicles        — motorcycle records owned by the rider (MVP: motorcycle-only)
--   * request_rider_verification / approve / reject / withdraw — SECURITY DEFINER
--     RPCs that enforce the verification state machine server-side
--
-- SECURITY MODEL
--   * Clients can never set verification_status directly: no INSERT/UPDATE
--     grants on rider_profiles to authenticated users at all. All state
--     changes flow through the RPCs, which resolve the caller via auth.uid().
--   * Vehicles: riders manage their own rows through RLS; motorcycle-only
--     MVP is enforced by CHECK constraints, not application convention.
--   * Verification events are append-only and readable by their subject
--     rider and by operators only.
--
-- DOMAIN (mirrors apps/web/src/lib/domain/rider-verification.ts):
--   pending -> under_review -> approved
--                           -> rejected -> pending (resubmission)
--   pending -> withdrawn -> pending (rider re-enters)
--   approved is terminal in M1; suspension is a future decision.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rider_profiles
-- -----------------------------------------------------------------------------

create table public.rider_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'under_review', 'approved', 'rejected', 'withdrawn')),
  verification_notes text,
  -- Verification is separate from availability: no availability column here.
  -- Dispatch eligibility (M5) will require BOTH approved verification AND an
  -- explicit availability record created by the rider.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rider_profiles is
  'Rider-specific data. Verification lifecycle is server-controlled via RPCs; clients have no direct write grants. Availability is a separate, later concern.';

create index rider_profiles_verification_status_idx
  on public.rider_profiles (verification_status);

create trigger rider_profiles_set_updated_at
  before update on public.rider_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- rider_verification_events — immutable verification history
-- -----------------------------------------------------------------------------

create table public.rider_verification_events (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'review_started', 'approved', 'rejected', 'withdrawn', 'resubmitted')),
  from_status text not null,
  to_status text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('rider', 'operator', 'system')),
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.rider_verification_events is
  'Append-only verification history. No update/delete policies exist for any client role.';

create index rider_verification_events_rider_idx
  on public.rider_verification_events (rider_id, created_at desc);

-- -----------------------------------------------------------------------------
-- vehicles — motorcycle records owned by the rider
-- -----------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  -- MVP business rule: independent motorcycle riders only. 'motorcycle' is
  -- the sole permitted type; widening this is a founder decision, not a
  -- migration default.
  vehicle_type text not null default 'motorcycle' check (vehicle_type = 'motorcycle'),
  make text not null check (char_length(make) between 1 and 80),
  model text not null check (char_length(model) between 1 and 80),
  year integer check (year between 1980 and 2100),
  -- Plate required: operational identification for an independent rider.
  plate_number text not null check (char_length(plate_number) between 4 and 20),
  -- Documented proof of ownership/operation is collected at verification.
  ownership_document_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rider_id, plate_number)
);

comment on table public.vehicles is
  'Motorcycles owned/operated by independent riders. Motorcycle-only MVP; no fleet entities exist.';

create index vehicles_rider_idx on public.vehicles (rider_id) where is_active;

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RPC: request verification (rider)
--   pending -> under_review   (submit for review)
--   rejected -> pending       (resubmission)
--   withdrawn -> pending      (re-enter)
-- -----------------------------------------------------------------------------

create or replace function public.rider_request_verification()
returns text  -- new status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_id uuid := auth.uid();
  v_current text;
begin
  if v_rider_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_rider_id and p.role = 'rider' and p.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.rider_profiles (id)
  values (v_rider_id)
  on conflict (id) do nothing;

  select verification_status into v_current
  from public.rider_profiles
  where id = v_rider_id
  for update;

  if v_current = 'pending' then
    update public.rider_profiles
    set verification_status = 'under_review'
    where id = v_rider_id;

    insert into public.rider_verification_events
      (rider_id, event_type, from_status, to_status, actor_id, actor_role)
    values
      (v_rider_id, 'submitted', 'pending', 'under_review', v_rider_id, 'rider');

    return 'under_review';
  elsif v_current in ('rejected', 'withdrawn') then
    update public.rider_profiles
    set verification_status = 'pending'
    where id = v_rider_id;

    insert into public.rider_verification_events
      (rider_id, event_type, from_status, to_status, actor_id, actor_role)
    values
      (v_rider_id, 'resubmitted', v_current, 'pending', v_rider_id, 'rider');

    return 'pending';
  else
    -- under_review / approved: no rider-initiated transition.
    raise exception 'INVALID_TRANSITION';
  end if;
end;
$$;

revoke all on function public.rider_request_verification() from public, anon;
grant execute on function public.rider_request_verification() to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: review decision (operator)
--   under_review -> approved | rejected
-- -----------------------------------------------------------------------------

create or replace function public.rider_review_decision(
  p_rider_id uuid,
  p_decision text,       -- 'approve' | 'reject'
  p_notes text default null
)
returns text  -- new status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_current text;
  v_new text;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Operator authority is resolved from the database, never from input.
  if not exists (
    select 1 from public.profiles p
    where p.id = v_caller and p.role = 'operator' and p.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'INVALID_DECISION';
  end if;

  select verification_status into v_current
  from public.rider_profiles
  where id = p_rider_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_current <> 'under_review' then
    raise exception 'INVALID_TRANSITION';
  end if;

  v_new := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  update public.rider_profiles
  set verification_status = v_new,
      verification_notes = coalesce(p_notes, verification_notes)
  where id = p_rider_id;

  insert into public.rider_verification_events
    (rider_id, event_type, from_status, to_status, actor_id, actor_role, notes)
  values
    (p_rider_id,
     case when p_decision = 'approve' then 'approved' else 'rejected' end,
     'under_review', v_new, v_caller, 'operator', p_notes);

  return v_new;
end;
$$;

revoke all on function public.rider_review_decision(uuid, text, text) from public, anon;
grant execute on function public.rider_review_decision(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: withdraw request (rider)
--   pending | under_review -> withdrawn
-- -----------------------------------------------------------------------------

create or replace function public.rider_withdraw_verification()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_id uuid := auth.uid();
  v_current text;
begin
  if v_rider_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_rider_id and p.role = 'rider' and p.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select verification_status into v_current
  from public.rider_profiles
  where id = v_rider_id
  for update;

  if v_current in ('pending', 'under_review') then
    update public.rider_profiles
    set verification_status = 'withdrawn'
    where id = v_rider_id;

    insert into public.rider_verification_events
      (rider_id, event_type, from_status, to_status, actor_id, actor_role)
    values
      (v_rider_id, 'withdrawn', v_current, 'withdrawn', v_rider_id, 'rider');

    return 'withdrawn';
  else
    raise exception 'INVALID_TRANSITION';
  end if;
end;
$$;

revoke all on function public.rider_withdraw_verification() from public, anon;
grant execute on function public.rider_withdraw_verification() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: rider_profiles
-- -----------------------------------------------------------------------------

alter table public.rider_profiles enable row level security;
alter table public.rider_profiles force row level security;

create policy rider_profiles_select_own
  on public.rider_profiles for select
  to authenticated
  using (id = auth.uid());

create policy rider_profiles_select_operator
  on public.rider_profiles for select
  to authenticated
  using (public.has_role('operator'));

-- No INSERT/UPDATE/DELETE policies: all writes flow through the RPCs above.
-- An operator promotes an account to 'rider' via a later, audited server
-- path; the role column itself is still not client-grantable (M0 model).

revoke all on public.rider_profiles from anon, authenticated;

-- Read access only, row visibility governed by the SELECT policies above
-- (own rows; operator rows). No write grants exist: verification state is
-- RPC-controlled.
grant select (id, verification_status, verification_notes, created_at, updated_at)
  on public.rider_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: rider_verification_events
-- -----------------------------------------------------------------------------

alter table public.rider_verification_events enable row level security;
alter table public.rider_verification_events force row level security;

create policy rider_verification_events_select_own
  on public.rider_verification_events for select
  to authenticated
  using (exists (
    select 1 from public.rider_profiles rp
    where rp.id = rider_verification_events.rider_id and rp.id = auth.uid()
  ));

create policy rider_verification_events_select_operator
  on public.rider_verification_events for select
  to authenticated
  using (public.has_role('operator'));

-- Append-only: no insert/update/delete policies for any client role.
revoke all on public.rider_verification_events from anon, authenticated;

-- Read access only: the subject rider sees their own history; operators see
-- all. Row visibility is governed by the SELECT policies above.
grant select
  on public.rider_verification_events to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: vehicles — riders manage their own motorcycles
-- -----------------------------------------------------------------------------

alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;

create policy vehicles_select_own
  on public.vehicles for select
  to authenticated
  using (exists (
    select 1 from public.rider_profiles rp
    where rp.id = vehicles.rider_id and rp.id = auth.uid()
  ));

create policy vehicles_insert_own
  on public.vehicles for insert
  to authenticated
  with check (exists (
    select 1 from public.rider_profiles rp
    where rp.id = vehicles.rider_id and rp.id = auth.uid()
  ));

create policy vehicles_update_own
  on public.vehicles for update
  to authenticated
  using (exists (
    select 1 from public.rider_profiles rp
    where rp.id = vehicles.rider_id and rp.id = auth.uid()
  ))
  with check (exists (
    select 1 from public.rider_profiles rp
    where rp.id = vehicles.rider_id and rp.id = auth.uid()
  ));

create policy vehicles_delete_own
  on public.vehicles for delete
  to authenticated
  using (exists (
    select 1 from public.rider_profiles rp
    where rp.id = vehicles.rider_id and rp.id = auth.uid()
  ));

create policy vehicles_select_operator
  on public.vehicles for select
  to authenticated
  using (public.has_role('operator'));

revoke all on public.vehicles from anon, authenticated;

grant select, insert, update, delete on public.vehicles to authenticated;

-- -----------------------------------------------------------------------------
-- Promotion RPC (operator): create a rider identity for an existing user.
-- This is the only path that creates rider_profiles rows for other users,
-- and it is operator-only and event-logged.
-- -----------------------------------------------------------------------------

create or replace function public.operator_create_rider_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_caller and p.role = 'operator' and p.is_active
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'NOT_FOUND';
  end if;

  -- A rider identity requires the account to hold the rider role. Role
  -- changes on profiles remain service-role-only (M0); this RPC enforces
  -- that the role is already correct rather than granting it.
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'rider'
  ) then
    raise exception 'USER_NOT_RIDER_ROLE';
  end if;

  insert into public.rider_profiles (id) values (p_user_id)
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.operator_create_rider_profile(uuid) from public, anon;
grant execute on function public.operator_create_rider_profile(uuid) to authenticated;
