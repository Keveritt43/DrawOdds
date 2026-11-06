import { sortedSeasons, seasonsClass } from "./tagSeasons";
import { seasonDays, dayIndex } from "./seasonDays";
export interface SeasonFilters {
  youth: "exclude" | "include" | "only";
  antler: string[];
  weapon: string[];
  months: number[];
  dayFrom: number | null;
  dayTo: number | null;
  dayMode: "open" | "end";
}
export function matchesHuntSeason(
  r: {
    tagSeasons?: unknown;
    openDate: Date | null;
    closeDate: Date | null;
    youthOnly: boolean;
    antlerClass: string;
    weapon: string;
  },
  f: SeasonFilters,
  strictSeason = false,
): boolean {
  if (!strictSeason && f.antler.length && r.antlerClass !== 'EITHER' && !f.antler.includes(r.antlerClass)) return false;
  const seasons = sortedSeasons(r.tagSeasons);
  if (!seasons.length) {
    if (f.antler.length && r.antlerClass !== 'EITHER' && !f.antler.includes(r.antlerClass)) return false;
    if (strictSeason && f.weapon.length && !f.weapon.includes(r.weapon)) return false;
    if (
      (f.youth === "exclude" && r.youthOnly) ||
      (f.youth === "only" && !r.youthOnly)
    )
      return false;
    return dates(
      r.openDate && r.closeDate
        ? [{ open: r.openDate, close: r.closeDate }]
        : [],
      f,
    );
  }
  const eligible = seasons.filter((s) => {
    const youth = (strictSeason && r.youthOnly) || /youth/i.test(s.sex + " " + s.notes);
    if ((f.youth === "exclude" && youth) || (f.youth === "only" && !youth))
      return false;
    if (f.weapon.length && !f.weapon.includes(s.weapon)) return false;
    const antler = seasonsClass([s]);
    if (strictSeason && f.antler.length && antler !== 'EITHER' && !f.antler.includes(antler)) return false;
    return true;
  });
  return eligible.some((s) =>
    dates(
      s.dates.map((d) => ({
        open: new Date(d.open),
        close: new Date(d.close),
      })),
      f,
    ),
  );
}
function dates(spans: { open: Date; close: Date }[], f: SeasonFilters) {
  if (!f.months.length && f.dayFrom === null) return true;
  const days = seasonDays(spans).filter(d=>!f.months.length||f.months.includes(new Date(Date.UTC(2001,6,1+d)).getUTCMonth()+1));
  if (
    f.months.length &&
    !days.some((d) =>
      f.months.includes(new Date(Date.UTC(2001, 6, 1 + d)).getUTCMonth() + 1),
    )
  )
    return false;
  if (f.dayFrom === null || f.dayTo === null) return true;
  return f.dayMode === "end"
    ? spans.some(
        (s) => dayIndex(s.close) >= f.dayFrom! && dayIndex(s.close) <= f.dayTo!,
      )
    : days.some((d) => d >= f.dayFrom! && d <= f.dayTo!);
}
