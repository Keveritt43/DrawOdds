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

/** Moose, bighorn sheep, mountain goat: a separate, earlier drawing (sources: IDFG controlled hunt application page;
 *  IDFG 2026 release "Moose, bighorn sheep and mountain goat controlled hunt application period opens April 1";
 *  IDAPA 13.01.08.257). */
export const MSG_DRAW = {
  checked: '2026-11-03',
  windows: [
    { label: 'Moose, bighorn sheep & mountain goat applications', start: '04-01', end: '04-30', note: 'Results in early June.' },
    { label: 'Second drawing (leftover moose, sheep, goat tags)', start: '06-15', end: '06-25' },
  ] as Window[],
  license: 'A valid Idaho hunting license (nonresidents too).',
  fees: 'You pay the full tag fee plus the application fee when you apply. The tag fee is refunded if you don’t draw; the license and application fee are not (2026: $16.75 resident, $45.75 nonresident application fee; $2,672.50 total up front for a nonresident).',
  oneSpecies: 'Apply for only ONE of moose, bighorn sheep or mountain goat a year, and doing so keeps you out of the deer, elk and pronghorn controlled drawings that year (leftover tags, the second drawing, unlimited, depredation and extra-tag hunts excepted).',
  waits: 'Draw a moose, sheep or goat tag and you wait 2 years before applying for that species again. Mountain goat (any taken in Idaho since 1977) and antlered moose are once in a lifetime; a bighorn ram is once per subspecies (California or Rocky Mountain).',
  nr: 'Nonresidents can get at most 10% of each species’ tags statewide.',
  choices: 'A first choice, and an optional second choice. Groups of up to two hunters.',
  source: 'https://idfg.idaho.gov/licenses/controlled/apply',
  sourceLabel: 'IDFG controlled hunt applications',
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

/**
 * Idaho licence, application and tag fees, read from IDFG's own fee schedules.
 *
 * IDFG publishes both pages WITHOUT a season year on them, so these are labelled "current schedule, checked
 * <date>" everywhere they are shown - never given a year we cannot source. Resident rows have a second, lower
 * "price lock" price for hunters who qualify; IDFG's page does not state the qualifying rule, so we show the
 * standard price and point at the schedule rather than guess who is eligible.
 *
 * Sources: https://idfg.idaho.gov/licenses/fees-nonresident and https://idfg.idaho.gov/licenses/fees-resident
 */
export const FEES = {
  checked: '2026-11-10',
  source: {
    NONRESIDENT: 'https://idfg.idaho.gov/licenses/fees-nonresident',
    RESIDENT: 'https://idfg.idaho.gov/licenses/fees-resident',
  },
  NONRESIDENT: {
    license: 185,
    accessFee: 10,
    /** Deer, elk, pronghorn (also bear and turkey). */
    controlledApp: 18,
    /** Moose, bighorn sheep, mountain goat: a separate, higher application fee. */
    msgApp: 45.75,
    /** The nonresident general deer and elk tag draw (since 2026). */
    generalDrawApp: 18,
    tag: { DEER: 351.75, ELK: 651.75, PRONGHORN: 342.75, MOOSE: 2626.75, BIGHORN: 2626.75, GOAT: 2626.75 } as Record<string, number>,
  },
  RESIDENT: {
    license: 15.75,
    accessFee: 5,
    controlledApp: 6.25,
    msgApp: 16.75,
    /** Residents buy general deer and elk tags over the counter; there is no general draw for them. */
    generalDrawApp: null,
    tag: { DEER: 24.75, ELK: 36.75, PRONGHORN: 36.5, MOOSE: 199.75, BIGHORN: 199.75, GOAT: 199.75 } as Record<string, number>,
  },
} as const;

export type Residency = 'RESIDENT' | 'NONRESIDENT';
export type CostKind = 'controlled' | 'nrGeneral' | 'otc' | 'msg';
export interface CostItem { label: string; amount: number }
export interface CostBreakdown {
  /** Paid when you apply or buy, whether or not you end up hunting. */
  upFront: CostItem[];
  /** Paid only if you draw. Empty when the tag is bought outright or already paid at application. */
  ifYouDraw: CostItem[];
  notes: string[];
  checked: string;
  source: string;
  /** False when some part of the cost is not known, so no total is ever implied. */
  complete: boolean;
}

const SPECIES_WORD: Record<string, string> = {
  DEER: 'deer', ELK: 'elk', PRONGHORN: 'pronghorn',
  MOOSE: 'moose', BIGHORN: 'bighorn sheep', GOAT: 'mountain goat',
};

/**
 * What this hunt costs, itemised. Never returns a single total: the licence is annual and covers every hunt that
 * year, so adding it to one hunt's tag would overstate what a second application costs. Callers show the groups.
 */
export function costLines(kind: CostKind, residency: Residency, species: string): CostBreakdown {
  const f = FEES[residency];
  const nr = residency === 'NONRESIDENT';
  const word = SPECIES_WORD[species] ?? species.toLowerCase();
  const tag = f.tag[species];
  // Residents buy general deer and elk tags over the counter; only nonresidents draw for them.
  const k: CostKind = kind === 'nrGeneral' && !nr ? 'otc' : kind;

  const upFront: CostItem[] = [
    { label: `${nr ? 'Nonresident' : 'Resident'} hunting licence`, amount: f.license },
    { label: 'Access/depredation fee', amount: f.accessFee },
  ];
  const ifYouDraw: CostItem[] = [];
  const notes: string[] = [];
  let complete = tag !== undefined;

  if (k === 'controlled') {
    upFront.push({ label: 'Controlled hunt application', amount: f.controlledApp });
    if (tag !== undefined) ifYouDraw.push({ label: `${word[0].toUpperCase()}${word.slice(1)} tag`, amount: tag });
  } else if (k === 'msg') {
    upFront.push({ label: 'Moose/sheep/goat application', amount: f.msgApp });
    if (tag !== undefined) upFront.push({ label: `${word[0].toUpperCase()}${word.slice(1)} tag, paid at application`, amount: tag });
    notes.push('The tag fee is refunded if you do not draw. The licence and the application fee are not.');
  } else if (k === 'nrGeneral') {
    if (f.generalDrawApp !== null) upFront.push({ label: 'General tag draw application', amount: f.generalDrawApp });
    if (tag !== undefined) ifYouDraw.push({ label: `${word[0].toUpperCase()}${word.slice(1)} tag`, amount: tag });
    notes.push('One elk and one deer application each year; the fee is charged per application.');
  } else {
    if (tag !== undefined) upFront.push({ label: `${word[0].toUpperCase()}${word.slice(1)} tag, over the counter`, amount: tag });
    notes.push('No draw: buy the tag and hunt the open seasons.');
  }

  if (!complete) notes.push(`We do not have IDFG's current ${word} tag price; check the fee schedule.`);
  if (!nr) notes.push('IDFG lists a lower "price lock" price for residents who qualify; the schedule has the rule.');
  notes.push('The licence is annual and covers every hunt you apply for that year. Licence and application fees are nonrefundable.');

  return { upFront, ifYouDraw, notes, checked: FEES.checked, source: FEES.source[residency], complete };
}

/** The nonresident figures the planner's cost card needs, in the shape it already expects. */
export const plannerCosts = () => ({
  label: `IDFG fees, checked ${md(FEES.checked, true)}`,
  license: FEES.NONRESIDENT.license,
  accessFee: FEES.NONRESIDENT.accessFee,
  generalDrawApp: FEES.NONRESIDENT.generalDrawApp,
  deerTag: FEES.NONRESIDENT.tag.DEER,
  elkTag: FEES.NONRESIDENT.tag.ELK,
  note: 'Licence and application fees are nonrefundable. General deer and elk tags are bought only if you draw. Online purchases add a small convenience fee.',
  feeSchedule: FEES.source.NONRESIDENT,
});

export const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Calendar file (.ics) for application windows. */
export function icsFor(events: { title: string; start: Date; end: Date; note?: string }[]): string {
  const d = (x: Date) => x.toISOString().slice(0, 10).replace(/-/g, '');
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DrawOdds Idaho//Deadlines//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    const end = new Date(e.end.getTime() + 86400_000); // all-day DTEND is exclusive
    lines.push('BEGIN:VEVENT', `UID:${d(e.start)}-${e.title.replace(/\W+/g, '-').toLowerCase()}@drawodds`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${d(end)}`, `SUMMARY:${esc(e.title)}`, ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []),
      'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Every upcoming Idaho application window (next 12 months), for the calendar download and the planner. */
export function upcomingWindows(now = new Date()): { title: string; start: Date; end: Date; note?: string }[] {
  const out: { title: string; start: Date; end: Date; note?: string }[] = [];
  const add = (prefix: string, ws: Window[]) => {
    for (const w of ws) {
      const yearly = w.start.split('-').length === 2;
      for (const y of yearly ? [now.getUTCFullYear(), now.getUTCFullYear() + 1] : [0]) {
        const r = (s: string) => { const p = s.split('-').map(Number); return p.length === 3 ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : new Date(Date.UTC(y, p[0] - 1, p[1])); };
        const start = r(w.start);
        const end = r(w.end);
        if (end >= now && start.getTime() - now.getTime() < 366 * 86400_000) out.push({ title: `Idaho: ${prefix}${w.label}`, start, end, note: w.note });
      }
    }
  };
  add('NR general deer & elk tags - ', NR_GENERAL_DRAW.windows);
  add('', CONTROLLED_DRAW.windows);
  add('', MSG_DRAW.windows);
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
