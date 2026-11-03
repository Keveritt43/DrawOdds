/** Planner math, kept free of React so it can be tested. */
export interface DrawHistory { nrOdds5: number | null; nrDraw: { applied?: number[]; drew?: number[] } | null }

/** Chance of drawing at each listed choice of a nonresident general tag application (Idaho draws all 1st
 *  choices, then 2nd choices for those not yet drawn, and so on). Uses last drawing's results at that choice. */
export function tagChances(opts: (DrawHistory | undefined)[]): { at: number[]; any: number } {
  let miss = 1;
  const at: number[] = [];
  opts.forEach((o, k) => {
    const d = o?.nrDraw;
    const applied = d?.applied?.[k] ?? 0;
    const drew = d?.drew?.[k] ?? 0;
    // no history at this choice: the tag either filled earlier (0) or nobody listed it here (use its 1st-choice odds)
    const p = !o ? 0 : applied > 0 ? Math.min(1, drew / applied) : k === 0 ? o.nrOdds5 ?? 0 : d?.drew?.slice(1).some((x) => x > 0) ? 1 : 0;
    at.push(miss * p);
    miss *= 1 - p;
  });
  return { at, any: 1 - miss };
}

