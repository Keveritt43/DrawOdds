import { db } from './db';

export interface MigClass { key: string; label: string; color: string; pattern?: 'hatch'; acres?: number }
export interface MigTiming { startAvg: string; startMin: string; startMax: string; endAvg: string; endMin: string; endMax: string; durationAvgDays: number; durationMinDays: number; durationMaxDays: number }
export interface MigStats { avgMiles: number; maxMiles: number; minMiles: number; migrations: number; individuals: number; springMigrations: number; fallMigrations: number }

/** Studies without their (large) geometry. */
export async function listStudies(unit?: string) {
  return db.migrationStudy.findMany({
    where: unit ? { units: { has: unit } } : {},
    select: { slug: true, name: true, species: true, herd: true, summary: true, source: true, preparedBy: true, preparedDate: true, studyStart: true, studyEnd: true, winterCount: true, stats: true, timing: true, classes: true, units: true, unitAcres: true },
    orderBy: { name: 'asc' },
  });
}
export type StudyInfo = Awaited<ReturnType<typeof listStudies>>[number];

/** Every unit that has a migration study (for the filter). */
export async function migrationUnits(): Promise<string[]> {
  const rows = await db.migrationStudy.findMany({ select: { units: true } });
  return [...new Set(rows.flatMap((r) => r.units))];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "10-14" -> "Oct 14" */
export const md = (s: string) => `${MON[Number(s.slice(0, 2)) - 1]} ${Number(s.slice(3, 5))}`;
