-- =============================================================================
-- Embee Nexus V2 — Migration 0001: Identity, Roles, RLS Baseline
-- =============================================================================
-- Establishes the identity foundation:
--   * extensions required by the platform (PostGIS for later milestones)
--   * public.profiles (1:1 with auth.users) with a database-owned role model
--   * automatic profile creation on signup (SECURITY DEFINER, locked search_path)
--   * non-recursive role helper functions for RLS policies
--   * baseline Row Level Security on profiles
--
-- SECURITY NOTES
--   * `profiles.role` is NEVER writable by end users. Only the service role
--     (trusted server code) may change roles. Signup defaults to 'customer';
--     privileged roles are granted exclusively through server-side,
--     audited administration (later milestone).
--   * The role helper is SECURITY DEFINER with a locked search_path so RLS
--     on profiles cannot recurse and the function cannot be hijacked.
-- =============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role text not null default 'customer'
    check (role in ('customer', 'rider', 'seller', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for every auth.users row. Role is database-owned; clients can never set it.';

create index profiles_role_idx on public.profiles (role);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Role helpers (used by RLS policies; non-recursive by design)
-- -----------------------------------------------------------------------------

-- Resolve the caller's role without triggering RLS recursion on profiles.
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_user_role() from public;
grant execute on function public.get_user_role() to authenticated;

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = required_role and is_active
  );
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Signup trigger: create a profile for every new auth user.
-- Role is forced to 'customer' regardless of client-supplied metadata so a
-- signup request can never self-assign a privileged role.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS on profiles
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Everyone may read only their own profile.
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Users may update only non-privileged fields of their own profile.
-- The column-level grant below prevents role changes even by table owner users.
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.get_user_role() and is_active);

-- Operators may read all profiles (operations support).
create policy profiles_select_operator
  on public.profiles for select
  to authenticated
  using (public.has_role('operator'));

-- No insert policy for users: creation happens via the SECURITY DEFINER trigger.
-- No delete policy: profiles are never removed directly.
-- No client update path grants the role column (see grants below).

-- -----------------------------------------------------------------------------
-- Privileges: least-privilege grants. The role column is intentionally NOT
-- granted to authenticated users, making client role changes impossible even
-- if a policy were misconfigured.
-- -----------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;

grant select (id, full_name, role, is_active, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name)
  on public.profiles to authenticated;
