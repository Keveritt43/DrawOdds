import { auth } from '@/auth';
import { db } from '@/lib/db';
import { setAccountPreference } from '@/lib/accountPreferences';
import { changePresets, presetHref, presetName, PRESET_KEY, readPresets } from '@/lib/filterPresets';
import { NextResponse } from 'next/server';

const response = (data: object, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET() {
  const id = (await auth())?.user?.id;
  if (!id) return response({ error: 'Sign in to see your presets.' }, 401);
  const user = await db.user.findUnique({ where: { id }, select: { points: true } });
  return response({ owner: id, presets: readPresets(user?.points) });
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && origin !== 'https://' + req.headers.get('x-forwarded-host')) {
    return response({ error: 'Forbidden' }, 403);
  }
  const id = (await auth())?.user?.id;
  if (!id) return response({ error: 'Sign in to manage your presets.' }, 401);
  const body = await req.json().catch(() => null);
  if (!body || body.owner !== id) return response({ error: 'Your account changed. Refresh and try again.' }, 409);
  const name = presetName(body.name);
  const href = body.remove === true ? null : presetHref(body.href);
  if (!name || (!href && body.remove !== true)) return response({ error: 'Enter a valid preset name and search.' }, 400);

  // Retry write conflicts so two tabs cannot overwrite one another's presets.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await db.$transaction(async tx => {
        const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { points: true } });
        const result = changePresets(readPresets(user.points), { name, href, replace: body.replace === true });
        if (result.presets) await setAccountPreference(id, PRESET_KEY, result.presets, tx);
        return result;
      }, { isolationLevel: 'Serializable' });
      return result.error ? response({ error: result.error }, 409) : response(result);
    } catch (error) {
      const code = (error as { code?: string; meta?: { code?: string } })?.code;
      const dbCode = (error as { meta?: { code?: string } })?.meta?.code;
      if (code !== 'P2034' && dbCode !== '40001') throw error;
    }
  }
  return response({ error: 'Your presets were edited elsewhere. Please try again.' }, 409);
}
