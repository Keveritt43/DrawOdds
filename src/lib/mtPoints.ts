/**
 * Montana point balances for the account page. Pure and client-safe.
 *
 * Montana runs two unrelated point systems, so one number per species (the Colorado/Wyoming shape) is wrong here.
 * Rules below are from FWP's 2025 deer, elk and antelope regulations, p. 17 (checked 2026-11-10):
 *
 * Nonresident combination licenses — PREFERENCE points.
 *   - One balance, at most 3. A hunter's own balance is a whole number; fractional levels in FWP's reports are
 *     party applications (members' points averaged), not something a person holds.
 *   - Deleted when you draw a combination license, AND when you hold points and do not APPLY for a combination
 *     license in the next available drawing. Buying a point-only ($100, Jul 1 – Dec 31) does not stop that.
 *   - 75% of licenses go by points; the other 25% are drawn among applicants holding ZERO points (FWP states this).
 *
 * Permits and B licenses — BONUS points.
 *   - A separate balance per license type ("cannot be transferred between the species drawings"), uncapped.
 *   - Accumulated points count in a drawing ONLY if you buy a bonus point with that application. Otherwise they are
 *     kept but not used that year — you get one chance, like a zero-point applicant. So the balance alone is not
 *     enough state: we also need to know whether the hunter is buying this year.
 *   - Residents and nonresidents both hold them ($2 / $20 a point).
 */
import type { Residency } from '@prisma/client';

export const MT_COMBO_CAP = 3;
/** Sanity bound only: Montana bonus points are uncapped, but nobody holds 40 for these license types. */
export const MT_BONUS_MAX = 40;

/**
 * Bonus-point license types for deer, elk and antelope — one balance each. These are the license types FWP publishes
 * detailed bonus-point drawing statistics for. Antelope archery-only permits are antelope licenses (type 20, e.g.
 * 900-20), so they draw on the antelope balance, not a separate one. Moose, sheep, goat and bison come later.
 */
export const MT_BONUS_TYPES = [
  { key: 'DEER_PERMIT', label: 'Deer permit' },
  { key: 'ELK_PERMIT', label: 'Elk permit' },
  { key: 'ANTELOPE', label: 'Antelope license' },
  { key: 'DEER_B', label: 'Deer B license' },
  { key: 'ELK_B', label: 'Elk B license' },
  { key: 'ANTELOPE_B', label: 'Antelope B license' },
] as const;
export type MtBonusType = (typeof MT_BONUS_TYPES)[number]['key'];

/** As stored under the `MT` key of the points store (User.points, or the `pts` cookie). */
export interface MtStored {
  res: Residency;
  mtCombo: number;
  mtBonus: Record<MtBonusType, number>;
  /** Buying a bonus point with this year's application. false = accumulated points are not used this year. */
  mtBuying: Record<MtBonusType, boolean>;
  set: true;
}

export interface MtPoints {
  res: Residency;
  combo: number;
  bonus: Record<MtBonusType, number>;
  buying: Record<MtBonusType, boolean>;
  /** false until the hunter has saved anything for Montana, so pages can ask instead of assuming 0 points. */
  set: boolean;
}

const whole = (n: unknown, max: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;

/** Montana balances from a points store, with safe defaults. Unknown buying state defaults to yes. */
export function readMtPoints(store: Record<string, unknown> | null | undefined): MtPoints {
  const s = (store?.MT ?? {}) as Partial<MtStored> & { set?: unknown };
  const bonus = {} as Record<MtBonusType, number>, buying = {} as Record<MtBonusType, boolean>;
  for (const { key } of MT_BONUS_TYPES) {
    bonus[key] = whole(s.mtBonus?.[key], MT_BONUS_MAX);
    buying[key] = s.mtBuying?.[key] !== false;
  }
  return {
    // most Montana users of a multi-state site are nonresidents chasing the combination draw
    res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT',
    combo: whole(s.mtCombo, MT_COMBO_CAP),
    bonus,
    buying,
    set: s.set === true,
  };
}

/** Bonus points that actually count in this year's drawing for a license type: none unless a point is bought. */
export const mtBonusInPlay = (p: MtPoints, type: MtBonusType): number => (p.buying[type] ? p.bonus[type] : 0);

/**
 * Validate the Montana part of the preferences form. Returns null when the form has no Montana section
 * (older pages), an error message string when it is invalid, or the value to store.
 */
export function parseMtForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): MtStored | string | null {
  if (!has('mtResidency')) return null;
  const res = get('mtResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select a Montana residency.';
  const int = (name: string, max: number) => {
    const v = get(name);
    return typeof v === 'string' && /^\d{1,2}$/.test(v) && Number(v) <= max ? Number(v) : null;
  };
  const mtCombo = int('mtCombo', MT_COMBO_CAP);
  if (mtCombo === null) return `Montana combination preference points are a whole number from 0 to ${MT_COMBO_CAP}.`;
  const mtBonus = {} as Record<MtBonusType, number>, mtBuying = {} as Record<MtBonusType, boolean>;
  for (const { key, label } of MT_BONUS_TYPES) {
    const n = int('mtBonus_' + key, MT_BONUS_MAX);
    if (n === null) return `Enter whole Montana ${label.toLowerCase()} bonus points from 0 to ${MT_BONUS_MAX}.`;
    mtBonus[key] = n;
    mtBuying[key] = get('mtBuy_' + key) === 'on';
  }
  return { res, mtCombo, mtBonus, mtBuying, set: true };
}
