/**
 * Utah point balances for the account page. Pure and client-safe.
 *
 * Utah runs two point systems for deer and elk (Utah Admin. Code R657-62; DWR "How bonus and preference points
 * work", checked 2026-11-11; docs/states/ut-onboarding.md §2):
 *
 *   Bonus points: limited-entry buck deer (also premium limited-entry, management buck and CWMU buck deer) and
 *   limited-entry bull elk (also CWMU bull elk). One balance per species. Half of each hunt's permits go to the
 *   applicants with the most points, on their first choice; the rest are drawn with points + 1 entries each.
 *   Points are lost only by drawing a permit for that species (no skip-year loss in the rule).
 *
 *   Preference points: general-season buck deer. A strict queue by points, unit by unit.
 *
 *   Pronghorn (limited-entry buck pronghorn, CWMU pronghorn) and bison (once in a lifetime: hunter's choice, cow
 *   only and Antelope Island) are bonus-point draws too, each with its own balance.
 *
 * Waiting periods after drawing (2026 guidebook): limited-entry buck deer and bull elk 5 years, buck pronghorn
 * 2 years, bison never again. Not stored yet; the pages say so.
 */
import type { Residency } from '@prisma/client';

/** Sanity bound: the 2026 tables top out near 30 points. */
export const UT_POINTS_MAX = 40;

export const UT_POINT_TYPES = [
  { key: 'LE_DEER', label: 'Limited-entry buck deer', kind: 'bonus' },
  { key: 'LE_ELK', label: 'Limited-entry bull elk', kind: 'bonus' },
  { key: 'GEN_DEER', label: 'General-season buck deer', kind: 'preference' },
  { key: 'LE_PRONGHORN', label: 'Limited-entry buck pronghorn', kind: 'bonus' },
  { key: 'BISON', label: 'Bison (once in a lifetime)', kind: 'bonus' },
] as const;
export type UtPointType = (typeof UT_POINT_TYPES)[number]['key'];

/** As stored under the `UT` key of the points store (User.points, or the `pts` cookie). */
export interface UtStored {
  res: Residency;
  utPoints: Record<UtPointType, number>;
  set: true;
}

export interface UtPoints {
  res: Residency;
  points: Record<UtPointType, number>;
  /** false until the hunter has saved anything for Utah, so pages can ask instead of assuming 0 points. */
  set: boolean;
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(UT_POINTS_MAX, Math.floor(n))) : 0);

export function readUtPoints(store: Record<string, unknown> | null | undefined): UtPoints {
  const s = (store?.UT ?? {}) as Partial<UtStored> & { set?: unknown };
  const points = {} as Record<UtPointType, number>;
  for (const { key } of UT_POINT_TYPES) points[key] = whole(s.utPoints?.[key]);
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', points, set: s.set === true };
}

/** Which balance a Utah hunt draws on, from its DWR hunt number and species (null: no points, e.g. over the counter). */
export function utPointType(tagCode: string | null | undefined, species: string, type: string): UtPointType | null {
  if (!tagCode) return null;
  if (type === 'GENERAL') return species === 'DEER' ? 'GEN_DEER' : null;
  if (/^EB1\d{3}$/.test(tagCode)) return null; // general-season elk hunt numbers (youth draw included)
  return species === 'DEER' ? 'LE_DEER' : species === 'ELK' ? 'LE_ELK' : species === 'PRONGHORN' ? 'LE_PRONGHORN' : species === 'BISON' ? 'BISON' : null;
}

/**
 * Validate the Utah part of the preferences form. null when the form has no Utah section, an error message when
 * invalid, else the value to store.
 */
export function parseUtForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): UtStored | string | null {
  if (!has('utResidency')) return null;
  const res = get('utResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select a Utah residency.';
  const utPoints = {} as Record<UtPointType, number>;
  for (const { key, label } of UT_POINT_TYPES) {
    const v = get('utPts_' + key);
    if (typeof v !== 'string' || !/^\d{1,2}$/.test(v) || Number(v) > UT_POINTS_MAX) return `Enter whole Utah ${label.toLowerCase()} points from 0 to ${UT_POINTS_MAX}.`;
    utPoints[key] = Number(v);
  }
  return { res, utPoints, set: true };
}
