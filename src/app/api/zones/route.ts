import { union, featureCollection, pointOnFeature, feature } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { db } from '@/lib/db';
import { ELK_ZONES } from '@/lib/elkZones';

export const dynamic = 'force-dynamic';

/** Elk zone boundaries (units merged per zone) and a label point for each, for the Filtering map. */
export async function GET() {
  const units = await db.unit.findMany({ where: { state: 'ID', geometry: { not: undefined } }, select: { name: true, geometry: true } });
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
    merged = outerOnly(merged);
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

/**
 * Unit outlines don't share edges exactly, so merging leaves slivers: tiny holes inside the zone and tiny
 * stray pieces. Zones have no real holes: keep outer rings only, and drop pieces under 0.5% of the largest.
 */
function outerOnly(f: Feature<Polygon | MultiPolygon>): Feature<Polygon | MultiPolygon> {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const ringArea = (r: number[][]) => Math.abs(r.reduce((a, p, i) => a + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2);
  const outers = polys.map((p) => [p[0]]).map((p) => ({ p, a: ringArea(p[0]) }));
  const max = Math.max(...outers.map((o) => o.a));
  const keep = outers.filter((o) => o.a >= max * 0.005).map((o) => o.p);
  return { ...f, geometry: keep.length === 1 ? { type: 'Polygon', coordinates: keep[0] } : { type: 'MultiPolygon', coordinates: keep } };
}
