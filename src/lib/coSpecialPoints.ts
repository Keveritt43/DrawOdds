import pointData from '../../data/co-special-points.json';
import type { SpecialHunt } from './coSpecial';
import { specialOdds } from './coSpecial';
import type { StatePoints } from './points';

/** [preference, weighted, adult R/NR apps, youth R/NR apps, same four successful counts]. */
export type SpecialPointLevel = number[];
export type SpecialPointYear = { year: number; levels: SpecialPointLevel[]; unassigned?: number[] };
const data = pointData as Record<string, SpecialPointYear[]>;
export const specialPointHistory = (hunt: SpecialHunt) => data[hunt.code] ?? [];
export const specialPointSpecies = (hunt: SpecialHunt) => hunt.species === 'DESERT' ? null : hunt.species;
export function specialPointSetting(hunt: SpecialHunt, settings: StatePoints) {
  const species = specialPointSpecies(hunt);
  return species ? { preference: settings[species] ?? 0, weighted: settings.weighted?.[species] ?? 0 } : null;
}
export function specialAtLevel(history: SpecialPointYear, preference: number, weighted: number, nr: boolean, youth: boolean) {
  const i = (nr ? 1 : 0) + (youth ? 2 : 0);
  const row = history.levels.find(r => r[0] === preference && r[1] === weighted);
  const apps = row?.[2+i] ?? 0, drew = row?.[6+i] ?? 0;
  return { apps, drew, odds: apps ? drew / apps : null };
}
/** Published point-cohort outcomes, never a weighted lottery forecast or an inferred cutoff. */
export function specialPersonalOdds(hunt: SpecialHunt, nr: boolean, settings: StatePoints, year = hunt.draws[0]?.year) {
  if (hunt.code[5] === 'G') return null;
  const points = specialPointSetting(hunt, settings);
  if (!points || !settings.specialSet) return specialOdds(hunt, nr, settings.youth);
  const history = specialPointHistory(hunt).find(h => h.year === year);
  return history ? specialAtLevel(history, points.preference, points.weighted, nr, settings.youth).odds : null;
}
export function specialOddsBasis(hunt: SpecialHunt, settings: StatePoints) {
  const points = specialPointSetting(hunt, settings);
  if (hunt.code[5] === 'G') return 'Reserved license';
  return !points ? `${hunt.draws[0].year} random draw · no points` :
    settings.specialSet ? `${hunt.draws[0].year} actual · ${points.preference} preference + ${points.weighted} weighted points` :
      `${hunt.draws[0].year} historical first-choice draw rate · pooled preview · set points in Account`;
}
