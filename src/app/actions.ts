'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Residency } from '@prisma/client';
import { auth, signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { RESIDENCY_COOKIE, DRAW_COOKIE } from '@/lib/residency';

export async function setResidency(residency: Residency) {
  if (residency !== 'RESIDENT' && residency !== 'NONRESIDENT') return;
  const session = await auth();
  if (session?.user) await db.user.update({ where: { id: session.user.id }, data: { residency } });
  (await cookies()).set(RESIDENCY_COOKIE, residency, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
  revalidatePath('/', 'layout');
}

export async function setDraw(draw: 'DEP' | 'MSG') {
  if (draw !== 'DEP' && draw !== 'MSG') return;
  (await cookies()).set(DRAW_COOKIE, draw, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
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

export async function toggleSavedUnit(unit: string) {
  const session = await auth();
  if (!session?.user) return { error: 'Sign in to save units' };
  const name = unit.trim().toUpperCase().slice(0, 8);
  if (!(await db.unit.findUnique({ where: { name }, select: { name: true } }))) return { error: 'Unknown unit' };
  const key = { userId_unit: { userId: session.user.id, unit: name } };
  const existing = await db.savedUnit.findUnique({ where: key });
  if (existing) await db.savedUnit.delete({ where: key });
  else await db.savedUnit.create({ data: { userId: session.user.id, unit: name } });
  revalidatePath('/', 'layout');
  return { saved: !existing };
}

export async function emailSignIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const next = String(formData.get('next') ?? '');
  // only same-site paths: "/hunts?x" yes, "//evil.com" or "https://..." no
  await signIn('resend', { email, redirectTo: /^\/(?![\/\\])/.test(next) ? next : '/account' });
}

export async function doSignOut() {
  await signOut({ redirectTo: '/' });
}
