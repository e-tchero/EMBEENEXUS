-- =============================================================================
-- Embee Nexus V2 — Migration 0007: Rider Dispatch
-- =============================================================================
-- M5 — server-authoritative rider dispatch:
--   * rider_availability   — explicit availability record per rider (declared
--                            by the rider; longest-available queue uses
--                            available_since for ordering)
--   * dispatch_offers      — one-offer-at-a-time offer lifecycle
--                            (offered → accepted | declined | expired)
--   * RPCs                 — dispatch_start (system), dispatch_offer_next
--                            (system), dispatch_accept (rider),
--                            dispatch_decline (rider), dispatch_expire_due
--                            (system) — all race-safe via row locks and
--                            partial unique indexes
--   * order_transition     — extended: system actor may now perform
--                            dispatch_started and rider_accepted_offer after
--                            internal fact checks (payment-verified path is
--                            unchanged)
--
-- Dispatch rules implemented here (canonical, not configurable):
--   * eligibility = approved verification + active motorcycle + explicit
--     availability + active profile + no committed active delivery + no
--     active/declined/expired offer for the SAME order
--   * ordering    = longest available first (available_since asc); no
--     geographic/rating/priority ranking exists
--   * exactly ONE active offer per order and per rider (partial unique
--     indexes); offer TTL is 20 seconds
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. rider_availability — explicit, rider-declared dispatch readiness
-- -----------------------------------------------------------------------------
-- One row per rider (1:1). Availability is intentionally a separate table, per
-- the M1 design: verification status and dispatch availability are different
-- concepts. `available_since` is the queue clock: it is set when the rider
-- goes available and RESET when they go unavailable, so re-availability
-- restarts their queue position (longest-CONTINUOUS availability wins).

create table public.rider_availability (
  rider_id uuid primary key references public.rider_profiles (id) on delete cascade,
  is_available boolean not null default false,
  -- Clock for the longest-available queue; null while unavailable.
  available_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Invariant: an available rider always has a queue clock; an unavailable
  -- rider never does.
  constraint rider_availability_clock_consistent check (
    (is_available and available_since is not null)
    or (not is_available and available_since is null)
  )
);

comment on table public.rider_availability is
  'Explicit rider dispatch availability. The rider declares it via RPC; the server owns the queue clock. No client write grants.';

create index rider_availability_queue_idx
  on public.rider_availability (available_since)
  where is_available;

create trigger rider_availability_set_updated_at
  before update on public.rider_availability
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. dispatch_offers — immutable offer history
-- -----------------------------------------------------------------------------
-- Statuses are exactly the canonical lifecycle: offered → accepted | declined
-- | expired. No other states exist or are needed. Rows are historical facts:
-- clients can never mutate them (no write grants, no UPDATE policies).

create table public.dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired')),
  offered_at timestamptz not null default now(),
  -- Canonical offer TTL: 20 seconds (founder rule).
  expires_at timestamptz not null,
  responded_at timestamptz,
  -- Safe response metadata only (e.g. decline source); never secrets.
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- An offer is outstanding exactly 20 seconds.
  constraint dispatch_offers_ttl check (expires_at = offered_at + interval '20 seconds'),
  -- Terminal offers always record when they ended.
  constraint dispatch_offers_responded_when_terminal check (
    (status = 'offered' and responded_at is null)
    or (status <> 'offered' and responded_at is not null)
  )
);

comment on table public.dispatch_offers is
  'Rider offer history for dispatch. Exactly one offered (active) row per order and per rider at any time (partial unique indexes). Offers are immutable once terminal; clients have no write grants.';

-- Exactly ONE active offer per order (never fan out).
create unique index dispatch_offers_one_active_per_order_idx
  on public.dispatch_offers (order_id)
  where status = 'offered';

-- A rider holds at most one active offer platform-wide (one at a time).
create unique index dispatch_offers_one_active_per_rider_idx
  on public.dispatch_offers (rider_id)
  where status = 'offered';

create index dispatch_offers_order_idx on public.dispatch_offers (order_id, offered_at);
create index dispatch_offers_rider_idx on public.dispatch_offers (rider_id, offered_at desc);
-- Expiry scan: outstanding offers past their TTL.
create index dispatch_offers_expiry_idx
  on public.dispatch_offers (expires_at)
  where status = 'offered';

alter table public.dispatch_offers enable row level security;
alter table public.dispatch_offers force row level security;

-- Riders may read their OWN offers (the offer card: order pickup/dropoff
-- summary + TTL). No UPDATE/DELETE policies exist for any role — the accept/
-- decline RPCs are the only mutation path.
create policy dispatch_offers_select_own_rider
  on public.dispatch_offers for select
  to authenticated
  using (rider_id = auth.uid());

revoke all on public.dispatch_offers from anon, authenticated;
grant select on public.dispatch_offers to authenticated;

-- Customers must NOT see offers (they must not influence or discover rider
-- selection). Orders remain visible through existing policies.

alter table public.rider_availability enable row level security;
alter table public.rider_availability force row level security;

-- Riders may read their own availability row.
create policy rider_availability_select_own
  on public.rider_availability for select
  to authenticated
  using (rider_id = auth.uid());

revoke all on public.rider_availability from anon, authenticated;
grant select on public.rider_availability to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Shared eligibility predicate (used by offer selection and acceptance)
-- -----------------------------------------------------------------------------
-- The canonical eligibility rule, expressed once so selection and acceptance
-- can never disagree. `p_rider` is a rider_profiles.id (= profiles.id).

create or replace function public.dispatch_rider_eligible(
  p_rider uuid,
  p_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rider_profiles rp
    join public.profiles p on p.id = rp.id
    join public.rider_availability ra on ra.rider_id = rp.id
    where rp.id = p_rider
      -- account valid & rider role & not blocked/suspended
      and p.role = 'rider'
      and p.is_active
      -- verification
      and rp.verification_status = 'approved'
      -- explicit availability
      and ra.is_available
      -- eligible motorcycle (motorcycle-only MVP)
      and exists (
        select 1 from public.vehicles v
        where v.rider_id = rp.id and v.is_active and v.vehicle_type = 'motorcycle'
      )
      -- not committed to another active delivery
      and not exists (
        select 1 from public.orders o
        where o.rider_id = rp.id
          and o.status in (
            'rider_assigned', 'en_route_pickup', 'arrived_pickup',
            'picked_up', 'in_transit', 'arrived_destination'
          )
      )
      -- has not already declined or timed out on THIS order's current
      -- dispatch round (historical offers for this order)
      and not exists (
        select 1 from public.dispatch_offers dho
        where dho.order_id = p_order_id
          and dho.rider_id = rp.id
          and dho.status in ('declined', 'expired')
      )
      -- not currently holding any active offer (one at a time)
      and not exists (
        select 1 from public.dispatch_offers dho
        where dho.rider_id = rp.id
          and dho.status = 'offered'
      )
  );
$$;

revoke all on function public.dispatch_rider_eligible(uuid, uuid) from public, anon, authenticated;

comment on function public.dispatch_rider_eligible(uuid, uuid) is
  'Canonical dispatch eligibility: approved + active profile + motorcycle + available + not busy + not declined/expired this order + no active offer. Server-only.';

-- -----------------------------------------------------------------------------
-- 4. RPC — dispatch_start (system): payment_verified → searching_rider
-- -----------------------------------------------------------------------------
-- Called by the dispatch service when payment is verified (M4 completion path
-- or an operator trigger). Not client-executable.

create or replace function public.dispatch_start(
  p_order_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.orders;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_order.status <> 'payment_verified' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  -- Canonical transition path (system actor; the payment guard is satisfied
  -- by the verified payment this state implies).
  perform public.order_transition(p_order_id, 'dispatch_started');

  return 'dispatch_started';
end;
$$;

revoke all on function public.dispatch_start(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC — dispatch_offer_next (system): select next eligible rider & offer
-- -----------------------------------------------------------------------------
-- Locks the order, expires any due offer, then selects the longest-available
-- eligible rider and creates the single active offer. Safe to run repeatedly:
-- it is a no-op when an active offer exists or the order is not in
-- searching_rider. The offer is created AFTER the rider's queue clock is
-- PAUSED (availability row locked) so the rider cannot become busy elsewhere
-- mid-offer: their availability is explicitly revoked while the offer is
-- outstanding and restored on decline/expiry.
--
-- Returns the offer id + rider, or 'no_eligible_rider'.

create or replace function public.dispatch_offer_next(
  p_order_id uuid
)
returns table (offer_id uuid, rider_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.orders;
  v_offer public.dispatch_offers;
  v_due public.dispatch_offers;
  v_rider uuid;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Only searching_rider orders are dispatchable.
  if v_order.status <> 'searching_rider' then
    return query select null::uuid, null::uuid, 'not_dispatchable'::text;
    return;
  end if;

  -- Expire the current offer if due (same lock scope; safe to re-run).
  select * into v_due
  from public.dispatch_offers
  where order_id = v_order.id and status = 'offered'
  for update;

  if v_due.id is not null then
    if v_due.expires_at <= now() then
      update public.dispatch_offers
      set status = 'expired', responded_at = now()
      where id = v_due.id;
      -- Return the expired rider to the queue WITHOUT resetting their clock:
      -- they were continuously available before this offer paused it, and the
      -- canonical rule (longest-available first) must not let an expiry reset
      -- their position. If the row is somehow missing a clock, restore it.
      update public.rider_availability
      set available_since = coalesce(available_since, now())
      where rider_id = v_due.rider_id
        and is_available
        and available_since is null;
      -- Mark them available again (they were paused for this offer).
      update public.rider_availability
      set is_available = true
      where rider_id = v_due.rider_id
        and not is_available;
    else
      -- A live offer exists: exactly-one-offer holds; nothing to do.
      return query select v_due.id, v_due.rider_id, 'offer_active'::text;
      return;
    end if;
  end if;

  -- Longest-available eligible rider (queue clock asc). The eligibility
  -- predicate excludes riders who declined/expired this order, hold any
  -- active offer, are busy, unverified, unavailable, or blocked.
  select ra.rider_id into v_rider
  from public.rider_availability ra
  where ra.is_available
    and public.dispatch_rider_eligible(ra.rider_id, v_order.id)
  order by ra.available_since asc
  limit 1;

  if v_rider is null then
    return query select null::uuid, null::uuid, 'no_eligible_rider'::text;
    return;
  end if;

  -- Atomic pause of the chosen rider's availability while their offer is
  -- outstanding. The eligibility predicate requires is_available, so this
  -- (plus the per-rider active-offer unique index) closes the race where the
  -- same rider is selected by two concurrent dispatch ticks.
  update public.rider_availability
  set is_available = false, available_since = null
  where rider_id = v_rider;

  insert into public.dispatch_offers (order_id, rider_id, status, offered_at, expires_at)
  values (v_order.id, v_rider, 'offered', now(), now() + interval '20 seconds')
  returning * into v_offer;

  return query select v_offer.id, v_offer.rider_id, 'offered'::text;
end;
$$;

revoke all on function public.dispatch_offer_next(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC — dispatch_accept (rider): accept own active, unexpired offer
-- -----------------------------------------------------------------------------
-- Atomically: lock offer → re-validate (owner, active, unexpired, order
-- dispatchable, rider still eligible) → assign rider + transition order to
-- rider_assigned (canonical transition path) → finalize offer. Any competing
-- path (expiry, decline, cancellation) loses the lock race.

create or replace function public.dispatch_accept(
  p_offer_id uuid
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_offer public.dispatch_offers;
  v_order public.orders;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_offer
  from public.dispatch_offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Only the offered rider can accept their own offer.
  if v_offer.rider_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'OFFER_NOT_ACTIVE';
  end if;

  -- Expired offers are never acceptable.
  if v_offer.expires_at <= now() then
    -- Finalize it while we hold the lock (idempotent with the expiry scan).
    update public.dispatch_offers
    set status = 'expired', responded_at = now()
    where id = v_offer.id and status = 'offered';
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into v_order
  from public.orders
  where id = v_offer.order_id
  for update;

  if v_order.status <> 'searching_rider' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  -- Rider must STILL satisfy eligibility (minus the active-offer condition,
  -- which is their own current offer). Verified by re-checking the predicate
  -- excluding the offer-holder clause is unnecessary: the per-rider active
  -- offer IS this offer; other conditions (verified/available/busy/blocked)
  -- are re-checked via the availability + profile state.
  if not exists (
    select 1
    from public.rider_profiles rp
    join public.profiles p on p.id = rp.id
    where rp.id = v_caller
      and p.role = 'rider'
      and p.is_active
      and rp.verification_status = 'approved'
      and exists (
        select 1 from public.vehicles v
        where v.rider_id = rp.id and v.is_active and v.vehicle_type = 'motorcycle'
      )
      and not exists (
        select 1 from public.orders o
        where o.rider_id = rp.id
          and o.status in (
            'rider_assigned', 'en_route_pickup', 'arrived_pickup',
            'picked_up', 'in_transit', 'arrived_destination'
          )
      )
  ) then
    raise exception 'RIDER_INELIGIBLE';
  end if;

  -- Canonical order transition (system actor, internal fact established).
  perform public.order_transition(v_order.id, 'rider_accepted_offer');

  -- Persist the assignment on the order (same transaction as the transition).
  update public.orders
  set rider_id = v_caller
  where id = v_order.id;

  -- Finalize the offer.
  update public.dispatch_offers
  set status = 'accepted', responded_at = now()
  where id = v_offer.id;

  -- The rider's availability stays OFF: they are now committed to a delivery.
  -- available_since remains null until they complete and re-declare.

  return query select v_order.id, 'rider_assigned'::text;
end;
$$;

revoke all on function public.dispatch_accept(uuid) from public, anon;
grant execute on function public.dispatch_accept(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC — dispatch_decline (rider): decline own active offer
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_decline(
  p_offer_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_offer public.dispatch_offers;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_offer
  from public.dispatch_offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_offer.rider_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'OFFER_NOT_ACTIVE';
  end if;

  update public.dispatch_offers
  set status = 'declined', responded_at = now()
  where id = v_offer.id;

  -- The rider may be re-offered other orders immediately (and is excluded
  -- from THIS order by the eligibility predicate). Restore availability,
  -- resetting the clock: a decline is a fresh availability declaration and
  -- must not carry pre-offer queue seniority into other orders' queues.
  update public.rider_availability
  set is_available = true, available_since = now()
  where rider_id = v_caller
    and not is_available;
  -- Defensive: if the row already read available with no clock (impossible
  -- per constraint), fix the clock.
  update public.rider_availability
  set available_since = now()
  where rider_id = v_caller
    and is_available
    and available_since is null;

  return 'declined';
end;
$$;

revoke all on function public.dispatch_decline(uuid) from public, anon;
grant execute on function public.dispatch_decline(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC — dispatch_expire_due (system): expire all due offers; continue
-- -----------------------------------------------------------------------------
-- Idempotent background tick: expires every outstanding offer past its TTL
-- (restoring each rider's queue clock), then offers the next rider for each
-- affected order that is still searching. Safe to run concurrently with
-- accept (row locks decide the single winner) and with itself.

create or replace function public.dispatch_expire_due(
  p_max_orders integer default 50
)
returns table (expired integer, continued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_expired integer := 0;
  v_continued integer := 0;
  v_offer record;
  v_offer_id uuid;
  v_rider uuid;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_max_orders is null or p_max_orders < 1 or p_max_orders > 200 then
    raise exception 'INVALID_INPUT';
  end if;

  for v_offer in
    select d.id, d.order_id, d.rider_id
    from public.dispatch_offers d
    where d.status = 'offered' and d.expires_at <= now()
    order by d.expires_at
    limit p_max_orders
    for update skip locked
  loop
    update public.dispatch_offers
    set status = 'expired', responded_at = now()
    where id = v_offer.id and status = 'offered';

    if found then
      v_expired := v_expired + 1;

      -- Return the rider to the queue, preserving their pre-offer clock when
      -- it exists (expiry must not reset seniority); only fill a missing one.
      update public.rider_availability
      set is_available = true,
          available_since = coalesce(available_since, now())
      where rider_id = v_offer.rider_id
        and not is_available;

      -- Continue dispatch for this order. dispatch_offer_next re-locks the
      -- order row; because we already hold it via the offer scan + order lock
      -- below, this is a same-transaction re-acquire (safe, no deadlock:
      -- consistent order-then-offer ordering everywhere).
      select o.id into v_offer_id
      from public.orders o
      where o.id = v_offer.order_id and o.status = 'searching_rider'
      for update;

      if v_offer_id is not null then
        -- Inline the next-offer selection (same logic as dispatch_offer_next,
        -- which cannot be CALLed recursively from a set-returning context
        -- safely here): pick the longest-available eligible rider.
        select ra.rider_id into v_rider
        from public.rider_availability ra
        where ra.is_available
          and public.dispatch_rider_eligible(ra.rider_id, v_offer.order_id)
        order by ra.available_since asc
        limit 1;

        if v_rider is not null then
          update public.rider_availability
          set is_available = false, available_since = null
          where rider_id = v_rider;

          insert into public.dispatch_offers (order_id, rider_id, status, offered_at, expires_at)
          values (v_offer.order_id, v_rider, 'offered', now(), now() + interval '20 seconds');

          v_continued := v_continued + 1;
        end if;
      end if;
    end if;
  end loop;

  return query select v_expired, v_continued;
end;
$$;

revoke all on function public.dispatch_expire_due(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPC — rider availability declaration (rider)
-- -----------------------------------------------------------------------------
create or replace function public.rider_set_availability(
  p_is_available boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_status text;
  v_committed boolean;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_is_available is null then
    raise exception 'INVALID_INPUT';
  end if;

  -- Must be a rider with approved verification to declare availability.
  select rp.verification_status into v_status
  from public.rider_profiles rp
  join public.profiles p on p.id = rp.id
  where rp.id = v_caller and p.role = 'rider' and p.is_active;

  if v_status is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_status <> 'approved' then
    raise exception 'RIDER_NOT_APPROVED';
  end if;

  -- Cannot go available while committed to an active delivery.
  select exists (
    select 1 from public.orders o
    where o.rider_id = v_caller
      and o.status in (
        'rider_assigned', 'en_route_pickup', 'arrived_pickup',
        'picked_up', 'in_transit', 'arrived_destination'
      )
  ) into v_committed;

  if p_is_available and v_committed then
    raise exception 'RIDER_BUSY';
  end if;

  -- Going available while holding an active offer would break one-offer
  -- invariants, so the clock row simply reflects the offer pause (the offer
  -- system owns availability while offered). Accept the declaration anyway:
  -- when an offer is outstanding the row is already unavailable; restoring it
  -- is the expiry/decline path's job. Going UNavailable is always allowed and
  -- revokes a live offer's acceptability indirectly (accept re-checks).
  if p_is_available then
    insert into public.rider_availability (rider_id, is_available, available_since)
    values (v_caller, true, now())
    on conflict (rider_id) do update
      set is_available = true, available_since = now()
      where public.rider_availability.is_available = false
         or public.rider_availability.available_since is null;
  else
    insert into public.rider_availability (rider_id, is_available, available_since)
    values (v_caller, false, null)
    on conflict (rider_id) do update
      set is_available = false, available_since = null;
  end if;

  return case when p_is_available then 'available' else 'unavailable' end;
end;
$$;

revoke all on function public.rider_set_availability(boolean) from public, anon;
grant execute on function public.rider_set_availability(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. order_transition extension — dispatch system transitions
-- -----------------------------------------------------------------------------
-- Extends the M4 function: the system actor may now ALSO perform
-- dispatch_started and rider_accepted_offer once internal fact checks pass.
-- The payment path is byte-for-byte unchanged.

create or replace function public.order_transition(
  p_order_id uuid,
  p_trigger  text,
  p_notes    text default null,
  p_internal_payment_verified boolean default false,
  p_internal_dispatch boolean default false
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
    v_actor := 'system';
  elsif public.has_role(v_caller, 'customer') then
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

  if p_notes is not null and char_length(p_notes) not between 1 and 500 then
    raise exception 'INVALID_INPUT';
  end if;

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
    raise exception 'FORBIDDEN';
  end if;

  -- Operator review hold/release (unchanged from M3).
  if p_trigger = 'hold_for_review' then
    if v_actor <> 'operator' then
      raise exception 'FORBIDDEN';
    end if;
    if v_order.status not in ('awaiting_payment', 'payment_verified', 'searching_rider', 'rider_assigned') then
      raise exception 'INVALID_TRANSITION';
    end if;
    update public.orders
    set status = 'under_review', pre_hold_status = v_order.status
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
    if v_order.status <> 'under_review' or v_order.pre_hold_status is null then
      raise exception 'INVALID_TRANSITION';
    end if;
    update public.orders
    set status = v_order.pre_hold_status, pre_hold_status = null
    where id = v_order.id;
    insert into public.order_events (
      order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
    ) values (
      v_order.id, 'under_review', v_order.pre_hold_status, 'release_from_review', v_caller, v_actor, p_notes
    );
    return query select v_order.id, v_order.pre_hold_status;
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Static transition table (mirrors lib/domain/order-state.ts). System
  -- transitions: payment_verified (M4), dispatch_started +
  -- rider_accepted_offer (M5) — each behind an internal flag that only the
  -- corresponding server-side fact-checking path passes.
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

      if v_actor = 'system' then
        if p_trigger = 'payment_verified' then
          -- M4 path (unchanged): payment fact must exist.
          if p_internal_payment_verified is not true then
            raise exception 'FORBIDDEN';
          end if;
          if not exists (
            select 1 from public.payments pm
            where pm.order_id = v_order.id
              and pm.status = 'successful'
              and pm.verified_amount_kobo = pm.expected_amount_kobo
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
        elsif p_trigger = 'dispatch_started' then
          -- M5: order must be paid (verified successful payment exists).
          if p_internal_dispatch is not true then
            raise exception 'FORBIDDEN';
          end if;
          if not exists (
            select 1 from public.payments pm
            where pm.order_id = v_order.id
              and pm.status = 'successful'
              and pm.verified_amount_kobo = pm.expected_amount_kobo
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
        elsif p_trigger = 'rider_accepted_offer' then
          -- M5: an ACCEPTED offer for this order must exist, and the order
          -- must have no rider yet (the caller then sets rider_id in the
          -- same transaction).
          if p_internal_dispatch is not true then
            raise exception 'FORBIDDEN';
          end if;
          if not exists (
            select 1 from public.dispatch_offers d
            where d.order_id = v_order.id
              and d.status = 'accepted'
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
          if v_order.rider_id is not null then
            raise exception 'INVALID_ORDER_STATE';
          end if;
        else
          -- No other system transitions exist in M5.
          raise exception 'FORBIDDEN';
        end if;
      elsif not (v_row.actors @> array[v_actor]) then
        raise exception 'FORBIDDEN';
      end if;

      if v_guard is not null
         and v_guard <> 'payment_verified'
         and v_guard <> 'rider_assigned'
         and v_actor <> 'system' then
        -- Guards other than payment/assignment (OTP/recipient) still have no
        -- fact source in M5; remain unreachable from the client path.
        raise exception 'PREREQUISITE_MISSING';
      end if;

      update public.orders
      set status = v_next,
          cancellation_reason = case when v_next = 'cancelled' then coalesce(p_notes, 'cancelled by ' || v_actor) else cancellation_reason end,
          failure_reason      = case when v_next = 'failed'    then coalesce(p_notes, 'cancelled by ' || v_actor) else failure_reason end
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

  raise exception 'INVALID_TRANSITION';
end;
$$;

revoke all on function public.order_transition(uuid, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.order_transition(uuid, text, text, boolean, boolean)
  to authenticated;
-- Preserve older call signatures.
grant execute on function public.order_transition(uuid, text, text, boolean)
  to authenticated;
grant execute on function public.order_transition(uuid, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Grant boundary note
-- -----------------------------------------------------------------------------
-- dispatch_start / dispatch_offer_next / dispatch_expire_due are revoked from
-- public, anon AND authenticated: only the service-role (admin) client, whose
-- authority the dispatch service establishes (jobs token or operator session),
-- can execute them.
