import { createHash } from 'node:crypto';
import { scoreHunts, SCORE_VERSION, type ScoreInput, type ScoreOutput } from './score';
export type ScoreSnapshot = { input: ScoreInput; before: ScoreOutput }[];
export const scoreDigest = (rows: ScoreSnapshot) => createHash('sha256').update(JSON.stringify(rows.slice().sort((a,b)=>a.input.id.localeCompare(b.input.id)))).digest('hex');
export function scorePlan(rows: ScoreSnapshot) {
  const scores=scoreHunts(rows.map(r=>r.input));
  return { version:SCORE_VERSION, state:'ID', digest:scoreDigest(rows), rows:rows.map(r=>({id:r.input.id,before:r.before,after:scores.get(r.input.id)!})) };
}
export function validateScorePlan(saved: unknown, current: ScoreSnapshot) {
  const fresh=scorePlan(current);
  // Exact match protects both against stale source data and tampered/older proposed updates.
  if(JSON.stringify(saved)!==JSON.stringify(fresh)) throw new Error('Score plan differs from current Idaho inputs, stored scores or model. Generate and review a fresh plan.');
  return fresh;
}
