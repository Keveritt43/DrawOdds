/**
 * Montana nonresident combination license draw odds. Pure and client-safe.
 *
 * This covers the draw a nonresident must win before hunting deer or elk in Montana at all: the Big Game
 * (deer + elk) and Elk Combination licenses, drawn together, and the General Deer Combination. It does NOT
 * cover Montana's permits and B licenses, which use a different system (uncapped bonus points, squared).
 * See docs/states/mt-onboarding.md.
 *
 * How the draw works, verified against FWP's 2025 and 2026 published results:
 *   1. 75% of the licenses go to the applicants with the most preference points, highest first. Everyone above
 *      the cutoff draws; at the cutoff the rate is whatever the report printed.
 *   2. The other 25% are drawn at random among applicants holding ZERO points.
 *   3. So an applicant above zero points but below the cutoff draws at exactly 0% — they missed the preference
 *      phase and are not eligible for the random phase. In 2026 that was everyone holding 1 point for a Big
 *      Game / Elk combination. Holding points is worse than holding none until you reach the cutoff.
 *
 * Points cap at 3 and are lost on drawing or on skipping an application year. Party applications average their
 * members' points to three decimals and draw as one entry, so a point balance can be fractional.
 *
 * Everything here is the LAST DRAW — what happened, not a forecast. There is no projection for next year:
 * the quota moved for 2026-2027 (the commission withheld about 2,500 nonresident deer licenses) and no
 * projection has been backtested. Label it as the last draw wherever it is shown.
 */
import raw from '../../data/mt/nr-combo.json';

export const MT_POINTS_CAP = 3;

export interface MtLevel {
  label: string;
  min: number;
  max: number;
  apps: number;
  drawn: number;
  /** FWP prints no success count where everyone drew; `drawn` is then the applicant count. */
  drawnDerived?: boolean;
  /** null where nobody applied at that level — unknown, not 0%. */
  pct: number | null;
}
export interface MtYear { totalApps: number; levels: MtLevel[] }
export interface MtLicense {
  key: string;
  name: string;
  shortName: string;
  pool: string;
  reportName: string;
  note?: string;
  years: Record<string, MtYear>;
}

const DATA = raw as unknown as { source: Record<string, unknown>; pointsCap: number; licenses: MtLicense[] };

export const MT_SOURCE = DATA.source;
export const mtLicenses = (): MtLicense[] => DATA.licenses;
export const mtLicense = (key: string): MtLicense | undefined => DATA.licenses.find((l) => l.key === key);

/** Draw years present for a license, newest first. */
export function mtYears(key: string): number[] {
  const lic = mtLicense(key);
  if (!lic) return [];
  return Object.keys(lic.years).map(Number).sort((a, b) => b - a);
}
export const mtLatestYear = (key: string): number | null => mtYears(key)[0] ?? null;

const yearData = (key: string, year?: number): MtYear | null => {
  const lic = mtLicense(key);
  if (!lic) return null;
  const y = year ?? mtLatestYear(key);
  return y == null ? null : lic.years[String(y)] ?? null;
};

/** Levels with applicants, highest points first. Levels nobody applied at are dropped (unknown, not 0%). */
export function mtLevels(key: string, year?: number): MtLevel[] {
  const d = yearData(key, year);
  if (!d) return [];
  return d.levels.filter((l) => l.apps > 0).slice().sort((a, b) => b.min - a.min);
}

/**
 * The partial level where the preference phase ran out: some drew, some did not. null when everyone who held
 * any points drew (the landowner pool), in which case there is no dead zone.
 */
export function mtCutoff(key: string, year?: number): MtLevel | null {
  return mtLevels(key, year).find((l) => l.min > 0 && l.pct != null && l.pct > 0 && l.pct < 100) ?? null;
}

/** The band that drew nothing: above zero points, below the cutoff. null when there is no cutoff. */
export function mtDeadZone(key: string, year?: number): { min: number; max: number } | null {
  const cut = mtCutoff(key, year);
  if (!cut) return null;
  return { min: 0, max: cut.min };
}

export type MtBasis = 'above-cutoff' | 'at-cutoff' | 'dead-zone' | 'random-zero' | 'unknown';

export interface MtOdds {
  /** 0-1, or null when the report cannot answer (no applicants at that level). */
  odds: number | null;
  basis: MtBasis;
  year: number;
  /** The published level the answer came from, where there is one. */
  level: MtLevel | null;
}

/**
 * Last-draw odds for an applicant holding `points` preference points.
 *
 * Resolved from the cutoff rather than by matching a printed band, so a point balance that falls between two
 * printed bands (a party averaging 1.9) still gets the right answer: below the cutoff is 0% whether or not
 * anybody happened to apply at that exact level last year.
 */
export function mtComboOdds(key: string, points: number, year?: number): MtOdds | null {
  if (!Number.isFinite(points) || points < 0) throw new Error('points must be a number >= 0');
  if (points > MT_POINTS_CAP) throw new Error(`Montana preference points cap at ${MT_POINTS_CAP}`);
  const y = year ?? mtLatestYear(key);
  if (y == null) return null;
  const levels = mtLevels(key, y);
  if (!levels.length) return null;

  const zero = levels.find((l) => l.min === 0 && l.max === 0) ?? null;
  const cut = mtCutoff(key, y);

  if (points === 0) {
    return { odds: zero?.pct == null ? null : zero.pct / 100, basis: zero ? 'random-zero' : 'unknown', year: y, level: zero };
  }

  if (!cut) {
    // Nobody with points missed: every level above zero drew in full.
    const top = levels.find((l) => l.min > 0);
    return { odds: top?.pct == null ? null : top.pct / 100, basis: top ? 'above-cutoff' : 'unknown', year: y, level: top ?? null };
  }

  if (points >= cut.min && points <= cut.max) {
    return { odds: cut.pct == null ? null : cut.pct / 100, basis: 'at-cutoff', year: y, level: cut };
  }
  if (points < cut.min) {
    return { odds: 0, basis: 'dead-zone', year: y, level: levels.find((l) => l.min > 0 && l.max < cut.min) ?? null };
  }
  const above = levels.find((l) => l.min > cut.max);
  return { odds: above?.pct == null ? 1 : above.pct / 100, basis: 'above-cutoff', year: y, level: above ?? null };
}

/** Fewest points that drew in full last year, for "what it took" copy. null when there was no cutoff. */
export function mtPointsToDraw(key: string, year?: number): number | null {
  const cut = mtCutoff(key, year);
  if (!cut) return null;
  const above = mtLevels(key, year).find((l) => l.min > cut.max);
  return above ? above.min : null;
}

/** Share of the licenses drawn at random among zero-point applicants (0-1). Montana publishes no quota. */
export function mtRandomShare(key: string, year?: number): number | null {
  const levels = mtLevels(key, year);
  const drawn = levels.reduce((a, l) => a + l.drawn, 0);
  const zero = levels.find((l) => l.min === 0 && l.max === 0);
  if (!drawn || !zero) return null;
  return zero.drawn / drawn;
}

/** Total licenses drawn in a year, summed from the published levels. */
export function mtDrawn(key: string, year?: number): number | null {
  const levels = mtLevels(key, year);
  return levels.length ? levels.reduce((a, l) => a + l.drawn, 0) : null;
}

/** Plain-language summary of one applicant's position, for cards and the hunt page. */
export function mtOddsLabel(o: MtOdds | null): string {
  if (!o || o.odds == null) return 'Unavailable';
  switch (o.basis) {
    case 'dead-zone': return 'No chance at this point level';
    case 'random-zero': return `${(o.odds * 100).toFixed(1)}% — random draw for 0 points`;
    case 'at-cutoff': return `${(o.odds * 100).toFixed(1)}% — the level the licenses ran out at`;
    case 'above-cutoff': return o.odds >= 1 ? 'Everyone with these points drew' : `${(o.odds * 100).toFixed(1)}%`;
    default: return 'Unavailable';
  }
}
