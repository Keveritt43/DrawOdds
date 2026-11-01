'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Residency } from '@prisma/client';
import { auth, signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { RESIDENCY_COOKIE } from '@/lib/residency';

export async function setResidency(residency: Residency) {
  if (residency !== 'RESIDENT' && residency !== 'NONRESIDENT') return;
  const session = await auth();
  if (session?.user) await db.user.update({ where: { id: session.user.id }, data: { residency } });
  (await cookies()).set(RESIDENCY_COOKIE, residency, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
  revalidatePath('/', 'layout');
}

export async function toggleSaved(huntId: number) {
  const session = await auth();
  if (!session?.user) return { error: 'Sign in to save hunts' };
  const key = { userId_huntId: { userId: session.user.id, huntId } };
  const existing = await db.savedHunt.findUnique({ where: key });
  if (existing) await db.savedHunt.delete({ where: key });
  else await db.savedHunt.create({ data: { userId: session.user.id, huntId } });
  revalidatePath('/', 'layout');
  return { saved: !existing };
}

export async function emailSignIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  await signIn('resend', { email, redirectTo: String(formData.get('next') || '/account') });
}

export async function doSignOut() {
  await signOut({ redirectTo: '/' });
}
