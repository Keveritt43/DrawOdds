import { setAccountPreference } from '@/lib/accountPreferences';
import { auth } from '@/auth';
import { db } from '@/lib/db';

/**
 * Saved Application Planner choices (hunt ids in order) for states using the shared StatePlanner, one account key
 * per state (`_plan_WA`, ...), kept apart from Idaho's, Colorado's and Montana's plans and from point balances.
 */
const STATES = new Set(['WA', 'UT', 'WY', 'NM', 'OR']);
const stateOf = (req: Request) => {
  const s = new URL(req.url).searchParams.get('state') ?? '';
  return STATES.has(s) ? s : null;
};

export async function GET(req: Request) {
  const st = stateOf(req);
  if (!st) return new Response('Unknown state', { status: 400 });
  const s = await auth();
  if (!s?.user?.id) return new Response('Sign in', { status: 401 });
  const u = await db.user.findUnique({ where: { id: s.user.id }, select: { points: true } });
  return Response.json(
    { ids: (u?.points as Record<string, unknown> | null)?.[`_plan_${st}`] ?? [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function PUT(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && origin !== 'https://' + req.headers.get('x-forwarded-host'))
    return new Response('Forbidden', { status: 403 });
  const st = stateOf(req);
  if (!st) return new Response('Unknown state', { status: 400 });
  const s = await auth();
  if (!s?.user?.id) return new Response('Sign in', { status: 401 });
  const b = await req.json().catch(() => null);
  const ok = (c: unknown) => typeof c === 'string' && c.length <= 80 && c.startsWith(`${st}:`) && /^[A-Za-z0-9:._\- ]+$/.test(c);
  // every application x its choices, with room to spare; ids are HuntSummary ids, checked on read by the planner
  if (!Array.isArray(b?.ids) || b.ids.length > 80 || !b.ids.every(ok) || new Set(b.ids).size !== b.ids.length)
    return new Response('Invalid plan', { status: 400 });
  await setAccountPreference(s.user.id, `_plan_${st}`, b.ids);
  return Response.json({ ok: true });
}
