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
  const features = units.filter(u => u.geometry && (state === 'WY' ? u.name.startsWith(wyPrefix) && !u.name.includes('R-')
    // Montana: deer and elk share districts ("217"); antelope districts, when loaded, will be "A320"
    : state === 'MT' ? /^\d/.test(u.name) : state !== 'CO' || (msg
    ? species === 'GOAT' ? u.name.startsWith('G') : species === 'BIGHORN' ? u.name.startsWith('S') : species === 'MOOSE' ? /^\d/.test(u.name) : true
    : /^\d/.test(u.name)))).map(u => ({
    type: 'Feature', geometry: u.geometry, properties: { name: `${state}:${u.name}` },
  }));
  // An empty answer (a state whose districts are not imported yet) must not be cached: Montana's map stayed blank
  // for an hour after its import because browsers had kept the empty response.
  return Response.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': features.length ? 'public, max-age=3600' : 'no-store' } });
}
