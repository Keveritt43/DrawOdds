/**
 * New Mexico hunt records (HuntSummary rows from scripts/nm-import.ts, built by scripts/nm_build_hunts.py) and the
 * hunter's own odds. Pure and client-safe.
 *
 * New Mexico's draw is a pure lottery: no points. Every application gets a random sequence number and is examined
 * whole, 1st choice, then 2nd, then 3rd, each against its pool's share of the hunt's licenses; a separate 4th-choice
 * drawing then hands leftover deer and elk licenses to applicants who opted in. Odds are per pool and per first choice:
 *   oddsByPts.last.<pool>[0]  the 2026 draw: first-choice drawn / first-choice applicants (NMDOW Complete Report)
 *   oddsByPts.proj.<pool>[0]  next-draw estimate (residents: last 2 draws pooled; nonresident and outfitter pools: the
 *                             last draw shrunk toward the last 3 pooled), chosen per pool on 2021, 2022 and 2025 and
 *                             checked on 2026 (docs/states/nm-onboarding.md §4)
 * Arrays have one entry: points don't exist, so there is only "you".
 */
import { nmPool, type NmPool, type NmSettings } from './nmSettings';

export interface NmOddsTable { proj: Partial<Record<NmPool, number[]>>; last: Partial<Record<NmPool, number[]>> }
export interface NmPointOdds {
  state: 'NM';
  /** draw: public draw (incl. landowner-authorized private-land deer); otc: over-the-counter private-land deer */
  kind: 'draw' | 'otc';
  year: number;
  projected: boolean;
  bag: string;
  fee: 'S' | 'Q' | 'HD' | 'Q/HD' | null;
  feeType?: string;
  header?: string;
  weaponText?: string;
  dates?: string | null;
  datesFrom?: string | null;
  /** false: resident-only, WMA-only or antlerless elk (NMDOW issues those to residents only) */
  nrEligible: boolean;
  youth?: boolean;
  residentOnly?: boolean;
  mobility?: boolean;
  military?: boolean;
  wmaOnly?: boolean;
  publicOnly?: boolean;
  restrictedMuzzle?: boolean;
  onceInALifetime?: boolean;
  cwd?: boolean;
  area?: string | null;
  landNote?: string;
  method?: Record<NmPool, string>;
  /** first-choice [applicants, drawn] by pool, plus the hunt's licenses, per draw year with today's hunt codes */
  history?: Record<string, Record<NmPool, [number, number]> & { licenses: number }>;
  choices2026?: Record<NmPool, { apps: number[]; drew: number[] }>;
  issued2026?: Record<NmPool, number>;
  harvest?: { year: number; licenses: number | null; hunters: number | null; harvest: number | null; success: number | null; male: number | null; female: number | null; days: number | null }[];
}
type Row = { species: string; type: string; oddsByPts: unknown; pointOdds: unknown };

export const nmPo = (r: Row) => r.pointOdds as NmPointOdds | null;
export const nmIsOtc = (r: Row) => nmPo(r)?.kind === 'otc';

/** Whether this hunter may apply for (or buy) this hunt. */
export function nmEligible(r: Row, s: Pick<NmSettings, 'res'>): boolean {
  return s.res === 'RESIDENT' || nmPo(r)?.nrEligible !== false;
}

/** Restricted eligibility (mobility-impaired or military): hidden unless the hunter asks for them. */
export const nmRestricted = (r: Row) => !!(nmPo(r)?.mobility || nmPo(r)?.military);

export function nmPersonal(r: Row, s: NmSettings, mode: 'proj' | 'last' = 'proj'): { odds: number | null; pool: NmPool; basis: string; projected: boolean; eligible: boolean } {
  const po = nmPo(r);
  const pool = nmPool(s);
  const eligible = nmEligible(r, s);
  if (nmIsOtc(r)) return { odds: 1, pool, basis: 'Over the counter: private land only, no draw', projected: false, eligible };
  if (!eligible) return { odds: null, pool, basis: 'Residents only: NMDOW doesn\'t issue this license to nonresidents', projected: false, eligible };
  const t = r.oddsByPts as NmOddsTable | null;
  const projected = mode === 'proj' && !!po?.projected && t?.proj?.[pool]?.[0] !== undefined;
  const v = (projected ? t?.proj : t?.last)?.[pool]?.[0];
  const odds = v === undefined ? null : v;
  const hist = po?.history?.[String(po?.year ?? 2026)]?.[pool];
  const what = pool === 'out' ? 'outfitter pool' : pool === 'nr' ? 'nonresident pool' : 'resident pool';
  const basis = odds === null
    ? `No first-choice applicants in the ${what} in ${po?.year ?? 2026}`
    : projected
      ? `Next draw, estimated from recent draws · ${what}, first choice`
      : `${po?.year ?? 2026} draw · ${what}, first choice${hist ? `: ${hist[1]} of ${hist[0]} drew` : ''}`;
  return { odds, pool, basis, projected, eligible };
}

/** License kind for the "New Mexico: Hunt Type" filter. */
export function nmLicense(r: Row): 'draw' | 'private' | 'otc' {
  const po = nmPo(r);
  return po?.kind === 'otc' ? 'otc' : (r as { privateOnly?: boolean }).privateOnly ? 'private' : 'draw';
}

export const NM_LICENSE_LABEL = { draw: 'Public draw', private: 'Private land (landowner code)', otc: 'Over the counter (private land)' } as const;
export const NM_WEAPON_LABEL: Record<string, string> = { ANY: 'Any legal weapon', ARCHERY: 'Bow only', MUZZLELOADER: 'Muzzleloader, crossbow or bow' };
export const NM_BAG: Record<string, string> = {
  FAD: 'Fork-antlered deer (mule or white-tailed)', FAMD: 'Fork-antlered mule deer', FAWTD: 'Fork-antlered white-tailed deer',
  ESWTD: 'Either-sex white-tailed deer', A: 'Antlerless', MB: 'Mature bull (no spikes)', 'MB/A': 'Mature bull or antlerless',
  ES: 'Either sex (any elk, spikes included)', 'APRE/6': 'Bull with 6+ points on one antler', 'APRE/6/A': 'Bull with 6+ points on one antler, or antlerless',
};
export const nmUnitLabel = (u: string) => `GMU ${u}`;

/**
 * Fees, 2026-27 Hunting Rules and Information pp. 15-17, and NMDOW's 2027-2028 Draw Hunt License Fees sheet (same
 * license prices), checked Nov 17, 2026. The full license fee is charged when you apply and refunded, less the
 * application fee, if you don't draw. The game-hunting license, HMAV and habitat stamp are never refunded.
 */
export const NM_FEES = {
  checked: 'Nov 17, 2026',
  source: 'https://wildlife.dgf.nm.gov/download/2026-2027-new-mexico-hunting-rules-and-info/',
  appFee: { res: 7, nr: 13 },
  gameHunting: { res: 25, nr: 90 },
  hmav: 4,
  habitatStamp: 10,
  deer: { S: { res: 60, nr: 398 }, Q: { res: 60, nr: 623 }, HD: { res: 60, nr: 623 } },
  elk: { S: { res: 100, nr: 773 }, Q: { res: 100, nr: 998 }, HD: { res: 100, nr: 998 }, A: { res: 70, nr: null } },
  privateDeer: { S: { res: 53, nr: 385 }, Q: { res: 53, nr: 610 } },
} as const;

/** The license price for a hunt and residency, or null when it isn't issued to that residency. */
export function nmLicenseFee(r: Row & { privateOnly?: boolean }, nr: boolean): number | null {
  const po = nmPo(r);
  const fee = (po?.fee ?? 'S').includes('Q') || po?.fee === 'HD' ? (po?.fee === 'HD' ? 'HD' : 'Q') : 'S';
  const who = nr ? 'nr' : 'res';
  if (po?.kind === 'otc') return NM_FEES.privateDeer[fee === 'S' ? 'S' : 'Q'][who];
  if (r.species === 'ELK') return po?.bag === 'A' ? NM_FEES.elk.A[who] : NM_FEES.elk[fee][who];
  return NM_FEES.deer[fee][who];
}

/** The draw dates, 2026 (the 2027 dates are not published yet). */
export const NM_DRAW_2026 = { deadline: 'Mar 18, 2026, 5 pm MDT', results: 'Apr 22, 2026' } as const;
