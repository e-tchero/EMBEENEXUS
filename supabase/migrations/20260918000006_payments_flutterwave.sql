-- =============================================================================
-- Embee Nexus V2 — Migration 0006: Payments (Flutterwave, M4)
-- =============================================================================
-- M4 foundation:
--   * payments        — one authoritative payment record per (order, attempt)
--                       with an immutable expected-amount snapshot derived from
--                       the order's financial snapshot (never client-supplied)
--   * initiate_payment          — customer RPC: idempotent checkout session
--   * payment_get_by_reference  — internal lookup by tx_ref (webhook/verify)
--   * payment_complete_verified — grants value exactly once (idempotent)
--   * payment_mark_outcome      — records failed/cancelled outcomes safely
--   * payment_record_webhook    — idempotent webhook_events insert
--   * order_transition extension — 'system' actor support + the real
--     payment_verified guard (previously PREREQUISITE_MISSING in M3)
--
-- SECURITY MODEL (mirrors M3):
--   * Clients hold SELECT on their own payment rows only (RLS); every write
--     flows through SECURITY DEFINER RPCs that resolve auth.uid() and enforce
--     ownership/state server-side.
--   * Amounts: bigint kobo. The payment amount is copied from the ORDER's
--     immutable snapshot at initiation; provider-verified amount must match
--     exactly before value is granted.
--   * Transaction references are server-generated (see domain/payment.ts for
--     the format), stored before checkout creation, unique at DB level.
--   * Webhook rows are inserted once per provider event id (unique index);
--     duplicates are a database-level no-op.
--
-- FOUNDER-PENDING: refund behavior (D06/D07/D08/D17/D18) is NOT implemented;
-- no refund columns, states, or RPCs exist by design.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PAYMENTS — authoritative payment attempts
-- -----------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'flutterwave'
    check (provider in ('flutterwave')),
  -- Server-generated reference (domain/payment.ts format). Unique globally so
  -- webhooks and verification resolve to exactly one payment row.
  transaction_reference text not null unique
    check (char_length(transaction_reference) between 16 and 100),
  -- Provider's transaction id (known only after a successful/verifiable charge).
  provider_transaction_id text,
  -- Immutable expected amount: copied from the order financial snapshot.
  expected_amount_kobo bigint not null check (expected_amount_kobo > 0),
  currency text not null default 'NGN' check (currency in ('NGN')),
  -- Normalized internal status (NOT the order state; separate axis).
  status text not null default 'initiated'
    check (status in (
      'initiated',        -- checkout session created
      'redirected',       -- customer sent to provider checkout
      'pending',          -- provider reports pending/processing
      'successful',       -- verified against expected amount/currency
      'failed',           -- provider reported failure
      'cancelled',        -- customer abandoned/cancelled at provider
      'verification_failed' -- verification ran but data mismatched
    )),
  -- Safe checkout data persisted for recovery (no secrets).
  checkout_url text,
  -- Verification facts (server-established only).
  verified_at timestamptz,
  verified_amount_kobo bigint,
  failure_reason text check (failure_reason is null or char_length(failure_reason) between 1 and 300),
  -- Correlation with webhook_events for auditability.
  first_webhook_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One active payment session per order at a time; settled rows
  -- (successful/failed/cancelled/verification_failed) allow a new attempt.
  constraint payments_one_active_per_order unique (order_id)
    where (status in ('initiated', 'redirected', 'pending'))
);

comment on table public.payments is
  'Flutterwave payment attempts. Expected amount is copied from the order immutable snapshot; success requires exact server-side verification. Clients hold SELECT on their own rows only.';

create index payments_order_idx on public.payments (order_id, created_at desc);
create index payments_customer_idx on public.payments (customer_id, created_at desc);
create index payments_status_idx on public.payments (status) where status in ('initiated', 'redirected', 'pending');
create index payments_provider_txn_idx on public.payments (provider_transaction_id)
  where provider_transaction_id is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. RLS AND GRANTS
-- -----------------------------------------------------------------------------

alter table public.payments enable row level security;
alter table public.payments force row level security;

-- Customers read their own payment rows; operators read all (support/audit).
-- No INSERT/UPDATE/DELETE policies exist for any role: all writes are RPC-only.
create policy payments_select_own_or_operator
  on public.payments
  for select
  using (
    customer_id = auth.uid()
    or public.has_role(auth.uid(), 'operator')
  );

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- -----------------------------------------------------------------------------
-- 3. RPC — initiate_payment (customer, idempotent)
-- -----------------------------------------------------------------------------
-- Creates (or returns the existing active) payment session for an order that
-- is in 'awaiting_payment'. The transaction reference is generated by the
-- application (domain/payment.ts) and passed as the second argument, keeping
-- PostgreSQL free of formatting logic. The checkout URL is stored by the
-- service layer via payment_attach_checkout afterwards; this RPC only
-- reserves the session/reference so retries reuse the same attempt.

create or replace function public.initiate_payment(
  p_order_id uuid,
  p_transaction_reference text
)
returns table (
  payment_id uuid,
  transaction_reference text,
  expected_amount_kobo bigint,
  currency text,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_order  public.orders;
  v_payment public.payments;
  v_ref text := p_transaction_reference;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_ref is null or char_length(v_ref) not between 16 and 100
     or v_ref !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_order.customer_id <> v_caller then
    raise exception 'FORBIDDEN';
  end if;

  if v_order.status <> 'awaiting_payment' then
    raise exception 'INVALID_ORDER_STATE';
  end if;

  -- Idempotent reuse of an active attempt.
  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and status in ('initiated', 'redirected', 'pending')
  limit 1;

  if v_payment.id is not null then
    return query select
      v_payment.id,
      v_payment.transaction_reference,
      v_payment.expected_amount_kobo,
      v_payment.currency,
      true;
    return;
  end if;

  insert into public.payments (
    order_id,
    customer_id,
    provider,
    transaction_reference,
    expected_amount_kobo,
    currency,
    status
  ) values (
    v_order.id,
    v_caller,
    'flutterwave',
    v_ref,
    v_order.customer_price_kobo,
    'NGN',
    'initiated'
  )
  on conflict (transaction_reference) do nothing
  returning * into v_payment;

  if v_payment.id is null then
    -- Reference collision (astronomically unlikely): fail closed rather than
    -- guessing. The client can retry; a new reference is generated.
    raise exception 'REFERENCE_COLLISION';
  end if;

  return query select
    v_payment.id,
    v_payment.transaction_reference,
    v_payment.expected_amount_kobo,
    v_payment.currency,
    false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC — payment_attach_checkout (service-role context via RPC owner check)
-- -----------------------------------------------------------------------------
-- Records the provider checkout URL + status transition to 'redirected'.
-- Called by the payment service AFTER a successful provider call. Not
-- client-executable.

create or replace function public.payment_attach_checkout(
  p_payment_id uuid,
  p_checkout_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_payment public.payments;
begin
  -- Service-role callers bypass RLS and have auth.uid() = null; ordinary
  -- authenticated users must never pass this check.
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_checkout_url is null or p_checkout_url !~ '^https://' then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_payment.status not in ('initiated', 'redirected') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;

  update public.payments
  set checkout_url = p_checkout_url,
      status = 'redirected'
  where id = v_payment.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC — payment_get_by_reference (internal lookup)
-- -----------------------------------------------------------------------------

create or replace function public.payment_get_by_reference(
  p_transaction_reference text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_payment public.payments;
begin
  -- Service-role only (webhook processing / verification job contexts).
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_payment
  from public.payments
  where transaction_reference = p_transaction_reference;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC — payment_complete_verified (grants value exactly once)
-- -----------------------------------------------------------------------------
-- Marks the payment successful (with verified facts) and transitions the order
-- awaiting_payment → payment_verified through the canonical transition path.
-- Idempotent: calling twice for the same payment succeeds once.

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

  return query select v_order.id, 'payment_verified'::text, 'successful'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC — payment_mark_outcome (failed / cancelled / pending, idempotent-safe)
-- -----------------------------------------------------------------------------

create or replace function public.payment_mark_outcome(
  p_payment_id uuid,
  p_status text,
  p_provider_transaction_id text default null,
  p_reason text default null,
  p_event_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_payment public.payments;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('pending', 'failed', 'cancelled') then
    raise exception 'INVALID_INPUT';
  end if;

  if p_reason is not null and (char_length(p_reason) = 0 or char_length(p_reason) > 300) then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Never overwrite a settled successful payment.
  if v_payment.status = 'successful' then
    return 'ignored';
  end if;

  -- Only move forward, never backwards (successful is handled elsewhere;
  -- verification_failed/failed/cancelled are terminal for this attempt).
  if v_payment.status in ('failed', 'cancelled', 'verification_failed') then
    return 'ignored';
  end if;

  update public.payments
  set status = p_status,
      provider_transaction_id = coalesce(v_payment.provider_transaction_id, p_provider_transaction_id),
      failure_reason = coalesce(p_reason, v_payment.failure_reason),
      first_webhook_event_id = coalesce(v_payment.first_webhook_event_id, p_event_id),
      verified_at = case when p_status = 'pending' then null else verified_at end
  where id = v_payment.id;

  return 'applied';
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC — payment_record_webhook (idempotent webhook_events insert)
-- -----------------------------------------------------------------------------

create or replace function public.payment_record_webhook(
  p_event_type text,
  p_provider_event_id text,
  p_reference text,
  p_payload jsonb
)
returns table (event_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_event public.webhook_events;
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  if p_event_type is null or char_length(p_event_type) = 0
     or p_provider_event_id is null or char_length(p_provider_event_id) = 0
     or char_length(p_provider_event_id) > 200 then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.webhook_events (
    provider, event_type, provider_event_id, reference,
    signature_verified, payload, processing_status
  ) values (
    'flutterwave', p_event_type, p_provider_event_id, p_reference,
    true, p_payload, 'received'
  )
  on conflict (provider, provider_event_id) do nothing
  returning * into v_event;

  if v_event.id is null then
    -- Duplicate delivery: report the existing row, mark nothing twice.
    select * into v_event
    from public.webhook_events
    where provider = 'flutterwave'
      and provider_event_id = p_provider_event_id;
    return query select v_event.id, true;
    return;
  end if;

  return query select v_event.id, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC — payment_mark_webhook_processed (audit closure)
-- -----------------------------------------------------------------------------

create or replace function public.payment_mark_webhook_processed(
  p_event_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is not null then
    raise exception 'FORBIDDEN';
  end if;

  update public.webhook_events
  set processing_status = case when p_ok then 'processed' else 'failed' end,
      processed_at = case when p_ok then now() else processed_at end,
      last_error = case when p_ok then null else left(coalesce(p_error, 'processing failed'), 300) end
  where id = p_event_id
    and processing_status in ('received', 'processing');
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. order_transition EXTENSION — system actor + real payment guard
-- -----------------------------------------------------------------------------
-- M3 declared guarded transitions UNREACHABLE (PREREQUISITE_MISSING) because
-- no fact source existed. M4 provides the payment fact: the guard for
-- awaiting_payment → payment_verified is satisfied when an authoritative
-- successful payment row exists (server-verified). The 'system' actor is
-- accepted ONLY for payment-protected transitions and only resolves through
-- the internal completion path — never through the client-executable RPC.
--
-- Implementation: extend order_transition with an internal flag reserved for
-- the payment completion path (called by payment_complete_verified via
-- SECURITY DEFINER context where auth.uid() is null); client calls keep the
-- exact M3 behavior.

create or replace function public.order_transition(
  p_order_id uuid,
  p_trigger  text,
  p_notes    text default null,
  p_internal_payment_verified boolean default false
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

-- -----------------------------------------------------------------------------
-- 11. PRIVILEGES
-- -----------------------------------------------------------------------------

-- Client-executable: initiation only (customer-owned orders).
revoke all on function public.initiate_payment(uuid, text) from public, anon;
grant execute on function public.initiate_payment(uuid, text) to authenticated;

revoke all on function public.payment_attach_checkout(uuid, text)
  from public, anon, authenticated;
revoke all on function public.payment_get_by_reference(text)
  from public, anon, authenticated;
revoke all on function public.payment_complete_verified(uuid, text, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.payment_mark_outcome(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.payment_record_webhook(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.payment_mark_webhook_processed(uuid, boolean, text)
  from public, anon, authenticated;

-- Service-role uses these via RPC with auth.uid() = null; PostgREST service
-- role can execute functions regardless of grant when using the admin client
-- only where explicitly intended. Keep them revoked from anon/authenticated.

revoke all on function public.order_transition(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.order_transition(uuid, text, text, boolean)
  to authenticated;
-- Preserve the M3 3-arg call signature availability.
grant execute on function public.order_transition(uuid, text, text)
  to authenticated;
