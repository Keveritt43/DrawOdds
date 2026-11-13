import type { HuntSummary } from '@prisma/client';

/** Species hunter counts overlap by an unknown amount; the stored upper bound is not a measured rate. */
export function withoutUnvalidatedWyDeerMetrics<T extends HuntSummary>(row: T): T {
  if (row.state !== 'WY' || row.species !== 'DEER') return row;
  return { ...row, success5: null, successLast: null, hunters5: null, harvest5: null,
    huntersSqMi: null, daysPerHunter5: null, daysPerHarvest5: null, resTagAndFill: null, nrTagAndFill: null,
    scoreQuality: null, scoreSuccess: null, scoreAccess: null, scoreCrowd: null,
    scoreTrophy: null, scoreOppRes: null, scoreOppNr: null };
}
