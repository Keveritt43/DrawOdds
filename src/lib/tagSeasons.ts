/** Display helpers for nonresident elk A/B tag seasons (HuntSummary.tagSeasons). */
export interface TagSeason {
  weapon: string;
  sex: string;
  dates: { open: string; close: string }[];
  notes: string;
}
export interface TagSeasons {
  year: number;
  seasons: TagSeason[];
}

const W: Record<string, string> = { ANY: 'Any weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short range' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export const seasonDates = (s: TagSeason) => s.dates.map((d) => `${day(d.open)} - ${day(d.close)}`).join(', ');
export const seasonTitle = (s: TagSeason) => `${W[s.weapon] ?? s.weapon}${s.sex ? ` · ${s.sex}` : ''}`;

/** Seasons in date order, with notes trimmed of the dates they repeat. */
export function sortedSeasons(ts: unknown): TagSeason[] {
  const t = ts as TagSeasons | null;
  if (!t?.seasons) return [];
  return t.seasons.slice().sort((a, b) => (a.dates[0]?.open ?? '').localeCompare(b.dates[0]?.open ?? ''));
}

/** One line for a card: "Archery Aug 30 - Sep 30 · Any weapon Oct 10 - Oct 24 · +2 more". */
export function seasonsSummary(ts: unknown, max = 3): string {
  const s = sortedSeasons(ts);
  if (!s.length) return '';
  const shown = s.slice(0, max).map((x) => `${W[x.weapon] ?? x.weapon} ${seasonDates(x)}`);
  return `${shown.join(' · ')}${s.length > max ? ` · +${s.length - max} more` : ''}`;
}
