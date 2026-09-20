-- =============================================================================
-- Embee Nexus V2 — M6 Database Verification Matrix (hosted PostgreSQL engine)
-- =============================================================================
-- PURPOSE
--   Deterministic, self-contained scenario verification for migration 0013
--   (quote validity 10 minutes, D09) and migration 0014 (chain of custody,
--   OTP, photo evidence, recipient confirmation, waiting flow, return).
--
-- RUNBOOK
--   Connect to the verification engine as an admin role (the same hosted
--   PostgreSQL 17.6 runtime used for the M5 matrix):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/milestones/M6-DATABASE-VERIFICATION.sql
--   The script aborts on the first failed assertion. Re-running is safe:
--   every seed is idempotent and scenarios create fresh orders.
--
-- AUTH SIMULATION
--   * system/service-role paths run as the admin role (auth.uid() IS NULL);
--   * user paths switch role + request.jwt.claims inside each scenario block.
--
-- NOTE: photo BYTES (Storage upload / signed URLs) are exercised through the
-- API routes; this matrix covers the RPC/RLS/security surface. The waiting
-- clock is advanced via a direct fixture update (clearly marked) because the
-- only real clock is wall time.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- -----------------------------------------------------------------------------
-- 0. HELPERS (session-local) + TEST IDENTITIES
-- -----------------------------------------------------------------------------

create or replace function pg_temp.assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(p_expected text, p_actual text, p_label text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_actual, '') <> p_expected then
    raise exception 'ASSERTION FAILED (%): expected SQLERRM <%>, got <%>', p_label, p_expected, p_actual;
  end if;
end;
$$;

-- Fixed test identities (…01 customer, …02 rider, …03 rider2, …04 operator).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'm6-customer@verify.local', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'm6-rider@verify.local',    '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'm6-rider2@verify.local',   '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'm6-operator@verify.local', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider_name, identity_data, last_sign_in_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'email', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001'), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'email', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002'), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'email', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003'), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'email', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004'), now(), now(), now())
on conflict do nothing;

insert into public.profiles (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'M6 Verify Customer', 'customer', true),
  ('00000000-0000-0000-0000-000000000002', 'M6 Verify Rider',    'rider',    true),
  ('00000000-0000-0000-0000-000000000003', 'M6 Verify Rider 2',  'rider',    true),
  ('00000000-0000-0000-0000-000000000004', 'M6 Verify Operator', 'operator', true)
on conflict (id) do nothing;

-- Riders are dispatch-eligible fixtures: approved verification + an active
-- motorcycle (M5 eligibility predicate), so the dispatch RPCs issue offers.
insert into public.rider_profiles (id, verification_status) values
  ('00000000-0000-0000-0000-000000000002', 'approved'),
  ('00000000-0000-0000-0000-000000000003', 'approved')
on conflict (id) do nothing;

insert into public.vehicles (rider_id, make, model, plate_number, is_active)
values ('00000000-0000-0000-0000-000000000002', 'Honda', 'CB125', 'M6-VERIFY-1', true)
on conflict (rider_id, plate_number) do nothing;

-- Coverage + pricing: reuse any active zone/config; seed one if none exists.
insert into public.coverage_zones (name, boundary, is_active, activated_at)
select 'M6-VERIFY-ZONE',
       public.st_geomfromtext('POLYGON((7.44 9.02, 7.44 9.10, 7.56 9.10, 7.56 9.02, 7.44 9.02))', 4326)::public.geography,
       true, now()
where not exists (select 1 from public.coverage_zones z where z.is_active);

insert into public.pricing_configs (version, is_active, activated_at)
select coalesce((select max(version) from public.pricing_configs), 0) + 1, true, now()
where not exists (select 1 from public.pricing_configs pc where pc.is_active);

insert into public.pricing_bands (
  pricing_config_id, min_distance_m, max_distance_m,
  customer_price_kobo, rider_share_kobo, platform_share_kobo
)
select pc.id, 0, 35000, 220000, 154000, 66000
from public.pricing_configs pc
where pc.is_active
  and not exists (select 1 from public.pricing_bands pb where pb.pricing_config_id = pc.id);

-- -----------------------------------------------------------------------------
-- 1. SCHEMA SANITY + PURE WAITING BOUNDARIES
-- -----------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert(to_regclass('public.order_otp_codes') is not null, 'order_otp_codes missing');
  perform pg_temp.assert(to_regclass('public.order_photos') is not null, 'order_photos missing');
  perform pg_temp.assert(to_regclass('public.order_recipient_confirmations') is not null, 'order_recipient_confirmations missing');
  perform pg_temp.assert(to_regproc('public.waiting_charge_kobo(timestamptz, timestamptz)') is not null, 'waiting_charge_kobo missing');
  perform pg_temp.assert(to_regproc('public.verify_order_otp(uuid, text, text)') is not null, 'verify_order_otp missing');
  perform pg_temp.assert(to_regproc('public.issue_order_otp(uuid, text)') is not null, 'issue_order_otp missing');
  perform pg_temp.assert(to_regproc('public.confirm_order_receipt(uuid, text)') is not null, 'confirm_order_receipt missing');
  perform pg_temp.assert(to_regproc('public.register_order_photo(uuid, text, text, text, bigint)') is not null, 'register_order_photo missing');
  perform pg_temp.assert(to_regproc('public.order_initiate_return(uuid)') is not null, 'order_initiate_return missing');
  perform pg_temp.assert(to_regproc('public.order_complete_return(uuid, text)') is not null, 'order_complete_return missing');
  perform pg_temp.assert(to_regproc('public.process_waiting_expiry(integer)') is not null, 'process_waiting_expiry missing');
  perform pg_temp.assert(exists (select 1 from storage.buckets where id = 'order-evidence' and not public), 'order-evidence bucket missing or public');
  raise notice 'SECTION 1 OK: schema sanity';
end $$;

-- Pure charge function boundaries (founder D05: 10 free → ₦700/min → 30 cap).
do $$
declare
  t timestamptz := '2026-09-20 10:00:00+00';
begin
  perform pg_temp.assert(public.waiting_charge_kobo(t, t) = 0, 'zero-duration charge must be 0');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '540 seconds') = 0, '9 minutes must be free');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '600 seconds') = 0, '10 minutes must be free');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '601 seconds') = 70000, '10 min + 1 s must be 70000 (per-minute)');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '1200 seconds') = 700000, '20 min must be 700000 (NOT a 700-per-block model)');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '1799 seconds') = 1400000, '29:59 must be 20 started minutes');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '1800 seconds') = 1400000, '30 min must cap at 1400000');
  perform pg_temp.assert(public.waiting_charge_kobo(t, t + interval '7200 seconds') = 1400000, 'beyond cap must clamp at 1400000');
  perform pg_temp.assert(public.waiting_charge_kobo(null, t) = 0, 'null start must be 0');
  perform pg_temp.assert(public.waiting_charge_kobo(t + interval '1 hour', t) = 0, 'inverted interval must be 0');
  raise notice 'SECTION 1 OK: waiting_charge_kobo boundaries';
end $$;

-- -----------------------------------------------------------------------------
-- 2. QUOTE VALIDITY = 10 MINUTES (D09)
-- -----------------------------------------------------------------------------

do $$
declare
  v_quote record;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

  select * into v_quote from public.create_quote(9.0579, 7.4951, 'M6 pickup', 9.0600, 7.5000, 'M6 dropoff', 2500);
  perform pg_temp.assert(v_quote.expires_at between now() + interval '9 minutes 59 seconds' and now() + interval '10 minutes 1 second',
    format('quote validity must be ~10 minutes (D09), got expires_at=%s', v_quote.expires_at));
  perform pg_temp.assert(v_quote.customer_price_kobo = 220000, 'price must come from the active band (0–5 km = ₦2,200)');
end $$;

\echo 'SECTION 2 OK: quote validity 10 minutes'

-- -----------------------------------------------------------------------------
-- 3. SHARED FLOW HELPERS: quote → order → pay → dispatch → assign
-- -----------------------------------------------------------------------------

-- Creates a fully dispatched order for the customer, assigned to the given
-- rider, left in payment_verified/searching/rider_assigned as requested.
create or replace function pg_temp.create_paid_dispatched_order(
  p_label text,
  p_rider uuid
)
returns uuid
language plpgsql
as $$
declare
  v_quote_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_offer_id uuid;
  v_ref text := 'M6-VERIFY-' || p_label || '-' || substr(gen_random_uuid()::text, 1, 8);
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

  select quote_id into v_quote_id from public.create_quote(9.0579, 7.4951, 'M6 pickup ' || p_label, 9.0600, 7.5000, 'M6 dropoff ' || p_label, 2500);
  select order_id into v_order_id from public.create_order_from_quote(v_quote_id);
  perform public.order_transition(v_order_id, 'order_submitted', null);

  reset role;

  insert into public.payments (order_id, customer_id, transaction_reference, expected_amount_kobo, currency, status)
  values (v_order_id, '00000000-0000-0000-0000-000000000001', v_ref, 220000, 'NGN', 'initiated')
  returning id into v_payment_id;
  perform public.payment_complete_verified(v_payment_id, 'M6-FLW-' || p_label, 220000, null);

  -- Dispatch via the M5 RPCs (system), rider declares availability and accepts.
  perform public.dispatch_start(v_order_id);
  perform public.dispatch_offer_next(v_order_id);

  set local role authenticated;
  set local request.jwt.claims = format('{"sub":"%s"}', p_rider);
  perform public.rider_set_availability(true);
  reset role;

  select id into v_offer_id from public.dispatch_offers
  where order_id = v_order_id and status = 'offered'
  order by offered_at desc limit 1;
  perform pg_temp.assert(v_offer_id is not null, 'dispatch must create an offer');

  set local role authenticated;
  set local request.jwt.claims = format('{"sub":"%s"}', p_rider);
  perform public.dispatch_accept(v_offer_id);

  -- Restore the caller's role: SET LOCAL inside this function would otherwise
  -- leak the rider context into the remainder of the calling block.
  reset role;

  return v_order_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. OTP SECURITY MATRIX
-- -----------------------------------------------------------------------------

do $$
declare
  v_order_id uuid;
  v_code text;
  v_count integer;
begin
  v_order_id := pg_temp.create_paid_dispatched_order('OTPA', '00000000-0000-0000-0000-000000000002');
  perform set_config('m6.order_a', v_order_id::text, false);

  -- Payment verification must have provisioned exactly 2 OTPs, idempotently.
  select count(*) into v_count from public.order_otp_codes t where t.order_id = v_order_id;
  perform pg_temp.assert(v_count = 2, format('payment_verified must provision 2 OTPs, found %s', v_count));

  -- Riders cannot issue OTPs (customer-only).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.issue_order_otp(v_order_id, 'pickup');
    raise exception 'ASSERTION FAILED: rider must not issue OTP';
  exception when others then
    perform pg_temp.expect_error('FORBIDDEN', sqlerrm, 'rider issue');
  end;

  -- Non-owner customers cannot issue on someone else's order.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000004"}';
  begin
    perform public.issue_order_otp(v_order_id, 'pickup');
    raise exception 'ASSERTION FAILED: non-owner must not issue OTP';
  exception when others then
    perform pg_temp.expect_error('FORBIDDEN', sqlerrm, 'non-owner issue');
  end;

  -- Owner reissue: returns plaintext once, exactly one live code remains.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  select code into v_code from public.issue_order_otp(v_order_id, 'pickup');
  perform pg_temp.assert(v_code ~ '^[0-9]{6}$', 'issued code must be 6 digits');

  select count(*) into v_count from public.order_otp_codes t
  where t.order_id = v_order_id and t.kind = 'pickup'
    and t.used_at is null and t.invalidated_at is null;
  perform pg_temp.assert(v_count = 1, 'exactly one live pickup code after reissue');

  -- Verify in the wrong state (rider_assigned, not arrived_pickup).
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.verify_order_otp(v_order_id, 'pickup', v_code);
    raise exception 'ASSERTION FAILED: verify in wrong state must fail';
  exception when others then
    perform pg_temp.expect_error('INVALID_ORDER_STATE', sqlerrm, 'verify wrong state');
  end;

  perform set_config('m6.pickup_code_a', v_code, false);
end $$;

\echo 'SECTION 4 OK: OTP authority, provisioning, reissue, state binding'

-- -----------------------------------------------------------------------------
-- 5. CUSTODY TRANSITIONS: evidence gating, replay, wrong rider, wrong code
-- -----------------------------------------------------------------------------

do $$
declare
  v_order_id uuid := current_setting('m6.order_a')::uuid;
  v_code text;
  v_status text;
  v_attempts integer;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

  perform public.order_transition(v_order_id, 'rider_departed', null);
  perform public.order_transition(v_order_id, 'rider_arrived_pickup', null);

  v_code := current_setting('m6.pickup_code_a');

  -- OTP verify BEFORE evidence → EVIDENCE_MISSING, and nothing is consumed.
  begin
    perform public.verify_order_otp(v_order_id, 'pickup', v_code);
    raise exception 'ASSERTION FAILED: pickup without evidence must fail';
  exception when others then
    perform pg_temp.expect_error('EVIDENCE_MISSING', sqlerrm, 'pickup evidence pre-check');
  end;

  -- Direct client-path transition must hit the real guard (no fact source).
  begin
    perform public.order_transition(v_order_id, 'pickup_otp_verified', null);
    raise exception 'ASSERTION FAILED: direct guarded transition must fail';
  exception when others then
    perform pg_temp.expect_error('PREREQUISITE_MISSING', sqlerrm, 'direct pickup transition');
  end;

  -- Rider registers the pickup photo. The parcel photo belongs to the customer.
  perform public.register_order_photo(
    v_order_id, 'rider_pickup', v_order_id::text || '/rider_pickup/11111111-1111-1111-1111-111111111111.jpg', 'image/jpeg', 12345);

  begin
    perform public.verify_order_otp(v_order_id, 'pickup', v_code);
    raise exception 'ASSERTION FAILED: pickup without customer_parcel must fail';
  exception when others then
    perform pg_temp.expect_error('EVIDENCE_MISSING', sqlerrm, 'pickup missing parcel photo');
  end;

  -- Duplicate pickup photo (same kind) must be rejected.
  begin
    perform public.register_order_photo(
      v_order_id, 'rider_pickup', v_order_id::text || '/rider_pickup/11111111-1111-1111-1111-111111111112.jpg', 'image/jpeg', 12345);
    raise exception 'ASSERTION FAILED: duplicate photo must fail';
  exception when others then
    perform pg_temp.expect_error('PHOTO_EXISTS', sqlerrm, 'duplicate photo');
  end;

  -- Cross-order path injection must be rejected.
  begin
    perform public.register_order_photo(
      v_order_id, 'rider_pickup', '00000000-0000-0000-0000-000000000099/rider_pickup/x.jpg', 'image/jpeg', 12345);
    raise exception 'ASSERTION FAILED: cross-order path must fail';
  exception when others then
    perform pg_temp.expect_error('INVALID_INPUT', sqlerrm, 'path scoping');
  end;

  -- Customer uploads the parcel evidence.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  perform public.register_order_photo(
    v_order_id, 'customer_parcel', v_order_id::text || '/customer_parcel/22222222-2222-2222-2222-222222222222.jpg', 'image/jpeg', 54321);

  -- Wrong rider cannot verify even with the correct code.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';
  begin
    perform public.verify_order_otp(v_order_id, 'pickup', current_setting('m6.pickup_code_a'));
    raise exception 'ASSERTION FAILED: wrong rider must be forbidden';
  exception when others then
    perform pg_temp.expect_error('FORBIDDEN', sqlerrm, 'wrong rider verify');
  end;

  -- Assigned rider, wrong code: attempts increment; nothing consumed.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.verify_order_otp(v_order_id, 'pickup', '000000');
    raise exception 'ASSERTION FAILED: wrong code must fail';
  exception when others then
    perform pg_temp.expect_error('OTP_INVALID', sqlerrm, 'wrong code');
  end;
  select attempts into v_attempts from public.order_otp_codes t
  where t.order_id = v_order_id and t.kind = 'pickup' and t.used_at is null and t.invalidated_at is null;
  perform pg_temp.assert(v_attempts = 1, format('wrong code must increment attempts (got %s)', v_attempts));

  -- Correct code → picked_up (one-time consumption + canonical transition).
  select status into v_status from public.verify_order_otp(v_order_id, 'pickup', current_setting('m6.pickup_code_a'));
  perform pg_temp.assert(v_status = 'picked_up', format('pickup OTP must transition to picked_up, got %s', v_status));

  -- REPLAY: same code again → OTP_ALREADY_USED; state unchanged.
  begin
    perform public.verify_order_otp(v_order_id, 'pickup', current_setting('m6.pickup_code_a'));
    raise exception 'ASSERTION FAILED: replay must fail';
  exception when others then
    perform pg_temp.expect_error('OTP_ALREADY_USED', sqlerrm, 'replay');
  end;
  select status into v_status from public.orders where id = v_order_id;
  perform pg_temp.assert(v_status = 'picked_up', 'replay must not change state');

  -- Free the rider for later sections: the operator cancels from picked_up
  -- (an allowed operator transition per the founder-approved matrix).
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000004"}';
  select status into v_status from public.order_transition(v_order_id, 'cancel', 'M6 matrix cleanup: rider released');
  perform pg_temp.assert(v_status = 'cancelled', format('operator cancel from picked_up must succeed, got %s', v_status));
end $$;

\echo 'SECTION 5 OK: evidence gating, replay, authorization, attempts'

-- -----------------------------------------------------------------------------
-- 6. DELIVERY LEG: delivery evidence, waiting charge on delivered (11 min →
--    ₦700), recipient confirmation, idempotent double-tap, terminal safety
-- -----------------------------------------------------------------------------

do $$
declare
  v_order_id uuid;
  v_code text;
  v_status text;
  v_charge bigint;
begin
  v_order_id := pg_temp.create_paid_dispatched_order('DLVB', '00000000-0000-0000-0000-000000000002');
  perform set_config('m6.order_b', v_order_id::text, false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  perform public.order_transition(v_order_id, 'rider_departed', null);
  perform public.order_transition(v_order_id, 'rider_arrived_pickup', null);
  perform public.register_order_photo(
    v_order_id, 'rider_pickup', v_order_id::text || '/rider_pickup/33333333-3333-3333-3333-333333333333.jpg', 'image/jpeg', 4096);

  -- Owner displays the pickup code, rider verifies it.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  perform public.register_order_photo(
    v_order_id, 'customer_parcel', v_order_id::text || '/customer_parcel/44444444-4444-4444-4444-444444444444.jpg', 'image/jpeg', 4096);
  select code into v_code from public.issue_order_otp(v_order_id, 'pickup');
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  perform public.verify_order_otp(v_order_id, 'pickup', v_code);

  perform public.order_transition(v_order_id, 'rider_departed', null);
  perform public.order_transition(v_order_id, 'rider_arrived_destination', null);

  -- FIXTURE (admin): advance the waiting clock to 11 minutes (the real clock
  -- is wall time; clients have no UPDATE grants).
  reset role;
  update public.orders set waiting_started_at = now() - interval '11 minutes' where id = v_order_id;

  -- Owner displays the delivery code (may relay it to the recipient).
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  select code into v_code from public.issue_order_otp(v_order_id, 'delivery');

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.verify_order_otp(v_order_id, 'delivery', v_code);
    raise exception 'ASSERTION FAILED: delivery without photo must fail';
  exception when others then
    perform pg_temp.expect_error('EVIDENCE_MISSING', sqlerrm, 'delivery evidence pre-check');
  end;

  perform public.register_order_photo(
    v_order_id, 'rider_delivery', v_order_id::text || '/rider_delivery/55555555-5555-5555-5555-555555555555.jpg', 'image/webp', 2048);

  select status into v_status from public.verify_order_otp(v_order_id, 'delivery', v_code);
  perform pg_temp.assert(v_status = 'delivered', format('delivery OTP must transition to delivered, got %s', v_status));

  -- Waiting charge recorded at delivery: 11 minutes → 1 billable minute.
  select waiting_charge_kobo into v_charge from public.orders where id = v_order_id;
  perform pg_temp.assert(v_charge = 70000, format('11 minutes waited must record 70000 kobo, got %s', v_charge));

  -- Recipient/owner confirmation → completed; double-tap idempotent.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  select status into v_status from public.confirm_order_receipt(v_order_id, 'inspected, all good');
  perform pg_temp.assert(v_status = 'completed', format('receipt confirmation must complete the order, got %s', v_status));

  select status into v_status from public.confirm_order_receipt(v_order_id, null);
  perform pg_temp.assert(v_status = 'completed', 'double confirmation must be idempotent');

  -- Terminal states are immutable on the client path.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.order_transition(v_order_id, 'delivery_failed', null);
    raise exception 'ASSERTION FAILED: terminal state must be immutable';
  exception when others then
    perform pg_temp.expect_error('INVALID_TRANSITION', sqlerrm, 'terminal immutability');
  end;
end $$;

\echo 'SECTION 6 OK: delivery evidence, waiting charge on delivered, recipient confirmation'

-- -----------------------------------------------------------------------------
-- 7. WAITING MAXIMUM → RETURN → CLOSURE (D05: return to pickup customer,
--    Embee bears the return cost; never marked delivered)
-- -----------------------------------------------------------------------------

do $$
declare
  v_order_id uuid;
  v_code text;
  v_charge bigint;
  v_return_initiated boolean;
  v_status text;
  v_processed integer;
  v_failed_reason text;
begin
  v_order_id := pg_temp.create_paid_dispatched_order('RETC', '00000000-0000-0000-0000-000000000002');
  perform set_config('m6.order_c', v_order_id::text, false);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  perform public.order_transition(v_order_id, 'rider_departed', null);
  perform public.order_transition(v_order_id, 'rider_arrived_pickup', null);
  perform public.register_order_photo(
    v_order_id, 'rider_pickup', v_order_id::text || '/rider_pickup/66666666-6666-6666-6666-666666666666.jpg', 'image/jpeg', 4096);
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  perform public.register_order_photo(
    v_order_id, 'customer_parcel', v_order_id::text || '/customer_parcel/77777777-7777-7777-7777-777777777777.jpg', 'image/jpeg', 4096);
  select code into v_code from public.issue_order_otp(v_order_id, 'pickup');
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  perform public.verify_order_otp(v_order_id, 'pickup', v_code);
  perform public.order_transition(v_order_id, 'rider_departed', null);
  perform public.order_transition(v_order_id, 'rider_arrived_destination', null);

  -- FIXTURE (admin): 31 minutes of waiting (one minute past the maximum).
  reset role;
  update public.orders set waiting_started_at = now() - interval '31 minutes' where id = v_order_id;

  -- The system tick initiates the return with the capped charge.
  select processed into v_processed from public.process_waiting_expiry(50);
  perform pg_temp.assert(v_processed >= 1, 'waiting tick must process the overdue order');

  select waiting_charge_kobo, return_initiated_at is not null, status
    into v_charge, v_return_initiated, v_status
  from public.orders where id = v_order_id;
  perform pg_temp.assert(v_charge = 1400000, format('31 minutes must cap the charge at 1400000 kobo, got %s', v_charge));
  perform pg_temp.assert(v_return_initiated, 'return must be initiated');
  perform pg_temp.assert(v_status = 'arrived_destination', 'order must remain non-terminal (rider committed) during the return');

  -- Delivery progression is stopped: no new delivery codes, no OTP verify.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
  begin
    perform public.issue_order_otp(v_order_id, 'delivery');
    raise exception 'ASSERTION FAILED: issuing delivery OTP during return must fail';
  exception when others then
    perform pg_temp.expect_error('INVALID_ORDER_STATE', sqlerrm, 'delivery OTP during return');
  end;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
  begin
    perform public.verify_order_otp(v_order_id, 'delivery', '123456');
    raise exception 'ASSERTION FAILED: verifying delivery during return must fail';
  exception when others then
    perform pg_temp.expect_error('INVALID_ORDER_STATE', sqlerrm, 'delivery verify during return');
  end;

  -- The rider records the completed return → canonical failed closure.
  select status into v_status from public.order_complete_return(v_order_id, 'parcel returned to sender');
  perform pg_temp.assert(v_status = 'failed', format('completed return must close as failed, got %s', v_status));

  select failure_reason into v_failed_reason from public.orders where id = v_order_id;
  perform pg_temp.assert(v_failed_reason like '%returned to pickup customer%',
    format('failure reason must record the return, got %s', v_failed_reason));

  -- The waiting charge persists; the order was never delivered/completed.
  perform pg_temp.assert((select waiting_charge_kobo from public.orders where id = v_order_id) = 1400000,
    'waiting charge must persist after the return');
  perform pg_temp.assert((select status from public.orders where id = v_order_id) = 'failed', 'order must be failed');
  perform pg_temp.assert(
    not exists (select 1 from public.order_events where order_id = v_order_id and new_status = 'delivered'),
    'a returned order must never be marked delivered');

  -- Idempotent tick: already-returned orders are not reprocessed.
  reset role;
  select processed into v_processed from public.process_waiting_expiry(50);
  perform pg_temp.assert(v_processed = 0, 'tick must not reprocess a returned order');
end $$;

\echo 'SECTION 7 OK: waiting maximum, return, failed closure, idempotent tick'

-- -----------------------------------------------------------------------------
-- 8. RLS / PRIVILEGE MATRIX
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

-- OTP codes: NO client access (a readable hash is brute-forceable offline).
do $$
begin
  begin
    perform count(*) from public.order_otp_codes;
    raise exception 'ASSERTION FAILED: authenticated must not read order_otp_codes';
  exception when insufficient_privilege then
    null; -- expected: permission denied (no grants, no policies)
  end;
end $$;

-- Photos: participants read metadata; nobody writes directly.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.order_photos;
  perform pg_temp.assert(v_count >= 6, format('owner must see evidence metadata (got %s)', v_count));

  begin
    insert into public.order_photos (order_id, kind, storage_path, content_type, size_bytes, uploaded_by_role)
    values ('00000000-0000-0000-0000-000000000001', 'rider_pickup', 'x/y/z.jpg', 'image/jpeg', 1, 'rider');
    raise exception 'ASSERTION FAILED: direct insert into order_photos must fail';
  exception when insufficient_privilege then
    null; -- expected: no insert grants (writes only via RPC)
  end;
end $$;

-- Recipient confirmations: participants read.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.order_recipient_confirmations;
  perform pg_temp.assert(v_count >= 1, 'owner must read recipient confirmations');
end $$;

-- M6 audit events exist and are participant-readable.
do $$
declare
  v_triggers text[];
begin
  select array_agg(distinct trigger) into v_triggers
  from public.order_events
  where trigger in ('otp_codes_issued', 'otp_issued', 'photo_recorded', 'return_initiated', 'return_completed');
  perform pg_temp.assert(v_triggers is not null, 'M6 audit events must be recorded and readable by participants');
end $$;

reset role;

\echo 'ALL M6 DATABASE VERIFICATION SECTIONS PASSED'
