import { NextResponse } from 'next/server';

/**
 * Health endpoint — safe by construction.
 * Always dynamic (never evaluated at build time). Reports liveness and
 * which integrations are configured as booleans only; never configuration
 * values, URLs, or secrets.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'embee-nexus-v2',
    version: '0.1.0',
    configured: {
      supabase: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      payments: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
      maps: Boolean(process.env.STADIA_MAPS_API_KEY),
    },
  });
}
