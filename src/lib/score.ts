import { trophyQualityBonus } from './trophyTiers';
import { trophyForHunt } from './trophyHunt';
/** Absolute species benchmarks across weapons; no peer-dependent grades. */
import { successBands } from './format';
export const SCORE_VERSION = 'idaho-v6-evidence-trophy';
// Trophy is a bounded positive modifier around neutral, never redistributed.
export const SCORE_WEIGHTS = { success: 65, access: 20, crowd: 15, trophy: 10 } as const;
export type ScorePart = keyof typeof SCORE_WEIGHTS;
export const SCORE_PART_LABEL: Record<ScorePart, string> = { success: 'Success', access: 'Access', crowd: 'Elbow room', trophy: 'Trophy' };
// small once-in-a-lifetime permit counts: score from 10 hunters, not 30
const MSG = new Set(['MOOSE', 'BIGHORN', 'GOAT', 'BISON']);
export interface ScoreInput {
  id: string;
  state?: string;
  units?: string[];
  season?: string | null;
  openDate?: Date | string | null;
  closeDate?: Date | string | null;
  tagCode?:string|null;
  name?:string|null;
  takeMethod?:string|null;
  tagSeasons?:unknown;
  pointOdds?:unknown;
  species: string;
  type: string;
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
  twoPoint?: boolean;
  antlerMaximum?: boolean;
  resOdds5?: number | null;
  resOddsLast?: number | null;
  nrOddsLast?: number | null;
  oddsLastYear?: number | null;
  harvestYears?: number | null;
  youthOnly?: boolean;
  privateOnly?: boolean;
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
const finite = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export function curve(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return Math.round(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return Math.round(y0 + (x - x0) / (x1 - x0) * (y1 - y0));
  }
  return Math.round(pts[pts.length - 1][1]);
}
export function percentileRank(v: number | null | undefined, vals: number[], lowBetter = false): number | null {
  const valid = vals.filter(Number.isFinite);
  if (!finite(v) || valid.length < 4) return null;
  const p = (valid.filter(x => x < v).length + 0.5 * valid.filter(x => x === v).length) / valid.length;
  return Math.round((lowBetter ? 1 - p : p) * 100);
}
export const accessScore = (x: number | null | undefined): number | null => {
  if (!finite(x) || x < 0 || x > 100) return null;
  return Math.round(x < 50 ? x / 50 * 80 : 80 + (x - 50) / 50 * 20);
};
/** A decision index, not a probability of drawing or harvesting. Never exceeds Quality. */
export const opportunity = (quality: number | null, odds: number | null | undefined): number | null =>
  !finite(quality) || !finite(odds) || odds < 0 || odds > 1 ? null : Math.round(clamp(quality, 0, 100) * Math.sqrt(odds));
export function scoreHunts(rows: ScoreInput[]): Map<string, ScoreOutput> {
  const out = new Map<string, ScoreOutput>();
  for (const r of rows) {
    const o = { ...EMPTY };
    out.set(r.id, o);
    const trophy = r.twoPoint || r.antlerMaximum ? null : trophyForHunt({...r,state:r.state ?? 'ID',units:r.units ?? []});
    o.scoreTrophy = trophy;
    const n = r.hunters5, h = r.harvest5;
    if (!finite(n) || n < (MSG.has(r.species) ? 10 : 30) || !finite(h) || h < 0 || h > n) continue;
    const [hi, lo, top] = successBands(r.species, r.weapon, r.nrTag ? 'GENERAL' : r.type);
    const points: [number, number][] = [[0, 0], [lo, 30], [hi, 75], [top, 100]];
    // A fixed conservative prior avoids changing a hunt when unrelated peers are added.
    const k = MSG.has(r.species) ? 10 : 50;
    const success = curve((h + k * lo) / (n + k), points);
    const rawSuccess = curve(h / n, points);
    const access = accessScore(r.huntablePct ?? r.publicPct);
    const crowd = finite(r.huntersSqMi) && r.huntersSqMi >= 0
      ? curve(r.huntersSqMi, [[0, 100], [0.25, 85], [0.5, 70], [1, 50], [1.5, 38], [3, 18], [6, 0]]) : null;
    Object.assign(o, { scoreSuccess: success, scoreAccess: access, scoreCrowd: crowd, scoreTrophy: trophy });
    // Missing land or density must not silently inflate the remaining weights.
    if (access === null || crowd === null) continue;
    // Small samples attenuate the trophy adjustment too; total harvest is an upper bound on its sample.
    const trophyAdjustment = trophyQualityBonus(trophy) * h / (h + 50);
    const base = (success * SCORE_WEIGHTS.success + access * SCORE_WEIGHTS.access + crowd * SCORE_WEIGHTS.crowd) / 100;
    // Neither shrinkage nor perfect land/trophy can lift weak observed harvest into elite quality.
    const ceiling = Math.min(Math.min(rawSuccess, success) + 20, h / n < lo ? 49 : 100);
    const q = Math.round(clamp(Math.min(base + trophyAdjustment, ceiling), 0, 100));
    const resOdds = r.type === 'CONTROLLED' ? r.resOdds5 : r.nrTag && r.capped ? null : 1;
    Object.assign(o, { scoreQuality: q, scoreOppRes: opportunity(q, resOdds), scoreOppNr: opportunity(q, r.nrOdds5) });
  }
  return out;
}
