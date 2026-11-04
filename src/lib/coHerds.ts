/** Colorado herd (DAU) population estimates over time, for a set of units. Client-safe. */
export interface HerdYear { year: number; estimate: number; ratio: number | null }
export interface HerdSeries { dau: string; name: string | null; units: string[]; series: HerdYear[] }
type Report = { year: number; herds: { dau: string; name: string | null; units: string[]; estimate: number; ratio: number | null }[] };

/**
 * The herds that cover any of `units` in the latest report, each with every year's estimate. A herd is followed by its
 * DAU number; its unit list is the latest year's (CPW occasionally moves a unit between herds).
 */
export function herdSeries(reports: Report[], units: string[]): HerdSeries[] {
  const sorted = reports.slice().sort((a, b) => a.year - b.year);
  const latest = sorted[sorted.length - 1];
  if (!latest) return [];
  const daus = latest.herds.filter((h) => h.units.some((u) => units.includes(u)));
  return daus.map((h) => ({
    dau: h.dau,
    name: h.name ?? [...sorted].reverse().map((r) => r.herds.find((x) => x.dau === h.dau)?.name).find(Boolean) ?? null,
    units: h.units,
    series: sorted.flatMap((r) => {
      const x = r.herds.find((y) => y.dau === h.dau);
      return x ? [{ year: r.year, estimate: x.estimate, ratio: x.ratio }] : [];
    }),
  }));
}
