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
  /** 65+, hunters with disabilities or Master Hunter: limited eligibility, hidden unless the category is picked */
  restricted?: boolean;
  /** 65+: WDFW has never published results by point level, so no odds table */
  noPointData?: boolean;
  oddsUnavailableReason?: string;
  /** New this year (WDFW printed NEW or 0/0): nobody has applied yet, so no odds */
  newHunt?: boolean;
  /** moose, sheep, goat: WDFW's once-in-a-lifetime categories (Any Antlered Bull Moose, Goat, Any Ram) */
  onceInALifetime?: boolean;
  /** the pamphlet's hunt-note letters, spelled out */
  noteText?: string[];
  harvestIdentityBasis?: string;
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
type Row = { id?:string; species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

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
  const unavailable = po?.oddsUnavailableReason ?? (r.id==='WA:2016' && po?.category==='Quality Elk' && po.dates==='Sept. 2 5 -2 9' ? 'Point-level estimates are unavailable because this hunt number previously identified a different season.' : undefined);
  const projected = !unavailable && mode === 'proj' && !!po?.projected && !!t?.proj?.res?.length;
  const odds = unavailable ? null : waTableOdds(t, points, projected ? 'proj' : 'last');
  const label = type ? WA_POINT_TYPES.find((x) => x.key === type)!.label.toLowerCase() : 'category';
  const when = projected ? `${po?.projYear ?? 2027} projected` : `${po?.year ?? 2025} drawing`;
  const basis = unavailable ?? (po?.noPointData ? `No estimate at your points: WDFW has never published ${po?.category?.includes('65') ? '65+' : 'this category\'s'} results by point level` : odds === null ? 'No published applications' : `${when}, estimated, at ${points} ${label} point${points === 1 ? '' : 's'} (${(points + 1) ** 2} entr${points === 0 ? 'y' : 'ies'})`);
  return { odds, points, type, basis, projected, tagOk: waTagAllows(po?.tag, r.species, pts) };
}

/** Licence kind for the "Washington: License" filter. */
export function waLicense(r: Row): 'general' | 'special' | 'multi' {
  const po = waPo(r);
  return waIsGeneral(r) ? 'general' : po?.multiSeason ? 'multi' : 'special';
}

/** Plain-language flags for WDFW hunt notes that change whether a hunter can use the permit (pamphlet p. 37, p. 58). */
export function waNoteFlags(notes: string | null | undefined): string[] {
  const n = notes ?? '';
  const out: string[] = [];
  if (/\bB\b/.test(n)) out.push('Military installation: access may be extremely limited');
  return out;
}

export const WA_WEAPON_LABEL: Record<string, string> = { ANY: 'Modern firearm', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };

/** Who may apply, for the eligibility categories (pamphlet p. 18). */
export const WA_WHO: Record<string, string> = {
  'Deer - 65 Years or Over': '65 or older only', 'Elk - 65 and Over': '65 or older only',
  'Deer - Hunters with Disabilities': 'Registered hunters with disabilities only', 'Elk - Hunters with Disabilities': 'Registered hunters with disabilities only',
  'Deer - Master Hunter': 'Master Hunters only', 'Elk - Master Hunter': 'Master Hunters only',
  'Moose - 65 and Over': '65 or older only', 'Moose - Hunters with Disabilities': 'Registered hunters with disabilities only',
  'Bighorn Sheep - Hunters with Disabilities (Ewe)': 'Registered hunters with disabilities only',
  'Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)': 'Registered hunters with disabilities only',
};

export const WA_MSG = new Set(['MOOSE', 'BIGHORN', 'GOAT']);
export const waIsMsg = (species: string) => WA_MSG.has(species);
/** Lower-case species word for running text. */
export const waSpeciesWord = (species: string) => ({ DEER: 'deer', ELK: 'elk', MOOSE: 'moose', BIGHORN: 'bighorn sheep', GOAT: 'mountain goat' } as Record<string, string>)[species] ?? species.toLowerCase();
/** Unit key -> label: GMU 101, Deer Area 3071, Elk Area 3911, Moose Area 1, Sheep Unit 7, Goat Unit 3-6. */
export const waUnitLabel = (u: string) => (/^DA/.test(u) ? `Deer Area ${u.slice(2)}` : /^EA/.test(u) ? `Elk Area ${u.slice(2)}`
  : /^MA/.test(u) ? `Moose Area ${u.slice(2)}` : /^SH/.test(u) ? `Sheep Unit ${u.slice(2)}` : /^MG/.test(u) ? `Goat Unit ${u.slice(2)}` : `GMU ${u}`);
export const waUnitKind = (u: string) => (/^DA/.test(u) ? 'Deer Area' : /^EA/.test(u) ? 'Elk Area' : /^MA/.test(u) ? 'Moose Area'
  : /^SH/.test(u) ? 'Sheep Unit' : /^MG/.test(u) ? 'Goat Unit' : 'GMU');
/**
 * Moose, sheep and goat fees, WDFW fee table (2026 pamphlet p. 8 and wdfw.wa.gov/licenses/hunting/big-game, checked
 * Nov 12, 2026; the page carries no season year). The license and tag is bought only if drawn. The higher application
 * price applies to Any Antlered Bull Moose, Any Ram and Goat (footnote 4, with Quality deer and elk).
 */
export const WA_MSG_FEES = {
  checked: 'Nov 12, 2026',
  source: 'https://wdfw.wa.gov/licenses/hunting/big-game',
  appHigh: { res: 18.72, nr: 152.3 },
  app: { res: 9.61, nr: 152.3 },
  license: { res: 457.4, nr: 2279.0, youth: 77.9, senior: 156.84 },
} as const;
/** Categories WDFW limits to once in a lifetime: after you report harvesting (or fail to report) on one, you can't
 *  apply for that category again. Drawing alone doesn't count (pamphlet p. 20). */
export const WA_ONCE = new Set(['Any Antlered Bull Moose', 'Mountain Goat', 'Bighorn Sheep - Any Ram']);
