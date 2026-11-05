export interface SeasonContext {
  id: string;
  state: string;
  species: string;
  units: string[];
  openDate: Date | null;
  closeDate: Date | null;
  tagSeasons?: unknown;
}
function spans(h: SeasonContext): [number, number][] {
  const ts = h.tagSeasons as { seasons?: { dates?: { open: string; close: string }[] }[] } | null;
  const ranges = (ts?.seasons ?? [])
    .flatMap((s) => s.dates ?? [])
    .map((d) => [Date.parse(d.open), Date.parse(d.close)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
  // Compare complete UTC calendar days so noon vs midnight storage does not change overlap.
  const day = (n: number) => Math.floor(n / 86400000);
  if (ranges.length) return ranges.map(([a, b]) => [day(a), day(b)]);
  return h.openDate && h.closeDate ? [[day(+h.openDate), day(+h.closeDate)]] : [];
}
export function overlapsElk(target: SeasonContext, candidate: SeasonContext): boolean {
  if (
    candidate.id === target.id ||
    target.state !== candidate.state ||
    candidate.species !== 'ELK' ||
    !candidate.units.some((u) => target.units.includes(u))
  )
    return false;
  return spans(target).some(([a, b]) => spans(candidate).some(([c, d]) => a <= d && c <= b));
}
