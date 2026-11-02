/**
 * Pure calculation logic shared by the sync job and the app. No I/O - unit tested.
 */

export type SpeciesName = 'DEER' | 'ELK';

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
  } else {
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
}

/**
 * IDFG renumbers hunts every few years (Area 49's late bull hunt was 2030 in 2021-22, 2028 in 2023-24,
 * 2029 in 2025). To follow one hunt through time we take, for each earlier year, the first-drawing hunt in
 * the SAME area whose permit count is closest to the current hunt's, preferring an exact hunt-number match.
 * Returns year -> hunt number.
 */
export function lineage(current: OddsRow, history: OddsRow[]): Map<number, number> {
  const out = new Map<number, number>([[current.year, current.huntNumber]]);
  const byYear = new Map<number, OddsRow[]>();
  for (const r of history) {
    if (r.draw !== 1 || r.areaName !== current.areaName || r.year >= current.year) continue;
    (byYear.get(r.year) ?? byYear.set(r.year, []).get(r.year)!).push(r);
  }
  const target = current.permits ?? 0;
  for (const [year, rows] of byYear) {
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
    if (best && relDiff(best.permits ?? 0, target) <= 1) out.set(year, best.huntNumber);
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
}

/** 5-yr odds = total permits / total applicants (not an average of yearly %). */
export function summarizeOdds(rows: OddsRow[]): OddsSummary {
  const sorted = rows.slice().sort((a, b) => b.year - a.year);
  const last = sorted[0];
  const five = sorted.slice(0, 5);
  const avgApps = sumOf(five, (r) => r.apps1);
  return {
    resOddsLast: last ? ratio(last.resPermits, last.resApps) : null,
    nrOddsLast: last ? ratio(last.nrPermits, last.nrApps) : null,
    resOdds5: ratio(sumOf(five, (r) => r.resPermits), sumOf(five, (r) => r.resApps)),
    nrOdds5: ratio(sumOf(five, (r) => r.nrPermits), sumOf(five, (r) => r.nrApps)),
    resAppsLast: last?.resApps ?? null,
    nrAppsLast: last?.nrApps ?? null,
    appsTrend:
      last && last.apps1 !== null && avgApps !== null && five.length > 1
        ? last.apps1 / (avgApps / five.length) - 1
        : null,
    years: five.length,
  };
}

export interface HarvestRow extends Estimates {
  year: number;
  hunters: number | null;
  harvest: number | null;
  antlered: number | null;
  antlerless: number | null;
}

export interface HarvestSummary {
  success5: number | null;
  hunters5: number | null;
  harvest5: number | null;
  whitetailPct5: number | null;
  deerType: 'WHITETAIL' | 'MULE' | 'MIXED' | null;
  bigPct5: number | null; // deer: mule 4+ share of mule antlered (or all antlered pre-2016); elk: 6+ share of antlered
  antlerlessShare5: number | null;
  years: number;
  smallSample: boolean;
}

export function summarizeHarvest(species: SpeciesName, rows: HarvestRow[]): HarvestSummary {
  const five = rows.slice().sort((a, b) => b.year - a.year).slice(0, 5);
  const hunters = sumOf(five, (r) => r.hunters);
  const harvest = sumOf(five, (r) => r.harvest);
  const wt = species === 'DEER' ? sumOf(five, (r) => r.estWt) : null;
  const wtPct = species === 'DEER' && wt !== null && harvest ? (wt / harvest) * 100 : null;
  const antlered = sumOf(five, (r) => r.antlered);
  let bigPct: number | null = null;
  if (species === 'ELK') bigPct = ratio(sumOf(five, (r) => r.est6), antlered);
  else {
    const muleAnt = sumOf(five, (r) =>
      r.antlered === null ? null : r.year >= SPLIT_YEAR && r.estWt !== null && r.harvest ? r.antlered * (1 - r.estWt / r.harvest) : r.antlered,
    );
    bigPct = ratio(sumOf(five, (r) => r.est4), muleAnt);
  }
  return {
    success5: ratio(harvest, hunters),
    hunters5: hunters,
    harvest5: harvest,
    whitetailPct5: wtPct,
    deerType: species === 'DEER' ? deerType(wtPct) : null,
    bigPct5: bigPct,
    antlerlessShare5: ratio(sumOf(five, (r) => r.antlerless), harvest),
    years: five.length,
    smallSample: (hunters ?? 0) < 50,
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
