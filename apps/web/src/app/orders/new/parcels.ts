/**
 * Client-side parcel form helpers for the new-order wizard.
 *
 * The parcel limits below are founder product rules for the Abuja pilot
 * (max 65 kg, max 50 x 40 cm footprint, max 3 parcels per order). They gate
 * the FORM only — the quote/order/payment backend remains the sole
 * authority for money, state, and coverage. No value is ever silently
 * clamped: invalid input is surfaced as a validation error instead.
 */

export const PARCEL_LIMITS = {
  /** Maximum weight per parcel, in kilograms. */
  maxWeightKg: 65,
  /** Maximum footprint per parcel: 50 x 40 cm. */
  maxLengthCm: 50,
  maxWidthCm: 40,
  /** Maximum number of parcels per order. */
  maxParcels: 3,
} as const;

/** A single parcel row in the form. Amounts are free-text inputs. */
export interface ParcelEntry {
  /** Non-empty when the row has a parseable weight within limits. */
  weightKg: number | null;
  /** Non-empty when the row has a parseable length within limits. */
  lengthCm: number | null;
  /** Non-empty when the row has a parseable width within limits. */
  widthCm: number | null;
  /** Free-text description; optional for the pilot. */
  description: string;
}

/** Parses a numeric input, rejecting non-finite and non-positive values. */
export function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Validates one parcel entry against the founder limits.
 * Returns an error message string when invalid, null when valid.
 * The description is always acceptable (optional free text).
 */
export function validateParcel(parcel: ParcelEntry): string | null {
  if (parcel.weightKg === null) {
    return 'Enter the parcel weight in kilograms.';
  }
  if (parcel.weightKg > PARCEL_LIMITS.maxWeightKg) {
    return `Weight must be at most ${PARCEL_LIMITS.maxWeightKg} kg.`;
  }
  if (parcel.lengthCm === null) {
    return 'Enter the parcel length in centimetres.';
  }
  if (parcel.lengthCm > PARCEL_LIMITS.maxLengthCm) {
    return `Length must be at most ${PARCEL_LIMITS.maxLengthCm} cm.`;
  }
  if (parcel.widthCm === null) {
    return 'Enter the parcel width in centimetres.';
  }
  if (parcel.widthCm > PARCEL_LIMITS.maxWidthCm) {
    return `Width must be at most ${PARCEL_LIMITS.maxWidthCm} cm.`;
  }
  return null;
}
