/**
 * DrawOdds Score.
 *
 * Quality (0-100): how good the hunt is once you hold the tag, from four parts, blended by weight and then
 * ranked within its peer group (80 = better than 80% of hunts like it). Each part is a 0-100 rank
 * against the same kind of tag (species · general / controlled / NR tag · sex · weapon), except Access:
 *   - Success (35%): 5-yr harvest ÷ hunters, pulled toward the tag type's average when there are few hunters
 *     (so 3 of 3 doesn't read as 100%)
 *   - Access (35%): public + Access Yes! land. 50% scores 80; it climbs slowly above that and drops fast below
 *   - Elbow room (20%): fewer hunters per square mile ranks higher
 *   - Trophy (10%): share of 4+ pt mule deer / 6+ pt bulls. Left out (its weight spread over the others) for
 *     antlerless hunts, whitetail units, 2-point-only seasons and species without trophy data
 * Hunts with too few hunters (under 30 over 5 years; 10 for moose, sheep, goat) get no score.
 *
 * Opportunity (0-100): Quality × √(your 5-yr draw odds). The square root keeps a 25% draw at half its quality
 * rather than a quarter, and drops a 1% draw to a tenth. Over-the-counter tags: Opportunity = Quality.
 */

export const SCORE_WEIGHTS = { success: 35, access: 35, crowd: 20, trophy: 10 } as const;
export type ScorePart = keyof typeof SCORE_WEIGHTS;
export const SCORE_PART_LABEL: Record<ScorePart, string> = { success: 'Success', access: 'Access', crowd: 'Elbow room', trophy: 'Trophy' };

const MSG = new Set(['MOOSE', 'BIGHORN', 'GOAT']);
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
  const raw = new Map<string, { q: number; parts: Record<ScorePart, number | null> }>();
  for (const r of scored) {
    const p = peers(r);
    const nums = (f: (x: ScoreInput) => number | null | undefined, ok: (x: ScoreInput) => boolean = () => true) =>
      p.filter(ok).map(f).filter((v): v is number => v !== null && v !== undefined);
    const parts: Record<ScorePart, number | null> = {
      success: percentileRank(adj.get(r.id), p.map((x) => adj.get(x.id)!)),
      access: accessScore(r.huntablePct ?? r.publicPct),
      crowd: percentileRank(r.huntersSqMi, nums((x) => x.huntersSqMi), true),
      trophy: trophyOk(r) ? percentileRank(r.bigPct5, nums((x) => x.bigPct5, trophyOk)) : null,
    };
    if (parts.success === null) continue;
    let tot = 0;
    let w = 0;
    for (const k of Object.keys(SCORE_WEIGHTS) as ScorePart[]) {
      if (parts[k] === null) continue;
      tot += parts[k]! * SCORE_WEIGHTS[k];
      w += SCORE_WEIGHTS[k];
    }
    raw.set(r.id, { q: tot / w, parts });
  }
  // A weighted average of ranks bunches up in the middle (nothing is last at everything), which would paint
  // almost every hunt yellow. Rank the blend itself within the peer group, so 80 = better than 80% of hunts
  // like it, and the colors spread evenly.
  for (const r of scored) {
    const me = raw.get(r.id);
    if (!me) continue;
    const parts = me.parts;
    const q = percentileRank(me.q, peers(r).map((x) => raw.get(x.id)?.q).filter((v): v is number => v !== undefined)) ?? Math.round(me.q);
    // residents: general seasons and uncapped zone tags are over the counter
    const resOdds = r.type === 'CONTROLLED' ? r.resOdds5 : r.nrTag && r.capped ? null : 1;
    const nrOdds = r.type === 'CONTROLLED' ? r.nrOdds5 : r.nrOdds5;
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
  return out;
}
