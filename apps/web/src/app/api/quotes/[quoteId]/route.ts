import { NextResponse } from 'next/server';

import { getQuote } from '@/lib/services/quote-service';

/**
 * GET /api/quotes/[quoteId] — retrieve a quote.
 * Visibility (owner/operator) is enforced by RLS; invisible ≡ missing (404).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<NextResponse> {
  const { quoteId } = await params;
  const result = await getQuote(quoteId);

  if (!result.ok) {
    const status = result.error === 'unauthenticated' ? 401 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, quote: result.quote });
}
