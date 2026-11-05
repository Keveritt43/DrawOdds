/** Secondary recap headline cells can be blank in the extracted PDF; all four choice totals remain available. */
export function secondaryDrawn(h: { drawnTotal: number | null; postTotals: number[][] }): number | null {
  if (h.drawnTotal !== null) return h.drawnTotal;
  if (h.postTotals.length !== 4 || h.postTotals.some((r) => r.length !== 6 || r.some((n) => !Number.isInteger(n) || n < 0))) return null;
  return h.postTotals.flat().reduce((a, b) => a + b, 0);
}
