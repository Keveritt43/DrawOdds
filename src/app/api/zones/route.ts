import { union, featureCollection, pointOnFeature, feature } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { db } from '@/lib/db';
import { ELK_ZONES } from '@/lib/elkZones';

export const dynamic = 'force-dynamic';

/** Elk zone boundaries (units merged per zone) and a label point for each, for the Filtering map. */
export async function GET() {
  const units = await db.unit.findMany({ where: { geometry: { not: undefined } }, select: { name: true, geometry: true } });
  const geom = new Map(units.map((u) => [u.name, u.geometry as unknown as Polygon | MultiPolygon | null]));
  const zones: Feature<Polygon | MultiPolygon>[] = [];
  const labels: Feature[] = [];
  for (const [zone, us] of Object.entries(ELK_ZONES)) {
    const parts = us.map((u) => geom.get(u)).filter((g): g is Polygon | MultiPolygon => !!g).map((g) => feature(g));
    if (!parts.length) continue;
    let merged: Feature<Polygon | MultiPolygon> | null = null;
    try {
      merged = parts.length === 1 ? parts[0] : (union(featureCollection(parts)) as Feature<Polygon | MultiPolygon> | null);
    } catch {
      merged = null;
    }
    // if merging fails, outline the units together (inner unit lines show, but the zone still reads)
    if (!merged) {
      merged = feature({ type: 'MultiPolygon', coordinates: parts.flatMap((p) => (p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates)) });
    }
    merged.properties = { zone, units: us.join(', ') };
    zones.push(merged);
    const pt = pointOnFeature(merged);
    pt.properties = { zone };
    labels.push(pt);
  }
  return Response.json(
    { zones: featureCollection(zones), labels: featureCollection(labels) },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
