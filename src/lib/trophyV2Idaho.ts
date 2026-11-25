/** Idaho v2 trophy score: offline shadow, not wired to displayed or stored scores.
 *
 * Five parts, each a 0–1 value, weighted to 100 (owner, Nov 17: weight moved from B&C to herd):
 *  - demand 35: applicants per tag, percentile within species and weapon (Idaho is one
 *    random draw, so applicants per tag is close to 1 ÷ draw odds and isn't inflated by
 *    point-builders the way preference states are);
 *  - animal 37: herd quality per unit from IDFG's mature harvest share (mule deer 4+ points,
 *    elk 6+), percentile within species;
 *  - publications 8: named publication lists;
 *  - B&C 5: county entries over 20 years against harvest, shrunk toward the state rate. Idaho
 *    has 25 mule deer, 8 elk and 9 pronghorn entries since 2016 (81 / 29 / 25 since 2006), too
 *    few for any county to test as significant, so it is a small signal, not a test;
 *  - rut 15: days of the season inside the species' rut window, full credit at 10 days.
 *
 * Tiers keep the live 50/65/80/100 scale but are assigned by rank within species (`rankTiers`),
 * because the weights are owner-set and uncalibrated: fixed score cut-offs (85/70/55) let the
 * uncalibrated scale decide tiers. A tier therefore means "how this hunt ranks in this state for
 * this species", not an absolute size claim across states. */

export type IdSpecies = 'DEER' | 'ELK' | 'PRONGHORN';
export const WEIGHTS = { demand: 35, animal: 37, publications: 8, bc: 5, rut: 15 } as const;

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
export function rutDays(species: IdSpecies, deerType: string | null | undefined, open: string, close: string, windows: Record<string,[string,string]> = RUT_WINDOWS): number | null {
  const key = species === 'DEER' ? `DEER:${deerType === 'WHITETAIL' ? 'WHITETAIL' : 'MULE'}` : species;
  const w = windows[key], a = parse(open), b = parse(close);
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

export interface CountyInput { county: string; entries: number; units: string[] }
export interface CountyRate { county: string; entries: number; harvest: number; expected: number; shrunkRatio: number; credit: number }
/** Prior weight, in expected entries, pulling each county toward the state rate. */
export const BC_PRIOR = 2;

/** County B&C entries against the county's share of harvest. A unit counts toward every county it's
 * listed in; counties with no harvest are left out. Shrunk ratio = (entries + prior) ÷
 * (expected + prior); credit = min(1, max(0, ratio − 1)), so the state rate earns nothing and
 * double the state rate earns full credit. */
export function bcCountyRates(counties: CountyInput[], unitHarvest: Record<string, number>): CountyRate[] {
  const rows = counties.map(c => ({ ...c, harvest: c.units.reduce((s, u) => s + (unitHarvest[u] ?? 0), 0) })).filter(c => c.harvest > 0);
  const entries = rows.reduce((s, c) => s + c.entries, 0), harvest = rows.reduce((s, c) => s + c.harvest, 0);
  if (!rows.length) return [];
  return rows.map(c => {
    const expected = entries * c.harvest / harvest, shrunkRatio = (c.entries + BC_PRIOR) / (expected + BC_PRIOR);
    return { county: c.county, entries: c.entries, harvest: c.harvest, expected, shrunkRatio, credit: Math.min(1, Math.max(0, shrunkRatio - 1)) };
  });
}

/** Named publication lists (not B&C): one 0.5, two 0.8, three or more 1. They often reuse the same
 * draw and B&C data, so they carry 8 of 100 points. */
export const publicationCredit = (named: number) => named <= 0 ? 0 : named === 1 ? 0.5 : named === 2 ? 0.8 : 1;

/** Fixed cut-offs, kept for comparison only. */
export const tierFor = (score: number): 50 | 65 | 80 | 100 => score >= 85 ? 100 : score >= 70 ? 80 : score >= 55 ? 65 : 50;

/** Share of a species' hunts in each tier, top down: top 2% → 100, to top 10% → 80, to top 40% → 65.
 * This is a product choice about how generous tiers are, not evidence. The live Idaho spread
 * (2% / 7% / 17%, 5 / 16 / 39 / 176 of 236) was tried first: it put Unit 54's October rifle hunt
 * 1042 (rank 40 of 108 deer, top 37%) at 50, which the owner rejected (Nov 17). */
export const RANK_SHARES = { 100: 0.02, 80: 0.08, 65: 0.30 } as const;

/** Tier by rank within one species. Cumulative counts are rounded, with at least one hunt at 100.
 * Hunts tied on score share the higher tier, so a tie never splits across a boundary. */
export function rankTiers(scores: number[]): (50 | 65 | 80 | 100)[] {
  const n = scores.length;
  if (!n) return [];
  const c100 = Math.max(1, Math.round(RANK_SHARES[100] * n));
  const c80 = Math.max(c100, Math.round((RANK_SHARES[100] + RANK_SHARES[80]) * n));
  const c65 = Math.max(c80, Math.round((RANK_SHARES[100] + RANK_SHARES[80] + RANK_SHARES[65]) * n));
  const sorted = [...scores].sort((a, b) => b - a);
  const floorAt = (count: number) => sorted[Math.min(count, n) - 1];
  const s100 = floorAt(c100), s80 = floorAt(c80), s65 = floorAt(c65);
  return scores.map(s => s >= s100 ? 100 : s >= s80 ? 80 : s >= s65 ? 65 : 50);
}

export interface IdParts { demand: number; animal: number | null; publications: number; bc: number; rut: number }
/** Weighted score. An unknown animal signal uses the neutral 0.5 and is flagged by the caller. */
export function idScore(p: IdParts): number {
  const animal = p.animal ?? 0.5;
  return Math.round((WEIGHTS.demand * p.demand + WEIGHTS.animal * animal + WEIGHTS.publications * p.publications + WEIGHTS.bc * p.bc + WEIGHTS.rut * p.rut) * 10) / 10;
}

/** Offline comparison only. The old 35-point demand pillar is held constant;
 * timing varies by at most five points. These weights are not calibrated. */
export function idScoreNoQuota(p: Omit<IdParts,'demand'>): number {
  return Math.round((17.5 + 47 * (p.animal ?? 0.5) + 8 * p.publications + 5 * p.bc + 5 * p.rut) * 10) / 10;
}

/** Live Idaho score (owner, Nov 24). `demand` is half the raw-application percentile and half the
 * applications-per-tag percentile, within species: volume alone rewarded big easy hunts (deer 1057:
 * 2,694 applications for 2,293 tags), scarcity alone doesn't separate states where every tag is
 * hard to get. Draw odds are not added: in a random draw they are about tags / applications, the
 * same signal twice. Timing is worth at most five points. */
export const LIVE_WEIGHTS = { demand: 35, animal: 47, publications: 8, bc: 5, rut: 5 } as const;
export function idScoreApplicants(p: IdParts): number {
  const w = LIVE_WEIGHTS;
  return Math.round((w.demand * p.demand + w.animal * (p.animal ?? 0.5) + w.publications * p.publications + w.bc * p.bc + w.rut * p.rut) * 10) / 10;
}

/** Live timing windows. Deer: all of November, Idaho's rut (IDFG; East Idaho News puts the mule
 * deer peak near Nov 15), so a Nov 10–30 hunt counts as rut. The earlier Nov 1–15 window credited
 * an Oct 17–Nov 9 hunt with more rut than a Nov 10–30 hunt. Elk: mid-September to the first week
 * of October. */
export const LIVE_TIMING_WINDOWS: Record<string, [string, string]> = {
  'DEER:MULE': ['11-01', '11-30'], 'DEER:WHITETAIL': ['11-01', '11-30'], ELK: ['09-15', '10-07'], PRONGHORN: ['09-10', '10-05'],
};

export interface OrderRow { key: string; species: string; weapon: string; units: string[]; deerType?: string | null; rutDays: number; score: number }
/** Owner rule (Nov 24): for deer and elk, a hunt in the same units with the same weapon and more
 * rut days ranks above one with fewer (November deer over October; September rifle elk over
 * October). Raises the rut hunt just above the best earlier hunt; never lowers anything, and never
 * compares hunts across units or weapons. Returns the adjusted scores and which rows moved. */
export function orderByRut(rows: OrderRow[]): { scores: Map<string, number>; lifted: Map<string, string> } {
  const scores = new Map(rows.map(r => [r.key, r.score])), lifted = new Map<string, string>();
  const groups = new Map<string, OrderRow[]>();
  for (const r of rows) if (r.species === 'DEER' || r.species === 'ELK') {
    const g = `${r.species}|${r.species === 'DEER' ? (r.deerType ?? '') : ''}|${r.weapon}|${[...r.units].map(u => u.trim()).sort().join(',')}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.rutDays - b.rutDays);
    let best: { key: string; score: number } | null = null, i = 0;
    while (i < sorted.length) {
      const day = sorted[i].rutDays, same = sorted.filter(r => r.rutDays === day);
      for (const r of same) if (best && scores.get(r.key)! <= best.score) {
        scores.set(r.key, Math.round((best.score + 0.1) * 10) / 10); lifted.set(r.key, best.key);
      }
      for (const r of same) if (!best || scores.get(r.key)! > best.score) best = { key: r.key, score: scores.get(r.key)! };
      i += same.length;
    }
  }
  return { scores, lifted };
}
