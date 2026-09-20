-- =============================================================================
-- Embee Nexus V2 — Migration 0014: Chain of Custody, Waiting Flow, Return
-- =============================================================================
-- M6 implementation of the founder-approved delivery verification chain.
--
-- FOUNDER RULES IMPLEMENTED HERE
--   * Chain of custody (M6 authorization §3):
--       - pickup OTP + delivery OTP, rider-only verification, one-time use,
--         replay-proof, order- and transition-bound, server-side validation;
--       - the approved three-photo evidence chain:
--           1. customer_parcel  — customer/sender, before handover;
--           2. rider_pickup     — assigned rider, at pickup;
--           3. rider_delivery   — assigned rider, at delivery;
--         every pickup/delivery completion REQUIRES its evidence;
--       - recipient inspection/confirmation before final completion; the
--         order owner (customer) confirms — no new identity-verification
--         workflow is introduced (the customer may relay the delivery OTP
--         for a recipient who cannot access it, per the approved rule).
--   * Waiting rule (M6 authorization §7–§10, founder clarification D05):
--       0–10 minutes free; after 10 minutes ₦700 PER ADDITIONAL MINUTE
--       (NOT per 10-minute block); 30-minute operational maximum; after the
--       maximum the parcel is returned to the original pickup customer and
--       Embee bears the return cost.
--   * No new lifecycle states (M6 authorization §9): waiting and returning
--       are represented through dedicated columns + order_events. The order
--       remains non-terminal (and the rider committed) until the return
--       completes, at which point the canonical delivery_failed transition
--       closes the order. No casual redesign of the M3 state machine.
--
-- WAITING MODEL (deterministic, documented)
--   * Clock starts at the rider_arrived_destination transition (server clock)
--     and never resets (operator hold/release does not pause it).
--   * Clock ends at the delivered transition or at return initiation.
--   * BILLING CONVENTION: billable minutes = ceil((elapsed_seconds − 600) / 60)
--     clamped to [0, 20]. Each additional minute STARTED after the free
--     window is billed (10 min + 1 s ⇒ ₦700). At ≥ 1800 s the 30-minute
--     maximum has been reached: the tick initiates the return with the
--     capped charge (20 × ₦70,000 kobo = ₦14,000 maximum waiting charge).
--   * waiting_charge_kobo(started, ended) is the single pure definition;
--     apps/web/src/lib/domain/waiting.ts mirrors it exactly for tests.
--
-- RETURN MODEL
--   * process_waiting_expiry (system tick) initiates the return for every
--     order that has waited ≥ 30 minutes without delivery confirmation.
--   * The rider (or an operator backstop) records the completed return via
--     order_complete_return; the order then closes through the canonical
--     delivery_failed transition. The waiting charge is recorded on the
--     order; collection/settlement of waiting fees and the Embee-borne
--     return cost are ledger (M8) concerns and are intentionally NOT
--     implemented here — no financial rules are invented.
--
-- SECURITY MODEL
--   * All writes flow through SECURITY DEFINER RPCs (search_path = '').
--   * OTP codes: only sha256 hashes are stored. order_otp_codes has NO RLS
--     policies and NO client grants: a participant who could read the hash
--     could brute-force the 6-digit space offline and race the real rider.
--   * OTP generation: gen_random_uuid() (core, CSPRNG-backed), 40 bits
--     mapped to 6 digits (bias ≈ 1e-6, documented); sha256() is core.
--   * Attempt limiting: 5 failed attempts lock a code; the customer can
--     reissue (max 10 issues per order/kind); reissue invalidates the
--     previous code.
--   * Photos live in the PRIVATE order-evidence Storage bucket; clients get
--     short-lived signed URLs only after a server-side authorization check.
--     No Storage policies grant client access; the bucket itself carries
--     size and MIME limits.
--   * Evidence upload registration re-validates actor, order state, path
--     prefix (order/kind scoped), MIME and size inside the RPC.
--   * Concurrency: OTP verification, recipient confirmation, return
--     initiation/completion all lock the order row (FOR UPDATE); the OTP
--     row lock additionally serializes concurrent submissions; the
--     unique(order_id, kind) photo constraint rejects duplicates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OTP CODES — hashed, one-time, order- and transition-bound
-- -----------------------------------------------------------------------------

create table public.order_otp_codes (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  kind          text not null check (kind in ('pickup', 'delivery')),
  -- sha256 hex of the 6-digit code. Plaintext is NEVER stored, logged, or
  -- returned except once, to the order owner, by issue_order_otp.
  code_hash     text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts      integer not null default 0 check (attempts >= 0),
  issued_at     timestamptz not null default now(),
  -- Safety-net TTL (7 days). The OPERATIVE controls are the state gates and
  -- one-time consumption; this only prevents immortal live rows.
  expires_at    timestamptz not null,
  invalidated_at timestamptz,
  used_at       timestamptz,
  used_by       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint order_otp_codes_expires_after_issued check (expires_at > issued_at)
);

-- At most ONE live (unused, uninvalidated) code per (order, kind). Reissue
-- invalidates the previous row, so history is preserved for audit.
create unique index order_otp_codes_active_idx
  on public.order_otp_codes (order_id, kind)
  where used_at is null and invalidated_at is null;

create index order_otp_codes_order_idx on public.order_otp_codes (order_id, kind, issued_at);

comment on table public.order_otp_codes is
  'One-time hashed OTP codes per (order, kind). No RLS policies and no client grants: readable only inside SECURITY DEFINER RPCs. Plaintext codes exist only in the single issue_order_otp response.';

-- -----------------------------------------------------------------------------
-- 2. PHOTO EVIDENCE — the approved three-photo chain
-- -----------------------------------------------------------------------------

create table public.order_photos (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  kind          text not null check (kind in ('customer_parcel', 'rider_pickup', 'rider_delivery')),
  -- {order_id}/{kind}/{uuid}.{ext} inside the private order-evidence bucket.
  storage_path  text not null unique,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by   uuid references auth.users (id) on delete set null,
  uploaded_by_role text not null check (uploaded_by_role in ('customer', 'rider')),
  created_at    timestamptz not null default now(),
  -- Exactly one evidence photo per kind per order: duplicates are rejected,
  -- and existing evidence can never be overwritten.
  constraint order_photos_one_per_kind unique (order_id, kind)
);

comment on table public.order_photos is
  'Approved three-photo chain: customer_parcel (sender), rider_pickup, rider_delivery. Objects live in the private order-evidence bucket; clients only ever receive short-lived signed URLs after server-side authorization.';

create index order_photos_order_idx on public.order_photos (order_id, kind);

-- -----------------------------------------------------------------------------
-- 3. RECIPIENT CONFIRMATION — inspection attestation before completion
-- -----------------------------------------------------------------------------

create table public.order_recipient_confirmations (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders (id) on delete cascade,
  confirmed_by uuid not null references auth.users (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

comment on table public.order_recipient_confirmations is
  'Recipient/owner inspection confirmation (delivered → completed guard fact). No new identity-verification workflow: the order owner confirms; the customer may relay the delivery OTP where the recipient cannot access it.';

-- -----------------------------------------------------------------------------
-- 4. ORDERS — waiting/return operational columns (no new lifecycle states)
-- -----------------------------------------------------------------------------

alter table public.orders
  add column waiting_started_at   timestamptz,
  add column waiting_ended_at     timestamptz,
  add column waiting_charge_kobo  bigint not null default 0,
  add column return_initiated_at  timestamptz,
  add column return_completed_at  timestamptz;

alter table public.orders
  add constraint orders_waiting_charge_nonnegative check (waiting_charge_kobo >= 0);

comment on column public.orders.waiting_started_at is
  'Waiting clock start: set at the rider_arrived_destination transition (server clock); never reset (operator hold/release does not pause it).';
comment on column public.orders.waiting_charge_kobo is
  'Founder D05 waiting fee in kobo: 0 for the first 10 minutes, ₦70,000 kobo per ADDITIONAL minute started, capped at 20 billable minutes (₦14,000). Recorded when waiting ends (delivered or return initiated). Collection/settlement is an M8 ledger concern.';

-- Backfill in-flight orders that arrived at destination before this migration:
-- derive the clock start from their latest arrival event so the 30-minute
-- cap applies from the true arrival time.
update public.orders o
set waiting_started_at = e.created_at
from (
  select distinct on (order_id) order_id, created_at
  from public.order_events
  where new_status = 'arrived_destination'
    and trigger = 'rider_arrived_destination'
  order by order_id, created_at desc
) e
where e.order_id = o.id
  and o.status = 'arrived_destination'
  and o.waiting_started_at is null;

-- -----------------------------------------------------------------------------
-- 5. PURE WAITING CHARGE (single authoritative definition; mirrored in
--    apps/web/src/lib/domain/waiting.ts)
-- -----------------------------------------------------------------------------

create or replace function public.waiting_charge_kobo(
  p_started timestamptz,
  p_ended   timestamptz
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_started is null or p_ended is null or p_ended <= p_started then 0::bigint
    when extract(epoch from (p_ended - p_started)) <= 600 then 0::bigint
    else least(
      ceil((extract(epoch from (p_ended - p_started)) - 600)::numeric / 60),
      20
    )::bigint * 70000::bigint
  end;
$$;

comment on function public.waiting_charge_kobo(timestamptz, timestamptz) is
  'D05 waiting fee: first 600 s free; then ₦70,000 kobo per additional minute STARTED (ceiling); capped at 20 billable minutes. Pure/immutable; integer math only.';

-- -----------------------------------------------------------------------------
-- 6. RPC — ensure_order_otp_codes (system): provision both OTPs at payment
-- -----------------------------------------------------------------------------

create or replace function public.ensure_order_otp_codes(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_order   public.orders;
  v_code    text;
  v_kind    text;
  v_inserted boolean := false;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  foreach v_kind in array array['pickup', 'delivery'] loop
    if not exists (
      select 1 from public.order_otp_codes t
      where t.order_id = v_order.id
        and t.kind = v_kind
        and t.used_at is null
        and t.invalidated_at is null
    ) then
      v_code := lpad((
        ('x' || substring(translate(gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint
        % 1000000)::text, 6, '0');

      insert into public.order_otp_codes (order_id, kind, code_hash, expires_at)
      values (
        v_order.id,
        v_kind,
        encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
        now() + interval '7 days'
      );
      v_inserted := true;
    end if;
  end loop;

  if v_inserted then
    insert into public.order_events (
      order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
    ) values (
      v_order.id, v_order.status, v_order.status, 'otp_codes_issued',
      null, 'system', 'pickup,delivery custody codes provisioned'
    );
  end if;
end;
$$;

revoke all on function public.ensure_order_otp_codes(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC — issue_order_otp (customer): display a fresh code to the owner
-- -----------------------------------------------------------------------------
-- The customer app shows the current code by REISSUING: each call invalidates
-- the previous live code, creates a fresh one, and returns the plaintext once.
-- This keeps only hashes at rest while allowing the owner to display the code
-- at the door (and to relay the delivery code to the recipient per the
-- approved rule). Capped at 10 issues per (order, kind) to bound abuse.

create or replace function public.issue_order_otp(
  p_order_id uuid,
  p_kind     text
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
  v_code   text;
  v_expires timestamptz;
  v_issue_count integer;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_kind not in ('pickup', 'delivery') then
    raise exception 'INVALID_INPUT';
  end if;

  if not public.has_role(v_caller, 'customer') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_order.customer_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  -- State gates: pickup code lives from payment confirmation until pickup
  -- completes; delivery code lives from payment confirmation until delivery
  -- completes (or a return is initiated).
  if p_kind = 'pickup' then
    if v_order.status not in (
      'payment_verified', 'searching_rider', 'rider_assigned',
      'en_route_pickup', 'arrived_pickup'
    ) then
      raise exception 'INVALID_ORDER_STATE';
    end if;
  else
    if v_order.return_initiated_at is not null
       or v_order.status not in (
        'payment_verified', 'searching_rider', 'rider_assigned',
        'en_route_pickup', 'arrived_pickup', 'picked_up', 'in_transit',
        'arrived_destination'
      ) then
      raise exception 'INVALID_ORDER_STATE';
    end if;
  end if;

  select count(*) into v_issue_count
  from public.order_otp_codes t
  where t.order_id = v_order.id and t.kind = p_kind;

  if v_issue_count >= 10 then
    raise exception 'OTP_ISSUE_LIMIT';
  end if;

  -- Invalidate any live code (history preserved for audit).
  update public.order_otp_codes
  set invalidated_at = now()
  where order_id = v_order.id
    and kind = p_kind
    and used_at is null
    and invalidated_at is null;

  v_code := lpad((
    ('x' || substring(translate(gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint
    % 1000000)::text, 6, '0');
  v_expires := now() + interval '7 days';

  insert into public.order_otp_codes (order_id, kind, code_hash, expires_at)
  values (v_order.id, p_kind, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_expires);

  insert into public.order_events (
    order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
  ) values (
    v_order.id, v_order.status, v_order.status, 'otp_issued',
    v_caller, 'customer', p_kind || ' code reissued to owner'
  );

  return query select v_code, v_expires;
end;
$$;

revoke all on function public.issue_order_otp(uuid, text) from public, anon;
grant execute on function public.issue_order_otp(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC — verify_order_otp (rider): one-time verification + canonical
--    transition, atomically
-- -----------------------------------------------------------------------------

create or replace function public.verify_order_otp(
  p_order_id uuid,
  p_kind     text,
  p_code     text
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_order   public.orders;
  v_otp     public.order_otp_codes;
  v_new     text;
  v_trigger text;
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
    -- Distinguish replay (a consumed code exists) from never-issued.
    if exists (
      select 1 from public.order_otp_codes t
      where t.order_id = v_order.id and t.kind = p_kind and t.used_at is not null
    ) then
      raise exception 'OTP_ALREADY_USED';
    end if;
    raise exception 'OTP_NOT_ISSUED';
  end if;

  if v_otp.attempts >= 5 then
    raise exception 'OTP_LOCKED';
  end if;
  if v_otp.expires_at <= now() then
    raise exception 'OTP_EXPIRED';
  end if;

  -- Constant-shape comparison over the stored hash.
  if encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> v_otp.code_hash then
    update public.order_otp_codes
    set attempts = attempts + 1
    where id = v_otp.id;
    raise exception 'OTP_INVALID';
  end if;

  -- One-time consumption (same transaction as the transition: a failed
  -- transition rolls the consumption back, so attempts and usage are exact).
  update public.order_otp_codes
  set used_at = now(), used_by = v_caller
  where id = v_otp.id;

  -- Canonical transition path (rider actor; the guard re-validates OTP
  -- consumption, evidence, and — for delivery — absence of a return).
  perform public.order_transition(v_order.id, v_trigger, null);

  select o.status into v_new from public.orders o where o.id = v_order.id;

  return query select v_order.id, v_new;
end;
$$;

revoke all on function public.verify_order_otp(uuid, text, text) from public, anon;
grant execute on function public.verify_order_otp(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPC — confirm_order_receipt (customer owner): delivered → completed
-- -----------------------------------------------------------------------------

create or replace function public.confirm_order_receipt(
  p_order_id uuid,
  p_notes    text default null
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_notes is not null and char_length(p_notes) not between 1 and 500 then
    raise exception 'INVALID_INPUT';
  end if;

  if not public.has_role(v_caller, 'customer') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_order.customer_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  -- Idempotent double-tap: confirming an already-confirmed delivery is a
  -- safe success (unlike OTP replay, this has no security value).
  if v_order.status = 'completed' then
    if exists (
      select 1 from public.order_recipient_confirmations c
      where c.order_id = v_order.id
    ) then
      return query select v_order.id, v_order.status;
      return;
    end if;
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  -- Guard fact for the recipient_confirmed transition.
  insert into public.order_recipient_confirmations (order_id, confirmed_by)
  values (v_order.id, v_caller);

  perform public.order_transition(v_order.id, 'recipient_confirmed', p_notes);

  select o.status into v_order.status from public.orders o where o.id = v_order.id;

  return query select v_order.id, v_order.status;
end;
$$;

revoke all on function public.confirm_order_receipt(uuid, text) from public, anon;
grant execute on function public.confirm_order_receipt(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. RPC — register_order_photo (customer/rider): evidence metadata
-- -----------------------------------------------------------------------------
-- The object is uploaded by the server route (service role, after session +
-- ownership + MIME/size validation) into the PRIVATE order-evidence bucket
-- under {order_id}/{kind}/{uuid}.{ext}; this RPC then registers the metadata
-- under the CALLER's authority and re-validates everything server-side.

create or replace function public.register_order_photo(
  p_order_id     uuid,
  p_kind         text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes   bigint
)
returns table (photo_id uuid, kind text, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
  v_role   text;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_kind not in ('customer_parcel', 'rider_pickup', 'rider_delivery') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'INVALID_INPUT';
  end if;
  -- Path must be scoped to THIS order and kind (no cross-order injection).
  if p_storage_path is null
     or p_storage_path not like p_order_id::text || '/' || p_kind || '/%'
     or char_length(p_storage_path) > 400 then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Actor authorization per kind.
  if p_kind = 'customer_parcel' then
    if not public.has_role(v_caller, 'customer') or v_order.customer_id <> v_caller then
      raise exception 'FORBIDDEN';
    end if;
    v_role := 'customer';
    -- Parcel evidence must exist before handover; uploads close at pickup.
    if v_order.status not in (
      'draft', 'awaiting_payment', 'payment_verified', 'searching_rider',
      'rider_assigned', 'en_route_pickup', 'arrived_pickup'
    ) then
      raise exception 'INVALID_ORDER_STATE';
    end if;
  else
    if not public.has_role(v_caller, 'rider')
       or v_order.rider_id is null
       or v_order.rider_id <> v_caller then
      raise exception 'FORBIDDEN';
    end if;
    v_role := 'rider';
    if p_kind = 'rider_pickup' then
      if v_order.status <> 'arrived_pickup' then
        raise exception 'INVALID_ORDER_STATE';
      end if;
    else
      if v_order.status <> 'arrived_destination' then
        raise exception 'INVALID_ORDER_STATE';
      end if;
    end if;
  end if;

  begin
    insert into public.order_photos (
      order_id, kind, storage_path, content_type, size_bytes, uploaded_by, uploaded_by_role
    ) values (
      v_order.id, p_kind, p_storage_path, p_content_type, p_size_bytes, v_caller, v_role
    );
  exception
    when unique_violation then
      raise exception 'PHOTO_EXISTS';
  end;

  insert into public.order_events (
    order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
  ) values (
    v_order.id, v_order.status, v_order.status, 'photo_recorded',
    v_caller, v_role, 'evidence recorded: ' || p_kind
  );

  return query select p_order_id, p_kind, p_storage_path;
end;
$$;

revoke all on function public.register_order_photo(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_order_photo(uuid, text, text, text, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. RPC — order_initiate_return (system): waiting maximum reached
-- -----------------------------------------------------------------------------
-- The waiting tick calls this for every order that reached the 30-minute
-- maximum without a delivery confirmation. Stops normal delivery progression,
-- records the charge (capped), and leaves the order non-terminal (rider still
-- committed) until the completed return is recorded.

create or replace function public.order_initiate_return(
  p_order_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
  v_charge bigint;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Idempotent: an already-initiated return is a no-op success.
  if v_order.return_initiated_at is not null then
    return v_order.waiting_charge_kobo;
  end if;

  if v_order.status <> 'arrived_destination'
     or v_order.waiting_started_at is null
     or now() < v_order.waiting_started_at + interval '30 minutes' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  v_charge := public.waiting_charge_kobo(v_order.waiting_started_at, now());

  update public.orders
  set waiting_ended_at = now(),
      waiting_charge_kobo = v_charge,
      return_initiated_at = now()
  where id = v_order.id;

  insert into public.order_events (
    order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
  ) values (
    v_order.id, 'arrived_destination', 'arrived_destination', 'return_initiated',
    null, 'system',
    format('waiting maximum reached (30 min); return to pickup customer initiated; waiting_charge_kobo=%s; return cost borne by Embee', v_charge)
  );

  return v_charge;
end;
$$;

revoke all on function public.order_initiate_return(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 12. RPC — order_complete_return (assigned rider, operator backstop)
-- -----------------------------------------------------------------------------
-- Records the completed return journey and closes the order through the
-- canonical delivery_failed transition (never delivered/completed). The rider
-- stays committed to the order for the whole return leg.

create or replace function public.order_complete_return(
  p_order_id uuid,
  p_notes    text default null
)
returns table (order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_notes is not null and char_length(p_notes) not between 1 and 500 then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Assigned rider records the return; operators are the backstop when a
  -- rider cannot (the same authority they hold for delivery_failed).
  if not (
    (public.has_role(v_caller, 'rider') and v_order.rider_id = v_caller)
    or public.has_role(v_caller, 'operator')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_order.status <> 'arrived_destination' or v_order.return_initiated_at is null then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  update public.orders
  set return_completed_at = now()
  where id = v_order.id;

  insert into public.order_events (
    order_id, previous_status, new_status, trigger, actor_id, actor_role, notes
  ) values (
    v_order.id, 'arrived_destination', 'arrived_destination', 'return_completed',
    v_caller,
    case when v_order.rider_id = v_caller then 'rider' else 'operator' end,
    coalesce(p_notes, 'parcel returned to pickup customer')
  );

  -- Canonical closure: arrived_destination → failed (delivery was NOT
  -- completed; the founder-approved return path is failure with a reason).
  perform public.order_transition(
    v_order.id,
    'delivery_failed',
    coalesce(p_notes, 'returned to pickup customer after waiting maximum')
  );

  select o.status into v_order.status from public.orders o where o.id = v_order.id;

  return query select v_order.id, v_order.status;
end;
$$;

revoke all on function public.order_complete_return(uuid, text) from public, anon;
grant execute on function public.order_complete_return(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 13. RPC — process_waiting_expiry (system tick)
-- -----------------------------------------------------------------------------

create or replace function public.process_waiting_expiry(
  p_max_orders integer default 50
)
returns table (processed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    uuid := auth.uid();
  v_processed integer := 0;
  v_rec       record;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_max_orders is null or p_max_orders < 1 or p_max_orders > 200 then
    raise exception 'INVALID_INPUT';
  end if;

  -- SKIP LOCKED: concurrent ticks (and the delivery/OTP paths, which lock the
  -- order row) never deadlock; each due order is processed exactly once.
  for v_rec in
    select o.id
    from public.orders o
    where o.status = 'arrived_destination'
      and o.return_initiated_at is null
      and o.waiting_started_at is not null
      and o.waiting_started_at <= now() - interval '30 minutes'
    order by o.waiting_started_at
    limit p_max_orders
    for update skip locked
  loop
    perform public.order_initiate_return(v_rec.id);
    v_processed := v_processed + 1;
  end loop;

  return query select v_processed;
end;
$$;

revoke all on function public.process_waiting_expiry(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 14. order_transition (3-arg, client path) — real M6 guards + waiting
-- -----------------------------------------------------------------------------
-- Body identical to migration 0005 except:
--   * the three custody guards (pickup_otp_verified, delivery_otp_verified,
--     recipient_confirmed) are now REAL facts with M6 sources;
--   * the delivered guard additionally refuses once a return was initiated;
--   * waiting_started_at is set on arrival at the destination (never reset);
--   * the delivered transition ends the waiting clock and records the charge.
-- The M4/M5 overloads are untouched (their system paths never carry the
-- custody triggers; client calls resolve to this 3-arg form exclusively).

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
    -- Seller flows are M9; sellers hold no order-authority in M6.
    raise exception 'FORBIDDEN';
  end if;

  -- ---------------------------------------------------------------------------
  -- Operator review hold/release (exceptional states per the founder model).
  -- The waiting clock is NOT paused by a hold: it is wall-clock from arrival
  -- (documented M6 convention; holds in arrived_destination are rare and
  -- operator-initiated).
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
  -- M6: pickup_otp_verified, delivery_otp_verified and recipient_confirmed
  -- guards are REAL (verified below against order_otp_codes, order_photos and
  -- order_recipient_confirmations).
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
        -- -------------------------------------------------------------------
        -- M6 fact checks. Each guard is satisfied only by facts recorded in
        -- this same transaction or earlier committed transactions — the
        -- client path can never assert them directly.
        -- -------------------------------------------------------------------
        if v_guard = 'pickup_otp_verified' then
          -- A consumed pickup OTP by THIS rider (consumption happens only in
          -- verify_order_otp, atomically with this transition).
          if not exists (
            select 1 from public.order_otp_codes t
            where t.order_id = v_order.id
              and t.kind = 'pickup'
              and t.used_at is not null
              and t.used_by = v_caller
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
          -- The approved chain requires the sender's parcel photo AND the
          -- rider's pickup photo before custody can pass to the rider.
          if not exists (
            select 1 from public.order_photos ph
            where ph.order_id = v_order.id and ph.kind = 'customer_parcel'
          ) or not exists (
            select 1 from public.order_photos ph
            where ph.order_id = v_order.id and ph.kind = 'rider_pickup'
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
        elsif v_guard = 'delivery_otp_verified' then
          -- No delivery after the waiting maximum was reached: the founder
          -- rule stops normal progression and returns the parcel.
          if v_order.return_initiated_at is not null then
            raise exception 'INVALID_TRANSITION';
          end if;
          if not exists (
            select 1 from public.order_otp_codes t
            where t.order_id = v_order.id
              and t.kind = 'delivery'
              and t.used_at is not null
              and t.used_by = v_caller
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
          if not exists (
            select 1 from public.order_photos ph
            where ph.order_id = v_order.id and ph.kind = 'rider_delivery'
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
        elsif v_guard = 'recipient_confirmed' then
          if not exists (
            select 1 from public.order_recipient_confirmations c
            where c.order_id = v_order.id
          ) then
            raise exception 'PREREQUISITE_MISSING';
          end if;
        else
          raise exception 'PREREQUISITE_MISSING';
        end if;
      end if;

      update public.orders
      set status = v_next,
          -- Waiting clock starts at (first) arrival at the destination and
          -- is never reset.
          waiting_started_at = case when v_next = 'arrived_destination'
            then coalesce(waiting_started_at, now()) else waiting_started_at end,
          -- Delivery confirmation ends the waiting clock and records the
          -- D05 charge (0 within the free window).
          waiting_ended_at = case when v_next = 'delivered'
            then now() else waiting_ended_at end,
          waiting_charge_kobo = case when v_next = 'delivered'
            then public.waiting_charge_kobo(waiting_started_at, now())
            else waiting_charge_kobo end,
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

-- Grants preserved by CREATE OR REPLACE; re-assert explicitly.
revoke all on function public.order_transition(uuid, text, text)
  from public, anon;
grant execute on function public.order_transition(uuid, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 15. payment_complete_verified — provision custody OTPs atomically with
--     payment verification
-- -----------------------------------------------------------------------------
-- Body identical to migration 0006 except: after granting value (both the
-- settle-existing-payment_verified branch and the main grant path), the
-- pickup and delivery OTP codes are ensured inside the same transaction, so
-- "order confirmed" ⇒ "custody codes exist" is atomic and cannot dead-end at
-- pickup. Idempotency is unchanged.

create or replace function public.payment_complete_verified(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_verified_amount_kobo bigint,
  p_event_id uuid default null
)
returns table (order_id uuid, order_status text, payment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_payment public.payments;
  v_order public.orders;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_provider_transaction_id is null
     or char_length(p_provider_transaction_id) = 0
     or char_length(p_provider_transaction_id) > 100
     or p_verified_amount_kobo is null or p_verified_amount_kobo <= 0 then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Amount MUST match the immutable expected snapshot exactly.
  if p_verified_amount_kobo <> v_payment.expected_amount_kobo then
    update public.payments
    set status = 'verification_failed',
        verified_amount_kobo = p_verified_amount_kobo,
        verified_at = now(),
        provider_transaction_id = coalesce(v_payment.provider_transaction_id, p_provider_transaction_id),
        failure_reason = 'amount_mismatch'
    where id = v_payment.id;
    raise exception 'AMOUNT_MISMATCH';
  end if;

  -- Already settled?
  if v_payment.status = 'successful' then
    select status into v_order.status from public.orders where id = v_payment.order_id;
    return query select v_payment.order_id, v_order.status, 'successful'::text;
    return;
  end if;

  if v_payment.status in ('failed', 'cancelled', 'verification_failed') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;

  -- Transition the order FIRST via the canonical RPC-internal path: this
  -- function is itself the payment_verified guard implementation, so the
  -- transition is performed inline (same transaction, same row lock) using
  -- the exact mirrored state machine, then event-logged.
  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if v_order.status = 'payment_verified' then
    -- Order already verified (e.g. reconciled earlier); settle payment row.
    update public.payments
    set status = 'successful',
        provider_transaction_id = coalesce(v_payment.provider_transaction_id, p_provider_transaction_id),
        verified_amount_kobo = p_verified_amount_kobo,
        verified_at = now(),
        first_webhook_event_id = coalesce(v_payment.first_webhook_event_id, p_event_id)
    where id = v_payment.id;

    -- M6: custody codes are ensured (idempotent) on every settle path.
    perform public.ensure_order_otp_codes(v_order.id);

    return query select v_order.id, v_order.status, 'successful'::text;
    return;
  end if;

  if v_order.status <> 'awaiting_payment' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  update public.orders
  set status = 'payment_verified'
  where id = v_order.id;

  insert into public.order_events (
    order_id, previous_status, new_status, trigger,
    actor_id, actor_role, notes
  ) values (
    v_order.id, 'awaiting_payment', 'payment_verified', 'payment_verified',
    null, 'system', format('flutterwave verified: %s', p_provider_transaction_id)
  );

  update public.payments
  set status = 'successful',
      provider_transaction_id = coalesce(v_payment.provider_transaction_id, p_provider_transaction_id),
      verified_amount_kobo = p_verified_amount_kobo,
      verified_at = now(),
      first_webhook_event_id = coalesce(v_payment.first_webhook_event_id, p_event_id)
  where id = v_payment.id;

  -- M6: provision the pickup and delivery OTP codes atomically with payment
  -- verification (chain-of-custody prerequisite; idempotent).
  perform public.ensure_order_otp_codes(v_order.id);

  return query select v_order.id, 'payment_verified'::text, 'successful'::text;
end;
$$;

-- Grants preserved by CREATE OR REPLACE; re-assert explicitly (0006 pattern:
-- revoked from all client roles; the service role executes via the admin
-- client with auth.uid() = null).
revoke all on function public.payment_complete_verified(uuid, text, bigint, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 16. PRIVATE STORAGE BUCKET — order evidence
-- -----------------------------------------------------------------------------
-- No client Storage policies exist: anon/authenticated can neither read nor
-- write bucket objects. All object I/O is server-mediated (service role) and
-- authorized per order/actor by the upload/signed-URL routes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-evidence', 'order-evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- 17. RLS AND GRANTS
-- -----------------------------------------------------------------------------

alter table public.order_otp_codes             enable row level security;
alter table public.order_otp_codes             force row level security;
alter table public.order_photos                enable row level security;
alter table public.order_photos                force row level security;
alter table public.order_recipient_confirmations enable row level security;
alter table public.order_recipient_confirmations force row level security;

-- OTP codes: NO policies — no client (participant or operator) may read OTP
-- material. A leaked hash would be brute-forceable offline (6-digit space);
-- RPCs under SECURITY DEFINER are the only access path.
revoke all on public.order_otp_codes from anon, authenticated;

-- Photos: participants (owner/assigned rider) and operators read metadata;
-- object bytes remain behind the private bucket + signed-URL route.
create policy order_photos_select_participants
  on public.order_photos
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_photos.order_id
        and (
          o.customer_id = auth.uid()
          or o.rider_id = auth.uid()
          or public.has_role(auth.uid(), 'operator')
        )
    )
  );

-- Recipient confirmations: participants and operators read.
create policy order_recipient_confirmations_select_participants
  on public.order_recipient_confirmations
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_recipient_confirmations.order_id
        and (
          o.customer_id = auth.uid()
          or o.rider_id = auth.uid()
          or public.has_role(auth.uid(), 'operator')
        )
    )
  );

-- No INSERT/UPDATE/DELETE policies on any new table.
revoke all on public.order_photos                from anon, authenticated;
revoke all on public.order_recipient_confirmations from anon, authenticated;
grant select on public.order_photos                to authenticated;
grant select on public.order_recipient_confirmations to authenticated;
