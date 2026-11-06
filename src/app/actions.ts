'use server';

import { cookies } from 'next/headers';
import { STATES, STATE_COOKIE, parseUnitKey } from '@/lib/states';
import { revalidatePath } from 'next/cache';
import type { Residency } from '@prisma/client';
import { auth, signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { RESIDENCY_COOKIE, DRAW_COOKIE, getState } from '@/lib/residency';
import { getPointsStore, readState, POINTS_COOKIE, type StatePoints } from '@/lib/points';

export async function setResidency(residency: Residency) {
  if (residency !== 'RESIDENT' && residency !== 'NONRESIDENT') return;
  const st = (await getState()).code;
  if (st !== 'ID') return setPoints(st, { res: residency }); // residency is per state; Idaho's stays on the profile
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

/** `unit`: the unit's key ("39" in Idaho, "co-70" elsewhere; see unitKey). */
export async function toggleSavedUnit(unit: string) {
  const session = await auth();
  if (!session?.user) return { error: 'Sign in to save units' };
  const { state, name: raw } = parseUnitKey(unit.trim());
  const name = raw.toUpperCase().slice(0, 8);
  if (!(await db.unit.findUnique({ where: { state_name: { state, name } }, select: { name: true } }))) return { error: 'Unknown unit' };
  const key = { userId_state_unit: { userId: session.user.id, state, unit: name } };
  const existing = await db.savedUnit.findUnique({ where: key });
  if (existing) await db.savedUnit.delete({ where: key });
  else await db.savedUnit.create({ data: { userId: session.user.id, state, unit: name } });
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

export async function setStateCode(code: string) {
  const s = STATES[code.toUpperCase() as keyof typeof STATES];
  if (!s) return;
  (await cookies()).set(STATE_COOKIE, s.code, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
  revalidatePath('/', 'layout');
}

/** Save preference points / residency for a state (signed in: the profile too). */
export async function setPoints(state: string, patch: Partial<StatePoints>) {
  if (!(state in STATES) || state === 'ID') return;
  const { store, userId } = await getPointsStore();
  const cur = readState(store, state);
  const next: StatePoints = {
    res: patch.res === 'RESIDENT' || patch.res === 'NONRESIDENT' ? patch.res : cur.res,
    DEER: patch.DEER !== undefined ? Math.max(0, Math.min(40, Math.round(Number(patch.DEER) || 0))) : cur.DEER,
    ELK: patch.ELK !== undefined ? Math.max(0, Math.min(40, Math.round(Number(patch.ELK) || 0))) : cur.ELK,
    PRONGHORN: patch.PRONGHORN !== undefined ? Math.max(0, Math.min(40, Math.round(Number(patch.PRONGHORN) || 0))) : cur.PRONGHORN,
    youth: patch.youth !== undefined ? !!patch.youth : cur.youth,
    set: true,
  };
  const all = { ...store, [state]: next };
  if (userId) await db.$executeRaw`UPDATE "User" SET points=jsonb_set(COALESCE(points,'{}'::jsonb),ARRAY[${state}]::text[],${JSON.stringify(next)}::jsonb,true) WHERE id=${userId}`;
  (await cookies()).set(POINTS_COOKIE, encodeURIComponent(JSON.stringify(all)), { maxAge: 60 * 60 * 24 * 365 * 2, sameSite: 'lax', path: '/' });
  revalidatePath("/", "layout");
}
