'use client';

import { useState } from 'react';

import { LocationsForm, type LocationsResult } from './locations-form';
import { ParcelsForm } from './parcels-form';
import { QuoteForm } from './quote-form';
import { PaymentStep } from './payment-step';
import type { ParcelEntry } from './parcels';

/**
 * Customer new-order wizard — client state machine over four steps:
 * locations → parcels → quote → payment. Each step performs a REAL server
 * operation (geocode/quote, order create, hosted checkout); there is no
 * simulated success anywhere. Prices, distances and expiry always come
 * from the authoritative server quote.
 */

type Step = 'locations' | 'parcels' | 'quote' | 'payment';

interface AcceptedQuote {
  readonly id: string;
  readonly customerPriceKobo: string;
}

const STEP_LABELS: Record<Step, string> = {
  locations: 'Locations',
  parcels: 'Parcels',
  quote: 'Price',
  payment: 'Payment',
};

const STEP_ORDER: readonly Step[] = ['locations', 'parcels', 'quote', 'payment'];

export function NewOrderWizard() {
  const [step, setStep] = useState<Step>('locations');
  const [locations, setLocations] = useState<LocationsResult | null>(null);
  const [parcels, setParcels] = useState<ParcelEntry[] | null>(null);
  const [quote, setQuote] = useState<AcceptedQuote | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-4">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">New delivery</h1>
        </div>
        <ol className="flex gap-1" aria-label="Progress">
          {STEP_ORDER.map((label, index) => (
            <li
              key={label}
              className={`h-1.5 flex-1 rounded-full ${
                index <= stepIndex ? 'bg-(--action-ink)' : 'bg-neutral-200'
              }`}
              aria-current={index === stepIndex ? 'step' : undefined}
              title={STEP_LABELS[label]}
            />
          ))}
        </ol>
      </header>

      {step === 'locations' ? (
        <LocationsForm
          onBack={() => {
            window.location.href = '/dashboard';
          }}
          onContinue={(result) => {
            setLocations(result);
            setStep('parcels');
          }}
        />
      ) : null}

      {step === 'parcels' && locations ? (
        <ParcelsForm
          onBack={() => setStep('locations')}
          onContinue={(result) => {
            setParcels(result);
            setStep('quote');
          }}
        />
      ) : null}

      {step === 'quote' && locations && parcels ? (
        <QuoteForm
          pickup={locations.pickup}
          dropoff={locations.dropoff}
          parcels={parcels}
          onBack={() => setStep('parcels')}
          onQuoteAccepted={(accepted) => {
            setQuote({ id: accepted.id, customerPriceKobo: accepted.customerPriceKobo });
            setStep('payment');
          }}
        />
      ) : null}

      {step === 'payment' && locations && parcels && quote ? (
        <PaymentStep
          quoteId={quote.id}
          priceKobo={quote.customerPriceKobo}
          pickupAddress={locations.pickup.address}
          dropoffAddress={locations.dropoff.address}
          parcels={parcels}
          onBack={() => setStep('quote')}
          onQuoteExpired={() => setStep('quote')}
        />
      ) : null}
    </div>
  );
}
