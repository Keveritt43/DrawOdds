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
 * Next draw: bonus-point licences default to the projection in src/lib/mtProj.ts (FWP's weighted draw re-run on the
 * last draw's applicants; it beat the last draw in a backtest). The combination draw has no projection that beat its
 * last draw, so general licences and the combination part of a nonresident permit always show the last draw.
 */
import { mtCombo, type MtBonusType, type MtPoints } from './mtPoints';
import { mtProjected } from './mtProj';

/** Labels for the ownership classes in data/mt/land.json (scripts/mt_build_land.py). */
export const MT_OWNER: Record<string, string> = {
  BLM: 'BLM', USFS: 'Forest Service', STATE: 'State and FWP', NPS: 'National Park', FWS: 'Fish & Wildlife', BOR: 'Reclamation', DOD: 'Defense',
  LOCAL: 'Local government', OTHER: 'Other federal', PRIVATE: 'Private', TRIBAL: 'Tribal', UNDETERMINED: 'Not attributed',
};

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
  /** general licence, drawn bonus-point licence, or a B licence sold over the counter (no draw) */
  kind: 'bonus' | 'general' | 'otc';
  /** over-the-counter B licences: 2026 fees as printed, and the day sales open */
  fee?: { res: number; nr: number; year: number; pages: string };
  onSale?: string;
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
  /** antelope: the regulation districts as FWP prints them (Region 7 areas are "R7:Portions of HDs …") */
  regsDistricts?: string[];
  /** the nonresident combination draws at 0..3 preference points, by FWP drawing ('biggame-elk' | 'deer') */
  combo?: { key?: string; name?: string; year: number; odds?: Record<string, number[]>; names?: Record<string, string> };
  /** deer the licence allows: ['MULE'], ['WHITETAIL'] or both */
  deer?: ('MULE' | 'WHITETAIL')[];
  /** success is mule bucks per permit (only a permit allows a mule deer buck in the district) */
  mulePermit?: boolean;
  mulePermitNote?: string;
}

export const MT_LICENSE_TYPE: Record<string, MtBonusType> = {
  'Deer Permit': 'DEER_PERMIT', 'Elk Permit': 'ELK_PERMIT', 'Deer B License': 'DEER_B', 'Elk B License': 'ELK_B',
  'Antelope License': 'ANTELOPE', 'Antelope B License': 'ANTELOPE_B',
};
export const MT_POOL_LABEL: Record<MtPool, string> = { res: 'Resident', nr: 'Nonresident' };

/** "Elk Permit" -> "permit", "Antelope License" -> "antelope", any B licence -> "b", general -> "general".
 *  Used by the licence-type filter. */
export function mtKind(po: MtPointOdds | null | undefined): 'general' | 'permit' | 'antelope' | 'b' | null {
  if (!po) return null;
  if (po.kind === 'general') return 'general';
  if (po.license === 'Antelope License') return 'antelope';
  return /Permit$/.test(po.license) ? 'permit' : 'b';
}

/** Unit key -> what a hunter reads: "261" -> "HD 261"; antelope "A320" -> "HD 320"; "A701N" -> "HD 701 north". */
export function mtUnitLabel(u: string): string {
  const m = /^A(\d+)([NS])?$/.exec(u);
  if (!m) return `HD ${u}`;
  return `HD ${m[1]}${m[2] ? (m[2] === 'N' ? ' north' : ' south') : ''}`;
}
export const mtIsAntelopeUnit = (u: string) => /^A\d/.test(u);

const at = (a: number[] | undefined, i: number) => (a && a.length ? a[Math.min(Math.max(0, Math.floor(i)), a.length - 1)] : null);

export interface MtPersonal {
  odds: number | null; points: number | null; buying: boolean | null; basis: string;
  /** nonresident permit: the combination draw's part and the permit draw's part of `odds` */
  parts?: { combo: number | null; permit: number | null; comboName: string };
}

/** The nonresident combination draw that applies to a species for the hunter's chosen combination, or why none. */
export function mtComboFor(po: MtPointOdds, species: string, p: MtPoints): { odds: number | null; name: string; covered: boolean } {
  const c = mtCombo(p.comboType);
  const covered = (c.species as readonly string[]).includes(species);
  const name = po.combo?.names?.[c.draw] ?? (c.draw === 'deer' ? 'Deer Combination' : 'Big Game / Elk Combination');
  if (!covered) return { odds: 0, name: c.label.replace(/ \(.*\)$/, ''), covered };
  const arr = po.combo?.odds?.[c.draw];
  const pts = Math.min(3, Math.max(0, Math.floor(p.combo)));
  return { odds: arr ? at(arr, pts) : null, name, covered };
}

/** A hunter's odds for one Montana hunt from their saved settings. */
export function mtPersonal(r: { oddsByPts: unknown; pointOdds: unknown; oddsLastYear: number | null }, p: MtPoints, nr: boolean, mode: 'proj' | 'last' = 'proj'): MtPersonal {
  const po = r.pointOdds as MtPointOdds | null;
  const t = r.oddsByPts as MtOddsTable | null;
  const year = po?.year ?? r.oddsLastYear ?? 'latest';
  if (!po || !t) return { odds: null, points: null, buying: null, basis: 'No draw data' };
  const species = po.license.startsWith('General Elk') || po.license.startsWith('Elk') ? 'ELK' : 'DEER';
  if (po.kind === 'otc') {
    return { odds: 1, points: null, buying: null,
      basis: `Over the counter from ${po.onSale ?? 'June 15'}, no draw${po.quota === 'UNL' ? ', unlimited' : ''}; no combination licence needed` };
  }
  if (po.kind === 'general') {
    if (!nr) return { odds: 1, points: null, buying: null, basis: 'Resident general licence, over the counter' };
    const pts = Math.min(3, Math.max(0, Math.floor(p.combo)));
    if (po.combo?.odds) {
      const c = mtComboFor(po, species, p);
      return { odds: c.odds, points: pts, buying: null,
        basis: c.covered ? `${po.combo.year} ${c.name} draw · ${pts} preference point${pts === 1 ? '' : 's'}`
          : `Your ${c.name} doesn't include ${species === 'ELK' ? 'elk' : 'deer'}: change it in Account` };
    }
    return { odds: at(t.last.nr, pts), points: pts, buying: null,
      basis: `${po.combo?.year ?? year} ${po.combo?.name ?? 'combination'} draw · ${pts} preference point${pts === 1 ? '' : 's'}` };
  }
  const type = MT_LICENSE_TYPE[po.license];
  const pool: MtPool = nr ? 'nr' : 'res';
  const banked = type ? p.bonus[type] : 0;
  const buying = type ? p.buying[type] : true;
  const proj = mode === 'proj' ? mtProjected(po) : null;
  const projArr = proj?.[pool] ?? null;
  const useProj = !!projArr;
  const permit = useProj
    ? (!buying ? proj!.noBuy[pool] : at(projArr!, banked))
    : !buying ? (t.noBuy?.[pool] ?? null) : at(t.last[pool], banked);
  const when = useProj ? `Next draw, projected from the ${year} draw` : `${year} draw`;
  const basis = !buying
    ? `${when} · ${MT_POOL_LABEL[pool]} · not buying a point: your ${banked} banked point${banked === 1 ? ' is' : 's are'} not used`
    : `${when} · ${MT_POOL_LABEL[pool]} · ${banked} bonus point${banked === 1 ? '' : 's'} + this year's (FWP's ${banked + 1}-point row)`;
  // A nonresident's deer or elk permit is only good with a combination licence, drawn at the same time: the chance
  // of hunting is both draws. Treated as independent; FWP doesn't say how a permit drawn without a combination is
  // handled, so this is the chance of holding both.
  if (nr && po.needsGeneral && po.combo?.odds) {
    const c = mtComboFor(po, species, p);
    const both = c.odds === null || permit === null ? null : c.odds * permit;
    return { odds: both, points: banked, buying, parts: { combo: c.odds, permit, comboName: c.name },
      basis: c.covered ? `${basis} × ${po.combo.year} ${c.name} draw (last draw) at ${Math.min(3, Math.floor(p.combo))} preference points`
        : `Your ${c.name} doesn't include ${species === 'ELK' ? 'elk' : 'deer'}, which this permit needs: change it in Account` };
  }
  return { odds: permit, points: banked, buying, basis };
}

/** "HD 217" / "HDs 210, 211 …" for cards. */
export function mtDistricts(units: string[], max = 4): string {
  if (units.length === 1) return mtUnitLabel(units[0]);
  return `HDs ${units.slice(0, max).map((u) => mtUnitLabel(u).slice(3)).join(', ')}${units.length > max ? ` +${units.length - max}` : ''}`;
}
