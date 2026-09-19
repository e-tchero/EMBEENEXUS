-- -----------------------------------------------------------------------------
-- 0010 — dispatch RPC name resolution (M5 runtime-verification corrective)
-- -----------------------------------------------------------------------------
-- Defect #7 (live-confirmed on the V2 verification engine):
--   public.dispatch_offer_next(uuid) declares
--     returns table (offer_id uuid, rider_id uuid, outcome text)
--   so `rider_id` is an implicit PL/pgSQL OUT variable; the three bare
--   `where rider_id = ...` references collide with the table column and fail
--   with SQLSTATE 42702 (column reference "rider_id" is ambiguous).
--   public.dispatch_accept(uuid) declares
--     returns table (order_id uuid, status text)
--   so `status` is an implicit OUT variable; the expired-offer finalize
--   (`where id = v_offer.id and status = 'offered'`) collides identically and
--   is reachable in the accept-vs-expiry race.
--
-- Remedy (same class and mechanism as 0009's initiate_payment fix, authorized
-- for that correction by the CTO): PL/pgSQL's documented
--   #variable_conflict use_column
-- placed immediately after `as $$`. In ALL FOUR collision sites the intended
-- referent is the TABLE column; the OUT variables are only ever populated via
-- `return query select ...` and never assigned directly, so use_column is
-- semantically exact.
--
-- Bodies are byte-identical to the authoritative sources:
--   dispatch_offer_next ← 20260918000007_rider_dispatch.sql
--   dispatch_accept     ← 20260918000008_order_transition_disambiguation.sql
-- (including dispatch_accept's explicit five-argument order_transition call).
-- Signatures, return types, SECURITY DEFINER, search_path, and grant postures
-- are unchanged; grants are re-issued verbatim as belt-and-braces.
-- -----------------------------------------------------------------------------

create or replace function public.dispatch_offer_next(
  p_order_id uuid
)
returns table (offer_id uuid, rider_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
-- dispatch_accept (M5). Body byte-identical to 0008 except the added
-- #variable_conflict use_column directive (defect #7b: bare `status` in the
-- expired-offer finalize collided with the returns-table OUT variable).
-- The explicit five-argument internal order_transition call is preserved.
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_accept(
  p_offer_id uuid
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
  perform public.order_transition(v_order.id, 'rider_accepted_offer', null, false, true);

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
