/** Idaho v2 trophy score: offline shadow, not wired to displayed or stored scores.
 *
 * Four parts, each a 0–1 value, weighted to 100:
 *  - demand 35: applicants per tag, percentile within species and weapon (Idaho is one
 *    random draw, so applicants per tag is close to 1 ÷ draw odds and isn't inflated by
 *    point-builders the way preference states are);
 *  - animal 30: IDFG's harvest share of mature animals (mule deer 4+ points, elk 6+ points),
 *    shrunk toward the species mean on small harvests, percentile within species;
 *  - evidence 20: B&C county entries tested against harvest (Poisson, BH-corrected) and
 *    named publication lists;
 *  - rut 15: days of the season inside the species' rut window, full credit at 10 days.
 *
 * Tiers keep the live 50/65/80/100 scale: ≥85 → 100, ≥70 → 80, ≥55 → 65, else 50.
 * The cut-offs and weights are owner-set, not calibrated against an outcome. */

export type IdSpecies = 'DEER' | 'ELK' | 'PRONGHORN';
export const WEIGHTS = { demand: 35, animal: 30, evidence: 20, rut: 15 } as const;

/** Inclusive month-day windows. Sources: East Idaho News (mule deer peak ~Nov 15, breeding into
 * December), IDFG (deer rut in November, elk in September), outfitter/agency summaries (Idaho elk
 * peak Sep 10–25/28; pronghorn mid-September to early October). Pre-rut chasing is included. */
export const RUT_WINDOWS: Record<string, [string, string]> = {
  'DEER:MULE': ['11-05', '12-05'],
  'DEER:WHITETAIL': ['11-01', '11-30'],
  ELK: ['09-08', '10-01'],
  PRONGHORN: ['09-10', '10-05'],
};
/** A peak rut lasts about ten days (goHunt, mule deer): ten rut days earn full credit. */
export const FULL_RUT_DAYS = 10;

const day = 86_400_000;
const parse = (v: string) => Date.parse(`${v.slice(0, 10)}T00:00:00Z`);

/** Days of [open, close] inside the rut window, in any year the season spans. */
export function rutDays(species: IdSpecies, deerType: string | null | undefined, open: string, close: string): number | null {
  const key = species === 'DEER' ? `DEER:${deerType === 'WHITETAIL' ? 'WHITETAIL' : 'MULE'}` : species;
  const w = RUT_WINDOWS[key], a = parse(open), b = parse(close);
  if (!w || !Number.isFinite(a) || !Number.isFinite(b) || b < a || (b - a) / day > 366) return null;
  let days = 0;
  for (let t = a; t <= b; t += day) {
    const md = new Date(t).toISOString().slice(5, 10);
    if (md >= w[0] && md <= w[1]) days++;
  }
  return days;
}
export const rutCredit = (days: number | null) => days === null ? null : Math.min(days, FULL_RUT_DAYS) / FULL_RUT_DAYS;

/** Mid-rank percentile of value among values. */
export function midRank(value: number, values: number[]): number {
  return (values.filter(v => v < value).length + values.filter(v => v === value).length / 2) / values.length;
}

/** Upper-tail Poisson probability P(X ≥ k | λ). */
export function poissonUpper(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda), cdf = term;
  for (let i = 1; i < k; i++) { term *= lambda / i; cdf += term; }
  return Math.max(0, 1 - cdf);
}

/** Benjamini–Hochberg adjusted q-values, in input order. */
export function bhAdjust(p: number[]): number[] {
  const order = p.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const q = new Array<number>(p.length);
  let min = 1;
  for (let r = order.length - 1; r >= 0; r--) {
    min = Math.min(min, order[r][0] * order.length / (r + 1));
    q[order[r][1]] = min;
  }
  return q;
}

export interface CountyInput { county: string; entries10: number; units: string[] }
export interface CountyResult { county: string; entries10: number; harvest10: number; expected: number; rateRatio: number; p: number; q: number; significant: boolean }

/** B&C entries in ten years against the county's ten-year harvest (five-year unit harvest × 2),
 * at the statewide entries-per-harvest rate. A unit counts toward every county it's listed in.
 * Significance: BH q < 0.10 and rate ratio > 1. Counties with no harvest are left out. */
export function bcCountySignificance(counties: CountyInput[], unitHarvest5: Record<string, number>): CountyResult[] {
  const rows = counties.map(c => ({ ...c, harvest10: 2 * c.units.reduce((s, u) => s + (unitHarvest5[u] ?? 0), 0) })).filter(c => c.harvest10 > 0);
  const totalEntries = rows.reduce((s, c) => s + c.entries10, 0), totalHarvest = rows.reduce((s, c) => s + c.harvest10, 0);
  if (!rows.length || totalHarvest <= 0) return [];
  const rate = totalEntries / totalHarvest;
  const p = rows.map(c => poissonUpper(c.entries10, rate * c.harvest10));
  const q = bhAdjust(p);
  return rows.map((c, i) => {
    const expected = rate * c.harvest10, rateRatio = expected > 0 ? c.entries10 / expected : 0;
    return { county: c.county, entries10: c.entries10, harvest10: c.harvest10, expected, rateRatio, p: p[i], q: q[i], significant: q[i] < 0.1 && rateRatio > 1 };
  });
}

/** Named publication lists (not B&C): one 0.5, two 0.8, three or more 1. They often reuse the same
 * draw and B&C data, so they carry 8 of 100 points at most. */
export const publicationCredit = (named: number) => named <= 0 ? 0 : named === 1 ? 0.5 : named === 2 ? 0.8 : 1;
/** Significant county 1; above the state rate but not significant 0.4; otherwise 0. */
export const bcCredit = (c: CountyResult | null | undefined) => !c ? 0 : c.significant ? 1 : c.rateRatio > 1 ? 0.4 : 0;
export const evidenceCredit = (bc: number, publications: number) => 0.6 * bc + 0.4 * publications;

export const tierFor = (score: number): 50 | 65 | 80 | 100 => score >= 85 ? 100 : score >= 70 ? 80 : score >= 55 ? 65 : 50;

export interface IdParts { demand: number; animal: number | null; evidence: number; rut: number }
/** Weighted score. An unknown animal signal uses the neutral 0.5 and is flagged by the caller. */
export function idScore(p: IdParts): number {
  const animal = p.animal ?? 0.5;
  return Math.round((WEIGHTS.demand * p.demand + WEIGHTS.animal * animal + WEIGHTS.evidence * p.evidence + WEIGHTS.rut * p.rut) * 10) / 10;
}
