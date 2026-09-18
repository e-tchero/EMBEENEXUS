-- =============================================================================
-- Embee Nexus V2 — Migration 0005: Quotes, Orders, and Order Lifecycle
-- =============================================================================
-- M3 foundation:
--   * quotes       — immutable server-generated price snapshots with expiry;
--                    consumed exactly once (order-creation idempotency anchor)
--   * orders       — order persistence with an immutable financial snapshot
--                    and server-authoritative lifecycle state
--   * order_events — append-only lifecycle history (audit)
--   * create_quote / create_order_from_quote / order_transition — SECURITY
--                    DEFINER RPCs that own all mutation paths
--
-- SECURITY MODEL
--   * Clients hold SELECT grants only; every write flows through an RPC that
--     resolves the caller via auth.uid() and re-derives authority server-side.
--   * Prices are re-derived from the ACTIVE pricing config inside create_quote;
--     client-supplied amounts are never trusted or even accepted.
--   * Transitions are validated against the M0 state-machine table (mirrored
--     here), serialized with FOR UPDATE row locks, and event-logged atomically.
--   * Guards whose fact sources do not exist yet (payment verification M4,
--     OTPs/recipient confirmation M6) are UNREACHABLE in M3 by design.
--
-- FOUNDER-PENDING (documented default, not an invented rule):
--   * Quote validity: 45 minutes (QUOTE_VALIDITY_MINUTES). No founder decision
--     exists for quote validity (related to D09/D10); this is an explicit,
--     single-site implementation default flagged for ratification.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. QUOTES — immutable server-generated price snapshots
-- -----------------------------------------------------------------------------

create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles (id) on delete cascade,
  -- Endpoint snapshots (the customer's chosen points at quote time).
  pickup_lat      double precision not null,
  pickup_lng      double precision not null,
  pickup_address  text not null check (char_length(pickup_address) between 1 and 300),
  dropoff_lat     double precision not null,
  dropoff_lng     double precision not null,
  dropoff_address text not null check (char_length(dropoff_address) between 1 and 300),
  -- Server-measured road distance (metres) from the maps provider.
  road_distance_m integer not null check (road_distance_m > 0 and road_distance_m <= 35000),
  -- Immutable pricing snapshot (re-derived server-side at creation).
  pricing_config_id uuid not null references public.pricing_configs (id),
  pricing_version   integer not null,
  customer_price_kobo bigint not null check (customer_price_kobo > 0),
  rider_share_kobo    bigint not null check (rider_share_kobo > 0),
  platform_share_kobo bigint not null check (platform_share_kobo > 0),
  constraint quotes_split_70_30 check (
    rider_share_kobo + platform_share_kobo = customer_price_kobo
    and rider_share_kobo * 10 = customer_price_kobo * 7
  ),
  -- Coverage was verified server-side before the snapshot was stored.
  coverage_verified boolean not null default true check (coverage_verified),
  -- Lifecycle of the quote itself: active → consumed | expired.
  status   text not null default 'active' check (status in ('active', 'consumed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint quotes_validity_window check (expires_at > created_at)
);

comment on table public.quotes is
  'Immutable price snapshots. Created only via create_quote (server re-prices from the active config); consumed exactly once by create_order_from_quote.';

create index quotes_customer_idx on public.quotes (customer_id, created_at desc);
create index quotes_active_idx on public.quotes (customer_id, status) where status = 'active';

-- -----------------------------------------------------------------------------
-- 2. ORDERS — lifecycle state + immutable financial snapshot
-- -----------------------------------------------------------------------------

create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  -- 1:1 with the quote it was created from; the unique constraint is the
  -- database-level idempotency anchor for order creation.
  quote_id    uuid not null unique references public.quotes (id),
  -- Endpoint snapshots (copied from the quote at creation; never updated).
  pickup_lat      double precision not null,
  pickup_lng      double precision not null,
  pickup_address  text not null check (char_length(pickup_address) between 1 and 300),
  dropoff_lat     double precision not null,
  dropoff_lng     double precision not null,
  dropoff_address text not null check (char_length(dropoff_address) between 1 and 300),
  road_distance_m integer not null check (road_distance_m > 0 and road_distance_m <= 35000),
  -- Immutable financial snapshot (mirrors the quote; the ledger, not this
  -- table, remains the financial system of record from M8).
  pricing_config_id uuid not null references public.pricing_configs (id),
  pricing_version   integer not null,
  customer_price_kobo bigint not null check (customer_price_kobo > 0),
  rider_share_kobo    bigint not null check (rider_share_kobo > 0),
  platform_share_kobo bigint not null check (platform_share_kobo > 0),
  constraint orders_split_70_30 check (
    rider_share_kobo + platform_share_kobo = customer_price_kobo
    and rider_share_kobo * 10 = customer_price_kobo * 7
  ),
  -- Lifecycle state (mirrors lib/domain/order-state.ts).
  status text not null default 'draft'
    check (status in (
      'draft', 'awaiting_payment', 'payment_verified', 'searching_rider',
      'rider_assigned', 'en_route_pickup', 'arrived_pickup', 'picked_up',
      'in_transit', 'arrived_destination', 'delivered', 'completed',
      'cancelled', 'failed', 'under_review'
    )),
  -- Assignment (populated from M5 dispatch; NULL until then). Rider actions
  -- require rider_id = caller, so riders cannot act on unassigned orders.
  rider_id uuid references public.rider_profiles (id) on delete set null,
  -- Hold support: the state to return to when an operator releases a review.
  pre_hold_status text,
  -- Terminal metadata.
  cancellation_reason text,
  failure_reason      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is
  'Delivery orders with server-authoritative lifecycle state and immutable financial snapshot. All mutations flow through RPCs; clients hold SELECT only.';

create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_rider_idx on public.orders (rider_id) where rider_id is not null;
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. ORDER EVENTS — append-only lifecycle history
-- -----------------------------------------------------------------------------

create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  -- 'none' for the creation event.
  previous_status text not null,
  new_status      text not null,
  trigger         text not null,
  actor_id   uuid references auth.users (id) on delete set null,
  -- Domain actor (customer/rider/seller/operator/system/recipient).
  actor_role text not null check (actor_role in
    ('customer', 'rider', 'seller', 'operator', 'system', 'recipient')),
  notes text check (notes is null or char_length(notes) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.order_events is
  'Append-only lifecycle history. No update/delete policies exist for any role; no client has write grants.';

create index order_events_order_idx on public.order_events (order_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. RPC — create_quote
-- -----------------------------------------------------------------------------

create or replace function public.create_quote(
  p_pickup_lat      double precision,
  p_pickup_lng      double precision,
  p_pickup_address  text,
  p_dropoff_lat     double precision,
  p_dropoff_lng     double precision,
  p_dropoff_address text,
  -- Server-measured road distance from the maps provider (service layer).
  p_road_distance_m integer
)
returns table (
  quote_id            uuid,
  road_distance_m     integer,
  customer_price_kobo bigint,
  rider_share_kobo    bigint,
  platform_share_kobo bigint,
  expires_at          timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_config  public.pricing_configs;
  v_band    public.pricing_bands;
  v_validity constant integer := 45; -- QUOTE_VALIDITY_MINUTES (founder-pending)
  v_expires timestamptz;
  v_quote   public.quotes;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- M3 scope: customers create quotes. Seller flows arrive in M9.
  if public.has_role(v_caller, 'customer') is not true then
    raise exception 'FORBIDDEN';
  end if;

  -- Bounded, valid inputs.
  if p_pickup_address is null or p_dropoff_address is null
     or char_length(p_pickup_address) not between 1 and 300
     or char_length(p_dropoff_address) not between 1 and 300
     or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180
     or p_dropoff_lat not between -90 and 90 or p_dropoff_lng not between -180 and 180
     or p_road_distance_m is null or p_road_distance_m < 1 or p_road_distance_m > 35000 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Coverage: both endpoints must lie inside active zones (server-side PostGIS).
  if not public.is_point_covered(p_pickup_lat, p_pickup_lng)
     or not public.is_point_covered(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'OUT_OF_COVERAGE';
  end if;

  -- Server-authoritative pricing: re-derive from the ACTIVE config. The
  -- distance comes from our maps provider; the money comes from the database.
  select pc.* into v_config
  from public.pricing_configs pc
  where pc.is_active
  limit 1;

  if v_config.id is null then
    raise exception 'PRICING_UNAVAILABLE';
  end if;

  -- Band semantics: (min, max] with the first band including 0 m.
  select pb.* into v_band
  from public.pricing_bands pb
  where pb.pricing_config_id = v_config.id
    and (
      (pb.min_distance_m = 0 and p_road_distance_m >= pb.min_distance_m)
      or p_road_distance_m > pb.min_distance_m
    )
    and p_road_distance_m <= pb.max_distance_m
  limit 1;

  if v_band.id is null then
    raise exception 'NO_BAND_FOR_DISTANCE';
  end if;

  v_expires := now() + make_interval(mins => v_validity);

  insert into public.quotes (
    customer_id,
    pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address,
    road_distance_m,
    pricing_config_id, pricing_version,
    customer_price_kobo, rider_share_kobo, platform_share_kobo,
    coverage_verified, status, expires_at
  ) values (
    v_caller,
    p_pickup_lat, p_pickup_lng, p_pickup_address,
    p_dropoff_lat, p_dropoff_lng, p_dropoff_address,
    p_road_distance_m,
    v_config.id, v_config.version,
    v_band.customer_price_kobo, v_band.rider_share_kobo, v_band.platform_share_kobo,
    true, 'active', v_expires
  )
  returning * into v_quote;

  return query select
    v_quote.id, v_quote.road_distance_m, v_quote.customer_price_kobo,
    v_quote.rider_share_kobo, v_quote.platform_share_kobo, v_quote.expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC — create_order_from_quote (atomic consumption, idempotent)
-- -----------------------------------------------------------------------------

create or replace function public.create_order_from_quote(
  p_quote_id uuid
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_quote  public.quotes;
  v_order  public.orders;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the quote row: concurrent creations serialize here; the second
  -- caller re-reads the consumed status and fails cleanly.
  select q.* into v_quote
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if v_quote.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_quote.customer_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  if v_quote.status = 'expired' or (v_quote.status = 'active' and v_quote.expires_at <= now()) then
    update public.quotes set status = 'expired' where id = v_quote.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  if v_quote.status <> 'active' then
    raise exception 'QUOTE_NOT_ACTIVE';
  end if;

  -- Expired-but-not-yet-marked quotes cannot create orders.
  if v_quote.expires_at <= now() then
    update public.quotes set status = 'expired' where id = v_quote.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  insert into public.orders (
    customer_id, quote_id,
    pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address,
    road_distance_m,
    pricing_config_id, pricing_version,
    customer_price_kobo, rider_share_kobo, platform_share_kobo,
    status
  ) values (
    v_caller, v_quote.id,
    v_quote.pickup_lat, v_quote.pickup_lng, v_quote.pickup_address,
    v_quote.dropoff_lat, v_quote.dropoff_lng, v_quote.dropoff_address,
    v_quote.road_distance_m,
    v_quote.pricing_config_id, v_quote.pricing_version,
    v_quote.customer_price_kobo, v_quote.rider_share_kobo, v_quote.platform_share_kobo,
    'draft'
  )
  returning * into v_order;

  update public.quotes
  set status = 'consumed'
  where id = v_quote.id;

  insert into public.order_events (
    order_id, previous_status, new_status, trigger,
    actor_id, actor_role
  ) values (
    v_order.id, 'none', 'draft', 'order_created',
    v_caller, 'customer'
  );

  return query select v_order.id, v_order.status;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC — order_transition (server-authoritative lifecycle)
-- -----------------------------------------------------------------------------

create or replace function public.order_transition(
  p_order_id uuid,
  p_trigger  text,
  p_notes    text default null
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_actor  text;
  v_order  public.orders;
  v_next   text;
  v_guard  text;
  v_row    record;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_notes is not null and char_length(p_notes) not between 1 and 500 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Resolve the caller's domain actor from the database-owned role.
  if public.has_role(v_caller, 'customer') then
    v_actor := 'customer';
  elsif public.has_role(v_caller, 'rider') then
    v_actor := 'rider';
  elsif public.has_role(v_caller, 'operator') then
    v_actor := 'operator';
  elsif public.has_role(v_caller, 'seller') then
    v_actor := 'seller';
  else
    raise exception 'FORBIDDEN';
  end if;

  -- Lock the order row: transitions serialize; no lost updates.
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Ownership/assignment authorization.
  if v_actor = 'customer' and v_order.customer_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;
  if v_actor = 'rider' and (v_order.rider_id is null or v_order.rider_id <> v_caller) then
    raise exception 'FORBIDDEN';
  end if;
  if v_actor = 'seller' then
    -- Seller flows are M9; sellers hold no order-authority in M3.
    raise exception 'FORBIDDEN';
  end if;

  -- ---------------------------------------------------------------------------
  -- Operator review hold/release (exceptional states per the founder model:
  -- "Under Review may hold a delivery where payment state requires
  -- investigation"). Release returns the order to its pre-hold state.
  -- ---------------------------------------------------------------------------
  if p_trigger = 'hold_for_review' then
    if v_actor <> 'operator' then
      raise exception 'FORBIDDEN';
    end if;
    if v_order.status = 'under_review'
       or v_order.status in ('cancelled', 'failed', 'completed') then
      raise exception 'INVALID_TRANSITION';
    end if;

    update public.orders
    set pre_hold_status = v_order.status, status = 'under_review'
    where id = v_order.id;

    insert into public.order_events (
      order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
    ) values (
      v_order.id, v_order.status, 'under_review', 'hold_for_review', v_caller, v_actor, p_notes
    );

    return query select v_order.id, 'under_review'::text;
    return;
  end if;

  if p_trigger = 'release_from_review' then
    if v_actor <> 'operator' then
      raise exception 'FORBIDDEN';
    end if;
    if v_order.status <> 'under_review' or v_order.pre_hold_status is null
       or v_order.pre_hold_status in ('cancelled', 'failed', 'completed', 'under_review') then
      raise exception 'INVALID_TRANSITION';
    end if;

    v_next := v_order.pre_hold_status;
    update public.orders
    set pre_hold_status = null, status = v_next
    where id = v_order.id;

    insert into public.order_events (
      order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
    ) values (
      v_order.id, 'under_review', v_next, 'release_from_review', v_caller, v_actor, p_notes
    );

    return query select v_order.id, v_next;
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Static transition table (mirrors lib/domain/order-state.ts, M0):
  -- (from_status, trigger, to_status, actors, guard)
  -- Guards reference server-established facts whose sources arrive in
  -- M4 (payment) and M6 (OTPs, recipient confirmation) — unreachable in M3.
  -- ---------------------------------------------------------------------------
  for v_row in
    select v.from_status, v.trig, v.to_status, v.actors::text[], v.guard
    from (values
      ('draft','order_submitted','awaiting_payment','{customer}',null::text),
      ('awaiting_payment','payment_verified','payment_verified','{system}','payment_verified'),
      ('payment_verified','dispatch_started','searching_rider','{system}',null),
      ('searching_rider','rider_accepted_offer','rider_assigned','{rider,system}','rider_assigned'),
      ('rider_assigned','rider_departed','en_route_pickup','{rider}',null),
      ('en_route_pickup','rider_arrived_pickup','arrived_pickup','{rider}',null),
      ('arrived_pickup','pickup_otp_verified','picked_up','{rider}','pickup_otp_verified'),
      ('picked_up','rider_departed','in_transit','{rider}',null),
      ('in_transit','rider_arrived_destination','arrived_destination','{rider}',null),
      ('arrived_destination','delivery_otp_verified','delivered','{rider}','delivery_otp_verified'),
      ('delivered','recipient_confirmed','completed','{customer,recipient,system}','recipient_confirmed'),
      ('in_transit','delivery_failed','failed','{rider,operator}',null),
      ('arrived_destination','delivery_failed','failed','{rider,operator}',null),
      ('draft','cancel','cancelled','{customer,operator}',null),
      ('awaiting_payment','cancel','cancelled','{customer,operator}',null),
      ('payment_verified','cancel','cancelled','{customer,operator}',null),
      ('searching_rider','cancel','cancelled','{customer,operator}',null),
      ('rider_assigned','cancel','cancelled','{customer,operator}',null),
      ('en_route_pickup','cancel','cancelled','{customer,operator}',null),
      ('arrived_pickup','cancel','cancelled','{operator}',null),
      ('picked_up','cancel','cancelled','{operator}',null),
      ('in_transit','cancel','cancelled','{operator}',null::text)
    ) as v(from_status, trig, to_status, actors, guard)
  loop
    if v_row.from_status = v_order.status and v_row.trig = p_trigger then
      v_next  := v_row.to_status;
      v_guard := v_row.guard;
      if not (v_row.actors @> array[v_actor]) then
        raise exception 'FORBIDDEN';
      end if;
      if v_guard is not null then
        -- No fact source exists in M3 for any guarded transition.
        raise exception 'PREREQUISITE_MISSING';
      end if;

      update public.orders
      set status = v_next,
          cancellation_reason = case when v_next = 'cancelled' then coalesce(p_notes, 'cancelled by ' || v_actor) else cancellation_reason end,
          failure_reason      = case when v_next = 'failed'    then coalesce(p_notes, 'failed (' || v_actor || ')') else failure_reason end
      where id = v_order.id;

      insert into public.order_events (
        order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
      ) values (
        v_order.id, v_order.status, v_next, p_trigger, v_caller, v_actor, p_notes
      );

      return query select v_order.id, v_next;
      return;
    end if;
  end loop;

  -- No matching (current state, trigger) row: unknown trigger, wrong state,
  -- or an attempt to leave a terminal state.
  raise exception 'INVALID_TRANSITION';
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. PRIVILEGES
-- -----------------------------------------------------------------------------

revoke all on function public.create_quote(double precision, double precision, text, double precision, double precision, text, integer)
  from public, anon;
revoke all on function public.create_order_from_quote(uuid)
  from public, anon;
revoke all on function public.order_transition(uuid, text, text)
  from public, anon;

grant execute on function public.create_quote(double precision, double precision, text, double precision, double precision, text, integer)
  to authenticated;
grant execute on function public.create_order_from_quote(uuid)
  to authenticated;
grant execute on function public.order_transition(uuid, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RLS AND GRANTS
-- -----------------------------------------------------------------------------

alter table public.quotes       enable row level security;
alter table public.quotes       force row level security;
alter table public.orders       enable row level security;
alter table public.orders       force row level security;
alter table public.order_events enable row level security;
alter table public.order_events force row level security;

-- Quotes: owner and operators read; nobody writes directly.
create policy quotes_select_own_or_operator
  on public.quotes
  for select
  using (
    customer_id = auth.uid()
    or public.has_role(auth.uid(), 'operator')
  );

-- Orders: customer (owner), assigned rider, and operators read.
create policy orders_select_participants
  on public.orders
  for select
  using (
    customer_id = auth.uid()
    or rider_id = auth.uid()
    or public.has_role(auth.uid(), 'operator')
  );

-- Events: participants and operators read; immutable for everyone.
create policy order_events_select_participants
  on public.order_events
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (
          o.customer_id = auth.uid()
          or o.rider_id = auth.uid()
          or public.has_role(auth.uid(), 'operator')
        )
    )
  );

-- No INSERT/UPDATE/DELETE policies on any of the three tables.

revoke all on public.quotes       from anon, authenticated;
revoke all on public.orders       from anon, authenticated;
revoke all on public.order_events from anon, authenticated;
grant select on public.quotes       to authenticated;
grant select on public.orders       to authenticated;
grant select on public.order_events to authenticated;
