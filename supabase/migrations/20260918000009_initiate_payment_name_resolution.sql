-- =============================================================================
-- 0009 — initiate_payment name resolution (runtime-gate defect #6)
-- =============================================================================
-- Defect (SQLSTATE 42702, confirmed live on real PostgreSQL):
--   initiate_payment declares `returns table (... transaction_reference ...)`.
--   PL/pgSQL turns every RETURNS TABLE column into an implicit OUT variable,
--   so the body's `on conflict (transaction_reference)` target sees TWO
--   candidates for the bare identifier — the payments table column and the
--   OUT variable — and fails with 42702. Payment initiation has therefore
--   never been executable on a real engine (masked by mocked unit tests).
--
-- Fix: the documented PL/pgSQL remedy — `#variable_conflict use_column` —
--   resolves bare identifiers to the TABLE column. The only bare use is the
--   conflict target; every other use is record-qualified (v_payment.*), so
--   behavior is otherwise unchanged. Signature has no defaults, so
--   create-or-replace is legal. Body is byte-identical to 0006 apart from the
--   directive; grants are re-issued verbatim per the established posture.
-- =============================================================================

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
#variable_conflict use_column
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
-- PRIVILEGES (verbatim from 0006)
-- -----------------------------------------------------------------------------

-- Client-executable: initiation only (customer-owned orders).
revoke all on function public.initiate_payment(uuid, text) from public, anon;
grant execute on function public.initiate_payment(uuid, text) to authenticated;
