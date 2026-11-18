import type { MatchStat } from '@/components/HuntMap';

// Field order of a packed map stat. Combined Find Hunts sends one array per unit instead of an object with
// eleven named fields: across every state that was ~250 KB of a ~490 KB page (Nov 18, 2026).
export const MATCH_STAT_FIELDS = ['trophy', 'score', 'odds', 'fill', 'success', 'crowd', 'public', 'huntable', 'objBull', 'objCow', 'wilderness'] as const satisfies readonly (keyof MatchStat)[];
export type PackedStats = Record<string, (number | null)[]>;

// Four significant figures: far finer than any map class break (the finest is 0.05 success steps,
// or 2% odds), and it keeps small densities such as 0.00012 hunters/sq mi distinct from zero.
const sig = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)));

export function packStats(units: Record<string, MatchStat>): PackedStats {
  const out: PackedStats = {};
  for (const [key, s] of Object.entries(units)) {
    const row = MATCH_STAT_FIELDS.map(f => sig(s[f]));
    while (row.length && row[row.length - 1] === null) row.pop();
    out[key] = row;
  }
  return out;
}

export function unpackStats(packed: PackedStats): Record<string, MatchStat> {
  const out: Record<string, MatchStat> = {};
  for (const [key, row] of Object.entries(packed))
    out[key] = Object.fromEntries(MATCH_STAT_FIELDS.map((f, i) => [f, row[i] ?? null])) as MatchStat;
  return out;
}
