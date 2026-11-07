import { auth } from '@/auth';
import { db } from '@/lib/db';
import { unitKey } from '@/lib/states';
import { cookies } from 'next/headers';
import { GUEST_FAVORITES_COOKIE, parseGuestFavorites } from './guestFavorites';

/** The signed-in user's starred hunts and units (empty sets when signed out). Units are unit keys ("39", "co-70"). */
export async function getFavorites() {
  const session = await auth();
  if (!session?.user) {
    const saved = parseGuestFavorites((await cookies()).get(GUEST_FAVORITES_COOKIE)?.value);
    return { userId: null as string|null, signedIn: false, hunts: new Set(saved.hunts), units: new Set(saved.units) };
  }
  const [hunts, units] = await Promise.all([
    db.savedHunt.findMany({ where: { userId: session.user.id }, select: { huntId: true } }),
    db.savedUnit.findMany({ where: { userId: session.user.id }, select: { state: true, unit: true } }),
  ]);
  return { userId: session.user.id, signedIn: true, hunts: new Set(hunts.map((h) => h.huntId)), units: new Set(units.map((u) => unitKey(u.state, u.unit))) };
}
