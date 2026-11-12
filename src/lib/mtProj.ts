/**
 * Montana bonus-point draws: the next-draw projection. Client-safe.
 *
 * FWP's drawing is a weighted lottery: each applicant gets level² + 1 chances (level = points used, banked + the one
 * bought; an applicant who buys no point gets 1). Re-running that rule on the last draw's own applicants and
 * licences gives a smooth curve by points, instead of the printed rates, which jump around wherever a level had a
 * handful of applicants and stop where the last applicant did.
 *
 * Backtest (scripts/mt_backtest.py, docs/states/mt-onboarding.md §19): Brier over every first-choice applicant,
 * 2024-2026, each draw predicted from the one before only. This "same applicants, same licences" rule beat the
 * last draw's printed odds every year (0.1068 vs 0.1088, 0.1078 vs 0.1099, 0.1048 vs 0.1072) and in all 12 licence
 * type × pool cells. It is what ships, because it needs nothing the next draw hasn't published yet. (Knowing the
 * drawn year's quota helps more, 0.1039/0.1001/0.0939, but 2027's quotas aren't out.)
 *
 * The solver is the successive-sampling approximation of a weighted draw without replacement:
 *   p(L) = 1 - exp(-w(L) t), with t chosen so the expected winners equal the licences the pool gave first choices.
 * The nonresident combination draw is NOT projected: no forecast beat its last draw (same doc).
 */
import type { MtPointOdds, MtPool } from './mtHunt';

export interface MtProjection { res: number[] | null; nr: number[] | null; noBuy: Record<MtPool, number | null> }

/** Highest banked balance an array covers (src/lib/mtPoints.ts MT_BONUS_MAX). */
const TOP = 40;
const cache = new WeakMap<object, MtProjection | null>();

const weight = (level: number, buying: boolean) => (buying ? level * level + 1 : 1);

/** t for the weighted draw, or Infinity when every applicant draws, 0 when nobody does. */
export function mtSolve(counts: { level: number; buying: boolean; n: number }[], winners: number): number {
  const total = counts.reduce((a, c) => a + c.n, 0);
  if (winners <= 0 || !total) return 0;
  if (winners >= total) return Infinity;
  const expected = (t: number) => counts.reduce((a, c) => a + c.n * (1 - Math.exp(-weight(c.level, c.buying) * t)), 0);
  let lo = 0, hi = 1;
  while (expected(hi) < winners) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (expected(mid) < winners) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const mtChance = (t: number, level: number, buying: boolean) =>
  t === Infinity ? 1 : 1 - Math.exp(-weight(level, buying) * t);

function pool(po: MtPointOdds, p: MtPool): { arr: number[] | null; noBuy: number | null } {
  const x = po.pools?.[p];
  if (!x || !x.levels.length) return { arr: null, noBuy: null };
  const counts = x.levels.map(([pts, n]) => ({ level: pts === '' || pts === '0' ? 0 : Math.floor(Number(pts)), buying: !(pts === '' || pts === '0'), n }));
  const t = mtSolve(counts, x.succ[0] ?? 0);
  // index N = banked points, FWP's level N + 1 when buying
  const arr = Array.from({ length: TOP + 1 }, (_, n) => Math.round(mtChance(t, n + 1, true) * 1e4) / 1e4);
  return { arr, noBuy: Math.round(mtChance(t, 0, false) * 1e4) / 1e4 };
}

/** The projected next-draw odds for a drawn Montana licence, or null if it has no draw by points. */
export function mtProjected(po: MtPointOdds | null | undefined): MtProjection | null {
  if (!po || po.kind !== 'bonus' || !po.pools) return null;
  if (cache.has(po)) return cache.get(po)!;
  const r = pool(po, 'res'), n = pool(po, 'nr');
  const out = r.arr || n.arr ? { res: r.arr, nr: n.arr, noBuy: { res: r.noBuy, nr: n.noBuy } } : null;
  cache.set(po, out);
  return out;
}
