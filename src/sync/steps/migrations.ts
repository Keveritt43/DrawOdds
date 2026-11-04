import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { db } from '../core/context';

/**
 * Migration studies: every folder in data/migrations/ with a meta.json and a routes.geojson (converted from the
 * study's KML layers) is upserted into MigrationStudy. Folders that disappear are removed.
 */
export async function syncMigrations(): Promise<{ rows: number; details: string[] }> {
  const dir = join(process.cwd(), 'data', 'migrations');
  const details: string[] = [];
  if (!existsSync(dir)) return { rows: 0, details: ['No data/migrations folder'] };
  const slugs: string[] = [];
  for (const slug of readdirSync(dir)) {
    const meta = join(dir, slug, 'meta.json');
    const routes = join(dir, slug, 'routes.geojson');
    if (!existsSync(meta) || !existsSync(routes)) continue;
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    const geojson = JSON.parse(readFileSync(routes, 'utf8'));
    const data = {
      name: m.name, species: m.species, herd: m.herd, summary: m.summary, source: m.source,
      caveat: m.caveat ?? null, methods: m.methods ?? null, mapNote: m.mapNote ?? null,
      preparedBy: m.preparedBy ?? null, preparedDate: m.preparedDate ?? null,
      studyStart: m.studyStart ? new Date(`${m.studyStart}T00:00:00Z`) : null,
      studyEnd: m.studyEnd ? new Date(`${m.studyEnd}T00:00:00Z`) : null,
      winterCount: m.winterCount ?? null,
      stats: m.stats, timing: m.timing ?? Prisma.DbNull, classes: m.classes, units: m.units, unitAcres: m.unitAcres, geojson,
    };
    await db.migrationStudy.upsert({ where: { slug }, create: { slug, ...data }, update: data });
    slugs.push(slug);
    details.push(`${m.name}: ${geojson.features.length} polygons, units ${m.units.join(', ') || 'none'}`);
  }
  await db.migrationStudy.deleteMany({ where: { slug: { notIn: slugs } } });
  return { rows: slugs.length, details };
}
