import { cookies } from 'next/headers';
import type { Residency } from '@prisma/client';
import { auth } from '@/auth';
import type { Draw } from './species';

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
