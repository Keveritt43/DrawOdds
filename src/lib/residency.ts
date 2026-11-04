import { cookies } from 'next/headers';
import type { Residency } from '@prisma/client';
import { auth } from '@/auth';
import type { Draw } from './species';
import { stateConfig, STATE_COOKIE, type StateConfig } from './states';

export const RESIDENCY_COOKIE = 'residency';

/**
 * Signed-in users: their profile. Visitors: a cookie, so the filters work before signing up.
 * `as` ("nr" / "res", from a ?as= link) shows a page as the other residency without changing anything saved.
 */
export async function getResidency(as?: string | string[]): Promise<{ residency: Residency; signedIn: boolean; email?: string | null }> {
  const asv = (Array.isArray(as) ? as[0] : as)?.toLowerCase();
  const session = await auth();
  if (asv === 'nr' || asv === 'res') return { residency: asv === 'nr' ? 'NONRESIDENT' : 'RESIDENT', signedIn: !!session?.user, email: session?.user?.email };
  if (session?.user) return { residency: session.user.residency, signedIn: true, email: session.user.email };
  const c = (await cookies()).get(RESIDENCY_COOKIE)?.value;
  return { residency: c === 'NONRESIDENT' ? 'NONRESIDENT' : 'RESIDENT', signedIn: false };
}

export const isNR = (r: Residency) => r === 'NONRESIDENT';

export const DRAW_COOKIE = 'draw';

/** Which drawing the visitor is looking at (deer/elk/pronghorn or moose/sheep/goat). `?draw=msg|dep` overrides. */
export async function getDraw(param?: string | string[]): Promise<Draw> {
  const p = (Array.isArray(param) ? param[0] : param)?.toLowerCase();
  if (p === 'msg' || p === 'dep') return p.toUpperCase() as Draw;
  return (await cookies()).get(DRAW_COOKIE)?.value === 'MSG' ? 'MSG' : 'DEP';
}

/** The state the visitor is looking at: `?state=` overrides, then the cookie, then Idaho. Only enabled states. */
export async function getState(param?: string | string[]): Promise<StateConfig> {
  const p = Array.isArray(param) ? param[0] : param;
  return stateConfig(p || (await cookies()).get(STATE_COOKIE)?.value);
}
