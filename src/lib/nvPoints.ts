/**
 * Nevada point balances for the account page. Pure and client-safe.
 *
 * NDOW 2026 Big Game Application FAQ (checked 2026-11-17; docs/states/nv-onboarding.md §2): every hunt category has
 * its own bonus points ("Elk has three different categories of bonus points: Antlered Elk, Antlerless Elk, and Spike
 * Elk"). An unsuccessful application turns into a point; a point can also be bought instead of applying. In the draw
 * each application gets points² + 1 random numbers and keeps the lowest. Points are lost after missing two
 * consecutive years of applying for the category, and points are residency agnostic.
 */
import type { Residency } from '@prisma/client';

/** Sanity bound: the 2025 tables top out near 25 points. */
export const NV_POINTS_MAX = 40;

export const NV_POINT_TYPES = [
  { key: 'DEER', label: 'Antlered mule deer' },
  { key: 'DEER_JR', label: 'Junior mule deer' },
  { key: 'ELK_BULL', label: 'Antlered elk' },
  { key: 'ELK_COW', label: 'Antlerless elk' },
  { key: 'ELK_SPIKE', label: 'Spike elk' },
] as const;
export type NvPointType = (typeof NV_POINT_TYPES)[number]['key'];

/** As stored under the `NV` key of the points store (User.points, or the `pts` cookie). */
export interface NvStored { res: Residency; nvPoints: Record<NvPointType, number>; set: true }
export interface NvPoints {
  res: Residency;
  points: Record<NvPointType, number>;
  /** false until the hunter has saved anything for Nevada, so pages can ask instead of assuming 0 points. */
  set: boolean;
}

const whole = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(NV_POINTS_MAX, Math.floor(n))) : 0);

export function readNvPoints(store: Record<string, unknown> | null | undefined): NvPoints {
  const s = (store?.NV ?? {}) as Partial<NvStored> & { set?: unknown };
  const points = {} as Record<NvPointType, number>;
  for (const { key } of NV_POINT_TYPES) points[key] = whole(s.nvPoints?.[key]);
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', points, set: s.set === true };
}

/** Which balance a Nevada hunt draws on, from scripts/nv_build_hunts.py's category key (HuntSummary.pointOdds.category). */
export function nvPointType(category: string | null | undefined): NvPointType | null {
  if (!category) return null;
  if (category.startsWith('deer-jr')) return 'DEER_JR';
  if (category.startsWith('deer')) return 'DEER';
  if (category === 'elk-spike') return 'ELK_SPIKE';
  if (category.startsWith('elk-bull')) return 'ELK_BULL';
  if (category.startsWith('elk-cow')) return 'ELK_COW';
  return null;
}

/** Validate the Nevada part of the preferences form: null when absent, an error message, or the value to store. */
export function parseNvForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): NvStored | string | null {
  if (!has('nvResidency')) return null;
  const res = get('nvResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select a Nevada residency.';
  const nvPoints = {} as Record<NvPointType, number>;
  for (const { key, label } of NV_POINT_TYPES) {
    const v = get('nvPts_' + key);
    if (typeof v !== 'string' || !/^\d{1,2}$/.test(v) || Number(v) > NV_POINTS_MAX) return `Enter whole Nevada ${label.toLowerCase()} points from 0 to ${NV_POINTS_MAX}.`;
    nvPoints[key] = Number(v);
  }
  return { res, nvPoints, set: true };
}
