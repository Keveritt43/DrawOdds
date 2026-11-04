import { db } from './db';

export * from './migrationShared';

const STUDY_FIELDS = { slug: true, name: true, species: true, herd: true, summary: true, caveat: true, methods: true, mapNote: true, source: true, preparedBy: true, preparedDate: true, studyStart: true, studyEnd: true, winterCount: true, stats: true, timing: true, classes: true, units: true, unitAcres: true } as const;

/** One study without its geometry. */
export async function getStudy(slug: string) {
  return db.migrationStudy.findUnique({ where: { slug }, select: STUDY_FIELDS });
}

/** Studies without their (large) geometry. */
export async function listStudies(unit?: string) {
  return db.migrationStudy.findMany({
    where: unit ? { units: { has: unit } } : {},
    select: STUDY_FIELDS,
    orderBy: { name: 'asc' },
  });
}
export type StudyInfo = Awaited<ReturnType<typeof listStudies>>[number];

/** Per species, every unit crossed by a study of that species (for the filter). */
export async function migrationUnits(): Promise<Partial<Record<string, string[]>>> {
  const rows = await db.migrationStudy.findMany({ select: { units: true, species: true } });
  const out: Partial<Record<string, string[]>> = {};
  for (const r of rows) out[r.species] = [...new Set([...(out[r.species] ?? []), ...r.units])];
  return out;
}

/** Has the study got route polygons to draw? */
export const hasRoutes = (s: { mapNote: string | null }) => !s.mapNote;
