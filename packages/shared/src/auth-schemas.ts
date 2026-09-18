import { z } from 'zod';

/**
 * Authentication-related request schemas.
 *
 * These are the single source of truth for the shape of auth inputs. The
 * client uses them for form validation; the server re-validates with the
 * same schemas before touching the database. Client validation is UX only —
 * the server is authoritative.
 */

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be at most 120 characters'),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(128),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
