import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Controlled hunt-area boundaries for one species (?species=PRONGHORN), for species whose hunt areas don't follow
 * units. Which areas belong to the species comes from its drawing odds (AreaID), not the GIS layer's label.
 */
export async function GET(req: Request) {
  const species = new URL(req.url).searchParams.get('species') === 'PRONGHORN' ? 'PRONGHORN' : null;
  if (!species) return Response.json({ type: 'FeatureCollection', features: [] });
  const year = (await db.drawOdds.aggregate({ where: { species }, _max: { year: true } }))._max.year ?? 0;
  const ids = (await db.drawOdds.findMany({ where: { species, year: { gte: year - 1 }, areaId: { not: null } }, select: { areaId: true }, distinct: ['areaId'] }))
    .map((o) => o.areaId!)
    .filter(Boolean);
  const areas = await db.huntArea.findMany({ where: { areaId: { in: ids }, geometry: { not: undefined } }, select: { areaId: true, name: true, geometry: true, acres: true } });
  return Response.json(
    {
      type: 'FeatureCollection',
      features: areas.filter((a) => a.geometry).map((a) => ({ type: 'Feature', id: a.name, geometry: a.geometry, properties: { name: a.name, acres: a.acres } })),
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
