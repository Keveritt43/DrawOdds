import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** One study's routes as GeoJSON (cached by browsers for a day; the study rarely changes). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await db.migrationStudy.findUnique({ where: { slug }, select: { geojson: true, classes: true } });
  if (!s) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ ...(s.geojson as object), classes: s.classes }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
