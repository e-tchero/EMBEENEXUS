import 'server-only';

import { logger } from '@/lib/logging/logger';

import type { Session } from '@/lib/auth/session';

/**
 * Server-side RBAC helpers (M1).
 *
 * Route guards redirect browsers; these helpers serve server actions and
 * APIs where a safe, non-leaking response is required. Authorization always
 * re-derives the role server-side; client input is never consulted.
 */

export class AuthorizationError extends Error {
  constructor() {
    super('FORBIDDEN');
  }
}

export class AuthenticationError extends Error {
  constructor() {
    super('UNAUTHENTICATED');
  }
}

/** Assert the current session holds one of the given roles, else throw. */
export async function assertRole(session: Session, roles: readonly string[]): Promise<void> {
  if (!session.role || !roles.includes(session.role)) {
    logger.warn('rbac.denied', { requiredRoles: roles.join(','), hasRole: session.role ?? null });
    throw new AuthorizationError();
  }
}

/**
 * Map a Supabase RPC error to a safe ActionResult failure.
 *
 * Known domain error codes (raised by our SECURITY DEFINER RPCs) map to
 * precise, actionable messages; anything else is logged with context and
 * surfaced as a generic failure so internals never leak to clients.
 */
export function rpcErrorToActionFailure(
  error: { code?: string; message: string },
  fallback: string,
): string {
  const code = error.code ?? '';
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return 'You must be signed in.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'INVALID_TRANSITION':
      return 'This action is not valid for the current state.';
    case 'INVALID_DECISION':
      return 'Unknown decision.';
    case 'NOT_FOUND':
      return 'Not found.';
    case 'USER_NOT_RIDER_ROLE':
      return 'The account must hold the rider role first.';
    default:
      // Postgres error codes we deliberately treat generically:
      // 23505 unique_violation, 23514 check_violation, 42501 insufficient_privilege.
      if (code === '23505') return 'That value is already in use.';
      if (code === '42501') return 'You do not have permission to perform this action.';
      logger.error('rpc.unmapped_error', { code: code || null, message: error.message });
      return fallback;
  }
}
