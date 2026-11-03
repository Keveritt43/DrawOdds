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

const APP_KINDS = ['NR_ELK', 'NR_DEER', 'CTL_DEER', 'CTL_ELK', 'CTL_PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'];
const RESULTS = ['PENDING', 'DREW', 'NOT_DRAWN'];

/** Log an application on "My Applications". */
export async function addApplication(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const year = Number(formData.get('year'));
  const kind = String(formData.get('kind') ?? '');
  const result = String(formData.get('result') ?? 'PENDING');
  const codes = String(formData.get('codes') ?? '').slice(0, 120).trim();
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !APP_KINDS.includes(kind) || !RESULTS.includes(result)) return;
  await db.application.create({ data: { userId: session.user.id, year, kind, codes, result, note: String(formData.get('note') ?? '').slice(0, 200) || null } });
  revalidatePath('/account');
}

export async function setApplicationResult(id: string, result: string) {
  const session = await auth();
  if (!session?.user || !RESULTS.includes(result)) return;
  await db.application.updateMany({ where: { id, userId: session.user.id }, data: { result } });
  revalidatePath('/account');
}

export async function deleteApplication(id: string) {
  const session = await auth();
  if (!session?.user) return;
  await db.application.deleteMany({ where: { id, userId: session.user.id } });
  revalidatePath('/account');
}
