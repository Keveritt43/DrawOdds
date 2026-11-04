/** Migration study types and formatters that are safe to use in the browser (no database). */

export interface MigClass { key: string; label: string; color: string; pattern?: 'hatch'; acres?: number; notMapped?: boolean }
export interface MigTiming { startAvg: string; startMin: string; startMax: string; endAvg: string; endMin: string; endMax: string; durationAvgDays: number; durationMinDays: number; durationMaxDays: number }
export interface MigStats { avgMiles: number | null; maxMiles: number | null; minMiles: number | null; migrations: number | null; individuals: number | null; springMigrations: number | null; fallMigrations: number | null; median?: boolean }
export type MigSpecies = 'DEER' | 'ELK' | 'PRONGHORN';
export const MIG_SPECIES: MigSpecies[] = ['DEER', 'ELK', 'PRONGHORN'];
/** What the study collared: "mule deer", "elk", "pronghorn". */
export const ANIMAL: Record<string, string> = { DEER: 'mule deer', ELK: 'elk', PRONGHORN: 'pronghorn' };

/** The five route-use classes, in the study maps' colors (every study uses the same ones). */
export const STANDARD_CLASSES: MigClass[] = [
  { key: 'ONE', label: '1 individual', color: '#9a9a9a' },
  { key: 'LOW', label: '2 individuals to 10%', color: '#f2e600' },
  { key: 'MEDIUM', label: '10 to 20%', color: '#f5a623' },
  { key: 'HIGH', label: 'More than 20%', color: '#e3241b' },
  { key: 'STOPOVER', label: 'Stopover', color: '#111111', pattern: 'hatch' },
];
export const SPECIES_NAME: Record<string, string> = { DEER: 'Mule Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn' };

/** Short note under a key: what the colors mean for these species. */
export function keyNote(species: string[]): string {
  const names = [...new Set(species)].map((x) => ANIMAL[x] ?? 'animals');
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : 'animals';
  return `Share of collared ${who} using each route; hatching = stopovers.`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "10-14" -> "Oct 14"; "08" (the report gave only a month) -> "August"; missing -> "-" */
export const md = (s: string | null | undefined) => (!s ? '-' : s.length < 5 ? MONTH[Number(s) - 1] : `${MON[Number(s.slice(0, 2)) - 1]} ${Number(s.slice(3, 5))}`);
/** "2020-07" -> "July 2020" */
export const ym = (s: string | null | undefined) => (s ? `${MONTH[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '');
