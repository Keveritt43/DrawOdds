import { cookies } from 'next/headers';
import type { Residency } from '@prisma/client';
import { auth } from '@/auth';

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
