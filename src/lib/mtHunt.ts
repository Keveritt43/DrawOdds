/**
 * Montana hunts as stored on HuntSummary (built by scripts/mt_build_hunts.py; docs/states/mt-onboarding.md).
 * Client-safe.
 *
 * Two kinds:
 *   general  A General Deer/Elk License in one district. Residents buy it over the counter. Nonresidents must first
 *            draw a combination licence: oddsByPts.last.nr holds that draw's odds at 0, 1, 2, 3 preference points,
 *            exactly as drawn (Montana's dead zone included: 1 point can draw 0% while 0 points draws from the
 *            random quarter).
 *   bonus    A drawn Deer/Elk Permit or Deer/Elk B licence. oddsByPts.last.res/.nr[N] = the odds for a hunter
 *            holding N bonus points for that licence type who BUYS a point this year: FWP's report prints points
 *            used in the draw (banked + the one bought), so index N is FWP's level N+1. A hunter who does not buy
 *            has their banked points ignored: oddsByPts.noBuy.
 * Last draw only: no Montana projection has been backtested, so "next draw" shows the last draw, labelled.
 */
import type { MtBonusType, MtPoints } from './mtPoints';

export type MtPool = 'res' | 'nr';
export interface MtOddsTable {
  proj: Partial<Record<MtPool, number[]>>;
  last: Partial<Record<MtPool, number[]>>;
  noBuy?: Partial<Record<MtPool, number | null>>;
}
export type MtLevel = [points: string, apps: number, succ: number];
export interface MtRegRow {
  hd: string;
  opportunity: string | null;
  applyBy?: string | null;
  seasons: Record<string, string | null>;
  details: string | null;
  section?: string | null;
  landLimit?: string | null;
}
export interface MtHarvestYear { year: number; hunters: number; harvest: number; days: number | null; antlered: number; big: number }
export interface MtHistoryYear { year: number; quota: number | 'UNL'; res: [number, number]; nr: [number, number]; pointsKnown: boolean }
export interface MtPointOdds {
  state: 'MT';
  kind: 'bonus' | 'general';
  year: number;
  projected: false;
  license: string;
  pointsMeaning?: string;
  pools?: Record<MtPool, { levels: MtLevel[]; quota: number | 'UNL'; apps: number[]; succ: number[] }>;
  landowner?: Record<'loRes' | 'loNr', { quota: number | 'UNL'; apps: number; succ: number }>;
  history?: MtHistoryYear[];
  quota?: number | 'UNL';
  regsQuota?: number | 'UNL' | null;
  regsQuotaRange?: number[] | null;
  note?: string | null;
  deerSpecies?: string | null;
  regs: { year: number; rows: MtRegRow[]; validIn?: string | null; notes?: string[]; conflicts?: { field: string; values: Record<string, string[]> }[] | null; referenceConflict?: unknown };
  harvest: MtHarvestYear[];
  harvestBasis: string;
  /** permits are added to a general licence: a nonresident must also hold a combination licence */
  needsGeneral?: boolean;
  combo?: { key: string; name: string; year: number };
}

export const MT_LICENSE_TYPE: Record<string, MtBonusType> = {
  'Deer Permit': 'DEER_PERMIT', 'Elk Permit': 'ELK_PERMIT', 'Deer B License': 'DEER_B', 'Elk B License': 'ELK_B',
};
export const MT_POOL_LABEL: Record<MtPool, string> = { res: 'Resident', nr: 'Nonresident' };

/** "Elk Permit" -> "permit", "Elk B License" -> "B licence", general -> "general". Used by the licence-type filter. */
export function mtKind(po: MtPointOdds | null | undefined): 'general' | 'permit' | 'b' | null {
  if (!po) return null;
  if (po.kind === 'general') return 'general';
  return /Permit$/.test(po.license) ? 'permit' : 'b';
}

const at = (a: number[] | undefined, i: number) => (a && a.length ? a[Math.min(Math.max(0, Math.floor(i)), a.length - 1)] : null);

export interface MtPersonal { odds: number | null; points: number | null; buying: boolean | null; basis: string }

/** A hunter's odds for one Montana hunt from their saved settings. */
export function mtPersonal(r: { oddsByPts: unknown; pointOdds: unknown; oddsLastYear: number | null }, p: MtPoints, nr: boolean): MtPersonal {
  const po = r.pointOdds as MtPointOdds | null;
  const t = r.oddsByPts as MtOddsTable | null;
  const year = po?.year ?? r.oddsLastYear ?? 'latest';
  if (!po || !t) return { odds: null, points: null, buying: null, basis: 'No draw data' };
  if (po.kind === 'general') {
    if (!nr) return { odds: 1, points: null, buying: null, basis: 'Resident general licence, over the counter' };
    const pts = Math.min(3, Math.max(0, Math.floor(p.combo)));
    return { odds: at(t.last.nr, pts), points: pts, buying: null,
      basis: `${po.combo?.year ?? year} ${po.combo?.name ?? 'combination'} draw · ${pts} preference point${pts === 1 ? '' : 's'}` };
  }
  const type = MT_LICENSE_TYPE[po.license];
  const pool: MtPool = nr ? 'nr' : 'res';
  const banked = type ? p.bonus[type] : 0;
  const buying = type ? p.buying[type] : true;
  if (!buying) {
    const o = t.noBuy?.[pool] ?? null;
    return { odds: o, points: banked, buying, basis: `${year} draw · ${MT_POOL_LABEL[pool]} · not buying a point: your ${banked} banked point${banked === 1 ? ' is' : 's are'} not used` };
  }
  return { odds: at(t.last[pool], banked), points: banked, buying,
    basis: `${year} draw · ${MT_POOL_LABEL[pool]} · ${banked} bonus point${banked === 1 ? '' : 's'} + this year's (FWP's ${banked + 1}-point row)` };
}

/** "HD 217" / "HDs 210, 211 …" for cards. */
export function mtDistricts(units: string[], max = 4): string {
  if (units.length === 1) return `HD ${units[0]}`;
  return `HDs ${units.slice(0, max).join(', ')}${units.length > max ? ` +${units.length - max}` : ''}`;
}
