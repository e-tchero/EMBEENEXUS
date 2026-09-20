import { z } from 'zod';

/**
 * Chain-of-custody input schemas shared by client forms and server routes (M6).
 * Client validation is UX only; the server re-validates and the database
 * (SECURITY DEFINER RPCs, migration 0014) remains the final authority.
 *
 * SECURITY: the OTP code is the only secret-shaped field in the app; it is
 * 6 digits, consumed server-side, never logged, and never returned by any
 * API except the single issue_order_otp response to the order owner.
 */

export const otpKindSchema = z.enum(['pickup', 'delivery']);
export type OtpKind = z.infer<typeof otpKindSchema>;

export const issueOtpSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  kind: otpKindSchema,
});
export type IssueOtpInput = z.infer<typeof issueOtpSchema>;

export const verifyOtpSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  kind: otpKindSchema,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const confirmReceiptSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  notes: z.string().trim().max(500).optional(),
});
export type ConfirmReceiptInput = z.infer<typeof confirmReceiptSchema>;

export const photoKindSchema = z.enum(['customer_parcel', 'rider_pickup', 'rider_delivery']);
export type PhotoKind = z.infer<typeof photoKindSchema>;

export const registerPhotoSchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  kind: photoKindSchema,
});
export type RegisterPhotoInput = z.infer<typeof registerPhotoSchema>;

export const photoEvidenceQuerySchema = z.object({
  orderId: z.string().uuid('Invalid order reference'),
  kind: photoKindSchema,
});
export type PhotoEvidenceQuery = z.infer<typeof photoEvidenceQuerySchema>;
