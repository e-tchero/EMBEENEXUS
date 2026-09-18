/**
 * Money helpers — integer kobo everywhere; naira only at the display edge.
 *
 * Never use floating point for money. Values cross the system as integers
 * (bigint) minor units; this module only converts to a display string.
 */

/** Formats an amount in kobo as a naira display string, e.g. 220000n → "₦2,200". */
export function formatNairaFromKobo(kobo: bigint): string {
  if (kobo < 0n) {
    throw new RangeError('Negative amounts are not displayable.');
  }
  const naira = kobo / 100n;
  return `₦${naira.toLocaleString('en-NG')}`;
}
