import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/orders'];
const AUTH_PREFIXES = ['/login', '/signup'];

/**
 * Edge middleware — deliberately cheap.
 *
 * 1. Adds a correlation ID to every response for log tracing.
 * 2. Fast-redirects unauthenticated users away from protected prefixes by
 *    checking cookie presence only. This is UX optimization, NOT the
 *    security boundary: every server component and route re-verifies the
 *    session and role server-side (`lib/auth/guards`), and all data access
 *    remains subject to RLS.
 */
export async function middleware(request: NextRequest) {
  const correlationId = crypto.randomUUID();

  let response = NextResponse.next({ request });

  // Cheap unauthenticated check for protected pages.
  const hasSessionCookie = request.cookies.has('sb-access-token');
  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  const isAuthPage = AUTH_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !hasSessionCookie) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', request.nextUrl.pathname);
    response = NextResponse.redirect(redirectUrl);
  } else if (isAuthPage && hasSessionCookie) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    response = NextResponse.redirect(redirectUrl);
  }

  response.headers.set('x-correlation-id', correlationId);
  return response;
}

export const config = {
  matcher: [
    // Exclude static assets and Next internals from middleware work.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
