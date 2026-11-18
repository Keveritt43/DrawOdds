/**
 * Oregon hunt records (HuntSummary rows from scripts/or-import.ts, built by scripts/or_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * oddsByPts.{last,proj}.{res,nr}: index N = odds for a hunter holding N preference points when applying.
 *   last: ODFW's 2026 draw, from its report's preference-phase counts by point level and its random-phase totals
 *         (scripts/or_odds.py: one random number per application serves both phases, so a level's odds are
 *         max(preference share, random threshold)).
 *   proj: the 2027 projection, present only for the pools where it beat last draw's odds in the backtest
 *         (docs/states/or-onboarding.md §3: nonresident buck deer and elk). Every other pool shows the 2026 draw,
 *         labelled.
 */
import type { OrPoints, OrPointType } from './orPoints';
import { OR_POINT_TYPES, orPointType } from './orPoints';

export type OrPool = 'res' | 'nr';
export interface OrOddsTable { proj: Partial<Record<OrPool, number[]>>; last: Partial<Record<OrPool, number[]>> }
export interface OrPointOdds {
  state: 'OR';
  kind: 'preference' | 'otc';
  year: number;
  projYear?: number;
  /** pools with a 2027 projection */
  projected: OrPool[];
  series?: '100' | '200' | '600';
  section?: string;
  legal?: string;
  dates?: string;
  tag?: string;
  tags?: number;
  /** ODFW's "*": private lands will limit access; don't apply without a place to hunt */
  privateLimited?: boolean;
  /** new hunt number for 2026 (Eastern Oregon deer hunt areas), so one year of draw history */
  newHunt?: boolean;
  apps2025?: number | null;
  /** 'odfw': the hunt covers part of a unit and the public share is ODFW's own printed figure */
  publicPctSource?: 'units' | 'odfw';
  boundary?: string | null;
  pointsMeaning?: string;
  generalKey?: string;
  note?: string;
  demand?: Record<string, { tags: number; drawn: number; apps: number; resApps: number; nrApps: number; resDrawn: number; nrDrawn: number; prefCutoff: number | null }>;
  harvest?: { year: number; hunters: number; harvest: number; days?: number; units?: string[] }[];
  pools?: Partial<Record<OrPool, { rows: [number, number, number][] }>>;
}
type Row = { species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

export const orPo = (r: Row) => r.pointOdds as OrPointOdds | null;
export const orIsGeneral = (r: Row) => (orPo(r)?.kind ?? 'otc') === 'otc';

export const orTableOdds = (t: OrOddsTable | null, pool: OrPool, points: number, which: 'proj' | 'last'): number | null => {
  const a = t?.[which]?.[pool];
  if (!a?.length) return null;
  return a[Math.min(Math.max(0, points), a.length - 1)];
};

/** The hunter's odds: the 2027 projection where one passed the backtest, else the 2026 draw. */
export function orPersonal(r: Row, pts: OrPoints, nr: boolean, mode: 'proj' | 'last' = 'proj'): { odds: number | null; points: number | null; type: OrPointType | null; basis: string; projected: boolean } {
  const po = orPo(r);
  if (orIsGeneral(r)) return { odds: 1, points: null, type: null, basis: 'General season: tag over the counter, no draw', projected: false };
  const type = orPointType(po?.series);
  const points = type ? pts.points[type] : 0;
  const pool: OrPool = nr ? 'nr' : 'res';
  const t = r.oddsByPts as OrOddsTable | null;
  const projected = mode === 'proj' && !!po?.projected?.includes(pool) && !!t?.proj?.[pool]?.length;
  const odds = orTableOdds(t, pool, points, projected ? 'proj' : 'last');
  const label = type ? OR_POINT_TYPES.find((x) => x.key === type)!.label.replace(/ \(.*\)/, '').toLowerCase() : '';
  const when = projected ? `${po?.projYear ?? 2027} projected` : `${po?.year ?? 2026} draw`;
  const nrNone = nr && (po?.demand?.[String(po?.year)]?.nrDrawn ?? 0) === 0 && (odds ?? 0) === 0;
  const basis = odds === null ? 'No published applicants'
    : nrNone ? `${when}: no nonresident drew (the nonresident maximum is 5% of the tags)`
    : `${when}, first choice, at ${points} ${label} point${points === 1 ? '' : 's'}`;
  return { odds, points, type, basis, projected };
}

/** Fewest points that drew every applicant in the preference phase last draw (null: none did, or the hunt was
 *  undersubscribed). */
export function orPrefCutoff(po: OrPointOdds | null, pool: OrPool): { points: number; share: number } | null {
  const rows = po?.pools?.[pool]?.rows;
  if (!rows?.length) return null;
  const drawn = rows.filter(([, , d]) => d > 0);
  if (!drawn.length) return null;
  const c = Math.min(...drawn.map(([p]) => p));
  const [, n, d] = rows.find(([p]) => p === c)!;
  return { points: c, share: n ? d / n : 0 };
}

export const OR_WEAPON_LABEL: Record<string, string> = { ANY: 'Any legal weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };
export const OR_SERIES_LABEL: Record<string, string> = { '100': 'Buck deer (100 series)', '200': 'Elk (200 series)', '600': 'Antlerless deer (600 series)' };

/** Unit key -> label: "WMU 12" for a wildlife management unit, "Hunt Area DO-01" for an Eastern Oregon deer hunt area. */
export const orUnitLabel = (u: string) => (/^[A-Z]{2}-\d{2}$/.test(u) ? `Deer Hunt Area ${u}` : `WMU ${u}`);
export const orUnitKind = (u: string) => (/^[A-Z]{2}-\d{2}$/.test(u) ? 'Deer Hunt Area' : 'WMU');

/** 2026 fees, from the 2026 Oregon Big Game Hunting Regulations' fee table (a dated publication, so a season year
 *  can be given). The tag is bought after drawing; the application fee is per series. */
export const OR_FEES = {
  year: 2026,
  source: 'https://myodfw.com/sites/default/files/2025-11/26_BG_regs.pdf',
  license: { res: 39, nr: 193 },
  deerTag: { res: 33, nr: 500 },
  elkTag: { res: 56, nr: 660 },
  application: 10,
} as const;

/** Application deadline for the 100, 200 and 600 series (2026 regulations). */
export const OR_DEADLINE_2026 = 'May 15, 2026';
