/**
 * Safe, actionable copy for rider-facing error codes. Codes come from the
 * API routes (typed service errors); internals never leak — an unmapped code
 * becomes a generic retry message.
 */

export function messageForOtpError(code: string | undefined): string {
  switch (code) {
    case 'otp_invalid':
      return 'That code is not correct. Check with the customer and try again.';
    case 'otp_expired':
      return 'That code expired. Ask the customer to show the current one.';
    case 'otp_locked':
      return 'Too many wrong attempts, this code is locked. Contact support.';
    case 'otp_already_used':
      return 'That code was already used.';
    case 'otp_not_issued':
      return 'No code has been issued yet. Ask the customer to open their order page.';
    case 'otp_issue_limit':
      return 'This order has used all of its code reissues. Contact support.';
    case 'evidence_missing':
      return 'The required photo evidence is missing before this step.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Your session expired. Sign in again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

export function messageForTransitionError(code: string | undefined): string {
  switch (code) {
    case 'invalid_transition':
      return 'That action does not fit the current order state.';
    case 'prerequisite_missing':
      return 'A required step (code or photo) has not been completed yet.';
    case 'invalid_order_state':
      return 'The order state changed. Refresh and check the current step.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Your session expired. Sign in again.';
    default:
      return 'Something went wrong. Try again.';
  }
}
