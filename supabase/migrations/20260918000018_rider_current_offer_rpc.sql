-- =============================================================================
-- Embee Nexus V2 — Migration 0018: rider current-offer read RPC
-- =============================================================================
-- DEFECT (found during the hosted rider-lifecycle verification):
--   dispatch_offers rows carry only ids/status/timestamps; the limited
--   pre-acceptance delivery information (pickup/dropoff addresses, road
--   distance, rider share) lives on the orders table. The orders RLS policy
--   grants reads to the owner, the ASSIGNED rider, and operators only — an
--   OFFERED rider is none of these. Any API that joins offers to orders
--   therefore returns nothing for the rider who most needs to see the offer.
--   The offer lifecycle worked (SQL-level tests bypass RLS; the RPC layer
--   creates/offers/accepts correctly) but the rider could never SEE it.
--
-- FIX (additive only): a SECURITY DEFINER read RPC that returns the calling
--   rider's single active offer with exactly the limited pre-acceptance
--   fields the founder rule allows. Definer rights are confined to this
--   narrow, caller-scoped projection; no writes, no other columns, no other
--   riders' rows. Ownership/eligibility enforcement stays in the existing
--   accept/decline RPCs, which re-derive the caller under lock.
--
-- The service layer (dispatch-service.getCurrentOffer) switches from the
-- broken inline join to this RPC; no other consumer changes.
-- =============================================================================

create or replace function public.rider_current_offer()
returns table (
  offer_id uuid,
  order_id uuid,
  status text,
  offered_at timestamptz,
  expires_at timestamptz,
  pickup_address text,
  dropoff_address text,
  road_distance_m integer,
  rider_share_kobo bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.order_id, o.status, o.offered_at, o.expires_at,
         ord.pickup_address, ord.dropoff_address, ord.road_distance_m,
         ord.rider_share_kobo
  from public.dispatch_offers o
  join public.orders ord on ord.id = o.order_id
  where o.rider_id = auth.uid()
    and o.status = 'offered'
    and o.expires_at > now()
  order by o.offered_at desc
  limit 1;
$$;

revoke all on function public.rider_current_offer() from public, anon;
grant execute on function public.rider_current_offer() to authenticated;

comment on function public.rider_current_offer() is
  'The calling rider''s single active offer with the limited pre-acceptance delivery fields (founder rule). Definer read confined to caller-owned offered rows; no writes.';
