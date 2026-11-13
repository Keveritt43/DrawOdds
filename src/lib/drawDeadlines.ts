/**
 * Application windows for the home-page alert banner, across states.
 *
 * Only windows with a sourced date go here. A state whose next season's dates aren't posted yet (Wyoming 2027,
 * Montana 2027 when checked Nov 13, 2026) is left out rather than guessed from last year's calendar.
 *
 * Days are counted on the agency's own calendar (Mountain time for every live state but Washington), so the count
 * doesn't flip a day early for a visitor in the evening Pacific time or because the server runs on UTC.
 */
import { NR_GENERAL_DRAW, CONTROLLED_DRAW, MSG_DRAW, type Window } from './applyInfo';
import type { StateCode } from './states';

export interface DrawAlert {
  state: StateCode;
  /** "Idaho nonresident general deer & elk tags" */
  what: string;
  start: Date;
  end: Date;
  open: boolean;
  /** whole days until it opens (0 when open) */
  opensIn: number;
  /** whole days left to apply, counting today as day 0 ("closes today") */
  closesIn: number;
  href: string;
  apply: string;
  applyLabel: string;
}

interface Source { state: StateCode; tz: string; what: string; windows: Window[]; href: string; apply: string; applyLabel: string }

const SOURCES: Source[] = [
  { state: 'ID', tz: 'America/Denver', what: `Idaho nonresident general deer & elk tag draw (${NR_GENERAL_DRAW.season} season)`,
    windows: NR_GENERAL_DRAW.windows, href: '/hunts?state=ID&type=GENERAL&sort=odds', apply: NR_GENERAL_DRAW.source, applyLabel: 'IDFG' },
  { state: 'ID', tz: 'America/Denver', what: 'Idaho controlled hunts (deer, elk, pronghorn)',
    windows: CONTROLLED_DRAW.windows, href: '/hunts?state=ID&type=CONTROLLED', apply: CONTROLLED_DRAW.source, applyLabel: 'IDFG' },
  { state: 'ID', tz: 'America/Denver', what: 'Idaho moose, bighorn sheep & mountain goat',
    windows: MSG_DRAW.windows, href: '/hunts?state=ID&draw=msg', apply: MSG_DRAW.source, applyLabel: 'IDFG' },
];

const DAY = 86400_000;

/** Today's calendar date in `tz`, as UTC midnight (so date arithmetic is whole days). */
export function localDay(now: Date, tz: string): Date {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function resolve(s: string, year: number): Date {
  const p = s.split('-').map(Number);
  return p.length === 3 ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : new Date(Date.UTC(year, p[0] - 1, p[1]));
}

/** Windows open now, or opening within `horizonDays`, soonest-closing first. */
export function drawAlerts(now = new Date(), horizonDays = 28): DrawAlert[] {
  const out: DrawAlert[] = [];
  for (const s of SOURCES) {
    const today = localDay(now, s.tz);
    for (const w of s.windows) {
      const yearly = w.start.split('-').length === 2;
      for (const y of yearly ? [today.getUTCFullYear(), today.getUTCFullYear() + 1] : [0]) {
        const start = resolve(w.start, y);
        const end = resolve(w.end, y);
        if (end < today) continue;
        const opensIn = Math.round((start.getTime() - today.getTime()) / DAY);
        if (opensIn > horizonDays) continue;
        const open = opensIn <= 0;
        const label = w.label.toLowerCase().includes('second') ? `${s.what}: ${w.label.toLowerCase()}` : s.what;
        out.push({ state: s.state, what: label, start, end, open, opensIn: Math.max(0, opensIn),
          closesIn: Math.round((end.getTime() - today.getTime()) / DAY), href: s.href, apply: s.apply, applyLabel: s.applyLabel });
      }
    }
  }
  // open windows first (by how soon they close), then upcoming ones by how soon they open
  return out.sort((a, b) => (a.open === b.open ? (a.open ? a.closesIn - b.closesIn : a.opensIn - b.opensIn) : a.open ? -1 : 1));
}

/** "Opens in 22 days" / "Open now · 10 days left" / "Open now · Closes today". */
export function alertLead(a: DrawAlert): string {
  if (!a.open) return a.opensIn === 1 ? 'Opens tomorrow' : `Opens in ${a.opensIn} days`;
  return `Open now · ${a.closesIn === 0 ? 'Closes today' : a.closesIn === 1 ? '1 day left' : `${a.closesIn} days left`}`;
}
