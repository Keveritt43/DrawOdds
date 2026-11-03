import { db } from '@/lib/db';
import { AREA_SPECIES, type SpeciesKey } from '@/lib/species';

export const dynamic = 'force-dynamic';

/**
 * Controlled hunt-area boundaries for species whose hunt areas don't follow units (pronghorn, moose, bighorn
 * sheep, mountain goat): ?species=MOOSE,BIGHORN,GOAT. Which areas belong to a species comes from its drawing
 * odds (AreaID), not the GIS layer's label. Area names repeat across species (moose "1-1" vs deer "1-1"), so each
 * feature's id is "<SPECIES>:<area>".
 */
export async function GET(req: Request) {
  const want = (new URL(req.url).searchParams.get('species') ?? '').toUpperCase().split(',').filter((s): s is SpeciesKey => AREA_SPECIES.includes(s as SpeciesKey));
  if (!want.length) return Response.json({ type: 'FeatureCollection', features: [] });
  const features: unknown[] = [];
  for (const species of want) {
    const year = (await db.drawOdds.aggregate({ where: { species }, _max: { year: true } }))._max.year ?? 0;
    const odds = await db.drawOdds.findMany({ where: { species, year: { gte: year - 1 }, areaId: { not: null } }, select: { areaId: true, areaName: true }, distinct: ['areaId'] });
    const areas = await db.huntArea.findMany({ where: { areaId: { in: odds.map((o) => o.areaId!) }, geometry: { not: undefined } }, select: { areaId: true, name: true, geometry: true, acres: true } });
    for (const a of areas) {
      if (!a.geometry) continue;
      // the drawing's area name is what hunts carry (the GIS layer can spell it differently)
      const name = odds.find((o) => o.areaId === a.areaId)?.areaName ?? a.name;
      features.push({ type: 'Feature', id: `${species}:${name}`, geometry: a.geometry, properties: { key: `${species}:${name}`, name, species, acres: a.acres } });
    }
  }
  return Response.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
