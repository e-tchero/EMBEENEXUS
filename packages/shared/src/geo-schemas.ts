import { z } from 'zod';

/**
 * Address search/geocode input schemas shared by the customer wizard and
 * the /api/geo/* routes. Client validation is UX only; the server
 * re-validates before calling the maps provider.
 */

export const addressSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, 'Enter at least 3 characters')
    .max(200, 'Query is too long'),
});

export type AddressSearchInput = z.infer<typeof addressSearchSchema>;

export const geocodePairSchema = z.object({
  pickupAddress: z
    .string()
    .trim()
    .min(1, 'Pickup address is required')
    .max(300, 'Address is too long'),
  dropoffAddress: z
    .string()
    .trim()
    .min(1, 'Destination address is required')
    .max(300, 'Address is too long'),
});

export type GeocodePairInput = z.infer<typeof geocodePairSchema>;

/** Sanitized candidate returned by /api/geo/search (label + coords only). */
export const addressCandidateSchema = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type AddressCandidate = z.infer<typeof addressCandidateSchema>;
