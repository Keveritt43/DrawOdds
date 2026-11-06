import { coDeerPressure, GENERAL_ELK_QUALITY_FACTOR, type CoPressureContext, type CoPressure } from './coPressure';
import type { HuntSummary } from '@prisma/client';
import { withCoLand, coLandUnit } from './coLand';
import { opportunity, scoreHunts } from './score';
/** Read-time CO scoring leaves historical summaries and all Idaho rows untouched. */
export type CoScored = HuntSummary & { coPressure?: CoPressure };
export function withCoScores<T extends HuntSummary>(row: T, context?: CoPressureContext): T & {coPressure?:CoPressure} {
  if (row.state !== 'CO') return row;
  const r = withCoLand(row);
  const pressure = context ? coDeerPressure(r,context) : undefined;
  if (pressure) r.huntersSqMi = pressure.density;
  const landValid = r.units.length > 0 && r.units.every(u => {
    const l = coLandUnit(u);
    return l && Number.isFinite(l.acres) && l.acres > 0 && l.coverage >= .95 &&
      [l.publicPct,l.privatePct,l.tribalPct,l.unknownPct].every(p => Number.isFinite(p) && p >= 0 && p <= 100) &&
      Math.abs(l.publicPct+l.privatePct+l.tribalPct+l.unknownPct-100) < .1;
  });
  const countsValid = r.harvestYears > 0 && r.harvestYears <= 5 && r.hunters5 !== null &&
    r.harvest5 !== null && Number.isFinite(r.hunters5) && Number.isFinite(r.harvest5) &&
    r.hunters5 >= 0 && r.harvest5 >= 0 && r.harvest5 <= r.hunters5 &&
    r.success5 !== null && Math.abs(r.success5 - (r.hunters5 ? r.harvest5/r.hunters5 : 0)) < .001;
  const scores = scoreHunts([{...r, hunters5: countsValid ? r.hunters5 : null,
    publicPct: landValid && !r.privateOnly ? r.publicPct : landValid ? 0 : null,
    huntablePct: null, bigPct5: null, nrTag: false,
    huntersSqMi: landValid ? r.huntersSqMi : null,
    resOdds5: null, nrOdds5: null}]).get(r.id)!;
  if (pressure && ['complete','missing'].includes(pressure.status) && scores.scoreQuality!==null) {
    scores.scoreQuality = Math.floor(scores.scoreQuality * GENERAL_ELK_QUALITY_FACTOR);
  }
  return {...r,...scores,...(pressure ? {coPressure:pressure} : {})};
}
/** Opportunity follows the user's points, pool and actual/projected selection. */
export function withCoOpportunity<T extends HuntSummary>(r: T, odds: number | null, nr: boolean): T {
  return {...r, scoreOppRes: nr ? null : opportunity(r.scoreQuality,odds),
    scoreOppNr: nr ? opportunity(r.scoreQuality,odds) : null};
}
