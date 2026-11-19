/**
 * Arizona point balances for the account page. Pure and client-safe.
 *
 * AZGFD "Bonus Point Process" and "Draw Process" pages (checked 2026-11-18; docs/states/az-onboarding.md): a bonus
 * point per species (genus) for each unsuccessful valid application or point-only purchase, zeroed when the hunter
 * draws that species. Two extra points count in every species' draw: the loyalty bonus point (applied or bought a
 * point every year for five years in a row) and the hunter education bonus point (an AZGFD-approved course, earned
 * once). In the draw an application holds one random number plus one per point and keeps the lowest; the 20% bonus
 * pass sorts by those same points.
 */
import type { Residency } from '@prisma/client';

export const AZ_POINTS_MAX = 40;
export const AZ_POINT_TYPES = [
  { key: 'DEER', label: 'Deer' },
  { key: 'ELK', label: 'Elk' },
] as const;
export type AzPointType = (typeof AZ_POINT_TYPES)[number]['key'];

/** As stored under the `AZ` key of the points store (User.points, or the `pts` cookie). */
export interface AzStored { res: Residency; azPoints: Record<AzPointType, number>; loyalty: boolean; hunterEd: boolean; set: true }
export interface AzPoints {
  res: Residency;
  points: Record<AzPointType, number>;
  loyalty: boolean;
  hunterEd: boolean;
  /** false until the hunter has saved anything for Arizona, so pages can ask instead of assuming 0 points. */
  set: boolean;
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(AZ_POINTS_MAX, Math.floor(n))) : 0);

export function readAzPoints(store: Record<string, unknown> | null | undefined): AzPoints {
  const s = (store?.AZ ?? {}) as Partial<AzStored> & { set?: unknown };
  const points = {} as Record<AzPointType, number>;
  for (const { key } of AZ_POINT_TYPES) points[key] = whole(s.azPoints?.[key]);
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', points, loyalty: s.loyalty === true, hunterEd: s.hunterEd === true, set: s.set === true };
}

/** The points AZGFD sorts and weights the application by: species bonus points + loyalty + hunter education. */
export function azGroupPoints(p: AzPoints, species: string): number {
  const base = species === 'ELK' ? p.points.ELK : species === 'DEER' ? p.points.DEER : 0;
  return base + (p.loyalty ? 1 : 0) + (p.hunterEd ? 1 : 0);
}

/** Validate the Arizona part of the preferences form: null when absent, an error message, or the value to store. */
export function parseAzForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): AzStored | string | null {
  if (!has('azResidency')) return null;
  const res = get('azResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select an Arizona residency.';
  const azPoints = {} as Record<AzPointType, number>;
  for (const { key, label } of AZ_POINT_TYPES) {
    const v = get('azPts_' + key);
    if (typeof v !== 'string' || !/^\d{1,2}$/.test(v) || Number(v) > AZ_POINTS_MAX) return `Enter whole Arizona ${label.toLowerCase()} bonus points from 0 to ${AZ_POINTS_MAX}.`;
    azPoints[key] = Number(v);
  }
  return { res, azPoints, loyalty: get('azLoyalty') === 'on', hunterEd: get('azHunterEd') === 'on', set: true };
}
