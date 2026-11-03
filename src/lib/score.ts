/**
 * DrawOdds Score.
 *
 * Quality (0-100): how good the hunt is once you hold the tag. Four parts, each on a fixed scale that means the
 * same thing for every hunt of a species (so a controlled hunt and a general tag can be compared, and the bars
 * agree with the "High for deer" / "Uncrowded" chips):
 *   - Success (35%): 5-yr harvest ÷ hunters against the species' bands, scaled for the weapon (archery deer
 *     at 25% is as good as rifle deer at 55%). "Low" edge = 40, "High" edge = 75. Few hunters: pulled toward
 *     the average for hunts like it, so 3 of 3 doesn't read as 100%.
 *   - Access (35%): public + Access Yes! land. 50% scores 80; it climbs slowly above that and drops fast below.
 *   - Elbow room (20%): hunters per square mile. 0.5 ("uncrowded" edge) = 70, 1.5 ("crowded") = 38.
 *   - Trophy (10%): share of bucks / bulls that were 4+ pt mule deer / 6+ pt bulls. 25% = 45, 50% = 75, 75% = 100.
 *     Left out (weight spread over the others) for antlerless hunts, whitetail units, 2-point-only seasons and
 *     species without trophy data.
 * Hunts with too few hunters (under 30 over 5 years; 10 for moose, sheep, goat) get no score.
 *
 * Opportunity (0-100): Quality × √(your 5-yr draw odds), ranked among the same kind of hunt (species · general /
 * controlled / tag · sex · weapon), per residency: which long shots are the best bets among hunts like them.
 * Over-the-counter tags count as 100% odds.
 */

export const SCORE_WEIGHTS = { success: 35, access: 35, crowd: 20, trophy: 10 } as const;
export type ScorePart = keyof typeof SCORE_WEIGHTS;
export const SCORE_PART_LABEL: Record<ScorePart, string> = { success: 'Success', access: 'Access', crowd: 'Elbow room', trophy: 'Trophy' };

import { successBands } from './format';

const MSG = new Set(['MOOSE', 'BIGHORN', 'GOAT']);

/** Piecewise-linear 0-100 through [x, score] points (x ascending; flat beyond the ends). */
export function curve(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return Math.round(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
  }
  return Math.round(pts[pts.length - 1][1]);
}
/** hunters per sq mi -> elbow room: 0.5 (the "uncrowded" edge) = 70, 1.5 ("crowded") = 38 */
const CROWD_CURVE: [number, number][] = [[0, 100], [0.25, 85], [0.5, 70], [1, 50], [1.5, 38], [3, 18], [6, 0]];
/** trophy share of bucks / bulls taken */
const TROPHY_CURVE: [number, number][] = [[0, 0], [0.25, 45], [0.5, 75], [0.75, 100]];
/** a peer group smaller than this falls back to species · kind · sex (all weapons) */
const MIN_PEERS = 8;

export interface ScoreInput {
  id: string;
  species: string;
  type: string; // GENERAL | CONTROLLED
  nrTag?: boolean | null;
  weapon: string;
  antlerClass: string;
  hunters5?: number | null;
  harvest5?: number | null;
  huntersSqMi?: number | null;
  publicPct?: number | null;
  huntablePct?: number | null;
  bigPct5?: number | null;
  deerType?: string | null;
  twoPoint?: boolean; // antlered seasons are 2-point only
  resOdds5?: number | null;
  nrOdds5?: number | null;
  capped?: boolean | null;
}

export interface ScoreOutput {
  scoreQuality: number | null;
  scoreSuccess: number | null;
  scoreAccess: number | null;
  scoreCrowd: number | null;
  scoreTrophy: number | null;
  scoreOppRes: number | null;
  scoreOppNr: number | null;
}

const EMPTY: ScoreOutput = { scoreQuality: null, scoreSuccess: null, scoreAccess: null, scoreCrowd: null, scoreTrophy: null, scoreOppRes: null, scoreOppNr: null };

const sexGroup = (a: string) => (a === 'ANTLERED' ? 'male' : a === 'ANTLERLESS' ? 'female' : 'either');
const kindOf = (r: ScoreInput) => (r.nrTag ? 'TAG' : r.type);

/** Percentile rank 0-100 of v among vals (ties count half). Null with fewer than 4 values. */
export function percentileRank(v: number | null | undefined, vals: number[], lowBetter = false): number | null {
  if (v === null || v === undefined || vals.length < 4) return null;
  let below = 0;
  let eq = 0;
  for (const x of vals) {
    if (x < v) below++;
    else if (x === v) eq++;
  }
  const p = (below + 0.5 * eq) / vals.length;
  return Math.round((lowBetter ? 1 - p : p) * 100);
}

/** Public + Access Yes! % to 0-100: 50% = 80 (the line that matters), 100% = 100, 25% = 40. */
export const accessScore = (huntable: number | null | undefined): number | null =>
  huntable === null || huntable === undefined ? null : Math.round(huntable < 50 ? (huntable / 50) * 80 : 80 + ((Math.min(100, huntable) - 50) / 50) * 20);

/** Quality × √odds, rounded. */
export const opportunity = (quality: number | null, odds: number | null | undefined): number | null =>
  quality === null || odds === null || odds === undefined ? null : Math.round(quality * Math.sqrt(Math.max(0, Math.min(1, odds))));

export function scoreHunts(rows: ScoreInput[]): Map<string, ScoreOutput> {
  const minHunters = (r: ScoreInput) => (MSG.has(r.species) ? 10 : 30);
  const scored = rows.filter((r) => (r.hunters5 ?? 0) >= minHunters(r));
  const key1 = (r: ScoreInput) => `${r.species}|${kindOf(r)}|${sexGroup(r.antlerClass)}|${r.weapon}`;
  const key2 = (r: ScoreInput) => `${r.species}|${kindOf(r)}|${sexGroup(r.antlerClass)}`;
  const g1 = new Map<string, ScoreInput[]>();
  const g2 = new Map<string, ScoreInput[]>();
  for (const r of scored) {
    (g1.get(key1(r)) ?? g1.set(key1(r), []).get(key1(r))!).push(r);
    (g2.get(key2(r)) ?? g2.set(key2(r), []).get(key2(r))!).push(r);
  }
  const peers = (r: ScoreInput) => (g1.get(key1(r))!.length >= MIN_PEERS ? g1.get(key1(r))! : g2.get(key2(r))!);

  // success, shrunk toward the peer group's pooled rate (worth K hunter-seasons)
  const adj = new Map<string, number>();
  const pooled = new Map<ScoreInput[], number>();
  for (const r of scored) {
    const p = peers(r);
    if (!pooled.has(p)) {
      const h = p.reduce((a, x) => a + (x.hunters5 ?? 0), 0);
      pooled.set(p, h ? p.reduce((a, x) => a + Math.min(x.harvest5 ?? 0, x.hunters5 ?? 0), 0) / h : 0);
    }
    const K = MSG.has(r.species) ? 10 : 50;
    adj.set(r.id, (Math.min(r.harvest5 ?? 0, r.hunters5!) + K * pooled.get(p)!) / (r.hunters5! + K));
  }
  const trophyOk = (r: ScoreInput) =>
    r.bigPct5 !== null && r.bigPct5 !== undefined && r.antlerClass !== 'ANTLERLESS' && r.deerType !== 'WHITETAIL' && !r.twoPoint;

  const out = new Map<string, ScoreOutput>();
  for (const r of rows) out.set(r.id, { ...EMPTY });
  for (const r of scored) {
    const [hi, lo, top] = successBands(r.species, r.weapon, r.nrTag ? 'GENERAL' : r.type);
    const parts: Record<ScorePart, number | null> = {
      success: curve(adj.get(r.id)!, [[0, 0], [lo, 40], [hi, 75], [top, 100]]),
      access: accessScore(r.huntablePct ?? r.publicPct),
      crowd: r.huntersSqMi === null || r.huntersSqMi === undefined ? null : curve(r.huntersSqMi, CROWD_CURVE),
      trophy: trophyOk(r) ? curve(r.bigPct5!, TROPHY_CURVE) : null,
    };
    let tot = 0;
    let w = 0;
    for (const k of Object.keys(SCORE_WEIGHTS) as ScorePart[]) {
      if (parts[k] === null) continue;
      tot += parts[k]! * SCORE_WEIGHTS[k];
      w += SCORE_WEIGHTS[k];
    }
    const q = Math.round(tot / w);
    // residents: general seasons and uncapped zone tags are over the counter
    const resOdds = r.type === 'CONTROLLED' ? r.resOdds5 : r.nrTag && r.capped ? null : 1;
    const nrOdds = r.nrOdds5;
    out.set(r.id, {
      scoreQuality: q,
      scoreSuccess: parts.success,
      scoreAccess: parts.access,
      scoreCrowd: parts.crowd,
      scoreTrophy: parts.trophy,
      scoreOppRes: opportunity(q, resOdds),
      scoreOppNr: opportunity(q, nrOdds),
    });
  }
  // Opportunity, like Quality, is ranked within the peer group (per residency): every good bull elk hunt is a
  // long shot, so the useful question is which long shots are the best bets among hunts like it.
  const rawOpp = new Map([...out].map(([id, o]) => [id, { res: o.scoreOppRes, nr: o.scoreOppNr }]));
  for (const r of scored) {
    const o = out.get(r.id)!;
    if (o.scoreQuality === null) continue;
    for (const [k, f] of [['res', 'scoreOppRes'], ['nr', 'scoreOppNr']] as const) {
      const mine = rawOpp.get(r.id)![k];
      const vals = peers(r).map((x) => rawOpp.get(x.id)?.[k]).filter((v): v is number => v !== null && v !== undefined);
      o[f] = mine === null ? null : percentileRank(mine, vals) ?? mine;
    }
  }
  return out;
}
