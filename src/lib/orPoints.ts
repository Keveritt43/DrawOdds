/**
 * Oregon preference points for the account page. Pure and client-safe.
 *
 * ODFW keeps one preference point balance per hunt series (2026 Oregon Big Game Regulations, "How Does the
 * Controlled Hunt Draw Work?"): 100 Buck Deer, 200 Elk (bull and antlerless elk share it), 600 Antlerless Deer.
 * A hunter gains a point each year they apply and don't draw their first choice (or buy a point saver), and goes
 * back to 0 on drawing a first choice, whether or not they buy the tag. Points don't lapse. Residents and
 * nonresidents draw in one queue, but nonresidents stop drawing once a hunt's nonresident maximum (5% of its tags)
 * is reached (docs/states/or-onboarding.md §2).
 */
import type { Residency } from '@prisma/client';

/** Sanity bound: ODFW's 2026 reports top out in the low 20s. */
export const OR_POINTS_MAX = 30;

export const OR_POINT_TYPES = [
  { key: 'BUCK', label: 'Buck deer (100 series)', series: '100', species: 'DEER' },
  { key: 'ELK', label: 'Elk (200 series)', series: '200', species: 'ELK' },
  { key: 'ANTLERLESS', label: 'Antlerless deer (600 series)', series: '600', species: 'DEER' },
] as const;
export type OrPointType = (typeof OR_POINT_TYPES)[number]['key'];

/** As stored under the `OR` key of the points store (User.points, or the `pts` cookie). */
export interface OrStored { res: Residency; orPoints: Record<OrPointType, number>; set: true }

export interface OrPoints {
  res: Residency;
  points: Record<OrPointType, number>;
  /** false until the hunter has saved anything for Oregon. */
  set: boolean;
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(OR_POINTS_MAX, Math.floor(n))) : 0);

export function readOrPoints(store: Record<string, unknown> | null | undefined): OrPoints {
  const s = (store?.OR ?? {}) as Partial<OrStored> & { set?: unknown };
  const points = {} as Record<OrPointType, number>;
  for (const { key } of OR_POINT_TYPES) points[key] = whole(s.orPoints?.[key]);
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', points, set: s.set === true };
}

/** Which balance an Oregon controlled hunt draws on, from its hunt series. */
export const orPointType = (series: string | null | undefined): OrPointType | null =>
  series === '100' ? 'BUCK' : series === '200' ? 'ELK' : series === '600' ? 'ANTLERLESS' : null;

/** Validate the Oregon part of the preferences form: null without an OR section, a message when invalid. */
export function parseOrForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): OrStored | string | null {
  if (!has('orResidency')) return null;
  const res = get('orResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select an Oregon residency.';
  const orPoints = {} as Record<OrPointType, number>;
  for (const { key, label } of OR_POINT_TYPES) {
    const v = get('orPts_' + key) ?? '0';
    if (typeof v !== 'string' || !/^\d{1,2}$/.test(v) || Number(v) > OR_POINTS_MAX) return `Enter whole Oregon ${label.toLowerCase()} points from 0 to ${OR_POINTS_MAX}.`;
    orPoints[key] = Number(v);
  }
  return { res, orPoints, set: true };
}
