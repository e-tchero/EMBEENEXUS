import 'server-only';

import { assertRole } from '@/lib/auth/rbac';
import { getSession, type Session } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/client-admin';
import { createClient } from '@/lib/db/client-server';

import { ALL_STATUSES, TERMINAL_ORDER_STATUSES, type OrderStatus } from '@/lib/domain/order-state';
import {
  operatorAttentionReasons,
  type OperatorAttentionReason,
} from '@/lib/domain/operator-attention';

// ---------------------------------------------------------------------------
// Authorization: every entry point re-verifies the operator role server-side.
// RLS remains the data boundary; the only admin-client reads are the two the
// client surface structurally cannot see (offers/availability before their
// 0019 operator policies reach older environments, and rider identities that
// profiles RLS scopes to self for everyone). Both are read-only.
// ---------------------------------------------------------------------------

type OperatorGuard = { ok: true; session: Session } | { ok: false; error: 'unauthenticated' | 'forbidden' };

async function requireOperator(): Promise<OperatorGuard> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };
  try {
    await assertRole(session, ['operator']);
  } catch {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true, session };
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ALL_STATUSES as readonly string[]).includes(value);
}

export interface OperatorOrderListItem {
  readonly id: string;
  readonly status: OrderStatus;
  readonly customerName: string;
  readonly riderName: string | null;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly customerPriceKobo: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastTrigger: string | null;
  readonly lastEventAt: string | null;
  readonly attention: readonly OperatorAttentionReason[];
}

export interface OperatorOverview {
  readonly totals: {
    readonly orders: number;
    readonly active: number;
    readonly completed: number;
    readonly failed: number;
    readonly cancelled: number;
  };
  readonly payments: {
    readonly successful: number;
    readonly failedOrStuck: number;
  };
  readonly riders: {
    readonly available: number;
    readonly committed: number;
    readonly awaitingReview: number;
  };
  readonly attention: readonly OperatorOrderListItem[];
}

const ACTIVE_STATUSES: readonly OrderStatus[] = ALL_STATUSES.filter(
  (status) => !TERMINAL_ORDER_STATUSES.includes(status) && status !== 'completed',
);

// ---------------------------------------------------------------------------
// 1. Overview — the operator home answers
// ---------------------------------------------------------------------------

export async function getOperatorOverview(): Promise<
  { ok: true; overview: OperatorOverview } | { ok: false; error: 'unauthenticated' | 'forbidden' | 'unknown_error' }
> {
  const guard = await requireOperator();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(
      'id, status, rider_id, customer_id, pickup_address, dropoff_address, customer_price_kobo, created_at, updated_at, waiting_started_at, return_initiated_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (ordersError) return { ok: false, error: 'unknown_error' };

  const { data: payments } = await supabase.from('payments').select('order_id, status');
  const { data: events } = await supabase
    .from('order_events')
    .select('order_id, trigger, created_at')
    .order('created_at', { ascending: true });
  const { data: offers } = await supabase
    .from('dispatch_offers')
    .select('order_id, rider_id, status, offered_at')
    .order('offered_at', { ascending: false });
  const { data: availability } = await supabase
    .from('rider_availability')
    .select('rider_id, is_available, available_since');

  // Operator-scoped identity resolution: profiles RLS grants operators read
  // over profiles; riders additionally resolve through rider_profiles.
  const { data: riderProfiles } = await supabase
    .from('rider_profiles')
    .select('id, verification_status');
  const { data: profiles } = await supabase.from('profiles').select('id, full_name');

  const profileName = new Map<string, string>();
  for (const row of profiles ?? []) profileName.set(row.id, row.full_name);
  const riderName = (id: string | null): string | null =>
    id ? (profileName.get(id) ?? 'Rider') : null;
  const verificationStatus = new Map<string, string>();
  for (const row of riderProfiles ?? []) verificationStatus.set(row.id, row.verification_status);

  const eventsByOrder = new Map<string, { trigger: string; createdAt: string }[]>();
  for (const event of events ?? []) {
    const list = eventsByOrder.get(event.order_id) ?? [];
    list.push({ trigger: event.trigger, createdAt: event.created_at });
    eventsByOrder.set(event.order_id, list);
  }
  const offersByOrder = new Map<string, { status: string; offeredAt: string }[]>();
  for (const offer of offers ?? []) {
    const list = offersByOrder.get(offer.order_id) ?? [];
    list.push({ status: offer.status, offeredAt: offer.offered_at });
    offersByOrder.set(offer.order_id, list);
  }
  const paymentByOrder = new Map<string, string>();
  for (const payment of payments ?? []) paymentByOrder.set(payment.order_id, payment.status);

  const now = new Date().toISOString();
  const rows = (orders ?? []).filter((order) => isOrderStatus(order.status));

  const items: OperatorOrderListItem[] = rows.map((order) => {
    const orderEvents = eventsByOrder.get(order.id) ?? [];
    const last = orderEvents[orderEvents.length - 1] ?? null;
    return {
      id: order.id,
      status: order.status,
      customerName: profileName.get(order.customer_id) ?? 'Customer',
      riderName: riderName(order.rider_id),
      pickupAddress: order.pickup_address,
      dropoffAddress: order.dropoff_address,
      customerPriceKobo: String(order.customer_price_kobo),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      lastTrigger: last?.trigger ?? null,
      lastEventAt: last?.createdAt ?? null,
      attention: operatorAttentionReasons({
        status: order.status,
        events: orderEvents,
        paymentStatus: paymentByOrder.get(order.id) ?? null,
        offers: offersByOrder.get(order.id) ?? [],
        returnInitiated: order.return_initiated_at !== null,
        now,
      }),
    };
  });

  const attention = items
    .filter((item) => item.attention.length > 0)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 25);

  const committedRiders = new Set(
    rows
      .filter((order) => order.rider_id !== null && !TERMINAL_ORDER_STATUSES.includes(order.status))
      .map((order) => order.rider_id as string),
  );

  const { count: awaitingReview } = await supabase
    .from('rider_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('verification_status', 'under_review');

  const overview: OperatorOverview = {
    totals: {
      orders: rows.length,
      active: rows.filter((order) => ACTIVE_STATUSES.includes(order.status)).length,
      completed: rows.filter((order) => order.status === 'completed').length,
      failed: rows.filter((order) => order.status === 'failed').length,
      cancelled: rows.filter((order) => order.status === 'cancelled').length,
    },
    payments: {
      successful: (payments ?? []).filter((payment) => payment.status === 'successful').length,
      failedOrStuck: (payments ?? []).filter(
        (payment) =>
          payment.status !== 'successful' &&
          payment.status !== 'cancelled' &&
          payment.status !== 'failed',
      ).length,
    },
    riders: {
      available: (availability ?? []).filter((row) => row.is_available).length,
      committed: committedRiders.size,
      awaitingReview: awaitingReview ?? 0,
    },
    attention,
  };

  return { ok: true, overview };
}

// ---------------------------------------------------------------------------
// 2. Order monitor — list with canonical status filters
// ---------------------------------------------------------------------------

export type OperatorOrderFilter = 'all' | 'active' | OrderStatus;

export async function listOperatorOrders(
  filterRaw: string | null,
): Promise<
  { ok: true; orders: readonly OperatorOrderListItem[] } | { ok: false; error: 'unauthenticated' | 'forbidden' | 'invalid_input' | 'unknown_error' }
> {
  const guard = await requireOperator();
  if (!guard.ok) return guard;

  const filter = (filterRaw ?? 'all') as OperatorOrderFilter;
  if (
    filter !== 'all' &&
    filter !== 'active' &&
    !(ALL_STATUSES as readonly string[]).includes(filter)
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  const supabase = await createClient();
  let query = supabase
    .from('orders')
    .select(
      'id, status, rider_id, customer_id, pickup_address, dropoff_address, customer_price_kobo, created_at, updated_at, return_initiated_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter === 'active') {
    query = query.in('status', ACTIVE_STATUSES as unknown as string[]);
  } else if (filter !== 'all') {
    query = query.eq('status', filter);
  }

  const { data: orders, error } = await query;
  if (error) return { ok: false, error: 'unknown_error' };

  const ids = (orders ?? []).map((order) => order.id);
  const { data: events } = ids.length
    ? await supabase
        .from('order_events')
        .select('order_id, trigger, created_at')
        .in('order_id', ids)
        .order('created_at', { ascending: true })
    : { data: [] };
  const { data: profiles } = await supabase.from('profiles').select('id, full_name');

  const profileName = new Map<string, string>();
  for (const row of profiles ?? []) profileName.set(row.id, row.full_name);
  const eventsByOrder = new Map<string, { trigger: string; createdAt: string }[]>();
  for (const event of events ?? []) {
    const list = eventsByOrder.get(event.order_id) ?? [];
    list.push({ trigger: event.trigger, createdAt: event.created_at });
    eventsByOrder.set(event.order_id, list);
  }

  const items: OperatorOrderListItem[] = (orders ?? []).map((order) => {
    const orderEvents = eventsByOrder.get(order.id) ?? [];
    const last = orderEvents[orderEvents.length - 1] ?? null;
    return {
      id: order.id,
      status: order.status,
      customerName: profileName.get(order.customer_id) ?? 'Customer',
      riderName: order.rider_id ? (profileName.get(order.rider_id) ?? 'Rider') : null,
      pickupAddress: order.pickup_address,
      dropoffAddress: order.dropoff_address,
      customerPriceKobo: String(order.customer_price_kobo),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      lastTrigger: last?.trigger ?? null,
      lastEventAt: last?.createdAt ?? null,
      attention: [],
    };
  });

  return { ok: true, orders: items };
}

// ---------------------------------------------------------------------------
// 3. Order detail — timeline, payment, dispatch, evidence, rider
// ---------------------------------------------------------------------------

export interface OperatorOrderDetail {
  readonly order: {
    readonly id: string;
    readonly status: OrderStatus;
    readonly customerName: string;
    readonly riderName: string | null;
    readonly riderId: string | null;
    readonly pickupAddress: string;
    readonly dropoffAddress: string;
    readonly roadDistanceM: number;
    readonly customerPriceKobo: string;
    readonly riderShareKobo: string;
    readonly platformShareKobo: string;
    readonly cancellationReason: string | null;
    readonly failureReason: string | null;
    readonly waitingStartedAt: string | null;
    readonly waitingChargeKobo: string;
    readonly returnInitiatedAt: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly events: readonly {
    readonly trigger: string;
    readonly previousStatus: string;
    readonly newStatus: string;
    readonly actorRole: string;
    readonly notes: string | null;
    readonly createdAt: string;
  }[];
  readonly payment: {
    readonly status: string;
    readonly expectedAmountKobo: string;
    readonly verifiedAmountKobo: string | null;
    readonly verifiedAt: string | null;
    readonly failureReason: string | null;
    readonly createdAt: string;
  } | null;
  readonly dispatch: {
    readonly offers: readonly {
      readonly id: string;
      readonly riderName: string | null;
      readonly status: string;
      readonly offeredAt: string;
      readonly expiresAt: string;
      readonly respondedAt: string | null;
    }[];
    readonly attemptCount: number;
    readonly assignedRiderName: string | null;
  } | null;
  readonly evidence: readonly {
    readonly kind: string;
    readonly contentType: string;
    readonly sizeBytes: string;
    readonly uploadedByRole: string;
    readonly createdAt: string;
  }[];
  readonly attention: readonly OperatorAttentionReason[];
}

export async function getOperatorOrderDetail(
  orderId: string,
): Promise<
  { ok: true; detail: OperatorOrderDetail } | { ok: false; error: 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_input' | 'unknown_error' }
> {
  const guard = await requireOperator();
  if (!guard.ok) return guard;

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, error: 'not_found' };

  const supabase = await createClient();
  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, status, rider_id, customer_id, pickup_address, dropoff_address, road_distance_m, customer_price_kobo, rider_share_kobo, platform_share_kobo, cancellation_reason, failure_reason, waiting_started_at, waiting_charge_kobo, return_initiated_at, created_at, updated_at',
    )
    .eq('id', orderId)
    .maybeSingle();

  interface OrderDetailRow {
    id: string;
    status: string;
    rider_id: string | null;
    customer_id: string;
    pickup_address: string;
    dropoff_address: string;
    road_distance_m: number;
    customer_price_kobo: string | number;
    rider_share_kobo: string | number;
    platform_share_kobo: string | number;
    cancellation_reason: string | null;
    failure_reason: string | null;
    waiting_started_at: string | null;
    waiting_charge_kobo: string | number | null;
    return_initiated_at: string | null;
    created_at: string;
    updated_at: string;
  }

  const row = order as OrderDetailRow | null;
  if (!row || !isOrderStatus(row.status)) return { ok: false, error: 'not_found' };

  const [{ data: events }, { data: payment }, { data: photos }, { data: profiles }] =
    await Promise.all([
      supabase
        .from('order_events')
        .select('trigger, previous_status, new_status, actor_role, notes, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      supabase
        .from('payments')
        .select(
          'status, expected_amount_kobo, verified_amount_kobo, verified_at, failure_reason, created_at',
        )
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('order_photos')
        .select('kind, content_type, size_bytes, uploaded_by_role, created_at')
        .eq('order_id', orderId),
      supabase.from('profiles').select('id, full_name'),
    ]);

  // Dispatch visibility (offers + assignment identity): operator-authorized
  // admin read — see requireOperator above and migration 0019.
  const admin = createAdminClient();
  const [{ data: offers }, { data: riderProfile }] = await Promise.all([
    admin
      .from('dispatch_offers')
      .select('id, rider_id, status, offered_at, expires_at, responded_at')
      .eq('order_id', orderId)
      .order('offered_at', { ascending: true }),
    row.rider_id
      ? admin.from('rider_profiles').select('id').eq('id', row.rider_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profileName = new Map<string, string>();
  for (const item of profiles ?? []) profileName.set(item.id, item.full_name);
  const riderNameFor = (id: string | null): string | null =>
    id ? (profileName.get(id) ?? (riderProfile ? 'Rider' : null)) : null;

  const detail: OperatorOrderDetail = {
    order: {
      id: row.id,
      status: row.status,
      customerName: profileName.get(row.customer_id) ?? 'Customer',
      riderName: riderNameFor(row.rider_id),
      riderId: row.rider_id,
      pickupAddress: row.pickup_address,
      dropoffAddress: row.dropoff_address,
      roadDistanceM: row.road_distance_m,
      customerPriceKobo: String(row.customer_price_kobo),
      riderShareKobo: String(row.rider_share_kobo),
      platformShareKobo: String(row.platform_share_kobo),
      cancellationReason: row.cancellation_reason,
      failureReason: row.failure_reason,
      waitingStartedAt: row.waiting_started_at,
      waitingChargeKobo: String(row.waiting_charge_kobo ?? '0'),
      returnInitiatedAt: row.return_initiated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    events: (events ?? []).map((event) => ({
      trigger: event.trigger,
      previousStatus: event.previous_status,
      newStatus: event.new_status,
      actorRole: event.actor_role,
      notes: event.notes,
      createdAt: event.created_at,
    })),
    payment: payment
      ? {
          status: payment.status,
          expectedAmountKobo: String(payment.expected_amount_kobo),
          verifiedAmountKobo:
            payment.verified_amount_kobo === null ? null : String(payment.verified_amount_kobo),
          verifiedAt: payment.verified_at,
          failureReason: payment.failure_reason,
          createdAt: payment.created_at,
        }
      : null,
    dispatch: {
      offers: (offers ?? []).map((offer) => ({
        id: offer.id,
        riderName: riderNameFor(offer.rider_id),
        status: offer.status,
        offeredAt: offer.offered_at,
        expiresAt: offer.expires_at,
        respondedAt: offer.responded_at,
      })),
      attemptCount: (offers ?? []).length,
      assignedRiderName: riderNameFor(row.rider_id),
    },
    evidence: (photos ?? []).map((photo) => ({
      kind: photo.kind,
      contentType: photo.content_type,
      sizeBytes: String(photo.size_bytes),
      uploadedByRole: photo.uploaded_by_role,
      createdAt: photo.created_at,
    })),
    attention: [],
  };

  const attention = operatorAttentionReasons({
    status: row.status,
    events: (events ?? []).map((event) => ({ trigger: event.trigger, createdAt: event.created_at })),
    paymentStatus: payment?.status ?? null,
    offers: (offers ?? []).map((offer) => ({ status: offer.status, offeredAt: offer.offered_at })),
    returnInitiated: row.return_initiated_at !== null,
    now: new Date().toISOString(),
  });

  return { ok: true, detail: { ...detail, attention } };
}

// ---------------------------------------------------------------------------
// 4. Rider visibility — dispatch operations
// ---------------------------------------------------------------------------

export interface OperatorRiderView {
  readonly id: string;
  readonly name: string;
  readonly verificationStatus: string;
  readonly isActive: boolean;
  readonly available: boolean | null;
  readonly availableSince: string | null;
  readonly activeOrder: { readonly id: string; readonly status: OrderStatus } | null;
  readonly currentOffer: { readonly id: string; readonly orderId: string; readonly status: string; readonly offeredAt: string; readonly expiresAt: string } | null;
  readonly lastEventAt: string | null;
}

export async function listOperatorRiders(): Promise<
  { ok: true; riders: readonly OperatorRiderView[] } | { ok: false; error: 'unauthenticated' | 'forbidden' | 'unknown_error' }
> {
  const guard = await requireOperator();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const [{ data: riderProfiles }, { data: profiles }] = await Promise.all([
    supabase
      .from('rider_profiles')
      .select('id, verification_status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase.from('profiles').select('id, full_name, is_active, role').eq('role', 'rider'),
  ]);

  const riderIds = (riderProfiles ?? []).map((rider) => rider.id);
  const [{ data: availability }, { data: activeOrders }, { data: activeOffers }] =
    await Promise.all([
      riderIds.length
        ? supabase
            .from('rider_availability')
            .select('rider_id, is_available, available_since')
            .in('rider_id', riderIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from('orders')
        .select('id, status, rider_id, updated_at')
        .in(
          'status',
          ['rider_assigned', 'en_route_pickup', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination'] as unknown as string[],
        )
        .order('updated_at', { ascending: false }),
      supabase
        .from('dispatch_offers')
        .select('id, order_id, rider_id, status, offered_at, expires_at')
        .eq('status', 'offered')
        .order('offered_at', { ascending: false }),
    ]);

  const profileById = new Map<string, { full_name: string; is_active: boolean }>();
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, { full_name: profile.full_name, is_active: profile.is_active });
  }
  const availabilityByRider = new Map<string, { is_available: boolean; available_since: string | null }>();
  for (const row of availability ?? []) {
    availabilityByRider.set(row.rider_id, { is_available: row.is_available, available_since: row.available_since });
  }
  const activeOrderByRider = new Map<string, { id: string; status: string; updated_at: string }>();
  for (const order of activeOrders ?? []) {
    if (order.rider_id && !activeOrderByRider.has(order.rider_id)) {
      activeOrderByRider.set(order.rider_id, order);
    }
  }
  const offerByRider = new Map<string, { id: string; order_id: string; status: string; offered_at: string; expires_at: string }>();
  for (const offer of activeOffers ?? []) {
    if (!offerByRider.has(offer.rider_id)) offerByRider.set(offer.rider_id, offer);
  }

  const riders: OperatorRiderView[] = (riderProfiles ?? []).map((rider) => {
    const profile = profileById.get(rider.id);
    const avail = availabilityByRider.get(rider.id) ?? null;
    const activeOrder = activeOrderByRider.get(rider.id) ?? null;
    const offer = offerByRider.get(rider.id) ?? null;
    return {
      id: rider.id,
      name: profile?.full_name || 'Rider',
      verificationStatus: rider.verification_status,
      isActive: profile?.is_active ?? false,
      available: avail ? avail.is_available : null,
      availableSince: avail?.available_since ?? null,
      activeOrder:
        activeOrder && isOrderStatus(activeOrder.status)
          ? { id: activeOrder.id, status: activeOrder.status }
          : null,
      currentOffer: offer
        ? {
            id: offer.id,
            orderId: offer.order_id,
            status: offer.status,
            offeredAt: offer.offered_at,
            expiresAt: offer.expires_at,
          }
        : null,
      lastEventAt: rider.updated_at,
    };
  });

  return { ok: true, riders };
}

// ---------------------------------------------------------------------------
// 5. Job visibility — honest, real checks only
// ---------------------------------------------------------------------------

export interface OperatorJobsView {
  readonly jobs: readonly {
    readonly job: 'dispatch-tick' | 'waiting-tick' | 'reconcile-payments';
    readonly route: string;
    readonly purpose: string;
    readonly lastObservedSignal: string;
  }[];
  readonly appHealth: {
    readonly ok: boolean;
    readonly configured: Record<string, boolean>;
  } | null;
}

/**
 * Operator job visibility. The tick routes are jobs-token/operator gated and
 * idempotent; rather than fabricate a health number, the console surfaces the
 * routes' purposes and the real application health check. Per-order evidence
 * of functioning dispatch (offers being created and expiring, continuations)
 * is visible on the order monitor itself.
 */
export async function getOperatorJobs(): Promise<
  { ok: true; jobs: OperatorJobsView } | { ok: false; error: 'unauthenticated' | 'forbidden' | 'unknown_error' }
> {
  const guard = await requireOperator();
  if (!guard.ok) return guard;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000';
  let appHealth: OperatorJobsView['appHealth'] = null;
  try {
    const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as {
        status?: string;
        configured?: Record<string, boolean>;
      };
      appHealth = {
        ok: body.status === 'ok',
        configured: body.configured ?? {},
      };
    }
  } catch {
    appHealth = { ok: false, configured: {} };
  }

  return {
    ok: true,
    jobs: {
      jobs: [
        {
          job: 'dispatch-tick',
          route: 'POST /api/jobs/dispatch-tick',
          purpose: 'Expires due offers (20s TTL) and continues dispatch to the next eligible rider.',
          lastObservedSignal: 'Offer/continuation events on the order monitor; expiry visible per order.',
        },
        {
          job: 'waiting-tick',
          route: 'POST /api/jobs/waiting-tick',
          purpose: 'Initiates returns for orders past the 30-minute waiting maximum and books the capped fee.',
          lastObservedSignal: 'return_initiated events and waiting fees on affected orders.',
        },
        {
          job: 'reconcile-payments',
          route: 'POST /api/jobs/reconcile-payments',
          purpose: 'Re-verifies payments left unverified after the processing window.',
          lastObservedSignal: 'Payment status transitions on the order detail payment panel.',
        },
      ],
      appHealth,
    },
  };
}
