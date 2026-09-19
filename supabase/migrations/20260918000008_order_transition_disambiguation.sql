-- =============================================================================
-- Embee Nexus V2 — Migration 0008: order_transition overload disambiguation
-- =============================================================================
-- DEFECT (defect #5, found during M5 runtime verification):
--   Migrations 0006 and 0007 extended order_transition as separate OVERLOADS
--   with defaulted trailing parameters:
--     (uuid, text, text)                                — M3 original (0005)
--     (uuid, text, text, boolean DEFAULT false)         — M4 (0006)
--     (uuid, text, text, boolean DEFAULT false,
--                        boolean DEFAULT false)         — M5 (0007)
--   PostgreSQL cannot resolve calls with fewer than 5 arguments when
--   defaulted overloads overlap shorter signatures: every 2/3/4-argument
--   call fails with SQLSTATE 42725 ("function is not unique"). This broke
--   the customer lifecycle path AND M5's own internal dispatch calls.
--
-- FIX (empirically validated on the target engine, PostgreSQL 17.6):
--   CREATE OR REPLACE cannot remove parameter defaults from an existing
--   function (ERROR 42P13: "cannot remove parameter defaults from existing
--   function"; HINT: use DROP FUNCTION first). The correct mechanism is
--   DROP + CREATE with defaults removed. The engine experiment proved:
--     * plain DROP (no CASCADE) is safe — no object depends on either
--       overload (pg_depend: normal dependencies only);
--     * SECURITY DEFINER / search_path must be re-specified in CREATE;
--     * grants do NOT survive DROP+CREATE — the REVOKE/GRANT sections are
--       re-issued verbatim below;
--     * after removal, every arity (2/3/4/5) resolves to exactly one
--       candidate. The M3 3-arg function KEEPS its p_notes DEFAULT NULL
--       (untouched), which is what allows M5's 2-arg internal call shape
--       to resolve uniquely.
--
--   Additionally, 0007's internal dispatch calls used the 2-argument form,
--   which after disambiguation would resolve to the M3 3-arg body — that
--   body rejects the system actor (NOT_AUTHENTICATED) and has no real
--   guards, and the M5 body's own guards REQUIRE p_internal_dispatch=true.
--   dispatch_start / dispatch_accept are therefore recreated with their
--   bodies identical except that the two internal calls explicitly invoke
--   the 5-argument form with the internal dispatch flag set.
--
-- SAFETY: additive migration; no applied migration is modified; no CASCADE;
-- no state-machine, RLS, or application changes. Function bodies below are
-- byte-identical to 0006/0007 except for the noted parameter-default and
-- internal-call-arity corrections.
-- =============================================================================

drop function public.order_transition(uuid, text, text, boolean);
drop function public.order_transition(uuid, text, text, boolean, boolean);

-- -----------------------------------------------------------------------------
-- 4-argument form (M4 internal payment path). Body byte-identical to 0006;
-- the only change is removal of the DEFAULT clauses.
-- -----------------------------------------------------------------------------
create or replace function public.order_transition(
  p_order_id uuid,
  p_trigger  text,
  p_notes    text,
  p_internal_payment_verified boolean
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
    -- The system path is available only to the internal payment completion
    -- flow, which asserts the payment fact before calling. Any other
    -- unauthenticated caller fails at the transition-table authorization
    -- below ('system' never matches a client actor resolution).
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
  -- Static transition table (mirrors lib/domain/order-state.ts). The
  -- payment_verified guard is now REAL: satisfied only via the internal
  -- flag, which only payment_complete_verified (service-role) passes after
  -- verifying the provider transaction.
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

      -- 'system' actor is exclusively the internal payment path.
      if v_actor = 'system' then
        if p_trigger <> 'payment_verified' or p_internal_payment_verified is not true then
          raise exception 'FORBIDDEN';
        end if;
        -- Additional defense: the order MUST have a successful verified payment.
        if not exists (
          select 1 from public.payments pm
          where pm.order_id = v_order.id
            and pm.status = 'successful'
            and pm.verified_amount_kobo = pm.expected_amount_kobo
        ) then
          raise exception 'PREREQUISITE_MISSING';
        end if;
      elsif not (v_row.actors @> array[v_actor]) then
        raise exception 'FORBIDDEN';
      end if;

      if v_guard is not null and v_actor <> 'system' then
        -- Guards other than payment (OTP/recipient) still have no fact
        -- source in M4; remain unreachable from the client path.
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

  raise exception 'INVALID_TRANSITION';
end;
$$;

revoke all on function public.order_transition(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.order_transition(uuid, text, text, boolean)
  to authenticated;
-- Preserve the M3 3-arg call signature availability.
grant execute on function public.order_transition(uuid, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 5-argument form (M5 dispatch path). Body byte-identical to 0007; the only
-- change is removal of the DEFAULT clauses.
-- -----------------------------------------------------------------------------
create or replace function public.order_transition(
  p_order_id uuid,
  p_trigger  text,
  p_notes    text,
  p_internal_payment_verified boolean,
  p_internal_dispatch boolean
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
-- dispatch_start (M5). Body byte-identical to 0007 except the internal
-- transition call now explicitly invokes the 5-argument dispatch path.
-- -----------------------------------------------------------------------------
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
  perform public.order_transition(p_order_id, 'dispatch_started', null, false, true);

  return 'dispatch_started';
end;
$$;

revoke all on function public.dispatch_start(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- dispatch_accept (M5). Body byte-identical to 0007 except the internal
-- transition call now explicitly invokes the 5-argument dispatch path.
-- -----------------------------------------------------------------------------
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
