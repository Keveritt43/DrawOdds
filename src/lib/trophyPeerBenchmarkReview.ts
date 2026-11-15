/**
 * Historical peer comparisons. Inputs are matched to the archived population and year;
 * sparse cohorts remain provisional and comparisons do not establish animal size.
 */
import data from '../../data/trophy-peer-benchmarks-review.json';

export type PeerPool = 'Resident' | 'Nonresident' | 'NR Regular' | 'NR Special' | 'Combined';
export type PeerMeasure = 'Applications' | 'Observed cutoff points';
export interface PeerLookup {
  state: string;
  species: string;
  year: number;
  code: string;
  pool: PeerPool;
  measure: PeerMeasure;
  /** Current observation must exactly match the archived input, including its reporting year. */
  value: number;
}

const key = (x: {state:string; species:string; year:number; code:string; pool:string; measure:string}) =>
  [x.state.toUpperCase(),x.species.toUpperCase(),x.year,x.code.toUpperCase(),x.pool,x.measure].join('|');
const groupKey = (x: {state:string; species:string; year:number; cohort:string; pool:string; measure:string}) =>
  [x.state,x.species,x.year,x.cohort,x.pool,x.measure].join('|');
const rows = new Map(data.observations.map(row => [key(row),row]));
const groups = new Map(data.benchmarks.map(group => [groupKey(group),group]));
const distributions = new Map<string,number[]>();
for (const row of data.observations) {
  const k=groupKey(row),values=distributions.get(k)??[];
  values.push(row.value);distributions.set(k,values);
}

/**
 * Return a descriptive within-pool screen; missing, stale, or small comparisons are unknown.
 * A cutoff is not a claim about animal size, odds, or future points needed to draw.
 */
export function reviewTrophyPeerBenchmark(input:PeerLookup) {
  if (!Number.isFinite(input.value) || input.value < 0) return null;
  const row=rows.get(key(input));
  if (!row || row.value !== input.value) return null;
  const group=groups.get(groupKey(row));
  if (!group || group.n<10 || group.p90===null || group.p75===null) return null;
  const values=distributions.get(groupKey(row))??[];
  const percentile=100*(values.filter(value=>value<input.value).length+values.filter(value=>value===input.value).length/2)/values.length;
  return { cohort:group.cohort, peers:group.n, p75:group.p75, p90:group.p90,
    high:input.value>=group.p75, exceptional:input.value>=group.p90,
    percentile,provisional:group.n<30, year:group.year };
}
