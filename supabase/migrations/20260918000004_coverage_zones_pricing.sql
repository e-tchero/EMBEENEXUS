-- =============================================================================
-- Embee Nexus V2 — Migration 0004: Coverage Zones and Fixed-Band Pricing
-- =============================================================================
-- M2 foundation:
--   * coverage_zones  — PostGIS polygons; operational data (Zone A seed),
--                       NOT hardcoded application logic
--   * pricing_configs — versioned configuration; exactly one active row
--                       (partial unique index)
--   * pricing_bands   — the five fixed distance bands + money in kobo
--   * is_point_covered(lat, lng) — SECURITY DEFINER RPC for point-in-zone
--                       checks used by later milestones (quote/order intake)
--
-- Money rule: all monetary values are BIGINT minor units (kobo). Never float.
-- A pricing change inserts a NEW config row and deactivates the old one;
-- future quotes/orders store an immutable snapshot and are never altered
-- retroactively by configuration changes.
--
-- Access model:
--   * anonymous/authenticated: SELECT only (coverage + prices are public data)
--   * writes: SECURITY DEFINER RPC restricted to operator role
-- =============================================================================

create extension if not exists postgis;

-- =============================================================================
-- 1. COVERAGE ZONES
-- =============================================================================

create table public.coverage_zones (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  -- 4326 (lng/lat) is the standard for geocoding input; geography keeps
  -- point-in-polygon simple and index-friendly.
  boundary       geography(polygon, 4326) not null,
  is_active      boolean not null default true,
  activated_at   timestamptz,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Boundary must be a closed, valid polygon; PostGIS validity guard.
  constraint coverage_zones_boundary_valid check (st_isvalid(boundary::geometry)),
  constraint coverage_zones_activation_pair check (
    (is_active and deactivated_at is null)
    or (not is_active)
  )
);

comment on table public.coverage_zones is
  'Operational coverage areas (MVP: Zone A, Abuja). Data, not code: zones are toggled by operators via RPC.';

-- Expression index: point-in-zone queries evaluate st_covers on the geometry
-- cast (PostGIS geography functions wrap geometry internals), so index the
-- cast to keep the lookup indexed.
create index coverage_zones_active_gix
  on public.coverage_zones using gist ((boundary::geometry))
  where is_active;

create index coverage_zones_active_lookup
  on public.coverage_zones (is_active);

-- updated_at maintenance (same helper as M0)
create trigger coverage_zones_set_updated_at
  before update on public.coverage_zones
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. PRICING CONFIGURATION
-- =============================================================================

create table public.pricing_configs (
  id             uuid primary key default gen_random_uuid(),
  version        integer not null unique,
  description    text not null,
  is_active      boolean not null default false,
  activated_at   timestamptz,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  constraint pricing_configs_activation_pair check (
    (is_active and deactivated_at is null)
    or (not is_active)
  )
);

comment on table public.pricing_configs is
  'Versioned pricing configuration. Only the active row is used for new quotes; historical rows remain for audit and snapshot provenance.';

create index pricing_configs_active_lookup
  on public.pricing_configs (is_active);

-- Exactly one active configuration at any time (partial unique index;
-- PostgreSQL does not allow WHERE clauses on table constraints).
create unique index pricing_configs_single_active
  on public.pricing_configs (is_active)
  where is_active;

create table public.pricing_bands (
  id                uuid primary key default gen_random_uuid(),
  pricing_config_id uuid not null references public.pricing_configs (id)
                    on delete cascade,
  -- Distance bounds in metres, integer arithmetic only. Interval semantics:
  -- (min_distance_m, max_distance_m] — a boundary distance belongs to the
  -- LOWER-priced band, per the founder table ('0–5 km' includes exactly
  -- 5 km; '>5–10 km' starts strictly above 5 km). The first band includes
  -- 0 m; the final band includes 35,000 m (maximum supported distance).
  min_distance_m    integer not null check (min_distance_m >= 0),
  max_distance_m    integer not null check (max_distance_m > min_distance_m),
  -- Customer price and rider earnings in kobo (integer minor units).
  customer_price_kobo bigint not null check (customer_price_kobo > 0),
  rider_share_kobo    bigint not null check (rider_share_kobo > 0),
  platform_share_kobo bigint not null check (platform_share_kobo > 0),
  -- The 70/30 split is an invariant of the current business model; the
  -- check documents it at the row level and survives ad-hoc data edits.
  constraint pricing_bands_split_70_30 check (
    rider_share_kobo + platform_share_kobo = customer_price_kobo
    and rider_share_kobo * 10 = customer_price_kobo * 7
  ),
  constraint pricing_bands_unique_bounds
    unique (pricing_config_id, min_distance_m, max_distance_m)
);

comment on table public.pricing_bands is
  'Fixed distance bands for a pricing config. Money in kobo; 70/30 rider/platform split enforced by constraint.';

create index pricing_bands_config_gix
  on public.pricing_bands (pricing_config_id, min_distance_m);

-- =============================================================================
-- 3. SEED — ZONE A (Abuja launch coverage) and PRICING v1
-- =============================================================================

-- Zone A neighbourhoods. Boundaries are approximate operational polygons;
-- the authoritative check is point-in-zone at quote time. WKT coordinates
-- are (lng lat) — X first — per SQL/MM convention.
with zones(name, wkt) as (
  values
    ('Wuse',        'POLYGON((7.4660 9.0930,7.5140 9.0930,7.5140 9.0700,7.4660 9.0700,7.4660 9.0930))'),
    ('Wuse 2',      'POLYGON((7.4700 9.0780,7.5000 9.0780,7.5000 9.0560,7.4700 9.0560,7.4700 9.0780))'),
    ('Maitama',     'POLYGON((7.4700 9.1000,7.5200 9.1000,7.5200 9.0740,7.4700 9.0740,7.4700 9.1000))'),
    ('CBD',         'POLYGON((7.4700 9.0560,7.5200 9.0560,7.5200 9.0300,7.4700 9.0300,7.4700 9.0560))'),
    ('Garki',       'POLYGON((7.4600 9.0300,7.5100 9.0300,7.5100 9.0000,7.4600 9.0000,7.4600 9.0300))'),
    ('Asokoro',     'POLYGON((7.5200 9.1000,7.5700 9.1000,7.5700 9.0500,7.5200 9.0500,7.5200 9.1000))'),
    ('Jabi',        'POLYGON((7.4000 9.1100,7.4500 9.1100,7.4500 9.0750,7.4000 9.0750,7.4000 9.1100))'),
    ('Utako',       'POLYGON((7.4000 9.0750,7.4450 9.0750,7.4450 9.0500,7.4000 9.0500,7.4000 9.0750))'),
    ('Mabushi',     'POLYGON((7.4450 9.1200,7.4800 9.1200,7.4800 9.0930,7.4450 9.0930,7.4450 9.1200))'),
    ('Wuye',        'POLYGON((7.4000 9.0500,7.4450 9.0500,7.4450 9.0250,7.4000 9.0250,7.4000 9.0500))'),
    ('Jahi',        'POLYGON((7.4200 9.1250,7.4550 9.1250,7.4550 9.1000,7.4200 9.1000,7.4200 9.1250))'),
    ('Kado',        'POLYGON((7.4100 9.1350,7.4450 9.1350,7.4450 9.1100,7.4100 9.1100,7.4100 9.1350))'),
    ('Katampe',     'POLYGON((7.3700 9.1250,7.4200 9.1250,7.4200 9.0900,7.3700 9.0900,7.3700 9.1250))'),
    ('Gwarinpa',    'POLYGON((7.3600 9.1500,7.4200 9.1500,7.4200 9.1000,7.3600 9.1000,7.3600 9.1500))'),
    ('Life Camp',   'POLYGON((7.3900 9.1000,7.4300 9.1000,7.4300 9.0700,7.3900 9.0700,7.3900 9.1000))'),
    ('Durumi',      'POLYGON((7.4300 9.0250,7.4700 9.0250,7.4700 9.0000,7.4300 9.0000,7.4300 9.0250))'),
    ('Apo',         'POLYGON((7.5000 9.0100,7.5400 9.0100,7.5400 8.9800,7.5000 8.9800,7.5000 9.0100))')
)
insert into public.coverage_zones (name, boundary, is_active, activated_at)
select
  name,
  st_geogfromtext(wkt, 4326),
  true,
  now()
from zones;

-- Pricing v1: the five founder bands. Bounds are (min, max] in metres —
-- boundary distances belong to the lower band; the final band is inclusive
-- at 35,000 m (maximum supported distance).
with cfg as (
  insert into public.pricing_configs (version, description, is_active, activated_at)
  values (1, 'Founder fixed bands — Abuja launch (70/30 split)', true, now())
  returning id
)
insert into public.pricing_bands (
  pricing_config_id, min_distance_m, max_distance_m,
  customer_price_kobo, rider_share_kobo, platform_share_kobo
)
select
  cfg.id,
  b.min_m, b.max_m,
  b.customer, b.rider, b.customer - b.rider
from cfg, (values
  (0,      5000,   220000, 154000),   -- 0–5 km      ₦2,200 → ₦1,540 / ₦660
  (5000,   10000,  260000, 182000),   -- >5–10 km    ₦2,600 → ₦1,820 / ₦780
  (10000,  15000,  300000, 210000),   -- >10–15 km   ₦3,000 → ₦2,100 / ₦900
  (15000,  25000,  360000, 252000),   -- >15–25 km   ₦3,600 → ₦2,520 / ₦1,080
  (25000,  35000,  430000, 301000)    -- >25–35 km   ₦4,300 → ₦3,010 / ₦1,290
) as b(min_m, max_m, customer, rider);

-- =============================================================================
-- 4. POINT-IN-ZONE RPC
-- =============================================================================

-- SECURITY DEFINER: anon clients must be able to ask "is this point covered?"
-- without any access to raw zone polygons beyond the boolean answer.
create or replace function public.is_point_covered(
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coverage_zones cz
    where cz.is_active
      and st_covers(
        cz.boundary,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      )
  );
$$;

revoke all on function public.is_point_covered(double precision, double precision)
  from public, anon;
grant execute on function public.is_point_covered(double precision, double precision)
  to anon, authenticated;

-- =============================================================================
-- 5. OPERATOR RPCs — zone activation and pricing version activation
-- =============================================================================

create or replace function public.operator_set_zone_active(
  p_zone_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null or public.has_role(v_caller, 'operator') is not true then
    raise exception 'operator role required' using errcode = '42501';
  end if;

  update public.coverage_zones
  set is_active      = p_is_active,
      activated_at   = case when p_is_active then now() else activated_at end,
      deactivated_at = case when p_is_active then null else now() end
  where id = p_zone_id;

  if not found then
    raise exception 'zone not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.operator_activate_pricing_config(
  p_config_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null or public.has_role(v_caller, 'operator') is not true then
    raise exception 'operator role required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.pricing_configs where id = p_config_id) then
    raise exception 'pricing config not found' using errcode = 'P0002';
  end if;

  -- Deactivate current, activate requested, in one transaction.
  update public.pricing_configs
  set is_active = false, deactivated_at = now()
  where is_active;

  update public.pricing_configs
  set is_active = true, activated_at = now(), deactivated_at = null
  where id = p_config_id;
end;
$$;

-- Future pricing versions are created by migration (schema-as-data discipline
-- for M2). Ad-hoc band inserts by operators are NOT enabled in this milestone;
-- when needed, a dedicated operator RPC will validate band completeness
-- (contiguous coverage 0–35 km) before activation.

revoke all on function public.operator_set_zone_active(uuid, boolean)
  from public, anon;
revoke all on function public.operator_activate_pricing_config(uuid)
  from public, anon;
grant execute on function public.operator_set_zone_active(uuid, boolean)
  to authenticated;
grant execute on function public.operator_activate_pricing_config(uuid)
  to authenticated;

-- =============================================================================
-- 6. RLS AND GRANTS
-- =============================================================================

alter table public.coverage_zones   enable row level security;
alter table public.coverage_zones   force row level security;
alter table public.pricing_configs  enable row level security;
alter table public.pricing_configs  force row level security;
alter table public.pricing_bands    enable row level security;
alter table public.pricing_bands    force row level security;

-- Coverage and pricing are public, non-sensitive operational data: read-only
-- for everyone (including anon — the customer flow needs coverage/price
-- before authentication), writable by nobody directly (RPCs only).

create policy coverage_zones_select_all
  on public.coverage_zones
  for select
  using (true);

create policy pricing_configs_select_all
  on public.pricing_configs
  for select
  using (true);

-- Bands are readable only alongside a config the reader can see (all, but the
-- join keeps the dependency explicit).
create policy pricing_bands_select_all
  on public.pricing_bands
  for select
  using (
    exists (
      select 1 from public.pricing_configs pc
      where pc.id = pricing_bands.pricing_config_id
    )
  );

-- No INSERT/UPDATE/DELETE policies: even the service role should prefer the
-- operator RPCs; migrations are the authoritative path for schema/seed data.

revoke all on public.coverage_zones   from anon, authenticated;
revoke all on public.pricing_configs  from anon, authenticated;
revoke all on public.pricing_bands    from anon, authenticated;
grant select on public.coverage_zones   to anon, authenticated;
grant select on public.pricing_configs  to anon, authenticated;
grant select on public.pricing_bands    to anon, authenticated;
