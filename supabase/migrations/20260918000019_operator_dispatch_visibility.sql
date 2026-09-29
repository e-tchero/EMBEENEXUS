-- =============================================================================
-- 0019 — Operator dispatch visibility (closed Abuja pilot, M5 console)
-- =============================================================================
-- The operator console needs read visibility into dispatch state (current
-- offer, expiry, attempt counts) and rider availability/queue state. Both
-- tables previously granted SELECT to the offered rider only, which is the
-- correct customer/rider surface — operators are the third participant class
-- already recognized by every other RLS policy (orders, quotes, payments,
-- events, rider_profiles).
--
-- Scope: SELECT ONLY, for authenticated operators, via the existing
-- public.has_role('operator') predicate. No INSERT/UPDATE/DELETE policy is
-- added: offer creation/mutation stays exclusive to the dispatch RPCs, and
-- availability stays rider-owned. No columns are exposed to customers or
-- riders beyond what they already see.
-- =============================================================================

create policy dispatch_offers_select_operator
  on public.dispatch_offers for select
  to authenticated
  using (public.has_role('operator'));

create policy rider_availability_select_operator
  on public.rider_availability for select
  to authenticated
  using (public.has_role('operator'));

comment on policy dispatch_offers_select_operator on public.dispatch_offers is
  'Operators read dispatch offers for console dispatch visibility; writes remain RPC-only.';
comment on policy rider_availability_select_operator on public.rider_availability is
  'Operators read rider availability/queue state for console dispatch visibility; writes remain rider-owned.';
