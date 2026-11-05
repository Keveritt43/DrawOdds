/** A bounded range of last-draw preference-point thresholds; both ends are independently filterable. */
export function pointRange(min: unknown, max: unknown): { min: number | null; max: number | null } {
  const parse = (x: unknown) =>
    x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Math.max(0, Math.min(40, Math.floor(Number(x)))) : null;
  const a = parse(min),
    b = parse(max);
  return a !== null && b !== null && a > b ? { min: b, max: a } : { min: a, max: b };
}
