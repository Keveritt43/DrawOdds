/**
 * Nevada hunt records (HuntSummary rows from scripts/nv-import.ts, built by scripts/nv_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * Nevada's resident and nonresident tags for the same unit group and season are separate NDOW hunt numbers with their
 * own quotas (1331 and 1332). The site lists them as one hunt with two pools, like Utah.
 *
 * oddsByPts.last.res / .nr: index N = first-choice odds for an applicant holding N bonus points, from NDOW's 2025
 * bonus point report: one cut c per hunt and pool such that 1 - (1 - c)^(N² + 1) reproduces the first-choice draws
 * (points² + 1 random numbers, the lowest kept; verified on 2,061 hunts, data/nv/backtest.json).
 * No projection: rolling the 2025 applicants forward did not beat repeating the 2025 draw in every year and pool,
 * so every page shows the 2025 draw, labelled.
 */
import type { NvPoints, NvPointType } from './nvPoints';
import { nvPointType, NV_POINT_TYPES } from './nvPoints';

export type NvPool = 'res' | 'nr';
export const NV_POOL_LABEL: Record<NvPool, string> = { res: 'Resident', nr: 'Nonresident' };

export interface NvOddsTable { proj: Partial<Record<NvPool, number[]>>; last: Partial<Record<NvPool, number[]>> }
export interface NvPoolInfo { quota: number; quotaLast: number | null; levels: [number, number, number][] | null; history?: Record<string, { apps: number; drew: number }> }
export interface NvPointOdds {
  state: 'NV';
  kind: 'bonus';
  year: number;
  regsYear: number;
  projected: false;
  category: string;
  pointsMeaning: string;
  residentsOnly: boolean;
  pools: Partial<Record<NvPool, NvPoolInfo>>;
  season: string;
  harvest: { year: number; hunters: number; harvest: number }[] | null;
}
type Row = { species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

export const nvPo = (r: Row) => r.pointOdds as NvPointOdds | null;

export const nvTableOdds = (t: NvOddsTable | null, pool: NvPool, points: number): number | null => {
  const a = t?.last?.[pool];
  if (!a?.length) return null;
  return a[Math.min(Math.max(0, points), a.length - 1)];
};

/** The hunter's odds at their saved points for this hunt's category: always the 2025 draw (no projection passed). */
export function nvPersonal(r: Row, pts: NvPoints, nr: boolean): { odds: number | null; points: number | null; type: NvPointType | null; basis: string; projected: false } {
  const po = nvPo(r);
  const pool: NvPool = nr ? 'nr' : 'res';
  const type = nvPointType(po?.category);
  const points = type ? pts.points[type] : 0;
  const odds = nvTableOdds(r.oddsByPts as NvOddsTable | null, pool, points);
  const year = po?.year ?? 2025;
  const label = type ? NV_POINT_TYPES.find((x) => x.key === type)!.label.toLowerCase() : null;
  const basis = odds !== null ? `${year} draw at ${points} bonus point${points === 1 ? '' : 's'}${label ? ` (${label})` : ''}`
    : nr && po?.residentsOnly ? 'Residents only'
    : po?.pools?.[pool] ? `New or changed for ${po?.regsYear ?? 2026}: no ${year} draw to compare` : `No ${nr ? 'nonresident' : 'resident'} tags`;
  return { odds, points: type ? points : null, type, basis, projected: false };
}
