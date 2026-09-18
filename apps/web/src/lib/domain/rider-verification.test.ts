import { describe, expect, it } from 'vitest';

import {
  actorCanTransition,
  canTransition,
  checkOperationalEligibility,
  isAllowedVehicleType,
  nextStatus,
} from '@/lib/domain/rider-verification';

import type { RiderVerificationStatus } from '@/lib/domain/rider-verification';

describe('rider verification — valid transitions', () => {
  it('submits a pending verification for review (rider)', () => {
    expect(canTransition('pending', 'submit').allowed).toBe(true);
    expect(nextStatus('pending', 'submit')).toBe('under_review');
  });

  it('operator approves or rejects an under-review verification', () => {
    expect(canTransition('under_review', 'approve').allowed).toBe(true);
    expect(nextStatus('under_review', 'approve')).toBe('approved');
    expect(canTransition('under_review', 'reject').allowed).toBe(true);
    expect(nextStatus('under_review', 'reject')).toBe('rejected');
  });

  it('supports resubmission after rejection and re-entry after withdrawal', () => {
    expect(nextStatus('rejected', 'resubmit')).toBe('pending');
    expect(nextStatus('withdrawn', 'resubmit')).toBe('pending');
  });

  it('allows withdrawal from pending and under_review', () => {
    expect(nextStatus('pending', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('under_review', 'withdraw')).toBe('withdrawn');
  });
});

describe('rider verification — invalid transitions', () => {
  it('rejects every trigger from a state that does not permit it', () => {
    const cases: Array<[RiderVerificationStatus, Parameters<typeof canTransition>[1]]> = [
      ['approved', 'submit'],
      ['under_review', 'submit'],
      ['approved', 'resubmit'],
      ['pending', 'approve'],
      ['pending', 'reject'],
      ['rejected', 'withdraw'],
      ['approved', 'withdraw'],
      ['withdrawn', 'submit'],
    ];
    for (const [from, trigger] of cases) {
      expect(canTransition(from, trigger).allowed, `${trigger} from ${from}`).toBe(false);
    }
  });

  it('never transitions out of approved (terminal in M1)', () => {
    for (const trigger of ['submit', 'approve', 'reject', 'withdraw', 'resubmit'] as const) {
      expect(canTransition('approved', trigger).allowed).toBe(false);
      expect(nextStatus('approved', trigger)).toBeUndefined();
    }
  });
});

describe('rider verification — actor permissions', () => {
  it('riders cannot approve or reject; operators cannot submit or resubmit', () => {
    expect(actorCanTransition('under_review', 'approve', 'rider')).toBe(false);
    expect(actorCanTransition('under_review', 'reject', 'rider')).toBe(false);
    expect(actorCanTransition('pending', 'submit', 'operator')).toBe(false);
    expect(actorCanTransition('rejected', 'resubmit', 'operator')).toBe(false);
  });

  it('only operators decide; only riders self-manage lifecycle', () => {
    expect(actorCanTransition('under_review', 'approve', 'operator')).toBe(true);
    expect(actorCanTransition('pending', 'submit', 'rider')).toBe(true);
    expect(actorCanTransition('under_review', 'withdraw', 'rider')).toBe(true);
  });

  it('system actor has no direct verification triggers in M1', () => {
    for (const trigger of ['submit', 'approve', 'reject', 'withdraw', 'resubmit'] as const) {
      expect(actorCanTransition('pending', trigger, 'system')).toBe(false);
    }
  });
});

describe('rider operational eligibility', () => {
  it('requires approved verification AND an explicit availability record', () => {
    expect(
      checkOperationalEligibility({ verificationStatus: 'approved', hasAvailabilityRecord: true }),
    ).toEqual({ eligible: true });
  });

  it('an account existing is never sufficient — verification gates eligibility', () => {
    expect(
      checkOperationalEligibility({ verificationStatus: 'pending', hasAvailabilityRecord: true }),
    ).toEqual({ eligible: false, reason: 'verification_not_approved' });
    expect(
      checkOperationalEligibility({ verificationStatus: 'rejected', hasAvailabilityRecord: true }),
    ).toEqual({ eligible: false, reason: 'verification_not_approved' });
  });

  it('approved verification alone does not make a rider eligible', () => {
    expect(
      checkOperationalEligibility({ verificationStatus: 'approved', hasAvailabilityRecord: false }),
    ).toEqual({ eligible: false, reason: 'no_availability_record' });
  });
});

describe('vehicle policy (MVP: motorcycle-only)', () => {
  it('accepts motorcycles only', () => {
    expect(isAllowedVehicleType('motorcycle')).toBe(true);
    expect(isAllowedVehicleType('bicycle')).toBe(false);
    expect(isAllowedVehicleType('car')).toBe(false);
    expect(isAllowedVehicleType('van')).toBe(false);
  });
});
