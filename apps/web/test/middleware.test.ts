import { beforeEach, describe, expect, it } from 'vitest';

import { middleware } from '@/middleware';

import type { NextRequest } from 'next/server';

/**
 * Middleware regression tests (M0 fix).
 *
 * The M0 implementation originally matched the legacy cookie name
 * `sb-access-token`, which @supabase/ssr never sets — the modern cookie is
 * `sb-<project-ref>-auth-token` (chunked with `.0`, `.1`, … suffixes).
 * These tests pin the corrected detection logic.
 */

function makeRequest(path: string, cookieNames: string[]): NextRequest {
  // Minimal stub of the NextRequest surface the middleware uses
  // (`cookies.getAll`, `nextUrl` incl. `clone`). This avoids depending on
  // Next.js server internals inside unit tests.
  const nextUrl = new URL(`https://embee.test${path}`) as URL & { clone: () => URL };
  nextUrl.clone = () => new URL(nextUrl.toString()) as URL;
  return {
    cookies: {
      getAll: () => cookieNames.map((name) => ({ name, value: 'value' })),
      has: (name: string) => cookieNames.includes(name),
    },
    nextUrl,
  } as unknown as NextRequest;
}

async function run(path: string, cookies: string[]) {
  const request = makeRequest(path, cookies);
  const response = await middleware(request);
  return { response, request };
}

describe('middleware — Supabase session cookie detection', () => {
  beforeEach(() => {
    // Deterministic correlation IDs are not asserted; nothing to seed.
  });

  it('does not redirect authenticated users away from protected pages', async () => {
    const { response } = await run('/dashboard', ['sb-testprojectref-auth-token']);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('detects chunked auth-token cookies', async () => {
    const { response } = await run('/dashboard', [
      'sb-testprojectref-auth-token.0',
      'sb-testprojectref-auth-token.1',
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects unauthenticated users from protected pages to login', async () => {
    const { response } = await run('/dashboard', []);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('ignores unrelated sb- cookies (not auth tokens)', async () => {
    const { response } = await run('/dashboard', ['sb-something-else']);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('bounces cookie-bearing users away from auth pages to the dashboard', async () => {
    const { response } = await run('/login', ['sb-testprojectref-auth-token']);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/dashboard');
  });

  it('sets a correlation id header on every response', async () => {
    const { response } = await run('/dashboard', []);
    const id = response.headers.get('x-correlation-id');
    expect(id).toBeTruthy();
    expect(id!.length).toBeGreaterThanOrEqual(8);
  });

  it('sets correlation ids on redirects too', async () => {
    const { response } = await run('/dashboard', []);
    expect(response.status).toBe(307);
    expect(response.headers.get('x-correlation-id')).toBeTruthy();
  });
});
