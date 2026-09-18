import { z } from 'zod';

/**
 * Rider/vehicle input schemas shared by client forms and server actions.
 * Client validation is UX only; the server re-validates and the database
 * (constraints + RPCs) remains the final authority.
 */

const platePattern = /^[A-Za-z0-9-]{4,20}$/;

export const addVehicleSchema = z.object({
  make: z.string().trim().min(1, 'Make is required').max(80),
  model: z.string().trim().min(1, 'Model is required').max(80),
  year: z.coerce
    .number()
    .int('Year must be a whole number')
    .min(1980, 'Year must be 1980 or later')
    .max(2100)
    .optional(),
  plateNumber: z
    .string()
    .trim()
    .regex(platePattern, 'Plate must be 4-20 letters, numbers or dashes'),
});

export type AddVehicleInput = z.infer<typeof addVehicleSchema>;

export const reviewDecisionSchema = z.object({
  riderId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(500).optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

export const promoteToRiderSchema = z.object({
  userId: z.string().uuid(),
});

export type PromoteToRiderInput = z.infer<typeof promoteToRiderSchema>;
