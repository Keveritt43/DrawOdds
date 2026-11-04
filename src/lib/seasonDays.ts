/**
 * Season days as small integers so "open between Oct 20 and Oct 31" is one array filter in the database.
 * Day 0 = July 1; a season year runs July 1 - June 30, so Dec-Jan seasons stay continuous.
 */
const DAY = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Days in each month from July (non-leap: Feb 29 folds into Mar 1, close enough for a filter). */
const LEN = [31, 31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30]; // Jul ... Jun

/** Slider ends: Aug 1 (31) to Jan 31 (214), where nearly every big game season falls. */
export const DAY_MIN = 31;
export const DAY_MAX = 214;

/** Index of a date in its season year (Jul 1 = 0). */
export function dayIndex(d: Date): number {
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 6, 1)) / DAY);
}

/** Every open day for a set of spans (deduped, sorted). Spans over a year long are ignored as bad data. */
export function seasonDays(spans: { open: Date; close: Date }[]): number[] {
  const out = new Set<number>();
  for (const s of spans) {
    const a = dayIndex(s.open);
    const len = Math.round((+s.close - +s.open) / DAY);
    if (len < 0 || len > 366) continue;
    for (let i = 0; i <= len; i++) out.add(Math.min(a + i, 365));
  }
  return [...out].sort((x, y) => x - y);
}

/** 0-based index -> "Oct 25". */
export function dayLabel(i: number): string {
  let m = 0;
  let d = i;
  while (m < 11 && d >= LEN[m]) { d -= LEN[m]; m++; }
  return `${MON[(m + 6) % 12]} ${d + 1}`;
}

/** "10-25" -> index (season year), null when malformed. */
export function parseMonthDay(s: string | undefined | null): number | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(s ?? '');
  if (!m) return null;
  const mo = Number(m[1]);
  const da = Number(m[2]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return dayIndex(new Date(Date.UTC(mo >= 7 ? 2001 : 2002, mo - 1, da)));
}

/** index -> "10-25" (for the address). */
export function toMonthDay(i: number): string {
  const [mon, day] = dayLabel(i).split(' ');
  return `${MON.indexOf(mon) + 1}-${day}`;
}
