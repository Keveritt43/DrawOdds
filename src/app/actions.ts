'use server';

import { cookies } from 'next/headers';
import { STATES, STATE_COOKIE, parseUnitKey, SPECIAL_POINT_SPECIES } from '@/lib/states';
import { revalidatePath } from 'next/cache';
import { auth, signIn, signOut } from '@/auth';
import { db } from '@/lib/db';
import { RESIDENCY_COOKIE, DRAW_COOKIE } from '@/lib/residency';
import { getPointsStore, POINTS_COOKIE, type StatePoints } from '@/lib/points';
import { setAccountPreference } from '@/lib/accountPreferences';
import { GUEST_FAVORITES_COOKIE, GUEST_FAVORITES_LIMIT, parseGuestFavorites } from '@/lib/guestFavorites';

export async function saveHuntingPreferences(_previous: { message: string; saved: boolean }, form: FormData) {
  const idaho = form.get('idahoResidency');
  const colorado = form.get('coloradoResidency');
  const validResidency = (value: FormDataEntryValue | null) => value === 'RESIDENT' || value === 'NONRESIDENT';
  if (!validResidency(idaho) || !validResidency(colorado)) return { message: 'Select a residency for each state.', saved: false };
  const readPoints = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' && /^\d{1,2}$/.test(value) && Number(value) <= 40 ? Number(value) : null;
  };
  const DEER = readPoints('DEER'), ELK = readPoints('ELK'), PRONGHORN = readPoints('PRONGHORN');
  if (DEER === null || ELK === null || PRONGHORN === null) return { message: 'Enter whole points from 0 to 40 for each species.', saved: false };
  const special: Partial<StatePoints> = {}, weighted: NonNullable<StatePoints['weighted']> = {};
  for (const species of SPECIAL_POINT_SPECIES) {
    const pref = readPoints(species), weight = readPoints(species + '_weighted');
    if (pref === null || pref > 3 || weight === null || (pref < 3 && weight > 0)) return { message: 'Moose, sheep and goat use 0–3 preference points. Weighted points require 3 preference points.', saved: false };
    special[species] = pref; weighted[species] = weight;
  }
  const CO: StatePoints = { res: colorado, DEER, ELK, PRONGHORN, ...special, weighted, specialSet: true, youth: form.get('youth') === 'on', set: true };
  // Wyoming: residency, nonresident preference points (deer, elk, antelope) and the regular/special pool
  const wyoming = form.get('wyomingResidency');
  const wyDEER = readPoints('wyDEER'), wyELK = readPoints('wyELK'), wyPRONGHORN = readPoints('wyPRONGHORN');
  const WY: StatePoints | null = validResidency(wyoming) && wyDEER !== null && wyELK !== null && wyPRONGHORN !== null
    ? { res: wyoming, DEER: wyDEER, ELK: wyELK, PRONGHORN: wyPRONGHORN, youth: false, set: true, wySpecial: form.get('wySpecial') === 'on' }
    : null;
  if (form.has('wyomingResidency') && !WY) return { message: 'Enter whole Wyoming points from 0 to 40 for each species.', saved: false };
  const { store, userId } = await getPointsStore();
  if (userId) {
    await db.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: { residency: idaho } });
      await setAccountPreference(userId, 'CO', CO, tx);
      if (WY) await setAccountPreference(userId, 'WY', WY, tx);
    });
  }
  const jar = await cookies();
  const options = { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const, path: '/', httpOnly: true };
  jar.set(RESIDENCY_COOKIE, idaho, options);
  // Keep account-only preferences out of the browser cookie.
  const all = { ...Object.fromEntries(Object.entries(store).filter(([code]) => Object.hasOwn(STATES, code))), CO, ...(WY ? { WY } : {}) };
  jar.set(POINTS_COOKIE, encodeURIComponent(JSON.stringify(all)), options);
  revalidatePath('/', 'layout');
  return { message: 'Hunting preferences saved.', saved: true };
}

export async function setDraw(draw: 'DEP' | 'MSG') {
  if (draw !== 'DEP' && draw !== 'MSG') return;
  (await cookies()).set(DRAW_COOKIE, draw, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
  revalidatePath('/', 'layout');
}

export async function toggleSaved(huntId: number) {
  const session = await auth();
  if (!Number.isSafeInteger(huntId) || !(await db.hunt.findUnique({where:{idfgId:huntId},select:{idfgId:true}}))) return {error:'Unknown hunt'};
  if (!session?.user) return toggleGuestFavorite('hunts', huntId);
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
  const { state, name: raw } = parseUnitKey(unit.trim());
  const name = raw.toUpperCase().slice(0, 8);
  if (!(await db.unit.findUnique({ where: { state_name: { state, name } }, select: { name: true } }))) return { error: 'Unknown unit' };
  if (!session?.user) return toggleGuestFavorite('units', state === 'ID' ? name : `co-${name}`);
  const key = { userId_state_unit: { userId: session.user.id, state, unit: name } };
  const existing = await db.savedUnit.findUnique({ where: key });
  if (existing) await db.savedUnit.delete({ where: key });
  else await db.savedUnit.create({ data: { userId: session.user.id, state, unit: name } });
  revalidatePath('/', 'layout');
  return { saved: !existing };
}

async function toggleGuestFavorite(kind: 'hunts' | 'units', id: number | string) {
  const jar = await cookies();
  const saved = parseGuestFavorites(jar.get(GUEST_FAVORITES_COOKIE)?.value);
  const list: (string|number)[] = saved[kind];
  const exists = list.includes(id);
  if (!exists && list.length >= GUEST_FAVORITES_LIMIT) return {error:'This browser can save up to 80 hunts and 80 units. Remove one to add another.'};
  const next = {...saved,[kind]:exists?list.filter(value=>value!==id):[...list,id]};
  jar.set(GUEST_FAVORITES_COOKIE, JSON.stringify(next), {maxAge:60*60*24*365,sameSite:'lax',path:'/',httpOnly:true});
  revalidatePath('/', 'layout');
  return {saved:!exists};
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
