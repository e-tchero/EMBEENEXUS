import 'server-only';

import { createClient } from '@/lib/db/client-server';
import { logger } from '@/lib/logging/logger';

/**
 * Coverage service (M2) — thin server wrapper over the database RPC.
 *
 * The authoritative point-in-zone determination lives in PostgreSQL
 * (`is_point_covered`, migration 0004, SECURITY DEFINER over PostGIS).
 * This module only marshals the call; delivery-level rules (both endpoints
 * covered) are evaluated in the pure domain module `lib/domain/coverage.ts`.
 */

export interface PointCoverageResult {
  readonly covered: boolean;
}

export async function isPointCovered(lat: number, lng: number): Promise<PointCoverageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_point_covered', {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    // The RPC is stable and public-readable; a failure here is a server
    // misconfiguration. Fail closed (uncovered) and log server-side.
    logger.error('coverage.rpc.failed', { code: error.code });
    return { covered: false };
  }

  return { covered: data === true };
}
