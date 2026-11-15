import type { HuntSummary } from '@prisma/client';
import type { Filters } from './finder';
import { withIdahoVerifiedArea } from './idahoHuntCorrections';
import { trophyForHunt } from './trophyHunt';

/** Apply current hunt corrections before emitting or filtering legacy Idaho CSV rows. */
export function prepareIdahoExport(raw: HuntSummary, filters: Filters, nonresident: boolean): HuntSummary | null {
  const corrected = withIdahoVerifiedArea(raw);
  const r = { ...corrected, scoreTrophy: trophyForHunt(corrected) };
  if (filters.trophy.length && (r.scoreTrophy === null || !filters.trophy.includes(r.scoreTrophy))) return null;
  if (filters.unit && !r.units.includes(filters.unit)) return null;
  const atLeast = (value: number | null, min: number | null) => min === null || (value !== null && value >= min);
  if (!atLeast(r.publicPct, filters.minPublic) || !atLeast(r.accessYesPct, filters.minAccessYes) ||
      !atLeast(r.huntablePct, filters.minHuntable) || !atLeast(r.scoreQuality, filters.minScore) ||
      !atLeast(nonresident ? r.scoreOppNr : r.scoreOppRes, filters.minOpp)) return null;
  if (filters.maxDensity !== null && (r.huntersSqMi === null || r.huntersSqMi > filters.maxDensity)) return null;
  if (filters.accessYes && !(r.accessYesCount && r.accessYesCount > 0)) return null;
  return r;
}
