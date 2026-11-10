/**
 * Wyoming hunts as stored on HuntSummary (built by scripts/wy_build_hunts.py, see docs/states/wy-draw-model.md).
 * Client-safe. Odds math lives in ./wyOdds.
 *
 * Pools: residents draw at random ('res'); nonresidents apply in the regular ('nr') or special ('nrs') pool, each a
 * preference draw then a random draw among those who missed. oddsByPts holds the odds at 0, 1, 2... points per pool
 * for the projected and the last draw (residents: one value, no points).
 */
import type { WyPref, WyRandom } from './wyOdds';

export type WyPool = 'res' | 'nr' | 'nrs';
export const WY_POOL_LABEL: Record<WyPool, string> = { res: 'Resident', nr: 'Nonresident regular', nrs: 'Nonresident special' };
export const WY_POOL_SHORT: Record<WyPool, string> = { res: 'Resident', nr: 'NR regular', nrs: 'NR special' };

export interface WyProjection { base: number; qs: number[]; eff: number; lo: number; hi: number }
export interface WyNrPoolData {
  pref: WyPref;
  random: WyRandom;
  eff: number | null;
  proj: WyProjection | null;
  history: { year: number; eff: number | null; prefQuota: number; randomQuota: number; apps1: number }[];
}
export interface WySegment { archery: [string, string] | null; regular: [string, string] | null; limitations: string }
export interface WyHarvestYear { year: number; hunters: number; harvest: number; days: number | null }
export interface WyLand { acres: number; sqmi: number; publicPct: number | null; privatePct: number | null; tribalPct?: number | null; accessAcres?: number; accessCount?: number; accessPct?: number | null; ownership?: Record<string, number> }

export interface WyPointOdds {
  state: 'WY';
  year: number;
  projYear: number;
  /** false: this species' projection failed its backtest, so "projected" shows the last draw */
  projected: boolean;
  pools: { regular?: WyNrPoolData; special?: WyNrPoolData };
  res: { last: WyRandom | null; history: { year: number; quota: number | null; apps: number[] }[] } | null;
  regs: { year: number; quota: number | 'unlimited' | null; segments: WySegment[]; sharedAreas: string[] | null } | null;
  harvest: WyHarvestYear[];
  /** set when harvest is combined from other rows (region licenses: the region's general seasons) */
  harvestBasis?: string;
  land: WyLand | null;
  /** general season: residents buy over the counter; nonresidents need this region's license */
  general?: boolean;
  nrRegion?: string | null;
  nrRegionSlug?: string | null;
}

export type WyOddsTable = Record<'proj' | 'last', Partial<Record<WyPool, number[]>>>;

export const wyPool = (nr: boolean, special: boolean): WyPool => (!nr ? 'res' : special ? 'nrs' : 'nr');

/** Odds at p points from the stored table (null when the hunt has no such pool). Past the end: the last value. */
export function wyTableOdds(t: WyOddsTable | null | undefined, mode: 'proj' | 'last', pool: WyPool, p: number): number | null {
  const a = t?.[mode]?.[pool];
  if (!a || !a.length) return null;
  return a[Math.min(Math.max(0, Math.floor(p)), a.length - 1)];
}

/** Hunt area number shown to hunters: "A12" -> "12" (antelope area 12). Region units ("DR-G") -> "Region G". */
export function wyAreaLabel(unit: string): string {
  const m = /^([ADE])(R-)?(.+)$/.exec(unit);
  if (!m) return unit;
  return m[2] ? `Region ${m[3]}` : `Area ${m[3]}`;
}
export const WY_UNIT_SPECIES: Record<string, 'PRONGHORN' | 'DEER' | 'ELK'> = { A: 'PRONGHORN', D: 'DEER', E: 'ELK' };
export const wyUnitPrefix = (species: string) => (species === 'PRONGHORN' ? 'A' : species === 'ELK' ? 'E' : 'D');

/** "Aug 15 – Sep 30" from ISO dates. */
export function wyDates(a: string, b: string): string {
  const f = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(a)} – ${f(b)}`;
}

/** Everything hunters need to read the odds basis in one line. */
export function wyBasis(pool: WyPool, mode: 'proj' | 'last', points: number, po: WyPointOdds | null): string {
  if (pool === 'res') return `Resident random draw · ${po?.year ?? 'latest'} first-choice applicants vs quota (estimated)`;
  const proj = mode === 'proj' && po?.projected;
  return `${proj ? `${po!.projYear} projected` : `${po?.year ?? 'Latest'} draw`} · ${WY_POOL_LABEL[pool]} · ${points} point${points === 1 ? '' : 's'}${mode === 'proj' && po && !po.projected ? ' (no validated projection for this species: last draw shown)' : ''}`;
}
