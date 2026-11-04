import { NextResponse } from 'next/server';
import { STATES, STATE_COOKIE, type StateCode } from '@/lib/states';

/** /api/state?code=co&next=/hunts : switch state by link (also reaches states not yet listed in the picker). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = (u.searchParams.get('code') ?? '').toUpperCase() as StateCode;
  const next = u.searchParams.get('next') ?? '/hunts';
  const res = NextResponse.redirect(new URL(/^\/(?![\/\\])/.test(next) ? next : '/hunts', u.origin));
  if (STATES[code]) res.cookies.set(STATE_COOKIE, code, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });
  return res;
}
