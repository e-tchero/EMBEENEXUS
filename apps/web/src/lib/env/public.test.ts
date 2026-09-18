import { describe, expect, it } from 'vitest';

import { publicEnv } from '@/lib/env/public';

/**
 * Environment validation tests.
 *
 * The vitest setup (`test/setup.ts`) provides valid placeholder values.
 * Here we verify that the public env module parses that configuration
 * without throwing and never contains server secrets by construction
 * (the schema has no secret fields).
 */
describe('public env', () => {
  it('parses the test-provided environment', () => {
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.local.supabase.co');
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY.length).toBeGreaterThan(0);
  });

  it('contains no server secret fields', () => {
    const keys = Object.keys(publicEnv);
    for (const key of keys) {
      expect(key.startsWith('NEXT_PUBLIC_')).toBe(true);
    }
    expect(keys).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(keys).not.toContain('FLUTTERWAVE_SECRET_KEY');
  });
});
