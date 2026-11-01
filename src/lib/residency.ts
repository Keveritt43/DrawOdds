import { cookies } from 'next/headers';
import type { Residency } from '@prisma/client';
import { auth } from '@/auth';

export const RESIDENCY_COOKIE = 'residency';

/** Signed-in users: their profile. Visitors: a cookie, so the filters work before signing up. */
export async function getResidency(): Promise<{ residency: Residency; signedIn: boolean; email?: string | null }> {
  const session = await auth();
  if (session?.user) return { residency: session.user.residency, signedIn: true, email: session.user.email };
  const c = (await cookies()).get(RESIDENCY_COOKIE)?.value;
  return { residency: c === 'NONRESIDENT' ? 'NONRESIDENT' : 'RESIDENT', signedIn: false };
}

export const isNR = (r: Residency) => r === 'NONRESIDENT';
