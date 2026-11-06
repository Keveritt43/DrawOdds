import { db } from '@/lib/db';
import { enabledStates } from '@/lib/states';

export const dynamic = 'force-dynamic';
/** Public geometry only: never mix personalized map metrics into a shared boundary cache. */
export async function GET(req: Request) {
  const state = new URL(req.url).searchParams.get('state')?.toUpperCase();
  if (!enabledStates().some(s => s.code === state)) return Response.json({ error: 'Unknown state' }, { status: 400 });
  const units = await db.unit.findMany({ where: { state }, select: { name: true, geometry: true } });
  return Response.json({ type: 'FeatureCollection', features: units.filter(u => u.geometry).map(u => ({
    type: 'Feature', geometry: u.geometry, properties: { name: `${state}:${u.name}` },
  })) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
