/**
 * Colorado preference-point odds (2026-2027 rules). Pure and client-safe.
 *
 * The draw, per hunt code and pool (resident, nonresident, youth...): first choices only, highest points first,
 * until the pool's licenses run out. The level where they run out is the "drawn out at" level; applicants there
 * are drawn at random. Hunts with a hybrid draw also give a few licenses at random to 5+ point applicants below
 * that level. So last year's odds at p points are exact; next year's are a projection.
 *
 * "Effective points" puts the cutoff on one scale: 6 points with 60% drawn at 6 = 6.4. Everyone at 7+ draws,
 * 6 is a 60% chance. An effective value of exactly 7.0 means the same thing as 6 points at 0%.
 *
 * Projection is a conservative same-hunt cohort scenario: unsuccessful first-choice applicants return
 * with one additional point, successful applicants leave, and observed first-choice supply is held fixed.
 * Historical variation can increase the projected cutoff but cannot lower it below the last draw or the
 * returning-cohort cutoff. Entrants, applicants switching hunts, and quota changes remain uncertain.
 */

export type Levels = Record<number, number>; // points -> applicants (or successful applicants)

export interface CutoffInfo {
  text: string;
  points: number | null;
  choice: number | null;
  leftover: boolean;
  drawnAtLevel: number | null;
  appsAtLevel: number | null;
}

/** One pool in one year's draw: first-choice applicants and successful applicants by points. */
export interface PoolYear {
  year: number;
  pre: Levels;
  post: Levels;
  cut: CutoffInfo | null;
  /** Licenses available to this pool, including later choices when known. */
  capacity?: number;
}

export interface Projection {
  year: number;
  /** Last draw's effective points, the starting point. */
  base: number;
  /** The cutoff's possible values next draw: base + each calibration quantile (0 or more). */
  qs: number[];
  /** Middle (median) and the 10th / 90th percentile of qs. */
  eff: number;
  lo: number;
  hi: number;
  /** Points per year the cutoff has been rising (5-year least squares); for point creep, not for next year. */
  slope: number | null;
  /** Deterministic returning-applicant cutoff under unchanged supply. */
  cohort?: number;
}

/** How far a cutoff moved from one draw to the next, as quantiles, for one residency and level band. */
export interface Calibration {
  /** Upper bounds of the level bands (effective points of the last draw); the last band is open. */
  bands: number[];
  /** Per band: sorted quantiles of (this draw - last draw). */
  q: number[][];
  n: number[];
}

/** Used until a sync has measured its own (deer, 2023-2026 draws, all hunt codes; see the header comment). */
export const DEFAULT_CALIBRATION: Record<'res' | 'nr', Calibration> = {
  res: {
    bands: [1, 3, 6, 10],
    q: [
      [-0.15, 0, 0, 0, 0, 0, 0, 0.01, 0.2],
      [-0.7, -0.42, -0.23, -0.12, -0.03, 0.06, 0.16, 0.27, 0.48],
      [-0.84, -0.47, -0.25, -0.11, 0.01, 0.16, 0.28, 0.46, 0.8],
      [-2.5, -1.56, -1, -0.33, 0.1, 0.42, 0.67, 1, 1.8],
      [-3, -1.42, -0.66, -0.07, 0.24, 0.5, 1, 1.45, 2.58],
    ],
    n: [3260, 815, 347, 117, 202],
  },
  nr: {
    bands: [1, 3, 6, 10],
    q: [
      [-0.06, 0, 0, 0, 0, 0, 0, 0, 0.26],
      [-1, -0.5, -0.25, -0.04, 0, 0.14, 0.29, 0.48, 0.77],
      [-1, -0.26, 0, 0.2, 0.43, 0.65, 0.88, 1.1, 1.58],
      [-2.33, -1.5, -0.5, -0.02, 0.16, 0.5, 0.9, 1.21, 2.75],
      [-3, -1, -0.5, 0, 0.33, 0.63, 1, 1.58, 2.63],
    ],
    n: [2254, 622, 293, 135, 287],
  },
};
export const CAL_BANDS = [1, 3, 6, 10];
/** Quantiles kept per band: 10%, 20% ... 90% (equal weight: each stands for a tenth of outcomes). */
export const CAL_QS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
/**
 * Share of first-choice applicants above the cutoff who drew (deer 2021-2026): a few don't, and CPW doesn't say
 * why. Projected odds are scaled by it, so "everyone at your points drew last year" reads ~95%, not 100%.
 */
export const ABOVE_CUTOFF_RATE = { res: 0.965, nr: 0.935 };

/** Measures a Calibration from backtest pairs (last draw's effective points, this draw's). */
export function calibrate(pairs: { last: number; next: number }[], bands = CAL_BANDS, qs = CAL_QS): Calibration {
  const groups: number[][] = bands.concat(Infinity).map(() => []);
  for (const { last, next } of pairs) groups[bandOf(last, bands)].push(next - last);
  return {
    bands,
    q: groups.map((g) => {
      const e = g.slice().sort((a, b) => a - b);
      return e.length ? qs.map((p) => round2(e[Math.floor(p * (e.length - 1))])) : qs.map(() => 0);
    }),
    n: groups.map((g) => g.length),
  };
}
const bandOf = (eff: number, bands: number[]) => {
  const i = bands.findIndex((b) => eff < b);
  return i < 0 ? bands.length : i;
};

const sum = (l: Levels) => Object.values(l).reduce((a, b) => a + b, 0);
const levels = (l: Levels) =>
  Object.keys(l)
    .map(Number)
    .sort((a, b) => a - b);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The pool's cutoff on one scale, or null when nobody applied. */
export function effective(py: PoolYear): number | null {
  const c = py.cut;
  const apps = sum(py.pre);
  if (!c || /no apps/i.test(c.text) || apps === 0) return null;
  if (c.points !== null) {
    const p = c.appsAtLevel ? (c.drawnAtLevel ?? 0) / c.appsAtLevel : 1;
    return round2(c.points + (1 - p));
  }
  // drawn out at a 2nd-4th choice or leftover: every first choice drew
  if (c.choice !== null || c.leftover || /leftover/i.test(c.text)) return 0;
  // none drawn: not even the most points drew
  if (/none/i.test(c.text)) return Math.max(...levels(py.pre)) + 1;
  return null;
}

/** Points needed and the share drawn at that level, from effective points. */
export function cutFromEff(eff: number): { pts: number; pct: number } {
  const pts = Math.floor(eff + 1e-9);
  return { pts, pct: round2(1 - (eff - pts)) };
}

/** Chance of drawing (first choice) at p points, given the cutoff in effective points. */
export function oddsAt(p: number, eff: number, hybridRate = 0): number {
  const { pts, pct } = cutFromEff(eff);
  if (p > pts) return 1;
  if (p === pts) return pct;
  return p >= 5 ? hybridRate : 0;
}

/** Last year's exact numbers at p points. */
export function exactAt(py: PoolYear, p: number): { apps: number; drawn: number; odds: number | null } {
  const apps = py.pre[p] ?? 0;
  const drawn = py.post[p] ?? 0;
  return { apps, drawn, odds: apps ? drawn / apps : null };
}

/** Share of 5+ point applicants below the cutoff who drew anyway (hybrid draw), 0 when the hunt had none. */
export function hybridRate(py: PoolYear): number {
  const c = py.cut?.points;
  if (c === null || c === undefined) return 0;
  let apps = 0,
    drawn = 0;
  for (const p of levels(py.pre)) {
    if (p < 5 || p >= c) continue;
    apps += py.pre[p] ?? 0;
    drawn += py.post[p] ?? 0;
  }
  return apps ? drawn / apps : 0;
}

/** Points per year and next year's value from up to the last 5 years (needs 3). */
export function trendNext(effs: { year: number; eff: number }[]): { slope: number; next: number } | null {
  const pts = effs.slice(-5);
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.year, 0) / n;
  const my = pts.reduce((a, p) => a + p.eff, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.year - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((a, p) => a + (p.year - mx) * (p.eff - my), 0) / sxx : 0;
  return { slope: round2(slope), next: round2(Math.max(0, pts[n - 1].eff + slope)) };
}

/** Returning first-choice applicants gain one point; historical successes leave this cohort. */
export function returningCohort(py: PoolYear): { pre: Levels; capacity: number; eff: number | null } {
  const pre: Levels = {};
  for (const [point, count] of Object.entries(py.pre)) {
    const p = Number(point),
      won = Math.max(0, py.post[p] ?? 0);
    if (!Number.isInteger(p) || p < 0 || !Number.isFinite(count) || count < 0 || won > count) continue;
    if (count > won) pre[p + 1] = (pre[p + 1] ?? 0) + count - won;
  }
  const hybridWins =
    py.cut?.points === null || py.cut?.points === undefined
      ? 0
      : Object.entries(py.post)
          .filter(([p]) => Number(p) >= 5 && Number(p) < py.cut!.points!)
          .reduce((a, [, n]) => a + n, 0);
  const capacity = Math.max(0, (py.capacity ?? sum(py.post)) - hybridWins);
  let left = capacity;
  const sorted = levels(pre).reverse();
  if (!sorted.length) return { pre, capacity, eff: 0 };
  if (!left) return { pre, capacity, eff: sorted[0] + 1 };
  for (const p of sorted) {
    const apps = pre[p];
    if (left <= apps) return { pre, capacity, eff: round2(p + 1 - left / apps) };
    left -= apps;
  }
  return { pre, capacity, eff: 0 };
}

/** The next draw's cutoff from a pool's history (oldest first). */
export function project(history: PoolYear[], cal: Calibration): Projection | null {
  if (!history.length) return null;
  const last = history[history.length - 1];
  const base = effective(last);
  if (base === null) return null;
  const effs = history.map((h) => ({ year: h.year, eff: effective(h) })).filter((e): e is { year: number; eff: number } => e.eff !== null);
  const band = cal.q[bandOf(base, cal.bands)];
  const cohort = returningCohort(last).eff ?? base;
  const floor = Math.max(base, cohort);
  const qs = band.map((d) => round2(Math.max(floor, base + Math.max(0, d)))).sort((a, b) => a - b);
  return {
    year: last.year + 1,
    base,
    qs,
    eff: qs[Math.floor(qs.length / 2)],
    lo: qs[0],
    hi: qs[qs.length - 1],
    slope: Math.max(0, trendNext(effs)?.slope ?? 0),
    cohort,
  };
}

export type Chance = 'sure' | 'likely' | 'possible' | 'longshot' | 'none';
export const CHANCE_LABEL: Record<Chance, string> = {
  sure: 'Near certain',
  likely: 'Likely',
  possible: 'Possible',
  longshot: 'Long shot',
  none: 'No chance',
};

/**
 * Projected odds at p points: the average over the cutoff's possible values (scaled by `rate`, the share above the
 * cutoff who draw), with the lowest and highest of those outcomes. Backtest, deer 2024-2026, each year predicted
 * from the years before it: Brier score 0.08 vs 0.10 for last year's odds (nonresidents), 0.054 vs 0.062 (residents).
 */
export function projectedOdds(
  p: number,
  pr: Pick<Projection, 'qs'>,
  hybrid = 0,
  rate = 1,
): { odds: number; lo: number; hi: number; chance: Chance } {
  const all = pr.qs.map((e) => oddsAt(p, e, hybrid) * rate);
  const odds = round2(all.reduce((a, b) => a + b, 0) / all.length);
  const lo = Math.min(...all),
    hi = Math.max(...all);
  return { odds, lo, hi, chance: chanceOf(odds, lo, hi) };
}

/** Label for odds (0..1); `hi` = the best case: none only when no outcome draws. */
export function chanceOf(odds: number, _lo: number, hi: number): Chance {
  if (hi <= 0 || odds < 0.005) return 'none';
  if (odds >= 0.9) return 'sure';
  if (odds >= 0.6) return 'likely';
  if (odds >= 0.3) return 'possible';
  return 'longshot';
}

/**
 * Draws from now (0 = the projected draw) until p points (gaining one a year) likely draws, if the cutoff keeps
 * rising at the trend. Null when the cutoff rises as fast as points do. Only meaningful under the current rules:
 * the 2028 draw splits licenses between preference and bonus draws.
 */
export function drawsToDraw(p: number, pr: Pick<Projection, 'eff' | 'slope'>, max = 15): number | null {
  const creep = Math.max(0, pr.slope ?? 0);
  for (let k = 0; k <= max; k++) if (oddsAt(p + k, pr.eff + creep * k) >= 0.5) return k;
  return null;
}

/** The first draw year run under the split preference / bonus rules (CPW, approved Feb 2025). */
export const RULE_CHANGE_YEAR = 2028;
