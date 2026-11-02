/**
 * Data-driven map shading. Fixed scales waste colors: if 90% of units are over 75% public land, a 0/25/50/75
 * scale paints nearly everything the same. Instead each metric gets class breaks from its own distribution
 * (quantiles, so each shade holds a similar number of units), rounded to the coarsest "nice" step that still
 * keeps the classes distinct and reasonably balanced. Everything below the first break is one "< x" class.
 */

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** 1, 2, 5, 10, 20, 50 ... at or below x. */
function niceFloor(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

/** Candidate rounding steps from coarse to fine. */
function steps(span: number): number[] {
  const out: number[] = [];
  let s = niceFloor(span / 2);
  for (let i = 0; i < 12 && s > 0; i++) {
    out.push(s);
    const p = 10 ** Math.floor(Math.log10(s));
    const f = Math.round(s / p);
    s = f === 5 ? 2 * p : f === 2 ? p : 0.5 * p;
  }
  return out;
}

const fix = (x: number) => Number(x.toPrecision(10));

export interface Classes {
  breaks: number[]; // ascending; class i covers [breaks[i-1], breaks[i]), first class is "< breaks[0]"
  counts: number[]; // units in each class (breaks.length + 1)
}

export function countClasses(values: number[], breaks: number[]): number[] {
  const counts = new Array(breaks.length + 1).fill(0);
  for (const v of values) {
    let c = 0;
    while (c < breaks.length && v >= breaks[c]) c++;
    counts[c]++;
  }
  return counts;
}

export function classBreaks(values: number[], k = 6): Classes {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 4) return { breaks: [], counts: [v.length] };
  k = Math.max(2, Math.min(k, Math.floor(v.length / 4)));
  const qs = Array.from({ length: k - 1 }, (_, i) => quantile(v, (i + 1) / k));
  const min = v[0];
  const max = v[v.length - 1];
  const span = (quantile(v, 0.95) - quantile(v, 0.05)) || max - min;
  if (span <= 0) return { breaks: [], counts: [v.length] };

  const ideal = v.length / k;
  let best: Classes | null = null;
  let bestScore = -Infinity;
  for (const s of steps(span)) {
    const breaks = [...new Set(qs.map((q) => fix(Math.round(q / s) * s)))].filter((b) => b > min && b <= max).sort((a, b) => a - b);
    if (!breaks.length) continue;
    const counts = countClasses(v, breaks);
    // balanced enough: no class under half an even share, no class over 2.2x (lumps at 0 or 100 are allowed
    // to be bigger - they're real)
    const balanced = counts.every((c) => c >= ideal * 0.5) && counts.slice(1, -1).every((c) => c <= ideal * 2.2);
    // prefer: all k classes, balanced, then the coarsest (most readable) step - we walk coarse to fine
    const score = breaks.length * 10 + (balanced ? 5 : 0);
    if (score > bestScore) {
      best = { breaks, counts };
      bestScore = score;
    }
    if (breaks.length === k - 1 && balanced) break;
  }
  return best ?? { breaks: [], counts: [v.length] };
}
