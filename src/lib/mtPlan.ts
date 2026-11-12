/**
 * Montana's application calendar, the applications a hunter puts choices on, and the year-on-year change log.
 * Pure and client-safe except `mtDroppedCodes`/`mtRedrawn`, which read the build's JSON (server pages only).
 *
 * Dates: FWP's "Application & drawing dates" page, checked 2026-11-11. That page covers the 2026 license year only;
 * FWP had not posted 2027 dates when checked, so every date here is labelled 2026 and is never rolled forward.
 * https://fwp.mt.gov/buyandapply/hunting-licenses/application-drawing-dates
 */
import type { MtBonusType } from './mtPoints';
import type { MtPointOdds, MtHistoryYear } from './mtHunt';

export const MT_DATES_SOURCE = 'https://fwp.mt.gov/buyandapply/hunting-licenses/application-drawing-dates';
export const MT_DATES_CHECKED = 'Nov 11, 2026';
export const MT_DATES_YEAR = 2026;

/** One application a hunter files. `COMBO` is the nonresident combination license; the rest are bonus-point types. */
export type MtAppKey = 'COMBO' | MtBonusType;
export interface MtApp {
  key: MtAppKey;
  label: string;
  /** 2026 deadline, 11:45 pm Mountain, as FWP prints it */
  deadline: string;
  /** FWP's "drawing date" wording; '' where FWP's dates page doesn't list the license */
  results: string;
  species: 'DEER' | 'ELK' | 'PRONGHORN' | 'DEER_ELK';
  nrOnly?: boolean;
  /** what it adds, in hunter words */
  what: string;
}

export const MT_APPS: MtApp[] = [
  { key: 'COMBO', label: 'Nonresident combination license', deadline: '2026-04-01', results: 'mid-April', species: 'DEER_ELK', nrOnly: true,
    what: 'Your general deer and/or elk license. A nonresident needs it to hunt deer or elk at all, and to use a deer or elk permit.' },
  { key: 'DEER_PERMIT', label: 'Deer permit', deadline: '2026-04-01', results: 'mid-April', species: 'DEER',
    what: 'Restricts your general deer license to a district, season or animal (most often a mule deer buck). Not an extra deer.' },
  { key: 'ELK_PERMIT', label: 'Elk permit', deadline: '2026-04-01', results: 'mid-April', species: 'ELK',
    what: 'Restricts your general elk license to a district or season (often a bull). Not an extra elk.' },
  { key: 'ANTELOPE', label: 'Antelope license', deadline: '2026-06-01', results: 'early August', species: 'PRONGHORN',
    what: 'Montana sells no general antelope license; every one is drawn. No combination license needed.' },
  { key: 'DEER_B', label: 'Deer B license (drawn)', deadline: '2026-06-01', results: 'mid-June', species: 'DEER',
    what: 'An extra antlerless deer. No combination license needed.' },
  { key: 'ELK_B', label: 'Elk B license (drawn)', deadline: '2026-06-01', results: 'mid-June', species: 'ELK',
    what: 'An extra antlerless elk. No combination license needed.' },
  // Not on FWP's dates page; every Antelope B row of the 2026 regulations says "Apply by June 1".
  { key: 'ANTELOPE_B', label: 'Antelope B license', deadline: '2026-06-01', results: '', species: 'PRONGHORN',
    what: 'An extra doe/fawn antelope.' },
];

/** FWP prints three choices on every bonus-point application; the combination license has none. */
export const MT_CHOICES = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mtDay = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };

/** Which application a hunt is chosen on. General licences and over-the-counter B licences are not drawn choices. */
export function mtAppOf(po: MtPointOdds | null | undefined): MtBonusType | null {
  if (!po || po.kind !== 'bonus') return null;
  const t: Record<string, MtBonusType> = {
    'Deer Permit': 'DEER_PERMIT', 'Elk Permit': 'ELK_PERMIT', 'Antelope License': 'ANTELOPE',
    'Deer B License': 'DEER_B', 'Elk B License': 'ELK_B', 'Antelope B License': 'ANTELOPE_B',
  };
  return t[po.license] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// What changed: the latest drawing against the one before, from each hunt's own draw history.

export interface MtChangeRow { id: string; slug: string | null; name: string; areaName: string | null; species: string; pointOdds: unknown; resOddsLast: number | null; nrOddsLast: number | null; resOddsPrev: number | null; nrOddsPrev: number | null; oddsYears: number }
export interface MtQuotaChange { row: MtChangeRow; prev: number; last: number; app: MtBonusType }
export interface MtAppsChange { row: MtChangeRow; prev: number; last: number; app: MtBonusType }

const pair = (h: MtHistoryYear[] | undefined, year: number) => {
  const last = h?.find((x) => x.year === year), prev = h?.find((x) => x.year === year - 1);
  return { last, prev };
};

/** The latest drawing year any drawn hunt reports. */
export function mtLatestDraw(rows: MtChangeRow[]): number | null {
  let y = 0;
  for (const r of rows) for (const h of (r.pointOdds as MtPointOdds | null)?.history ?? []) y = Math.max(y, h.year);
  return y || null;
}

/**
 * Quota changes and first-choice applicant swings between the latest drawing and the year before. Only drawn
 * hunts with a numeric quota both years count: an unlimited ("UNL") quota has no number to compare.
 */
export function mtChanges(rows: MtChangeRow[], year: number) {
  const quota: MtQuotaChange[] = [], apps: MtAppsChange[] = [], fresh: { row: MtChangeRow; app: MtBonusType }[] = [];
  for (const row of rows) {
    const po = row.pointOdds as MtPointOdds | null;
    const app = mtAppOf(po);
    if (!app) continue;
    const { last, prev } = pair(po?.history, year);
    if (!last) continue;
    if (!prev) { if ((po?.history ?? []).every((h) => h.year >= year)) fresh.push({ row, app }); continue; }
    if (typeof last.quota === 'number' && typeof prev.quota === 'number' && last.quota !== prev.quota) quota.push({ row, prev: prev.quota, last: last.quota, app });
    const a = last.res[0] + last.nr[0], b = prev.res[0] + prev.nr[0];
    if (b >= 50 && a !== b) apps.push({ row, prev: b, last: a, app });
  }
  quota.sort((x, y) => Math.abs(y.last - y.prev) - Math.abs(x.last - x.prev) || x.row.name.localeCompare(y.row.name));
  apps.sort((x, y) => Math.abs(y.last - y.prev) / y.prev - Math.abs(x.last - x.prev) / x.prev);
  return { quota, apps, fresh };
}
