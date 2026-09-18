/**
 * Rider verification state machine — domain foundation (M1).
 *
 * Pure and deterministic. The authoritative enforcement lives in
 * PostgreSQL RPCs (migration 0003); this module must mirror those rules
 * exactly and is the reference used by server actions to pre-validate and
 * by tests to pin the contract.
 *
 * Business rules encoded here (founder decisions):
 * - Verification is SEPARATE from availability: an approved verification
 *   never by itself makes a rider operationally eligible.
 * - `approved` is terminal in M1. Suspension/re-verification is a future
 *   decision and is deliberately NOT invented here.
 *
 * Lifecycle:
 *   pending -> under_review (rider submits)
 *   under_review -> approved | rejected (operator decides)
 *   rejected -> pending (rider resubmits)
 *   pending | under_review -> withdrawn (rider withdraws)
 *   withdrawn -> pending (rider re-enters)
 */

export const RIDER_VERIFICATION_STATUSES = [
  'pending',
  'under_review',
  'approved',
  'rejected',
  'withdrawn',
] as const;

export type RiderVerificationStatus = (typeof RIDER_VERIFICATION_STATUSES)[number];

export type RiderVerificationActor = 'rider' | 'operator' | 'system';

export type RiderVerificationTrigger =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'withdraw'
  | 'resubmit';

export interface RiderVerificationTransition {
  from: RiderVerificationStatus;
  to: RiderVerificationStatus;
  trigger: RiderVerificationTrigger;
  actors: readonly RiderVerificationActor[];
}

export const RIDER_VERIFICATION_TRANSITIONS: readonly RiderVerificationTransition[] = [
  { from: 'pending', to: 'under_review', trigger: 'submit', actors: ['rider'] },
  { from: 'under_review', to: 'approved', trigger: 'approve', actors: ['operator'] },
  { from: 'under_review', to: 'rejected', trigger: 'reject', actors: ['operator'] },
  { from: 'rejected', to: 'pending', trigger: 'resubmit', actors: ['rider'] },
  { from: 'pending', to: 'withdrawn', trigger: 'withdraw', actors: ['rider'] },
  { from: 'under_review', to: 'withdrawn', trigger: 'withdraw', actors: ['rider'] },
  { from: 'withdrawn', to: 'pending', trigger: 'resubmit', actors: ['rider'] },
];

const TRANSITION_INDEX: ReadonlyMap<string, RiderVerificationTransition> = new Map(
  RIDER_VERIFICATION_TRANSITIONS.map((t) => [`${t.from}:${t.trigger}`, t]),
);

export type GuardCheck = { allowed: true } | { allowed: false; reason: string };

/** Is this trigger valid from the given status? */
export function canTransition(
  from: RiderVerificationStatus,
  trigger: RiderVerificationTrigger,
): GuardCheck {
  const transition = TRANSITION_INDEX.get(`${from}:${trigger}`);
  if (!transition) {
    return { allowed: false, reason: `Cannot ${trigger} from ${from}` };
  }
  return { allowed: true };
}

/** Full authorization-aware check: actor + transition validity. */
export function actorCanTransition(
  from: RiderVerificationStatus,
  trigger: RiderVerificationTrigger,
  actor: RiderVerificationActor,
): boolean {
  const transition = TRANSITION_INDEX.get(`${from}:${trigger}`);
  if (!transition) return false;
  return transition.actors.includes(actor);
}

/** Resulting status if the transition is applied, otherwise undefined. */
export function nextStatus(
  from: RiderVerificationStatus,
  trigger: RiderVerificationTrigger,
): RiderVerificationStatus | undefined {
  return TRANSITION_INDEX.get(`${from}:${trigger}`)?.to;
}

/** Approved verification is the only verification state that satisfies eligibility. */
export function isVerificationApproved(status: RiderVerificationStatus): boolean {
  return status === 'approved';
}

/**
 * Operational dispatch eligibility (decision input for M5).
 *
 * A rider is eligible only when BOTH:
 *   1. verification is approved, AND
 *   2. the rider has explicitly created an availability record.
 * An account existing — or verification alone — is never sufficient.
 * (Actual dispatch/queue logic is M5; this function defines the rule.)
 */
export interface RiderEligibilityInputs {
  verificationStatus: RiderVerificationStatus;
  /** Explicit, rider-controlled availability record exists. */
  hasAvailabilityRecord: boolean;
}

export type EligibilityCheck =
  | { eligible: true }
  | { eligible: false; reason: 'verification_not_approved' | 'no_availability_record' };

export function checkOperationalEligibility(inputs: RiderEligibilityInputs): EligibilityCheck {
  if (!isVerificationApproved(inputs.verificationStatus)) {
    return { eligible: false, reason: 'verification_not_approved' };
  }
  if (!inputs.hasAvailabilityRecord) {
    return { eligible: false, reason: 'no_availability_record' };
  }
  return { eligible: true };
}

/** MVP vehicle policy: motorcycle only (founder business rule). */
export const ALLOWED_VEHICLE_TYPES = ['motorcycle'] as const;
export type VehicleType = (typeof ALLOWED_VEHICLE_TYPES)[number];

export function isAllowedVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (ALLOWED_VEHICLE_TYPES as readonly string[]).includes(value);
}
