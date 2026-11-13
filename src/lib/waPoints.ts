/**
 * Washington point balances and transport-tag choices for the account page. Pure and client-safe.
 *
 * WDFW special permits and multi-season tags are a weighted drawing (2026 Big Game pamphlet pp. 17-19; checked
 * against WDFW's own results in docs/states/wa-onboarding.md §3): one point per application per category, and an
 * application gets (points held + 1)² random numbers, the best one ranking it in that category's single queue.
 * Points are kept per category, reset to zero on drawing, and residents and nonresidents share one pool.
 *
 * The general transport tag matters too: a special permit can only be applied for with the tag its table lists
 * (weapon, and for elk the side of the state). Multi-season tag holders can apply with any weapon and either side.
 */
import type { Residency } from '@prisma/client';

/** Sanity bound: WDFW's 2018-2020 tables top out in the low 20s. */
export const WA_POINTS_MAX = 40;

export const WA_POINT_TYPES = [
  { key: 'QUALITY_DEER', label: 'Quality deer', species: 'DEER' },
  { key: 'BUCK_DEER', label: 'Buck deer', species: 'DEER' },
  { key: 'ANTLERLESS_DEER', label: 'Antlerless deer', species: 'DEER' },
  { key: 'SECOND_DEER', label: 'Second deer', species: 'DEER' },
  { key: 'QUALITY_ELK', label: 'Quality elk', species: 'ELK' },
  { key: 'BULL_ELK', label: 'Bull elk', species: 'ELK' },
  { key: 'ANTLERLESS_ELK', label: 'Antlerless elk', species: 'ELK' },
  { key: 'MS_DEER', label: 'Multi-season deer', species: 'DEER' },
  { key: 'MS_ELK', label: 'Multi-season elk', species: 'ELK' },
  { key: 'YOUTH_DEER', label: 'Youth deer (under 16)', species: 'DEER' },
  { key: 'YOUTH_ELK', label: 'Youth elk (under 16)', species: 'ELK' },
  { key: 'SENIOR_DEER', label: '65+ deer', species: 'DEER' },
  { key: 'SENIOR_ELK', label: '65+ elk', species: 'ELK' },
  { key: 'DISABLED_DEER', label: 'Hunters with disabilities deer', species: 'DEER' },
  { key: 'DISABLED_ELK', label: 'Hunters with disabilities elk', species: 'ELK' },
  { key: 'MASTER_DEER', label: 'Master Hunter deer', species: 'DEER' },
  { key: 'MASTER_ELK', label: 'Master Hunter elk', species: 'ELK' },
] as const;
export type WaPointType = (typeof WA_POINT_TYPES)[number]['key'];

export const WA_DEER_TAGS = [['MODERN', 'Modern firearm'], ['ARCHERY', 'Archery'], ['MUZZLELOADER', 'Muzzleloader'], ['MULTI', 'Multi-season']] as const;
export const WA_ELK_TAGS = [['EF', 'Eastern modern (EF)'], ['EA', 'Eastern archery (EA)'], ['EM', 'Eastern muzzleloader (EM)'],
  ['WF', 'Western modern (WF)'], ['WA', 'Western archery (WA)'], ['WM', 'Western muzzleloader (WM)'], ['MULTI', 'Multi-season']] as const;
export type WaDeerTag = (typeof WA_DEER_TAGS)[number][0];
export type WaElkTag = (typeof WA_ELK_TAGS)[number][0];

/** As stored under the `WA` key of the points store (User.points, or the `pts` cookie). */
export interface WaStored { res: Residency; waPoints: Record<WaPointType, number>; deerTag: WaDeerTag | null; elkTag: WaElkTag | null; set: true }

export interface WaPoints {
  res: Residency;
  points: Record<WaPointType, number>;
  deerTag: WaDeerTag | null;
  elkTag: WaElkTag | null;
  /** false until the hunter has saved anything for Washington. */
  set: boolean;
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(WA_POINTS_MAX, Math.floor(n))) : 0);
const isDeerTag = (v: unknown): v is WaDeerTag => WA_DEER_TAGS.some(([k]) => k === v);
const isElkTag = (v: unknown): v is WaElkTag => WA_ELK_TAGS.some(([k]) => k === v);

export function readWaPoints(store: Record<string, unknown> | null | undefined): WaPoints {
  const s = (store?.WA ?? {}) as Partial<WaStored> & { set?: unknown };
  const points = {} as Record<WaPointType, number>;
  for (const { key } of WA_POINT_TYPES) points[key] = whole(s.waPoints?.[key]);
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', points, deerTag: isDeerTag(s.deerTag) ? s.deerTag : null,
    elkTag: isElkTag(s.elkTag) ? s.elkTag : null, set: s.set === true };
}

const CATEGORY_TYPE: Record<string, WaPointType> = {
  'Quality Deer': 'QUALITY_DEER', 'Buck Deer': 'BUCK_DEER', 'Antlerless Deer': 'ANTLERLESS_DEER', 'Second Deer': 'SECOND_DEER',
  'Quality Elk': 'QUALITY_ELK', 'Bull Elk': 'BULL_ELK', 'Antlerless Elk': 'ANTLERLESS_ELK', 'Multi-season Deer': 'MS_DEER', 'Multi-season Elk': 'MS_ELK',
  'Deer - Youth': 'YOUTH_DEER', 'Elk - Youth': 'YOUTH_ELK',
  'Deer - 65 Years or Over': 'SENIOR_DEER', 'Elk - 65 and Over': 'SENIOR_ELK',
  'Deer - Hunters with Disabilities': 'DISABLED_DEER', 'Elk - Hunters with Disabilities': 'DISABLED_ELK',
  'Deer - Master Hunter': 'MASTER_DEER', 'Elk - Master Hunter': 'MASTER_ELK',
};
/** Which balance a Washington hunt draws on, from WDFW's category (null for a general-season, no-draw hunt). */
export const waPointType = (category: string | null | undefined): WaPointType | null => (category ? CATEGORY_TYPE[category] ?? null : null);

/**
 * Whether a hunter's general tag lets them apply for a special permit, from the permit table's "tag required"
 * cell ("Any", "Modern", "Archery, Muzzleloader", "EF", "EF, EM", "Any elk tag", ...). null when we can't tell
 * (no tag saved, or a cell we don't recognise): callers must not hide a hunt on null.
 */
export function waTagAllows(tagCell: string | null | undefined, species: string, p: Pick<WaPoints, 'deerTag' | 'elkTag'>): boolean | null {
  const cell = (tagCell ?? '').trim();
  const mine = species === 'DEER' ? p.deerTag : species === 'ELK' ? p.elkTag : null;
  if (!cell || !mine) return null;
  if (/^any\b/i.test(cell)) return true;
  if (mine === 'MULTI') return true; // multi-season tag holders may apply with any weapon (and, for elk, either side)
  if (species === 'DEER') {
    const want = ({ MODERN: /modern/i, ARCHERY: /archery/i, MUZZLELOADER: /muzzle/i } as Record<string, RegExp>)[mine];
    if (!want) return null;
    if (!/modern|archery|muzzle/i.test(cell)) return null;
    return want.test(cell);
  }
  const codes = cell.toUpperCase().match(/\b[EW][FAM]\b/g);
  if (!codes) return null;
  return codes.includes(mine);
}

/** Validate the Washington part of the preferences form: null without a WA section, a message when invalid. */
export function parseWaForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): WaStored | string | null {
  if (!has('waResidency')) return null;
  const res = get('waResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select a Washington residency.';
  const waPoints = {} as Record<WaPointType, number>;
  for (const { key, label } of WA_POINT_TYPES) {
    const v = get('waPts_' + key);
    if (typeof v !== 'string' || !/^\d{1,2}$/.test(v) || Number(v) > WA_POINTS_MAX) return `Enter whole Washington ${label.toLowerCase()} points from 0 to ${WA_POINTS_MAX}.`;
    waPoints[key] = Number(v);
  }
  const d = get('waDeerTag'), e = get('waElkTag');
  return { res, waPoints, deerTag: isDeerTag(d) ? d : null, elkTag: isElkTag(e) ? e : null, set: true };
}
