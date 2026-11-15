/** Prerequisite licenses for the shared Application Planner. Pure and client-safe. */
export interface PlanPrereq { label: string; amount: number; covers: string[]; group?: string }

/** The cheapest set of prerequisite licenses covering every need (brute force: a state has a handful). */
export function cheapestPrereqs(prereq: PlanPrereq[], needs: string[], group?: string): PlanPrereq[] | null {
  const need = [...new Set(needs)];
  if (!need.length) return [];
  const pool = prereq.filter((p) => (p.group ?? '') === (group ?? ''));
  let best: PlanPrereq[] | null = null, bestCost = Infinity;
  for (let m = 1; m < 1 << pool.length; m++) {
    const set = pool.filter((_, i) => m & (1 << i));
    if (!need.every((n) => set.some((p) => p.covers.includes(n)))) continue;
    const c = set.reduce((t, p) => t + p.amount, 0);
    if (c < bestCost) { best = set; bestCost = c; }
  }
  return best;
}
