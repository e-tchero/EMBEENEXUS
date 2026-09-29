'use client';

import { useMemo, useState } from 'react';

import {
  PARCEL_LIMITS,
  parsePositiveNumber,
  validateParcel,
  type ParcelEntry,
} from './parcels';

/**
 * Parcels step of the new-order wizard.
 *
 * Collects only what the founder rules require for the pilot: weight,
 * footprint (length x width), and an optional free-text description, for up
 * to three parcels. Nothing is silently clamped — out-of-limit input is
 * shown as a validation error and blocks continuation. Parcel details are
 * customer-asserted context for the pilot; the authoritative backend
 * contract (quote → order → payment) remains unchanged.
 */

interface ParcelsFormProps {
  onBack: () => void;
  onContinue: (parcels: ParcelEntry[]) => void;
}

const inputClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base focus:border-(--ring) focus:outline-none';
const labelClass = 'block text-xs font-medium text-(--foreground-muted)';

interface DraftParcel {
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  description: string;
}

function emptyParcel(): DraftParcel {
  return { weightKg: '', lengthCm: '', widthCm: '', description: '' };
}

export function ParcelsForm({ onBack, onContinue }: ParcelsFormProps) {
  const [drafts, setDrafts] = useState<DraftParcel[]>([emptyParcel()]);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () =>
      drafts.map((draft) => ({
        weightKg: parsePositiveNumber(draft.weightKg),
        lengthCm: parsePositiveNumber(draft.lengthCm),
        widthCm: parsePositiveNumber(draft.widthCm),
        description: draft.description.trim(),
      })),
    [drafts],
  );

  function update(index: number, patch: Partial<DraftParcel>) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
  }

  function handleContinue() {
    for (let index = 0; index < parsed.length; index += 1) {
      const parcel = parsed[index];
      if (!parcel) continue;
      const message = validateParcel(parcel);
      if (message !== null) {
        setError(`Parcel ${index + 1}: ${message}`);
        return;
      }
    }
    setError(null);
    onContinue(parsed);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-neutral-100 px-4 py-3 text-xs text-(--foreground-muted)">
        <p className="font-medium">What we carry</p>
        <p className="mt-1">
          Up to {PARCEL_LIMITS.maxParcels} parcels per order · max {PARCEL_LIMITS.maxWeightKg} kg
          each · max {PARCEL_LIMITS.maxLengthCm} x {PARCEL_LIMITS.maxWidthCm} cm footprint. Items
          must fit in a motorcycle delivery box and must be legal to carry.
        </p>
      </div>

      {drafts.map((draft, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-neutral-200 p-4">
          <p className="text-sm font-medium">Parcel {index + 1}</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor={`parcel-weight-${index}`} className={labelClass}>
                Weight (kg)
              </label>
              <input
                id={`parcel-weight-${index}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft.weightKg}
                onChange={(event) => update(index, { weightKg: event.target.value })}
                className={`mt-1 ${inputClass}`}
                placeholder="e.g. 4"
              />
            </div>
            <div>
              <label htmlFor={`parcel-length-${index}`} className={labelClass}>
                Length (cm)
              </label>
              <input
                id={`parcel-length-${index}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.lengthCm}
                onChange={(event) => update(index, { lengthCm: event.target.value })}
                className={`mt-1 ${inputClass}`}
                placeholder="e.g. 40"
              />
            </div>
            <div>
              <label htmlFor={`parcel-width-${index}`} className={labelClass}>
                Width (cm)
              </label>
              <input
                id={`parcel-width-${index}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.widthCm}
                onChange={(event) => update(index, { widthCm: event.target.value })}
                className={`mt-1 ${inputClass}`}
                placeholder="e.g. 30"
              />
            </div>
          </div>
          <div>
            <label htmlFor={`parcel-description-${index}`} className={labelClass}>
              Description (optional)
            </label>
            <input
              id={`parcel-description-${index}`}
              type="text"
              autoComplete="off"
              value={draft.description}
              onChange={(event) => update(index, { description: event.target.value })}
              className={`mt-1 ${inputClass}`}
              placeholder="e.g. Documents envelope"
            />
          </div>
          {drafts.length > 1 ? (
            <button
              type="button"
              onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-700 underline underline-offset-4"
            >
              Remove this parcel
            </button>
          ) : null}
        </div>
      ))}

      {drafts.length < PARCEL_LIMITS.maxParcels ? (
        <button
          type="button"
          onClick={() => setDrafts((current) => [...current, emptyParcel()])}
          className="min-h-11 w-full rounded-lg border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-(--foreground-muted) hover:bg-neutral-100"
        >
          + Add another parcel ({drafts.length}/{PARCEL_LIMITS.maxParcels})
        </button>
      ) : (
        <p className="text-center text-xs text-neutral-400">
          Maximum of {PARCEL_LIMITS.maxParcels} parcels per order.
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="min-h-11 flex-1 rounded-lg bg-(--action-ink) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--action-ink-hover)"
        >
          Get price
        </button>
      </div>
    </div>
  );
}
