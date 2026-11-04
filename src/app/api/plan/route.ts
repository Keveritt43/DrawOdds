import { auth } from '@/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** The signed-in user's application plan (401 for visitors: their plan stays in the browser). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'sign in' }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { plan: true, planUpdatedAt: true } });
  return Response.json({ plan: u?.plan ?? null, updatedAt: u?.planUpdatedAt ? +u.planUpdatedAt : 0 });
}

/** Save the plan; an older copy never overwrites a newer one (two devices editing). */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'sign in' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { plan?: unknown; updatedAt?: number } | null;
  const p = body?.plan as { elkTags?: unknown; deerTags?: unknown; ctl?: unknown } | undefined;
  if (!p || !Array.isArray(p.elkTags) || !Array.isArray(p.deerTags) || typeof p.ctl !== 'object' || JSON.stringify(p).length > 20_000) {
    return Response.json({ error: 'bad plan' }, { status: 400 });
  }
  const at = new Date(Number(body?.updatedAt) || Date.now());
  const cur = await db.user.findUnique({ where: { id: session.user.id }, select: { planUpdatedAt: true } });
  if (cur?.planUpdatedAt && cur.planUpdatedAt > at) return Response.json({ ok: false, stale: true });
  await db.user.update({ where: { id: session.user.id }, data: { plan: JSON.parse(JSON.stringify(p)), planUpdatedAt: at } });
  return Response.json({ ok: true });
}
