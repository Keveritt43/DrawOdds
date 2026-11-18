/**
 * New Mexico hunter settings for the account page: residency and which drawing pool the hunter applies in. Pure and
 * client-safe. New Mexico has no points of any kind (NMDOW "How New Mexico's Draw Works"), so there is no balance to
 * track; what changes a hunter's odds is the pool (NMSA 17-3-16(B)):
 *   resident  - at least 84% of each hunt's licenses
 *   nr        - nonresidents without an outfitter, 6%
 *   out       - residents or nonresidents whose application names a New Mexico outfitter (a signed contract), 10%
 */
import type { Residency } from '@prisma/client';

export type NmPool = 'res' | 'nr' | 'out';

/** As stored under the `NM` key of the points store (User.points, or the `pts` cookie). */
export interface NmStored { res: Residency; outfitter: boolean; set: true }

export interface NmSettings {
  res: Residency;
  /** Applies with a New Mexico outfitter (the 10% pool). */
  outfitter: boolean;
  /** false until the hunter has saved anything for New Mexico. */
  set: boolean;
}

export function readNmSettings(store: Record<string, unknown> | null | undefined): NmSettings {
  const s = (store?.NM ?? {}) as Partial<NmStored> & { set?: unknown };
  return { res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT', outfitter: s.outfitter === true, set: s.set === true };
}

/** The pool a hunter's application goes in. */
export const nmPool = (s: Pick<NmSettings, 'res' | 'outfitter'>): NmPool => (s.outfitter ? 'out' : s.res === 'RESIDENT' ? 'res' : 'nr');

export const NM_POOL_LABEL: Record<NmPool, string> = {
  res: 'Resident pool (84%)',
  nr: 'Nonresident pool (6%)',
  out: 'Outfitter pool (10%)',
};

/** Validate the New Mexico part of the preferences form: null without an NM section, a message when invalid. */
export function parseNmForm(get: (name: string) => FormDataEntryValue | null, has: (name: string) => boolean): NmStored | string | null {
  if (!has('nmResidency')) return null;
  const res = get('nmResidency');
  if (res !== 'RESIDENT' && res !== 'NONRESIDENT') return 'Select a New Mexico residency.';
  const pool = get('nmPool') ?? 'none';
  if (pool !== 'none' && pool !== 'outfitter') return 'Pick how you apply in New Mexico.';
  return { res, outfitter: pool === 'outfitter', set: true };
}
