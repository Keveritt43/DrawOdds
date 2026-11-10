/**
 * Wyoming deer, elk and antelope draw odds (WGFD Chapter 44). Pure and client-safe.
 *
 * Nonresidents, per hunt and per pool (regular or special):
 *   1. Preference draw: at least 75% of the pool's licenses (observed: ceil(75%)), first choices only, highest
 *      points first. Points count only on a first choice. A party draws together on its averaged points, so
 *      "Issued" can exceed the remaining quota.
 *   2. Random draw: the other licenses, drawn among everyone who missed in the preference draw (in the data,
 *      random first-choice applicants equal unsuccessful preference applicants in all 4,322 pools 2021-2026).
 *      Preference licenses nobody used do not move into the random quota.
 * Residents: no points; one random draw per hunt.
 *
 * What is published vs estimated:
 *   - Preference odds at your points are WGFD's printed "First Choice Success Odds" for that point level:
 *     remaining licenses / first-choice applicants at that level, capped at 100%. Published, last draw.
 *   - Random first-choice odds are not published. They are estimated as random quota / first-choice
 *     applicants, capped at 100%, assuming first choices are filled before any second choice.
 *   - Resident odds are estimated the same way from the resident report.
 *
 * Projection: lives in the hunt builder, not here. Scored with Brier the way Colorado is (each year predicted from
 * earlier draws only), it beats "last draw's odds" for antelope and deer, which default to projected; elk loses
 * and shows the last draw, labeled. See docs/states/wy-draw-model.md.
 */

export type WyKind = 'e' | 'p' | 'r';
/** [remainingQuota, issued|null, kind, points, firstChoiceApplicants, printedOddsPct] */
export type WyRow = [number, number | null, WyKind, number, number, number];

export interface WyPref { quota: number; rows: WyRow[] }
export interface WyRandom { quota: number | null; apps: [number, number, number] }
export interface WyNrPool { pref: WyPref; random: WyRandom }
export interface WyHuntYear { regular?: WyNrPool; special?: WyNrPool; res?: WyRandom }

export type WyPool = 'regular' | 'special';

/** WGFD's printed first-choice preference odds for a solo applicant with `points` (0-1), or null if not drawn. */
export function prefOdds(pref: WyPref, points: number): number {
  if (!Number.isInteger(points) || points < 0) throw new Error('points must be a whole number >= 0');
  if (pref.quota <= 0) return 0;
  const rows = pref.rows;
  const exact = rows.find((r) => r[2] === 'e' && r[3] === points);
  if (exact) return exact[5] / 100;
  const residual = rows.find((r) => r[2] === 'r');
  if (residual && points <= residual[3]) return residual[5] / 100;
  const top = Math.max(-1, ...rows.filter((r) => r[2] !== 'r').map((r) => r[3]));
  if (points > top) return 1; // more points than anyone who applied
  // A level between printed rows (no applicants at it): the next printed row below sets the odds.
  const below = rows.find((r) => r[2] !== 'r' && r[3] <= points);
  return below ? below[5] / 100 : 0;
}

/** Estimated first-choice odds in a random draw (0-1); null when the license is unlimited or unknown. */
export function randomOdds(r: WyRandom | undefined): number | null {
  if (!r || r.quota === null) return null;
  if (r.quota <= 0) return 0;
  const first = r.apps[0];
  return first <= 0 ? 1 : Math.min(1, r.quota / first);
}

export interface WyOdds {
  /** Chance in the preference phase (published, last draw). */
  pref: number;
  /** Chance in the random phase if the preference phase misses (estimated). */
  random: number | null;
  /** pref + (1 - pref) x random. */
  total: number | null;
  basis: 'published-preference+estimated-random';
}

export function nonresidentOdds(pool: WyNrPool, points: number): WyOdds {
  const pref = prefOdds(pool.pref, points);
  const random = randomOdds(pool.random);
  return {
    pref,
    random,
    total: random === null ? null : pref + (1 - pref) * random,
    basis: 'published-preference+estimated-random',
  };
}

export function residentOdds(res: WyRandom | undefined): { total: number | null; basis: 'estimated-random' | 'unlimited' } {
  if (res && res.quota === null) return { total: null, basis: 'unlimited' };
  return { total: randomOdds(res), basis: 'estimated-random' };
}

/**
 * The preference cutoff on one scale, as in coOdds: drawn out at L points with fraction f drawn -> L + (1 - f).
 * Everyone with more than L points drew. Party rows sit between L-1 and L (midpoint). null when every
 * first-choice applicant drew (the hunt was undersubscribed in the preference phase).
 */
export function effectiveCutoff(pref: WyPref): number | null {
  for (const [, , kind, points, apps, odds] of pref.rows) {
    if (kind === 'r') return points + 1;
    if (apps > 0 && odds < 100) return points - (kind === 'p' ? 0.5 : 0) + (1 - odds / 100);
  }
  return null;
}

/** Fewest whole points that drew with certainty in the preference phase; 0 when everyone drew. */
export function pointsToGuarantee(pref: WyPref): number | null {
  if (pref.quota <= 0) return null;
  const e = effectiveCutoff(pref);
  return e === null ? 0 : Math.floor(e) + 1;
}

/** Cutoff by year (point creep is a measured change in these, not a promise about next year). */
export function cutoffHistory(years: Record<string, WyHuntYear>, pool: WyPool): { year: number; cutoff: number | null }[] {
  return Object.entries(years)
    .filter(([, y]) => y[pool])
    .map(([year, y]) => ({ year: Number(year), cutoff: effectiveCutoff(y[pool]!.pref) }))
    .sort((a, b) => a.year - b.year);
}
