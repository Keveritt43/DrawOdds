/**
 * Washington hunt records (HuntSummary rows from scripts/wa-import.ts, built by scripts/wa_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * oddsByPts.{last,proj}.{res,nr}: index N = odds for a hunter holding N points before applying, who therefore
 * draws with (N + 1)² entries. Residents and nonresidents are one pool, so both arrays are the same.
 *   last: the 2025 drawing, estimated (WDFW stopped publishing results by point level after 2020; each hunt's
 *         point mix is rolled forward from its 2020 table through the applications WDFW published each year).
 *   proj: the 2027 drawing, two more roll steps (docs/states/wa-onboarding.md §5: beat last year's odds in the
 *         2019 and 2020 backtests).
 * Every special-permit and multi-season figure is an estimate and the pages say so.
 */
import type { WaPoints, WaPointType } from './waPoints';
import { waPointType, waTagAllows, WA_POINT_TYPES } from './waPoints';

export type WaPool = 'res' | 'nr';
export interface WaOddsTable { proj: Partial<Record<WaPool, number[]>>; last: Partial<Record<WaPool, number[]>> }
export interface WaPointOdds {
  state: 'WA';
  kind: 'squared' | 'otc';
  year: number;
  projected: boolean;
  projYear?: number;
  estimated?: boolean;
  /** 'own': started from this hunt's WDFW point table; 'category': from its category's pooled 2020 mix */
  seed?: 'own' | 'category';
  seedYear?: number;
  multiSeason?: boolean;
  category: string;
  tag?: string;
  side?: 'EAST' | 'WEST' | null;
  notes?: string;
  dates?: string;
  legal?: string;
  area?: string;
  pointsMeaning?: string;
  /** published any-choice applications and permits, by drawing year */
  demand?: Record<string, { apps: number | null; permits: number | null }>;
  cutoff?: { last: number; y2026: number; proj: number };
  harvest?: { year: number; hunters: number | null; harvest: number | null; apps?: number | null; permits?: number | null }[];
}
type Row = { species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

export const waPo = (r: Row) => r.pointOdds as WaPointOdds | null;
export const waIsGeneral = (r: Row) => (waPo(r)?.kind ?? 'otc') === 'otc';

export const waTableOdds = (t: WaOddsTable | null, points: number, which: 'proj' | 'last'): number | null => {
  const a = t?.[which]?.res;
  if (!a?.length) return null;
  return a[Math.min(Math.max(0, points), a.length - 1)];
};

/** The hunter's odds. 'proj' (the default) is the 2027 projection; 'last' the estimated 2025 drawing. */
export function waPersonal(r: Row, pts: WaPoints, mode: 'proj' | 'last' = 'proj'): { odds: number | null; points: number | null; type: WaPointType | null; basis: string; projected: boolean; tagOk: boolean | null } {
  const po = waPo(r);
  if (waIsGeneral(r)) return { odds: 1, points: null, type: null, basis: 'General season: over the counter, no draw', projected: false, tagOk: null };
  const type = waPointType(po?.category);
  const points = type ? pts.points[type] : 0;
  const t = r.oddsByPts as WaOddsTable | null;
  const projected = mode === 'proj' && !!po?.projected && !!t?.proj?.res?.length;
  const odds = waTableOdds(t, points, projected ? 'proj' : 'last');
  const label = type ? WA_POINT_TYPES.find((x) => x.key === type)!.label.toLowerCase() : 'category';
  const when = projected ? `${po?.projYear ?? 2027} projected` : `${po?.year ?? 2025} drawing`;
  const basis = odds === null ? 'No published applications' : `${when}, estimated, at ${points} ${label} point${points === 1 ? '' : 's'} (${(points + 1) ** 2} entr${points === 0 ? 'y' : 'ies'})`;
  return { odds, points, type, basis, projected, tagOk: waTagAllows(po?.tag, r.species, pts) };
}

/** Licence kind for the "Washington: License" filter. */
export function waLicense(r: Row): 'general' | 'special' | 'multi' {
  const po = waPo(r);
  return waIsGeneral(r) ? 'general' : po?.multiSeason ? 'multi' : 'special';
}

export const WA_WEAPON_LABEL: Record<string, string> = { ANY: 'Modern firearm', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };
