-- -----------------------------------------------------------------------------
-- 0012 — dispatch accept system-transition fix (M5 runtime-verification
--        corrective)
-- -----------------------------------------------------------------------------
-- Defect #9 (live-confirmed on the V2 verification engine):
--   dispatch_accept's final step —
--     perform public.order_transition(id, 'rider_accepted_offer', null, false, true)
--   — runs in RIDER actor context. The M3-era generic pre-guard in
--   order_transition (line 42) forbids ALL rider-actor transitions on orders
--   without an assigned rider (written for delivery-progress triggers where
--   the rider must already be assigned). rider_accepted_offer is the M5
--   ASSIGNMENT-CREATING transition: at accept time orders.rider_id is null by
--   definition, so the offered rider could never pass — the M5 acceptance
--   path was unreachable (P0001 FORBIDDEN).
--
-- Remedy (authorized): correct the operation sequence inside dispatch_accept
-- ONLY — order_transition is NOT modified, no guard is weakened:
--   1. all existing validations/locks unchanged (owner, active, unexpired,
--      order dispatchable, rider eligible)
--   2. the offer is FINALIZED ('offered' → 'accepted') BEFORE the transition,
--      satisfying the system path's accepted-offer prerequisite; the FOR UPDATE
--      row lock makes this race-free (a concurrent second accept observes
--      status <> 'offered' and fails through the existing OFFER_NOT_ACTIVE
--      path)
--   3. JWT claims are cleared TRANSACTION-LOCALLY
--        perform set_config('request.jwt.claims', '{}', true);
--      so auth.uid() resolves to null within THIS transaction and the
--      transition executes as the system actor through its purpose-built,
--      flag-protected path (p_internal_dispatch=true), which independently
--      re-verifies: an accepted offer exists, the order has no rider, and the
--      internal dispatch flag is set
--   4. the five-argument order_transition call is preserved verbatim
--   5. orders.rider_id = v_caller (same transaction, after the transition)
--
-- Any failure rolls the ENTIRE transaction back — including the offer
-- finalization, which returns to 'offered'.
--
-- Body is otherwise byte-identical to migration 0010 (including the
-- #variable_conflict use_column directive and explicit five-argument call).
-- Signature, return type, SECURITY DEFINER, search_path, and grant posture
-- are unchanged.
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

  -- Finalize the offer BEFORE the transition (authorized sequence change):
  -- the system transition path requires an ACCEPTED offer to exist, and the
  -- row lock makes a concurrent second accept fail through OFFER_NOT_ACTIVE.
  update public.dispatch_offers
  set status = 'accepted', responded_at = now()
  where id = v_offer.id;

  -- Clear JWT claims transaction-locally (authorized): auth.uid() resolves to
  -- null for the remainder of THIS transaction, so order_transition executes
  -- through its intended system-actor path. Transaction-local scope
  -- (is_local := true) means the caller's authentication is untouched outside
  -- this transaction.
  perform set_config('request.jwt.claims', '{}', true);

  -- Canonical order transition (system actor, internal fact established).
  perform public.order_transition(v_order.id, 'rider_accepted_offer', null, false, true);

  -- Persist the assignment on the order (same transaction as the transition).
  update public.orders
  set rider_id = v_caller
  where id = v_order.id;

  -- The rider's availability stays OFF: they are now committed to a delivery.
  -- available_since remains null until they complete and re-declare.

  return query select v_order.id, 'rider_assigned'::text;
end;
$$;

revoke all on function public.dispatch_accept(uuid) from public, anon;
grant execute on function public.dispatch_accept(uuid) to authenticated;
