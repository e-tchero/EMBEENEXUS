import 'server-only';

import { createOrderSchema, orderTransitionSchema } from '@embee/shared';

import { assertRole, AuthorizationError } from '@/lib/auth/rbac';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/db/client-server';
import { logger } from '@/lib/logging/logger';

/**
 * Order service (M3).
 *
 * All order writes flow through SECURITY DEFINER RPCs (migration 0005); this
 * module is the thin, safe wrapper: server-side role re-derivation, zod
 * re-validation, RPC error codes → typed safe results. No client-supplied
 * state or price is ever trusted.
 */

export type OrderServiceError =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'quote_expired'
  | 'quote_not_active'
  | 'invalid_transition'
  | 'prerequisite_missing'
  | 'unknown_error';

export interface OrderRefResult {
  readonly ok: boolean;
  readonly order?: { readonly id: string; readonly status: string };
  readonly error?: OrderServiceError;
}

export interface CreateOrderInput {
  readonly quoteId: string;
}

export async function createOrderFromQuote(
  input: CreateOrderInput,
): Promise<OrderRefResult> {
  // 1. Authorization.
  let userId: string;
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: 'unauthenticated' };
    }
    await assertRole(session, ['customer']);
    userId = session.userId;
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: 'forbidden' };
    throw error;
  }

  // 2. Re-validate.
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // 3. RPC (row-locked quote consumption + order + creation event, atomic).
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_order_from_quote', {
    p_quote_id: parsed.data.quoteId,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('order.create_failed', { code, customerId: userId });
    if (code === 'QUOTE_EXPIRED') return { ok: false, error: 'quote_expired' };
    if (code === 'QUOTE_NOT_ACTIVE') return { ok: false, error: 'quote_not_active' };
    if (code === 'NOT_FOUND') return { ok: false, error: 'not_found' };
    if (code === 'FORBIDDEN') return { ok: false, error: 'forbidden' };
    if (code === 'NOT_AUTHENTICATED') return { ok: false, error: 'unauthenticated' };
    return { ok: false, error: 'unknown_error' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; status: string }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('order.created', { orderId: row.order_id });
  return { ok: true, order: { id: row.order_id, status: row.status } };
}

export interface OrderTransitionInput {
  readonly orderId: string;
  readonly trigger: string;
  readonly notes?: string;
}

export interface OrderTransitionResult {
  readonly ok: boolean;
  readonly order?: { readonly id: string; readonly status: string };
  readonly error?: OrderServiceError;
}

/**
 * Applies a lifecycle transition. The RPC validates actor permissions,
 * preconditions, and the (state, trigger) pair under a row lock, then writes
 * an immutable order event in the same transaction.
 */
export async function applyOrderTransition(
  input: OrderTransitionInput,
): Promise<OrderTransitionResult> {
  // 1. Authorization — customers, assigned riders, operators act; the RPC
  //    enforces ownership/assignment per transition.
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: 'unauthenticated' };
    }
    await assertRole(session, ['customer', 'rider', 'operator']);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: 'forbidden' };
    throw error;
  }

  // 2. Re-validate.
  const parsed = orderTransitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  // 3. RPC.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_transition', {
    p_order_id: parsed.data.orderId,
    p_trigger: parsed.data.trigger,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    logger.warn('order.transition_failed', { code, orderId: parsed.data.orderId });
    if (code === 'INVALID_TRANSITION') return { ok: false, error: 'invalid_transition' };
    if (code === 'PREREQUISITE_MISSING') return { ok: false, error: 'prerequisite_missing' };
    if (code === 'NOT_FOUND') return { ok: false, error: 'not_found' };
    if (code === 'FORBIDDEN') return { ok: false, error: 'forbidden' };
    if (code === 'NOT_AUTHENTICATED') return { ok: false, error: 'unauthenticated' };
    return { ok: false, error: 'unknown_error' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id: string; status: string }
    | null;
  if (!row) return { ok: false, error: 'unknown_error' };

  logger.info('order.transitioned', { orderId: row.order_id, status: row.status });
  return { ok: true, order: { id: row.order_id, status: row.status } };
}
