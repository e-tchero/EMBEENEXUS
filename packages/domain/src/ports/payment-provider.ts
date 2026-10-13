/**
 * PaymentProvider port.
 *
 * 05 §2.1 and 15 §4: order and state-machine logic must talk to a generic
 * provider interface, never to a vendor SDK directly. The MVP adapter is
 * Flutterwave; Paystack is legacy and excluded. Nothing in this file names a
 * vendor.
 *
 * This module contains no framework, database, or vendor imports.
 */

export const PaymentStatus = {
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export interface InitiatePaymentCommand {
  readonly orderId: string;
  /** Non-negative integer minor units (Kobo). */
  readonly amountMinorUnits: bigint;
  readonly currency: string;
  readonly reference: string;
  readonly customerEmail?: string;
  readonly redirectUrl?: string;
}

export interface InitiatePaymentResult {
  readonly providerReference: string;
  readonly status: PaymentStatus;
  readonly authorizationUrl?: string;
}

export interface VerifyPaymentCommand {
  readonly providerReference: string;
}

/** A webhook is only a trigger: this is the server-to-server truth. */
export interface VerifyPaymentResult {
  readonly providerReference: string;
  readonly status: PaymentStatus;
  readonly amountMinorUnits: bigint;
  readonly currency: string;
  readonly verifiedAt: Date;
}

export interface IssueRefundCommand {
  readonly providerReference: string;
  /** Non-negative integer minor units (Kobo) to refund. */
  readonly amountMinorUnits: bigint;
  readonly reason?: string;
}

export interface IssueRefundResult {
  readonly refundReference: string;
  readonly status: PaymentStatus;
  readonly amountMinorUnits: bigint;
}

export interface PaymentProvider {
  initiatePayment(command: InitiatePaymentCommand): Promise<InitiatePaymentResult>;
  verifyPayment(command: VerifyPaymentCommand): Promise<VerifyPaymentResult>;
  issueRefund(command: IssueRefundCommand): Promise<IssueRefundResult>;
}
