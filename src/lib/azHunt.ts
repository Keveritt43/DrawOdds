/**
 * Arizona hunt records (HuntSummary rows from scripts/az-import.ts, built by scripts/az_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * oddsByPts.last.res / .nr: index N = first-choice odds for an application holding N group bonus points (species
 * bonus points + loyalty + hunter education), from AZGFD's 2026 Bonus Point and draw reports (scripts/az_model.py):
 * the 20% bonus pass by points, then a pass in which each point is one more random number (the lowest kept), fitted
 * to AZGFD's published first-choice draws per hunt and residency. Verified: points + 1 entries fits AZGFD's results
 * better than flat, P² + 1 or (P + 1)² (docs/states/az-onboarding.md).
 * No projection: rolling the 2026 applicants forward lost to repeating the last draw in nearly every species,
 * residency and year (data/az/backtest.json), so every page shows the 2026 draw, labelled.
 */
import type { AzPoints } from './azPoints';
import { azGroupPoints } from './azPoints';

export type AzPool = 'res' | 'nr';
export const AZ_POOL_LABEL: Record<AzPool, string> = { res: 'Resident', nr: 'Nonresident' };
/** [points, 1st-choice applicants, 2nd-choice applicants, permits in the bonus pass, permits in bonus + 1-2 pass] */
export type AzLevel = [number, number, number, number, number];
export interface AzOddsTable { proj: Partial<Record<AzPool, number[]>>; last: Partial<Record<AzPool, number[]>> }
export interface AzPointOdds {
  state: 'AZ';
  kind: 'bonus';
  year: number;
  projected: false;
  category: string;
  license: 'general' | 'youth' | 'muzzleloader' | 'archery' | 'champ' | 'lo';
  restricted: boolean;
  legal: string;
  nrCap: number | null;
  portion: boolean;
  pointsMeaning: string;
  cut: Partial<Record<AzPool, [number, number]>>;
  pools: Record<AzPool, { levels: AzLevel[] }>;
  history: Record<string, { hunt: number; permits: number; resApps?: number; nrApps?: number; apps?: number }>;
  notes: number[];
  harvest: { year: number; hunt: number; hunters: number; harvest: number; days: number; parts: number[] }[];
}
type Row = { species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

export const azPo = (r: Row) => r.pointOdds as AzPointOdds | null;
export const AZ_LICENSES: { value: AzPointOdds['license']; label: string }[] = [
  { value: 'general', label: 'General (rifle)' },
  { value: 'muzzleloader', label: 'Muzzleloader' },
  { value: 'archery', label: 'Archery' },
  { value: 'lo', label: 'Limited opportunity' },
  { value: 'youth', label: 'Youth-only' },
  { value: 'champ', label: 'CHAMP (mobility permit)' },
];

export const azTableOdds = (t: AzOddsTable | null, pool: AzPool, points: number): number | null => {
  const a = t?.last?.[pool];
  if (!a?.length) return null;
  return a[Math.min(Math.max(0, points), a.length - 1)];
};

/** Lowest group points that drew in the 20% bonus pass, and the share of first choices that drew at that level. */
export const azBonusCut = (r: Row, nr: boolean) => azPo(r)?.cut?.[nr ? 'nr' : 'res'] ?? null;

/** The hunter's first-choice odds at their saved points: always the 2026 draw (no projection passed its backtest). */
export function azPersonal(r: Row, pts: AzPoints, nr: boolean): { odds: number | null; points: number; basis: string; projected: false } {
  const po = azPo(r);
  const pool: AzPool = nr ? 'nr' : 'res';
  const points = azGroupPoints(pts, r.species);
  const odds = azTableOdds(r.oddsByPts as AzOddsTable | null, pool, points);
  const year = po?.year ?? 2026;
  const basis = odds !== null ? `${year} draw at ${points} group bonus point${points === 1 ? '' : 's'}`
    : nr && po?.nrCap === 0 ? 'No nonresident permits'
    : `No ${nr ? 'nonresident' : 'resident'} first-choice applicants in ${year}`;
  return { odds, points, basis, projected: false };
}
