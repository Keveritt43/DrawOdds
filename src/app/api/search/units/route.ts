import { db } from '@/lib/db';
import { enabledStates } from '@/lib/states';

export const dynamic = 'force-dynamic';
/** Public geometry only: never mix personalized map metrics into a shared boundary cache. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get('state')?.toUpperCase();
  const species = params.get('species');
  const msg = params.get('draw') === 'msg';
  if (!enabledStates().some(s => s.code === state)) return Response.json({ error: 'Unknown state' }, { status: 400 });
  const units = await db.unit.findMany({ where: { state }, select: { name: true, geometry: true } });
  // Wyoming hunt areas differ by species: "A12" antelope, "D12" deer, "E12" elk (default deer)
  const wyPrefix = species === 'PRONGHORN' ? 'A' : species === 'ELK' ? 'E' : 'D';
  return Response.json({ type: 'FeatureCollection', features: units.filter(u => u.geometry && (state === 'WY' ? u.name.startsWith(wyPrefix) && !u.name.includes('R-') : state !== 'CO' || (msg
    ? species === 'GOAT' ? u.name.startsWith('G') : species === 'BIGHORN' ? u.name.startsWith('S') : species === 'MOOSE' ? /^\d/.test(u.name) : true
    : /^\d/.test(u.name)))).map(u => ({
    type: 'Feature', geometry: u.geometry, properties: { name: `${state}:${u.name}` },
  })) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
