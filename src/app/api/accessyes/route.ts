import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Active Access Yes! properties (IDFG) as GeoJSON for the map's land layer. Browsers cache it for a day. */
export async function GET() {
  const rows = await db.accessYesProperty.findMany({ where: { active: true, geometry: { not: undefined } }, select: { id: true, name: true, acres: true, geometry: true } });
  const features = rows.filter((r) => r.geometry).map((r) => ({ type: 'Feature', id: r.id, properties: { name: r.name, acres: r.acres ? Math.round(r.acres) : null }, geometry: r.geometry }));
  return Response.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
