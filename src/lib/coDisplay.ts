/** "Nov 6 – Nov 14, 2027" */
export function dateRange(a: Date | null, b: Date | null): string {
  if (!a || !b) return '';
  const f = (d: Date, y = false) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return `${f(a)} – ${f(b, true)}`;
}

/** "6 (60%)": the level licenses ran out at and the share drawn there. */
export function fmtNeed(pts: number | null, share: number | null): string {
  if (pts === null) return '–';
  if (share === null || share >= 0.995) return String(pts);
  return `${pts} (${Math.round(share * 100)}%)`;
}
export function fmtCreep(c: number | null): string {
  if (c === null) return '–';
  if (Math.abs(c) < 0.1) return 'flat';
  return `${c > 0 ? '+' : ''}${c.toFixed(1)}/yr`;
}
