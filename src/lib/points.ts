import { cookies } from 'next/headers';
import type { Residency } from '@prisma/client';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import type { SpecialPointSpecies } from './states';

/**
 * Preference points and residency per state (Idaho has no points; residency there stays on User.residency).
 * Signed in: User.points. Visitors: the `pts` cookie. Same shape: { CO: { res, DEER, ELK, youth, set } }.
 * `set` is false until the hunter has entered anything, so pages can ask instead of assuming 0 points.
 */
export const POINTS_COOKIE = 'pts';

export interface StatePoints {
  res: Residency;
  DEER: number;
  ELK: number;
  PRONGHORN: number;
  youth: boolean;
  set: boolean;
  MOOSE?: number;
  BIGHORN?: number;
  GOAT?: number;
  weighted?: Partial<Record<SpecialPointSpecies, number>>;
  specialSet?: boolean;
  /** Wyoming nonresidents: apply in the special (higher-fee) pool instead of the regular one. */
  wySpecial?: boolean;
}
export type PointsStore = Record<string, Partial<StatePoints>>;

const clampPts = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(40, Math.round(n))) : 0);

export function readState(store: PointsStore | null | undefined, state: string): StatePoints {
  const s = store?.[state] ?? {};
  return {
    // most Colorado applicants on a multi-state site are nonresidents: start there until told otherwise
    res: s.res === 'RESIDENT' ? 'RESIDENT' : 'NONRESIDENT',
    DEER: clampPts(s.DEER),
    ELK: clampPts(s.ELK),
    PRONGHORN: clampPts(s.PRONGHORN),
    youth: s.youth === true,
    set: s.set === true,
    MOOSE: Math.min(3, clampPts(s.MOOSE)),
    BIGHORN: Math.min(3, clampPts(s.BIGHORN)),
    GOAT: Math.min(3, clampPts(s.GOAT)),
    weighted: {
      MOOSE: clampPts(s.weighted?.MOOSE),
      BIGHORN: clampPts(s.weighted?.BIGHORN),
      GOAT: clampPts(s.weighted?.GOAT),
    },
    specialSet: s.specialSet === true,
    wySpecial: s.wySpecial === true,
  };
}

export function parseStore(raw: string | undefined | null): PointsStore {
  if (!raw) return {};
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PointsStore) : {};
  } catch {
    return {};
  }
}

/** The whole store: signed-in users' saved points (falling back to the cookie), else the cookie. */
export async function getPointsStore(): Promise<{ store: PointsStore; userId: string | null }> {
  const cookie = parseStore((await cookies()).get(POINTS_COOKIE)?.value);
  const session = await auth();
  if (!session?.user?.id) return { store: cookie, userId: null };
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { points: true } });
  const saved = (u?.points ?? null) as PointsStore | null;
  return { store: saved && Object.keys(saved).length ? saved : cookie, userId: session.user.id };
}

export async function getPoints(state: string): Promise<StatePoints> {
  return readState((await getPointsStore()).store, state);
}
