-- =============================================================================
-- Embee Nexus V2 — Migration 0013: Quote Validity Ten Minutes (D09)
-- =============================================================================
-- FOUNDER DECISION (approved register, transcribed in the M6 authorization):
--   D09 — quote validity is 10 MINUTES.
--
-- This replaces the documented M3 founder-pending default (45 minutes,
-- migration 0005). The change is implemented as a CREATE OR REPLACE of
-- create_quote with a body byte-identical to 0005 except for:
--   * v_validity: 45 → 10 (QUOTE_VALIDITY_MINUTES, now founder-approved),
--   * updated header/comment wording (no founder-pending flag remains).
--
-- SAFETY:
--   * No applied migration is modified; CREATE OR REPLACE preserves the
--     existing signature and EXECUTE grants (granted to authenticated in 0005).
--   * Existing quotes keep the expires_at they were created with — historical
--     rows are never rewritten. Only newly created quotes get the 10-minute
--     window.
--   * Dependent behaviour (quote expiry marking in create_order_from_quote,
--     the lazy-expiry path, pricing-version preservation per D10) is unchanged:
--     they already read expires_at, so no other object requires modification.
--   * Application-side mirror: QUOTE_VALIDITY_MINUTES in
--     apps/web/src/lib/domain/quote.ts changes to 10 in the same milestone.
-- =============================================================================

create or replace function public.create_quote(
  p_pickup_lat      double precision,
  p_pickup_lng      double precision,
  p_pickup_address  text,
  p_dropoff_lat     double precision,
  p_dropoff_lng     double precision,
  p_dropoff_address text,
  -- Server-measured road distance from the maps provider (service layer).
  p_road_distance_m integer
)
returns table (
  quote_id            uuid,
  road_distance_m     integer,
  customer_price_kobo bigint,
  rider_share_kobo    bigint,
  platform_share_kobo bigint,
  expires_at          timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_config  public.pricing_configs;
  v_band    public.pricing_bands;
  v_validity constant integer := 10; -- QUOTE_VALIDITY_MINUTES (D09, founder-approved)
  v_expires timestamptz;
  v_quote   public.quotes;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- M3 scope: customers create quotes. Seller flows arrive in M9.
  if public.has_role(v_caller, 'customer') is not true then
    raise exception 'FORBIDDEN';
  end if;

  -- Bounded, valid inputs.
  if p_pickup_address is null or p_dropoff_address is null
     or char_length(p_pickup_address) not between 1 and 300
     or char_length(p_dropoff_address) not between 1 and 300
     or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180
     or p_dropoff_lat not between -90 and 90 or p_dropoff_lng not between -180 and 180
     or p_road_distance_m is null or p_road_distance_m < 1 or p_road_distance_m > 35000 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Coverage: both endpoints must lie inside active zones (server-side PostGIS).
  if not public.is_point_covered(p_pickup_lat, p_pickup_lng)
     or not public.is_point_covered(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'OUT_OF_COVERAGE';
  end if;

  -- Server-authoritative pricing: re-derive from the ACTIVE config. The
  -- distance comes from our maps provider; the money comes from the database.
  select pc.* into v_config
  from public.pricing_configs pc
  where pc.is_active
  limit 1;

  if v_config.id is null then
    raise exception 'PRICING_UNAVAILABLE';
  end if;

  -- Band semantics: (min, max] with the first band including 0 m.
  select pb.* into v_band
  from public.pricing_bands pb
  where pb.pricing_config_id = v_config.id
    and (
      (pb.min_distance_m = 0 and p_road_distance_m >= pb.min_distance_m)
      or p_road_distance_m > pb.min_distance_m
    )
    and p_road_distance_m <= pb.max_distance_m
  limit 1;

  if v_band.id is null then
    raise exception 'NO_BAND_FOR_DISTANCE';
  end if;

  v_expires := now() + make_interval(mins => v_validity);

  insert into public.quotes (
    customer_id,
    pickup_lat, pickup_lng, pickup_address,
    dropoff_lat, dropoff_lng, dropoff_address,
    road_distance_m,
    pricing_config_id, pricing_version,
    customer_price_kobo, rider_share_kobo, platform_share_kobo,
    coverage_verified, status, expires_at
  ) values (
    v_caller,
    p_pickup_lat, p_pickup_lng, p_pickup_address,
    p_dropoff_lat, p_dropoff_lng, p_dropoff_address,
    p_road_distance_m,
    v_config.id, v_config.version,
    v_band.customer_price_kobo, v_band.rider_share_kobo, v_band.platform_share_kobo,
    true, 'active', v_expires
  )
  returning * into v_quote;

  return query select
    v_quote.id, v_quote.road_distance_m, v_quote.customer_price_kobo,
    v_quote.rider_share_kobo, v_quote.platform_share_kobo, v_quote.expires_at;
end;
$$;

-- Grants are preserved by CREATE OR REPLACE; re-assert them defensively so the
-- function's privilege state is explicit and reproducible from this file.
revoke all on function public.create_quote(double precision, double precision, text, double precision, double precision, text, integer)
  from public, anon;
grant execute on function public.create_quote(double precision, double precision, text, double precision, double precision, text, integer)
  to authenticated;
