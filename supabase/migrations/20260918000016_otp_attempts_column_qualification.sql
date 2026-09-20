-- =============================================================================
-- Embee Nexus V2 — Migration 0016: OTP attempts column qualification
-- =============================================================================
-- DEFECT (found during the M6 hosted verification gate, immediately after 0015):
--   RETURNS TABLE (..., attempts integer) introduces an implicit PL/pgSQL
--   variable named `attempts`, so the unqualified reference inside
--     update public.order_otp_codes set attempts = attempts + 1 ... returning attempts
--   raised SQLSTATE 42702 ("column reference attempts is ambiguous") at
--   runtime — the failed-attempt counter still could not persist.
--
-- FIX: qualify every reference through the table alias (additive migration;
-- 0015 remains as applied — migration history is never rewritten). Function
-- signature, semantics, and the 0015 outcome contract are unchanged.
-- =============================================================================

create or replace function public.verify_order_otp(
  p_order_id uuid,
  p_kind     text,
  p_code     text
)
returns table (order_id uuid, status text, otp_status text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_order   public.orders;
  v_otp     public.order_otp_codes;
  v_trigger text;
  v_attempts integer;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_kind not in ('pickup', 'delivery') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    raise exception 'INVALID_INPUT';
  end if;

  if not public.has_role(v_caller, 'rider') then
    raise exception 'FORBIDDEN';
  end if;

  -- Row lock: concurrent submissions (same rider, same OTP, duplicate
  -- requests) serialize here; only one consumption can win.
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Authorized rider, correct order only.
  if v_order.rider_id is null or v_order.rider_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  -- Correct transition binding: pickup code only at arrived_pickup; delivery
  -- code only at arrived_destination and never after a return was initiated.
  if p_kind = 'pickup' then
    if v_order.status <> 'arrived_pickup' then
      raise exception 'INVALID_ORDER_STATE';
    end if;
    v_trigger := 'pickup_otp_verified';
  else
    if v_order.status <> 'arrived_destination' or v_order.return_initiated_at is not null then
      raise exception 'INVALID_ORDER_STATE';
    end if;
    v_trigger := 'delivery_otp_verified';
  end if;

  -- Evidence pre-check (the transition guard re-checks authoritatively).
  if p_kind = 'pickup' then
    if not exists (
      select 1 from public.order_photos ph
      where ph.order_id = v_order.id and ph.kind = 'customer_parcel'
    ) or not exists (
      select 1 from public.order_photos ph
      where ph.order_id = v_order.id and ph.kind = 'rider_pickup'
    ) then
      raise exception 'EVIDENCE_MISSING';
    end if;
  else
    if not exists (
      select 1 from public.order_photos ph
      where ph.order_id = v_order.id and ph.kind = 'rider_delivery'
    ) then
      raise exception 'EVIDENCE_MISSING';
    end if;
  end if;

  select * into v_otp
  from public.order_otp_codes t
  where t.order_id = v_order.id
    and t.kind = p_kind
    and t.used_at is null
    and t.invalidated_at is null
  order by t.issued_at desc
  limit 1
  for update;

  if v_otp.id is null then
    -- Replay (a consumed code exists) vs never-issued: committed no-ops.
    if exists (
      select 1 from public.order_otp_codes t
      where t.order_id = v_order.id and t.kind = p_kind and t.used_at is not null
    ) then
      return query select v_order.id, v_order.status, 'already_used'::text, null::integer;
      return;
    end if;
    return query select v_order.id, v_order.status, 'not_issued'::text, null::integer;
    return;
  end if;

  -- Locked: the counter persisted past 5 failed attempts (or this is the 5th).
  if v_otp.attempts >= 5 then
    return query select v_order.id, v_order.status, 'locked'::text, v_otp.attempts;
    return;
  end if;

  if v_otp.expires_at <= now() then
    return query select v_order.id, v_order.status, 'expired'::text, v_otp.attempts;
    return;
  end if;

  -- Constant-shape comparison over the stored hash. Column references are
  -- ALIAS-QUALIFIED: RETURNS TABLE's implicit `attempts` variable would
  -- otherwise collide (the 0016 correction).
  if encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> v_otp.code_hash then
    update public.order_otp_codes t
    set attempts = t.attempts + 1
    where t.id = v_otp.id
    returning t.attempts into v_attempts;

    if v_attempts >= 5 then
      return query select v_order.id, v_order.status, 'locked'::text, v_attempts;
      return;
    end if;
    return query select v_order.id, v_order.status, 'invalid'::text, v_attempts;
    return;
  end if;

  -- One-time consumption (same transaction as the transition: a failed
  -- transition rolls the consumption back, so usage stays exact).
  update public.order_otp_codes t
  set used_at = now(), used_by = v_caller
  where t.id = v_otp.id;

  -- Canonical transition path (rider actor; the guard re-validates OTP
  -- consumption, evidence, and — for delivery — absence of a return).
  perform public.order_transition(v_order.id, v_trigger, null);

  select o.status into v_order.status from public.orders o where o.id = v_order.id;

  return query select v_order.id, v_order.status, 'verified'::text, v_otp.attempts;
end;
$$;

-- Grants preserved by CREATE OR REPLACE; re-assert explicitly.
revoke all on function public.verify_order_otp(uuid, text, text) from public, anon;
grant execute on function public.verify_order_otp(uuid, text, text) to authenticated;
