-- -----------------------------------------------------------------------------
-- 0011 — dispatch expiry-restore fix (M5 runtime-verification corrective)
-- -----------------------------------------------------------------------------
-- Defect #8 (live-confirmed on the V2 verification engine):
--   public.dispatch_offer_next's expiry-restore was a TWO-step sequence whose
--   first UPDATE was dead code (it required is_available = true, but the row
--   is PAUSED — is_available = false — while an offer is outstanding), so the
--   clock stayed null; the second UPDATE then flipped is_available = true with
--   available_since still null, violating the
--   rider_availability_clock_consistent CHECK (SQLSTATE 23514). Every dispatch
--   tick that encountered a due offer therefore failed.
--
-- Remedy (authorized): replace the two-step sequence with the single atomic
-- restoration already proven correct in dispatch_expire_due:
--   set is_available = true, available_since = coalesce(available_since, now())
-- Canonical behavior per CTO decision (§5): an expired offer restores rider
-- eligibility with a FRESH availability clock. (Pre-offer seniority
-- preservation across offer→expiry would require a separate schema/design
-- change and is explicitly out of scope; recorded as a design note.)
--
-- Body is byte-identical to migration 0010 except this restore region.
-- Signature, return type, #variable_conflict use_column, SECURITY DEFINER,
-- search_path, and the service-only grant posture are unchanged.
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
      -- Restore the expired rider in ONE atomic update (same proven pattern
      -- as dispatch_expire_due): availability flips and the clock is filled
      -- in the same statement, satisfying rider_availability_clock_consistent.
      -- Canonical decision: an expired offer restores eligibility with a
      -- fresh availability clock (pre-offer seniority is not preserved; the
      -- offer-pause clears the clock by design).
      update public.rider_availability
      set
        is_available = true,
        available_since = coalesce(available_since, now())
      where
        rider_id = v_due.rider_id
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
