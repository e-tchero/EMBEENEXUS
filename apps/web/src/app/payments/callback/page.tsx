import type { Metadata } from 'next';

import { PaymentCallbackClient } from './callback-client';

export const metadata: Metadata = {
  title: 'Payment status',
  robots: { index: false },
};

/**
 * Flutterwave hosted-checkout landing page (M4).
 *
 * Flutterwave redirects the customer here with the transaction reference in
 * the query string after payment. This page is NOT authoritative: it polls
 * GET /api/payments/status, and the server decides the truth. The tx_ref
 * (`ENX-…`) is an opaque token — it identifies the payment attempt for
 * lookup only and contains no sensitive information.
 */
export default function PaymentCallbackPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <PaymentCallbackClient />
      </div>
    </main>
  );
}
