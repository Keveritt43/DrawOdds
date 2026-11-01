import { db } from '@/lib/db';

export const revalidate = 3600; // geometry and summaries change at most nightly

/** Unit boundaries + per-unit metrics for the map, as one GeoJSON FeatureCollection. */
export async function GET() {
  const [units, sums] = await Promise.all([
    db.unit.findMany({ where: { geometry: { not: undefined } } }),
    db.huntSummary.findMany({
      select: { species: true, type: true, unit: true, units: true, weapon: true, success5: true, resOdds5: true, nrOdds5: true, deerType: true },
    }),
  ]);
  const by = new Map<string, Record<string, number | string | null>>();
  const bump = (u: string, k: string, v: number | null, mode: 'max' | 'count' = 'max') => {
    const m = by.get(u) ?? by.set(u, {}).get(u)!;
    if (mode === 'count') m[k] = ((m[k] as number) ?? 0) + 1;
    else if (v !== null && (m[k] === undefined || m[k] === null || v > (m[k] as number))) m[k] = v;
  };
  for (const s of sums) {
    if (s.type === 'GENERAL' && s.unit && s.weapon === 'ANY') {
      bump(s.unit, s.species === 'DEER' ? 'deerSuccess' : 'elkSuccess', s.success5);
      if (s.species === 'DEER' && s.deerType) by.get(s.unit)!.deerType = s.deerType;
    }
    if (s.type === 'GENERAL' && s.unit && s.weapon === 'ARCHERY') bump(s.unit, s.species === 'DEER' ? 'deerArchery' : 'elkArchery', s.success5);
    if (s.type === 'CONTROLLED')
      for (const u of s.units) {
        bump(u, 'controlled', null, 'count');
        bump(u, 'bestResOdds', s.resOdds5);
        bump(u, 'bestNrOdds', s.nrOdds5);
      }
  }
  const features = units
    .filter((u) => u.geometry)
    .map((u) => ({
      type: 'Feature' as const,
      id: u.name,
      geometry: u.geometry,
      properties: {
        name: u.name,
        elkZone: u.elkZone,
        acres: u.acres,
        publicPct: u.publicPct,
        accessYesAcres: u.accessYesAcres ?? 0,
        wildernessPct: u.wildernessPct,
        boundaryChanged2022: u.boundaryChanged2022,
        ...(by.get(u.name) ?? {}),
      },
    }));
  return Response.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
