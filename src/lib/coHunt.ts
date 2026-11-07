/**
 * Colorado hunt codes and the per-hunt draw data stored on HuntSummary.pointOdds. Client-safe.
 * Hunt code: D M 070 O3 R = species, sex, unit, season (type letter + number), method of take.
 */
import type { HerdSeries } from './coHerds';
import {
  effective,
  exactAt,
  projectedOdds,
  oddsAt,
  chanceOf,
  ABOVE_CUTOFF_RATE,
  type PoolYear,
  type Projection,
  type Chance,
} from './coOdds';

export const CO_POOLS = ['res', 'nr', 'yres', 'ynr'] as const;
export type CoPool = (typeof CO_POOLS)[number];
export const POOL_LABEL: Record<CoPool, string> = { res: 'Resident', nr: 'Nonresident', yres: 'Youth resident', ynr: 'Youth nonresident' };

/** What HuntSummary.pointOdds holds for one pool. */
export interface PoolOdds {
  /** Last draw, first choice: [points, applicants, drawn]. */
  levels: [number, number, number][];
  cut: { text: string; points: number | null; pct: number | null } | null;
  eff: number | null;
  proj: Projection | null;
  hybrid: number;
  /** Every draw on file: effective points and CPW's "drawn out at" words. */
  history: { year: number; eff: number | null; text: string | null }[];
}
/** One season of harvest: from the by-hunt-code report ('code'), or summed over the code's units from the season table
 *  ('units': antlered / antlerless limited licenses; 'units-all': every license of that season and weapon there). */
export interface HarvestYear {
  year: number;
  hunters: number;
  harvest: number;
  days: number | null;
  basis: 'code' | 'units' | 'units-all';
  few?: boolean;
}
export interface RegsInfo {
  year: number | null;
  units: string[];
  partial: boolean;
  unitText: string;
  licenses: number | null;
  guessed: boolean;
}

export interface SharedDrawPool { codes: string[]; poolQuota: number | null; codeDrawn: number | null }

export interface PointOdds {
  sharedPool?: SharedDrawPool;
  general?: { resident: boolean; nonresident: boolean; regulationsYear: number };
  year: number;
  projYear: number;
  pools: Partial<Record<CoPool, PoolOdds>>;
  history: { year: number; quota: number | null; sharedPool?: SharedDrawPool; nrCapPct: number | null; hybridCap: number | null; apps1: number | null }[];
  nrCapPct: number | null;
  nrCap: number | null;
  hybridCap: number | null;
  list: string | null;
  apps: number[];
  /** From the W-2 regulations: the units the code covers, and its dates for the projected year (or the latest known). */
  regs?: RegsInfo | null;
  dates?: { start: string; end: string; year: number } | null;
  harvest?: HarvestYear[];
  /** CPW post-hunt population estimates for the herds (DAUs) the hunt's units are in. */
  herds?: HerdSeries[];
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const METHOD: Record<string, string> = { R: 'Rifle', A: 'Archery', M: 'Muzzleloader', X: 'Season Choice' };

export function decodeCode(code: string) {
  const m = /^([DEAMSGC])([MFEP])(\d{3}|[SG]\d{2})([A-Z0-9])(\d)([A-Z])$/.exec(code);
  if (!m) return null;
  const [, sp, sex, unit, type, no, method] = m;
  const species = ({ D: 'DEER', E: 'ELK', A: 'PRONGHORN', M: 'MOOSE', S: 'BIGHORN', G: 'GOAT', C: 'BIGHORN' } as const)[sp as 'D' | 'E' | 'A' | 'M' | 'S' | 'G' | 'C'];
  return { species, sex, unit: /^[SG]/.test(unit) ? unit : String(Number(unit)), type, no: Number(no), method } as const;
}

/** "3rd Rifle", "Archery", "Early Rifle", "Private Land Only Rifle". From the hunt code; dates come from the brochure. */
export function seasonLabel(code: string): string {
  const d = decodeCode(code);
  if (!d) return code;
  const meth = METHOD[d.method] ?? d.method;
  switch (d.type) {
    case 'U':
      return d.method === 'R' && d.no <= 4 ? `${ORD[d.no]} Rifle (OTC)` : d.method === 'A' ? 'Archery (OTC)' : 'OTC Rifle';
    case 'O':
      return d.method === 'R' && d.species !== 'PRONGHORN' ? `${ORD[d.no] ?? d.no} Rifle` : meth;
    case 'E':
      return `Early ${meth}`;
    case 'L':
      return `Late ${meth}`;
    case 'K':
      return `Youth ${meth}`;
    case 'P':
      return `Private Land Only ${meth}${d.no > 1 ? ` (${d.no})` : ''}`;
    case 'W':
    case 'J':
      return `Ranching for Wildlife ${meth}`;
    default:
      return `${meth} (season ${d.type}${d.no})`;
  }
}

export function huntTitle(code: string): string {
  const d = decodeCode(code);
  if (!d) return code;
  const animal =
    d.species === 'DEER'
      ? d.sex === 'M'
        ? 'Buck Deer'
        : d.sex === 'F'
          ? 'Doe Deer'
          : 'Either-Sex Deer'
      : d.species === 'PRONGHORN'
        ? d.sex === 'M' ? 'Buck Pronghorn' : d.sex === 'F' ? 'Doe Pronghorn' : 'Either-Sex Pronghorn'
      : d.sex === 'M'
        ? 'Bull Elk'
        : d.sex === 'F'
          ? 'Cow Elk'
          : 'Either-Sex Elk';
  return `${d.unit === '0' ? 'General' : `Unit ${d.unit}`} · ${seasonLabel(code)} · ${animal}`;
}

export const isPrivateOnly = (code: string) => ['P', 'W', 'J'].includes(decodeCode(code)?.type ?? '');

/** The pool a hunter is in. */
export const poolFor = (nr: boolean, youth: boolean): CoPool => (youth ? (nr ? 'ynr' : 'yres') : nr ? 'nr' : 'res');

/** Rebuilds a PoolYear (last draw) from stored levels, for exact odds. */
export function lastDraw(po: PoolOdds, year: number): PoolYear {
  const pre: Record<number, number> = {},
    post: Record<number, number> = {};
  for (const [p, a, d] of po.levels) {
    pre[p] = a;
    if (d) post[p] = d;
  }
  return {
    year,
    pre,
    post,
    cut: po.cut ? { text: po.cut.text, points: po.cut.points, choice: null, leftover: false, drawnAtLevel: null, appsAtLevel: null } : null,
  };
}

export interface MyOdds {
  /** Projected (next draw) or last draw. */
  odds: number | null;
  lo: number;
  hi: number;
  chance: Chance;
  /** Last draw at these points: applicants and how many drew (null when nobody had exactly these points). */
  last: { apps: number; drawn: number } | null;
}

/** Odds at p points for one pool, next draw (projected) or the last draw (what happened). */
export function myOdds(po: PoolOdds | undefined, p: number, mode: 'proj' | 'last', year: number, pool: CoPool = 'res'): MyOdds | null {
  if (!po) return null;
  const ex = exactAt(lastDraw(po, year), p);
  const last = ex.apps ? { apps: ex.apps, drawn: ex.drawn } : null;
  if (mode === 'proj') {
    if (!po.proj) return null;
    const r = projectedOdds(p, po.proj, po.hybrid, pool === 'nr' || pool === 'ynr' ? ABOVE_CUTOFF_RATE.nr : ABOVE_CUTOFF_RATE.res);
    return { odds: r.odds, lo: r.lo, hi: r.hi, chance: r.chance, last };
  }
  // last draw: what happened at exactly p points; with nobody there, what the cutoff implies
  if (po.eff === null) return null;
  const o = ex.odds ?? oddsAt(p, po.eff, po.hybrid);
  return { odds: o, lo: o, hi: o, chance: chanceOf(o, o, o), last };
}

/** Odds at 0..maxPts points per pool, projected and last draw (beyond the end: the last value). */
export type OddsTable = Record<'proj' | 'last', Partial<Record<CoPool, number[]>>>;
export function oddsTable(po: PointOdds, maxPts = 40): OddsTable {
  const t: OddsTable = { proj: {}, last: {} };
  for (const pool of CO_POOLS) {
    const p = po.pools[pool];
    if (!p) continue;
    for (const mode of ['proj', 'last'] as const) {
      const arr: number[] = [];
      for (let k = 0; k <= maxPts; k++) {
        const o = myOdds(p, k, mode, po.year, pool)?.odds;
        if (o === null || o === undefined) break;
        arr.push(Math.round(o * 1000) / 1000);
      }
      // trim the flat tail: once it tops out it stays there
      while (arr.length > 1 && arr[arr.length - 1] === arr[arr.length - 2] && arr[arr.length - 1] >= 0.9) arr.pop();
      if (arr.length) t[mode][pool] = arr;
    }
  }
  return t;
}
/** Odds at p points from an OddsTable row (null when the pool had nobody). */
export const tableOdds = (t: OddsTable | null | undefined, mode: 'proj' | 'last', pool: CoPool, p: number): number | null => {
  const a = t?.[mode]?.[pool];
  return a && a.length ? a[Math.min(p, a.length - 1)] : null;
};

export { effective };

/** Numbered rifle filters include both limited and general/OTC rifle seasons. */
export function matchesCoSeason(code: string, filters: string[]): boolean {
  const d = decodeCode(code);
  return !!d && (!filters.length || filters.some(s => /^\d$/.test(s)
    ? ['O', 'U'].includes(d.type) && d.method === 'R' && String(d.no) === s : d.type === s));
}
