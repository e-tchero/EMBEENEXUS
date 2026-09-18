import { NextResponse } from 'next/server';

import { requestQuote, type QuoteServiceError } from '@/lib/services/quote-service';

import type { CreateQuoteInput } from '@embee/shared';

/**
 * POST /api/quotes — create a quote (customer).
 *
 * Thin handler: authorization, validation, pricing/coverage/distance all
 * happen in the service/database layers. Client-supplied price/distance are
 * never accepted — the server measures and derives.
 */

const STATUS: Record<QuoteServiceError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_input: 400,
  out_of_coverage: 422,
  distance_exceeds_maximum: 422,
  pricing_unavailable: 503,
  maps_unavailable: 503,
  unknown_error: 500,
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const result = await requestQuote(body as CreateQuoteInput);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'unknown_error' },
      { status: STATUS[result.error ?? 'unknown_error'] },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      quote: {
        id: result.quote!.id,
        roadDistanceMetres: result.quote!.roadDistanceMetres,
        customerPriceKobo: result.quote!.customerPriceKobo,
        riderShareKobo: result.quote!.riderShareKobo,
        platformShareKobo: result.quote!.platformShareKobo,
        expiresAt: result.quote!.expiresAt,
      },
    },
    { status: 201 },
  );
}
