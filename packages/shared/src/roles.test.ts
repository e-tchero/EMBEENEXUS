import { describe, expect, it } from 'vitest';

import { isOperatorRole, isUserRole, USER_ROLES } from './roles';

describe('roles', () => {
  it('exposes the canonical V2 role set', () => {
    expect(USER_ROLES).toEqual(['customer', 'rider', 'seller', 'operator']);
  });

  it('identifies valid roles', () => {
    expect(isUserRole('customer')).toBe(true);
    expect(isUserRole('operator')).toBe(true);
    expect(isUserRole('admin')).toBe(false);
    expect(isUserRole('super_admin')).toBe(false);
    expect(isUserRole('')).toBe(false);
    expect(isUserRole(42)).toBe(false);
  });

  it('identifies operator roles', () => {
    expect(isOperatorRole('operator')).toBe(true);
    expect(isOperatorRole('customer')).toBe(false);
  });
});
