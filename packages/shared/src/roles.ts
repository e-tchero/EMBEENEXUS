/**
 * Canonical role model for Embee Nexus V2.
 *
 * Roles are stored in the database (`profiles.role`) and enforced by RLS +
 * server-side authorization. This module is client-safe: it is used by both
 * browser code (for UI presentation only) and server code (for enforcement).
 *
 * SECURITY: Client-side role checks are never a security boundary. The
 * database and server always re-resolve the role from the authenticated
 * session — a client-supplied role value is untrusted input.
 */

export const USER_ROLES = ['customer', 'rider', 'seller', 'operator'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that may access operational/admin surfaces. Enforced server-side. */
export const OPERATOR_ROLES: readonly UserRole[] = ['operator'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function isOperatorRole(role: UserRole): boolean {
  return OPERATOR_ROLES.includes(role);
}
