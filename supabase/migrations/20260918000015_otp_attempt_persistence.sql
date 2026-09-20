-- =============================================================================
-- Embee Nexus V2 — Migration 0015: Persistent OTP Attempt Limiting
-- =============================================================================
-- DEFECT (found during the M6 hosted verification gate):
--   Migration 0014's verify_order_otp incremented attempts and THEN raised
--   OTP_INVALID. A raised error aborts the caller's transaction (PostgREST
--   issues ROLLBACK; the matrix's exception handlers open subtransactions
--   that roll back the same write), so the counter never persisted and the
--   5-attempt lock was ineffective.
--
-- FIX (same pattern as 0008–0012: additive fix migration; 0014 is history and
-- is NOT modified):
--   * OTP-verification OUTCOMES are returned as data instead of raised:
--       otp_status ∈ 'verified' | 'invalid' | 'expired' | 'locked'
--                   | 'already_used' | 'not_issued'
--     the transaction COMMITS for these outcomes, persisting the attempts
--     counter on 'invalid'/'locked'.
--   * Authorization (NOT_AUTHENTICATED/FORBIDDEN), state binding
--     (INVALID_ORDER_STATE, incl. return-in-progress) and the evidence
--     pre-check (EVIDENCE_MISSING) remain EXCEPTIONS — no counter writes need
--     to survive them, and rejecting before any OTP logic stays the strongest
--     wrong-rider/replay defense.
--   * Lock semantics unchanged: a live code with attempts >= 5 reports
--     'locked' and never verifies; the 5th wrong attempt itself returns
--     'locked' with attempts persisted at 5. A reissue creates a fresh row
--     (attempts reset) — unchanged from 0014.
--   * Replay ('already_used') and never-issued ('not_issued') become
--     committed no-ops: identical information to the raised errors, now with
--     a uniform outcome contract.
--
-- SECURITY REVIEW:
--   * Consumption + canonical transition remain one atomic unit (unchanged).
--   * Return-as-data leaks nothing the exceptions did not already carry.
--   * search_path/SECURITY DEFINER/grants re-asserted; ordering of locks
--     (order row → OTP row) unchanged (deadlock-free).
-- =============================================================================

-- The outcome contract CHANGES the return type (adds otp_status, attempts),
-- which CREATE OR REPLACE cannot do (SQLSTATE 42P13). Per the established
-- 0008 pattern: a plain DROP (no CASCADE — pg_depend shows no dependent
-- objects; grants are re-issued below) then CREATE with the new signature.
drop function public.verify_order_otp(uuid, text, text);

create function public.verify_order_otp(
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

  -- Constant-shape comparison over the stored hash. The failed-attempt
  -- counter MUST survive the call: this outcome is RETURNED (transaction
  -- commits), never raised — that is the 0015 correction.
  if encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> v_otp.code_hash then
    update public.order_otp_codes
    set attempts = attempts + 1
    where id = v_otp.id
    returning attempts into v_attempts;

    if v_attempts >= 5 then
      return query select v_order.id, v_order.status, 'locked'::text, v_attempts;
      return;
    end if;
    return query select v_order.id, v_order.status, 'invalid'::text, v_attempts;
    return;
  end if;

  -- One-time consumption (same transaction as the transition: a failed
  -- transition rolls the consumption back, so usage stays exact).
  update public.order_otp_codes
  set used_at = now(), used_by = v_caller
  where id = v_otp.id;

  -- Canonical transition path (rider actor; the guard re-validates OTP
  -- consumption, evidence, and — for delivery — absence of a return).
  perform public.order_transition(v_order.id, v_trigger, null);

  select o.status into v_order.status from public.orders o where o.id = v_order.id;

  return query select v_order.id, v_order.status, 'verified'::text, v_otp.attempts;
end;
$$;

-- Grants preserved by CREATE OR REPLACE; re-assert explicitly (0014 pattern).
revoke all on function public.verify_order_otp(uuid, text, text) from public, anon;
grant execute on function public.verify_order_otp(uuid, text, text) to authenticated;
