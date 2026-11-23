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
  const ts = h.tagSeasons as { seasons?: { uncertain?:boolean; dates?: { open: string; close: string }[] }[] } | null;
  const ranges = (ts?.seasons ?? [])
    .filter(s=>!s.uncertain)
    .flatMap((s) => s.dates ?? [])
    .map((d) => [Date.parse(d.open), Date.parse(d.close)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
  // Compare complete UTC calendar days so noon vs midnight storage does not change overlap.
  const day = (n: number) => Math.floor(n / 86400000);
  if (ranges.length) return ranges.map(([a, b]) => [day(a), day(b)]);
  if(ts?.seasons?.some(s=>s.uncertain)) return [];
  return h.openDate && h.closeDate && Number.isFinite(+h.openDate) && Number.isFinite(+h.closeDate) && +h.closeDate >= +h.openDate
    ? [[day(+h.openDate), day(+h.closeDate)]] : [];
}
/** Unknown dates must not be treated as evidence that no OTC season overlaps. */
export function otcElkOverlap(target: SeasonContext, candidates: SeasonContext[]): boolean | null {
  if (!spans(target).length) return null;
  const relevant = candidates.filter(c => c.state === target.state && c.species === 'ELK' && c.units.some(u => target.units.includes(u)));
  if (relevant.some(c => overlapsElk(target,c))) return true;
  const uncertain=(h:SeasonContext)=>(h.tagSeasons as {seasons?:{uncertain?:boolean}[]}|null)?.seasons?.some(s=>s.uncertain)??false;
  return uncertain(target)||relevant.some(c => uncertain(c)||!spans(c).length) ? null : false;
}
/** Actual shared open days, with gaps retained and duplicate/adjacent spans merged. */
export function overlappingElkDates(target: SeasonContext, candidate: SeasonContext): [Date, Date][] {
  if (
    candidate.id === target.id ||
    target.state !== candidate.state ||
    candidate.species !== 'ELK' ||
    !candidate.units.some((u) => target.units.includes(u))
  ) return [];
  const intersections = spans(target).flatMap(([a,b]) => spans(candidate)
    .filter(([c,d]) => a <= d && c <= b)
    .map(([c,d]): [number,number] => [Math.max(a,c),Math.min(b,d)]))
    .sort((x,y) => x[0]-y[0] || x[1]-y[1]);
  const merged:[number,number][]=[];
  for(const [start,end] of intersections){
    const last=merged[merged.length-1];
    if(last && start<=last[1]+1) last[1]=Math.max(last[1],end);
    else merged.push([start,end]);
  }
  return merged.map(([start,end])=>[new Date(start*86400000),new Date(end*86400000)]);
}
export function overlapsElk(target: SeasonContext, candidate: SeasonContext): boolean {
  return overlappingElkDates(target,candidate).length>0;
}
