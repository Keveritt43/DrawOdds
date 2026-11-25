/**
 * Pure calculation logic shared by the sync job and the app. No I/O - unit tested.
 */

export type SpeciesName = 'DEER' | 'ELK' | 'PRONGHORN' | 'MOOSE' | 'BIGHORN' | 'GOAT' | 'BISON';

// IDFG footnote: "Beginning in 2016 calculations for %4+Pts are based on mule deer and %5+pts are based on white-tailed deer."
export const SPLIT_YEAR = 2016;
export const WT_MAJORITY = 60; // whitetail % of harvest at/above = "Whitetail"
export const MD_MAJORITY = 40; // at/below = "Mule deer"; between = "Mixed"

export interface HarvestInput {
  harvest: number | null;
  antlered: number | null;
  pct4: number | null;
  pct5: number | null;
  pctWt: number | null;
  pctSpike: number | null;
  pct6: number | null;
}

export interface Estimates {
  estWt: number | null;
  estMule: number | null;
  est4: number | null;
  est5: number | null;
  estSpike: number | null;
  est6: number | null;
}

const pct = (base: number | null, p: number | null) =>
  base === null || p === null ? null : Math.round((base * p) / 100);

/** Back-fills IDFG's rounded % columns into counts. */
export function estimates(species: SpeciesName, year: number, h: HarvestInput): Estimates {
  const e: Estimates = { estWt: null, estMule: null, est4: null, est5: null, estSpike: null, est6: null };
  if (species === 'DEER') {
    e.estWt = pct(h.harvest, h.pctWt);
    e.estMule = e.estWt === null || h.harvest === null ? null : h.harvest - e.estWt;
    if (year >= SPLIT_YEAR) {
      const muleAnt = h.antlered === null || h.pctWt === null ? null : (h.antlered * (100 - h.pctWt)) / 100;
      const wtAnt = h.antlered === null || h.pctWt === null ? null : (h.antlered * h.pctWt) / 100;
      e.est4 = pct(muleAnt, h.pct4);
      e.est5 = pct(wtAnt, h.pct5);
    } else {
      e.est4 = pct(h.antlered, h.pct4);
      e.est5 = pct(h.antlered, h.pct5);
    }
  } else if (species === 'ELK') {
    e.estSpike = pct(h.antlered, h.pctSpike);
    e.est6 = pct(h.antlered, h.pct6);
  }
  return e;
}

export function deerType(whitetailPct: number | null): 'WHITETAIL' | 'MULE' | 'MIXED' | null {
  if (whitetailPct === null || Number.isNaN(whitetailPct)) return null;
  if (whitetailPct >= WT_MAJORITY) return 'WHITETAIL';
  if (whitetailPct <= MD_MAJORITY) return 'MULE';
  return 'MIXED';
}

export function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined || b === 0) return null;
  return a / b;
}

/** Sum of a field across rows, null if every value is null. */
export function sumOf<T>(rows: T[], f: (r: T) => number | null | undefined): number | null {
  let any = false;
  let s = 0;
  for (const r of rows) {
    const v = f(r);
    if (v !== null && v !== undefined) {
      any = true;
      s += v;
    }
  }
  return any ? s : null;
}

export interface OddsRow {
  year: number;
  draw: number;
  huntNumber: number;
  areaName: string;
  permits: number | null;
  resPermits: number | null;
  nrPermits: number | null;
  resApps: number | null;
  nrApps: number | null;
  apps1: number | null;
  apps2?: number | null;
  drew2?: number | null;
}

/**
 * IDFG renumbers hunts every few years (Area 49's late bull hunt was 2030 in 2021-22, 2028 in 2023-24,
 * 2029 in 2025). To follow one hunt through time we take, for each earlier year, the first-drawing hunt in
 * the SAME area whose permit count is closest to the current hunt's, preferring an exact hunt-number match.
 * Returns year -> hunt number.
 */
/** The unit an Idaho hunt area belongs to: "41-1", "41-2" and "41X" are all in Unit 41; "36A-3" in 36A. */
export function parentArea(area: string): string {
  return area.match(/^\d+[A-WYZ]?/)?.[0] ?? area; // X marks an extra (antlerless) area, never a unit letter
}

/**
 * Which hunt number this hunt had in each earlier year. Within its own area a hunt can be renumbered
 * (matched by tag count, then nearest number). With `relabels` (owner-approved Nov 25, 2026), the
 * history also follows IDFG relabelling the area itself (2025 "38" -> 2026 "38-1", "41-1" -> "41-2"):
 * a year with no match in the current area may continue into another area of the same parent unit
 * when its tag count is within 10% and either the hunt number is the same, or it is the only such
 * row and its area name no longer exists in the following year. Without `relabels` the history stops
 * at the area name, which cut 15 current Idaho hunts' history in 2026.
 */
export function lineage(current: OddsRow, history: OddsRow[], opts: { relabels?: boolean } = {}): Map<number, number> {
  const out = new Map<number, number>([[current.year, current.huntNumber]]);
  const byYear = new Map<number, OddsRow[]>();
  for (const r of history) {
    if (r.draw !== 1 || r.year > current.year) continue;
    (byYear.get(r.year) ?? byYear.set(r.year, []).get(r.year)!).push(r);
  }
  const target = current.permits ?? 0;
  let area = current.areaName;
  let lastNum = current.huntNumber;
  let laterYear = current.year;
  for (const year of [...byYear.keys()].filter((y) => y < current.year).sort((a, b) => b - a)) {
    const all = byYear.get(year)!;
    const rows = all.filter((r) => r.areaName === area);
    const exact = rows.find((r) => r.huntNumber === current.huntNumber);
    const best =
      exact && relDiff(exact.permits ?? 0, target) <= 0.5
        ? exact
        : rows
            .slice()
            .sort(
              (a, b) =>
                relDiff(a.permits ?? 0, target) - relDiff(b.permits ?? 0, target) ||
                Math.abs(a.huntNumber - current.huntNumber) - Math.abs(b.huntNumber - current.huntNumber),
            )[0];
    // a hunt whose tag count is wildly different is a different hunt, not a renumbered one
    // (300 -> 500 tags is 0.4; 1 -> 200 is 0.995 and must not match)
    if (best && relDiff(best.permits ?? 0, target) <= 0.6) {
      out.set(year, best.huntNumber);
      lastNum = best.huntNumber;
      laterYear = year;
      continue;
    }
    if (!opts.relabels) continue;
    const later = byYear.get(laterYear) ?? [];
    const sib = all.filter((r) => r.areaName !== area && parentArea(r.areaName) === parentArea(area) && relDiff(r.permits ?? 0, target) <= 0.1);
    const same = sib.find((r) => r.huntNumber === lastNum);
    const only = sib.length === 1 && !later.some((r) => r.areaName === sib[0].areaName) ? sib[0] : undefined;
    const pick = same ?? only;
    if (pick) {
      out.set(year, pick.huntNumber);
      area = pick.areaName;
      lastNum = pick.huntNumber;
      laterYear = year;
    }
  }
  return out;
}

/** Harvest rows that belong to a lineage. A hunt held in January or February after its draw year can be
 * reported under the next calendar year (2024 draw, January 2025 hunt, 2025 harvest table): with
 * `nextYear`, a draw year with no harvest row of its own takes the next year's row for the same number,
 * in the same parent unit, when that number has no drawing of its own that next year. */
export function lineageHarvest<H extends { year: number; huntNumber: number; areaName: string }>(
  lin: Map<number, number>, linAreas: Map<number, string>, harvest: H[], drawn: Set<string>, species: string, opts: { nextYear?: boolean } = {},
): H[] {
  const at = new Map(harvest.map((h) => [`${h.year}|${h.huntNumber}`, h]));
  const out: H[] = [];
  for (const [year, n] of lin) {
    const own = at.get(`${year}|${n}`);
    if (own) { out.push(own); continue; }
    if (!opts.nextYear || lin.has(year + 1) || drawn.has(`${species}|${year + 1}|${n}`)) continue;
    const next = at.get(`${year + 1}|${n}`);
    const area = linAreas.get(year);
    if (next && area && parentArea(next.areaName) === parentArea(area)) out.push(next);
  }
  return out;
}

function relDiff(a: number, b: number): number {
  if (a === b) return 0;
  return Math.abs(a - b) / Math.max(1, Math.max(a, b));
}

export interface OddsSummary {
  resOddsLast: number | null;
  nrOddsLast: number | null;
  resOdds5: number | null;
  nrOdds5: number | null;
  resAppsLast: number | null;
  nrAppsLast: number | null;
  appsTrend: number | null; // last year's 1st-choice applicants vs. the 5-yr average, e.g. +0.12
  years: number;
  oddsLastYear: number | null;
  resOddsPrev: number | null; // previous drawing, only when it was the year before
  nrOddsPrev: number | null;
  resAppsPrev: number | null;
  nrAppsPrev: number | null;
  nrPermitsLast: number | null; // tags nonresidents drew in the latest drawing
  secondDrewLast: number | null; // tags that went to 2nd-choice applicants in the latest drawing (leftovers)
  secondAppsLast: number | null;
  permitsLast: number | null;
  permitsPrev: number | null; // all tags, the drawing before (only when it was the year before)
}

/** Draw odds = permits / first-choice applicants, capped at 100% (undersubscribed hunts give 2nd-choice tags too). */
export function odds(permits: number | null | undefined, apps: number | null | undefined): number | null {
  const r = ratio(permits, apps);
  return r === null ? null : Math.min(1, r);
}

/** 5-yr odds = total permits / total applicants (not an average of yearly %). */
export function summarizeOdds(rows: OddsRow[]): OddsSummary {
  const sorted = rows.slice().sort((a, b) => b.year - a.year);
  const last = sorted[0];
  const five = sorted.slice(0, 5);
  const avgApps = sumOf(five, (r) => r.apps1);
  const prev = sorted[1] && last && sorted[1].year === last.year - 1 ? sorted[1] : undefined;
  return {
    resOddsLast: last ? odds(last.resPermits, last.resApps) : null,
    nrOddsLast: last ? odds(last.nrPermits, last.nrApps) : null,
    resOdds5: odds(sumOf(five, (r) => r.resPermits), sumOf(five, (r) => r.resApps)),
    nrOdds5: odds(sumOf(five, (r) => r.nrPermits), sumOf(five, (r) => r.nrApps)),
    resAppsLast: last?.resApps ?? null,
    nrAppsLast: last?.nrApps ?? null,
    appsTrend:
      last && last.apps1 !== null && avgApps !== null && five.length > 1
        ? last.apps1 / (avgApps / five.length) - 1
        : null,
    years: five.length,
    oddsLastYear: last?.year ?? null,
    resOddsPrev: prev ? odds(prev.resPermits, prev.resApps) : null,
    nrOddsPrev: prev ? odds(prev.nrPermits, prev.nrApps) : null,
    resAppsPrev: prev?.resApps ?? null,
    nrAppsPrev: prev?.nrApps ?? null,
    nrPermitsLast: last?.nrPermits ?? null,
    secondDrewLast: last?.drew2 ?? null,
    secondAppsLast: last?.apps2 ?? null,
    permitsLast: last?.permits ?? null,
    permitsPrev: prev?.permits ?? null,
  };
}

export interface HarvestRow extends Estimates {
  year: number;
  avgSize?: number | null;
  hunters: number | null;
  harvest: number | null;
  antlered: number | null;
  antlerless: number | null;
  days?: number | null;
}

export interface HarvestSummary {
  success5: number | null;
  hunters5: number | null;
  harvest5: number | null;
  whitetailPct5: number | null;
  deerType: 'WHITETAIL' | 'MULE' | 'MIXED' | null;
  avgSize5: number | null; // moose antler spread / sheep, goat horn length: harvest-weighted (in.)
  bigPct5: number | null; // deer: mule 4+ share of mule antlered (or all antlered pre-2016); elk: 6+ share of antlered
  antlerlessShare5: number | null;
  years: number;
  smallSample: boolean;
  harvestLastYear: number | null;
  successLast: number | null;
  successPrev: number | null; // previous season, only when it was the year before
  daysPerHunter5: number | null; // hunter effort: days hunted / hunters (years that report days)
  daysPerHarvest5: number | null; // days hunted / animals taken
}

/** Fewer antlered animals than this over 5 years: the trophy share is too noisy to show. */
export const MIN_TROPHY_BASE = 20;
export function trophyShare(trophies: number | null, base: number | null): number | null {
  if (trophies === null || base === null || base < MIN_TROPHY_BASE) return null;
  return Math.min(1, trophies / base);
}

/** IDFG harvest rows with more animals than hunters are data errors (tiny samples): treat that year as missing. */
export const validHarvest = (r: { hunters: number | null; harvest: number | null }) => !(r.harvest !== null && r.hunters !== null && r.harvest > r.hunters);

export function summarizeHarvest(species: SpeciesName, rows: HarvestRow[]): HarvestSummary {
  const five = rows.filter(validHarvest).slice().sort((a, b) => b.year - a.year).slice(0, 5);
  const hunters = sumOf(five, (r) => r.hunters);
  const harvest = sumOf(five, (r) => r.harvest);
  const wt = species === 'DEER' ? sumOf(five, (r) => r.estWt) : null;
  const wtPct = species === 'DEER' && wt !== null && harvest ? (wt / harvest) * 100 : null;
  const antlered = sumOf(five, (r) => r.antlered);
  // trophy share: the counts are back-calculated from IDFG's rounded percentages, so a handful of animals can
  // round to more trophies than antlered animals (103%). Under MIN_TROPHY_BASE antlered animals it's left blank,
  // and it never goes over 100%. Only years that have the trophy estimate count in the denominator.
  let bigPct: number | null = null;
  if (species === 'ELK') {
    const yrs = five.filter((r) => r.est6 !== null && r.antlered !== null);
    bigPct = trophyShare(sumOf(yrs, (r) => r.est6), sumOf(yrs, (r) => r.antlered));
  } else if (species === 'DEER') {
    const yrs = five.filter((r) => r.est4 !== null && r.antlered !== null);
    const muleAnt = sumOf(yrs, (r) =>
      r.antlered === null ? null : r.year >= SPLIT_YEAR && r.estWt !== null && r.harvest ? r.antlered * (1 - r.estWt / r.harvest) : r.antlered,
    );
    bigPct = trophyShare(sumOf(yrs, (r) => r.est4), muleAnt);
  }
  return {
    success5: ratio(harvest, hunters),
    hunters5: hunters,
    harvest5: harvest,
    whitetailPct5: wtPct,
    deerType: species === 'DEER' ? deerType(wtPct) : null,
    bigPct5: bigPct,
    avgSize5: (() => {
      // harvest-weighted average of each year's average size (only years that report it)
      const ys = five.filter((r) => r.avgSize !== null && r.avgSize !== undefined && (r.antlered ?? r.harvest ?? 0) > 0);
      const w = ys.reduce((a, r) => a + (r.antlered ?? r.harvest ?? 0), 0);
      return w ? ys.reduce((a, r) => a + r.avgSize! * (r.antlered ?? r.harvest ?? 0), 0) / w : null;
    })(),
    antlerlessShare5: ratio(sumOf(five, (r) => r.antlerless), harvest),
    years: five.length,
    // moose / sheep / goat hunts have 1-10 tags: 50 hunters in 5 years would flag nearly all of them
    smallSample: (hunters ?? 0) < (['MOOSE', 'BIGHORN', 'GOAT'].includes(species) ? 10 : 50),
    harvestLastYear: five[0]?.year ?? null,
    successLast: five[0] ? ratio(five[0].harvest, five[0].hunters) : null,
    successPrev: five[1] && five[1].year === five[0].year - 1 ? ratio(five[1].harvest, five[1].hunters) : null,
    ...(() => {
      // effort: only years that report days, so the ratios use matching hunters and harvest
      const ys = five.filter((r) => (r.days ?? 0) > 0);
      const d = sumOf(ys, (r) => r.days ?? null);
      return { daysPerHunter5: ratio(d, sumOf(ys, (r) => r.hunters)), daysPerHarvest5: ratio(d, sumOf(ys, (r) => r.harvest)) };
    })(),
  };
}

/** Chance of drawing AND filling in one season = odds x success. The "best bet" sort. */
export function tagAndFill(odds: number | null, success: number | null): number | null {
  if (odds === null || success === null) return null;
  return Math.min(1, odds) * success;
}

/** Units whose boundaries IDFG changed in 2022 (IDFG GMU layer description). */
export const BOUNDARY_CHANGED_2022 = new Set(['38', '39', '41', '45', '46', '49', '50', '53', '56', '57']);

/** Calendar months (1-12) a season is open, including seasons that wrap Dec -> Jan. */
export function monthsOpen(open: Date | null, close: Date | null): number[] {
  if (!open || !close) return [];
  const out: number[] = [];
  const d = new Date(Date.UTC(open.getUTCFullYear(), open.getUTCMonth(), 1));
  const end = new Date(Date.UTC(close.getUTCFullYear(), close.getUTCMonth(), 1));
  for (let i = 0; d <= end && i < 13; i++) {
    out.push(d.getUTCMonth() + 1);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return [...new Set(out)];
}
