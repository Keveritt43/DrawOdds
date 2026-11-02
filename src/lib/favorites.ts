import { auth } from '@/auth';
import { db } from '@/lib/db';

/** The signed-in user's starred hunts and units (empty sets when signed out). */
export async function getFavorites() {
  const session = await auth();
  if (!session?.user) return { signedIn: false, hunts: new Set<number>(), units: new Set<string>() };
  const [hunts, units] = await Promise.all([
    db.savedHunt.findMany({ where: { userId: session.user.id }, select: { huntId: true } }),
    db.savedUnit.findMany({ where: { userId: session.user.id }, select: { unit: true } }),
  ]);
  return { signedIn: true, hunts: new Set(hunts.map((h) => h.huntId)), units: new Set(units.map((u) => u.unit)) };
}
