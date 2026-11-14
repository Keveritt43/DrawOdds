/**
 * Utah hunt records (HuntSummary rows from scripts/ut-import.ts, built by scripts/ut_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * oddsByPts.last.res / .nr: index N = odds for a hunter applying with N points (DWR's tables are by points held
 * when applying). Bonus hunts: the model that reproduces DWR's draw (half the permits to the most points, the rest
 * drawn with points + 1 entries), run on the 2026 applicants. General buck deer: DWR's printed first-choice rate,
 * filled upward.
 * oddsByPts.proj: the next (2027) draw, 2026's applicants rolled forward one point (scripts/ut_backtest.py), only in
 * the pools listed in pointOdds.projPools: per species and residency, a projection ships only if it beat the last
 * draw on 2026 (held out) and over 2023-2026. Other pools show the last draw.
 */
import type { UtPoints, UtPointType } from './utPoints';
import { utPointType, UT_POINT_TYPES } from './utPoints';

export type UtPool = 'res' | 'nr';
export const UT_POOL_LABEL: Record<UtPool, string> = { res: 'Resident', nr: 'Nonresident' };

export interface UtOddsTable { proj: Partial<Record<UtPool, number[]>>; last: Partial<Record<UtPool, number[]>> }
export interface UtPoolInfo { quota: number; maxPointQuota: number | null; randomQuota: number | null; levels: [number, number, number][] }
export interface UtPointOdds {
  state: 'UT';
  kind: 'bonus' | 'preference' | 'otc';
  year: number;
  projected: boolean;
  projYear?: number | null;
  projPools?: UtPool[];
  projMethod?: Partial<Record<UtPool, string | null>>;
  pointsMeaning: string;
  pools: Partial<Record<UtPool, UtPoolInfo>>;
  /** DWR's estimates for this hunt number; 2025 is preliminary */
  harvest: { year: number; hunters: number; harvest: number; days: number | null; preliminary: boolean }[];
  /** 2021-2025 first-choice applicants and permits drawn, by pool (DWR's odds reports) */
  history?: Record<string, Partial<Record<UtPool, { apps: number; drew: number }>>>;
}
/** Lowest point level with a successful first-choice applicant, for general deer only. */
export function utPreferenceCutoff(po: UtPointOdds | null, nr: boolean): number | null {
  if (po?.kind !== 'preference') return null;
  const levels = po.pools?.[nr ? 'nr' : 'res']?.levels;
  const drawn = (levels ?? []).filter(([p, apps, successes]) => Number.isFinite(p) && apps > 0 && successes > 0).map(([p]) => p);
  return drawn.length ? Math.min(...drawn) : null;
}

type Row = { tagCode: string | null; species: string; type: string; oddsByPts: unknown; pointOdds: unknown; youthOnly?: boolean | null };

/** 'otc' for over-the-counter general elk, else the point system the hunt draws on. */
export function utKind(r: Row): 'otc' | 'bonus' | 'preference' {
  const po = r.pointOdds as UtPointOdds | null;
  return po?.kind ?? 'otc';
}

/** Whether this pool's odds are a projection (it passed the backtest rule for its species and residency). */
export const utProjects = (po: UtPointOdds | null | undefined, pool: UtPool) => !!po?.projected && (po.projPools ?? []).includes(pool);

export const utTableOdds = (t: UtOddsTable | null, pool: UtPool, points: number, which: 'proj' | 'last' = 'last'): number | null => {
  const a = t?.[which]?.[pool];
  if (!a?.length) return null;
  return a[Math.min(Math.max(0, points), a.length - 1)];
};

/** The hunter's odds. mode 'proj' (the default everywhere) gives the next draw where Utah's projection passed its
 *  backtest; otherwise, and with 'last', the last draw. `projected` says which one came back. */
export function utPersonal(r: Row, pts: UtPoints, nr: boolean, mode: 'proj' | 'last' = 'proj'): { odds: number | null; points: number | null; type: UtPointType | null; basis: string; projected: boolean } {
  const kind = utKind(r);
  const pool: UtPool = nr ? 'nr' : 'res';
  if (kind === 'otc') return { odds: 1, points: null, type: null, basis: 'Over the counter (statewide permit cap)', projected: false };
  const type = r.youthOnly ? null : utPointType(r.tagCode, r.species, r.type);
  const points = type ? pts.points[type] : 0;
  const t = r.oddsByPts as UtOddsTable | null;
  const po = r.pointOdds as UtPointOdds | null;
  const projected = mode === 'proj' && utProjects(po, pool) && !!t?.proj?.[pool]?.length;
  const odds = utTableOdds(t, pool, points, projected ? 'proj' : 'last');
  const when = projected ? `${po?.projYear ?? (po?.year ?? 2026) + 1} projected` : `${po?.year ?? 2026} draw`;
  const label = type ? UT_POINT_TYPES.find((x) => x.key === type)!.label.toLowerCase() : null;
  const basis = odds === null ? `No ${nr ? 'nonresident' : 'resident'} permits in the ${po?.year ?? 2026} draw`
    : `${when} at ${points} ${kind === 'bonus' ? 'bonus' : 'preference'} point${points === 1 ? '' : 's'}${label ? ` (${label})` : ''}`;
  return { odds, points: type ? points : null, type, basis, projected };
}

/** Boundary label for a unit key ("685" -> the boundary's DWR name, when the caller has it). */
export const utBoundaryLabel = (name: string, label?: string | null) => (label ? label : `Boundary ${name}`);
