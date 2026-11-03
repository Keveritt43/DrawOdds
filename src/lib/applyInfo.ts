/**
 * Application dates and rules shown in the "How to apply" checklist. Hand-checked against IDFG sources; update
 * each season (the dates sit here, not in the database, so a stale date is one edit away from fixed).
 *
 * Sources:
 *  - 2027 Nonresident Supplement for General Season Deer and Elk (IDFG, seasons-rules-big-game-supplemental-proclamation-2027.pdf)
 *  - IDFG "Applying for a Controlled Hunt" (idfg.idaho.gov/licenses/tag/controlled)
 */

export interface Window { label: string; start: string; end: string; note?: string }

export const NR_GENERAL_DRAW = {
  season: 2027,
  checked: '2026-11-02',
  windows: [
    { label: 'First application period', start: '2026-12-05', end: '2026-12-15', note: 'Results in early January 2027; buy your tag by Jan 20, 2027 or it goes back.' },
    { label: 'Second application period', start: '2027-02-05', end: '2027-02-15', note: 'Leftover and unbought tags. Results early March; buy by Mar 20, 2027. If you drew in the first period you can’t apply.' },
  ] as Window[],
  fee: '$18 per application (nonrefundable)',
  license: 'A 2027 Idaho hunting license that includes big game, bought before you apply (on sale Dec 1, 2026; nonrefundable).',
  choices: 'One elk and one deer application, each with up to five hunt codes in order. A tag that fills on 1st choices never reaches later choices.',
  source: 'https://idfg.idaho.gov/licenses/tag/quotas/nonresident',
  sourceLabel: 'IDFG nonresident deer and elk tags',
};

export const CONTROLLED_DRAW = {
  checked: '2026-11-02',
  windows: [
    { label: 'Controlled hunt applications (deer, elk, pronghorn)', start: '05-01', end: '06-05', note: 'Every year for the fall seasons.' },
    { label: 'Second drawing (leftover tags)', start: '08-05', end: '08-15', note: 'Tags nobody applied for or claimed by Aug 1.' },
  ] as Window[],
  license: 'A valid Idaho hunting license (nonresidents too) and a small nonrefundable application fee.',
  choices: 'You list a first and a second choice. Odds on this site are first-choice odds; second choices only get tags left over from first choices.',
  source: 'https://idfg.idaho.gov/licenses/tag/controlled',
  sourceLabel: 'IDFG applying for a controlled hunt',
};

export const BUY_SITE = 'https://gooutdoorsidaho.com';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-12-05" or "12-05" -> "Dec 5" (+ ", 2026" when the year is given). */
export function md(iso: string, withYear = false): string {
  const p = iso.split('-').map(Number);
  const [y, m, d] = p.length === 3 ? p : [0, p[0], p[1]];
  return `${MON[m - 1]} ${d}${withYear && y ? `, ${y}` : ''}`;
}

/** The next window that hasn't closed (yearly windows roll to next year once past). */
export function nextWindow(ws: Window[], now = new Date()): { w: Window; start: Date; end: Date; open: boolean } | null {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const resolve = (s: string, year: number) => {
    const p = s.split('-').map(Number);
    return p.length === 3 ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : new Date(Date.UTC(year, p[0] - 1, p[1]));
  };
  const cands = ws.flatMap((w) => {
    const yearly = w.start.split('-').length === 2;
    const years = yearly ? [today.getUTCFullYear(), today.getUTCFullYear() + 1] : [0];
    return years.map((y) => ({ w, start: resolve(w.start, y), end: resolve(w.end, y) }));
  }).filter((c) => c.end >= today).sort((a, b) => a.start.getTime() - b.start.getTime());
  const c = cands[0];
  return c ? { ...c, open: c.start <= today } : null;
}
