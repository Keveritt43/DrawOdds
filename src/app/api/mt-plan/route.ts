import { setAccountPreference } from '@/lib/accountPreferences';
import { auth } from '@/auth';
import { db } from '@/lib/db';

/** The Montana planner's choices (hunt ids in order), kept apart from Idaho's and Colorado's plans. */
export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return new Response('Sign in', { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.user.id }, select: { points: true } });
  return Response.json(
    { ids: (u?.points as Record<string, unknown> | null)?._plan_MT ?? [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && origin !== 'https://' + req.headers.get('x-forwarded-host'))
    return new Response('Forbidden', { status: 403 });
  const s = await auth();
  if (!s?.user?.id) return new Response('Sign in', { status: 401 });
  const b = await req.json().catch(() => null);
  // six bonus-point applications x three choices
  if (!Array.isArray(b?.ids) || b.ids.length > 18 || b.ids.some((c: unknown) => typeof c !== 'string' || !/^MT:(deer|elk|antelope)(-permit|-b)?:[0-9A-Z]{3}-[0-9]{2}$/.test(c)))
    return new Response('Invalid plan', { status: 400 });
  await setAccountPreference(s.user.id, '_plan_MT', b.ids);
  return Response.json({ ok: true });
}
