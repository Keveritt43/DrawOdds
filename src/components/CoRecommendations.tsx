import { HuntLink } from '@/components/HuntNavigation';
import type { HuntSummary } from "@prisma/client";
export function CoRecommendations({
  rows,
}: {
  rows: { r: HuntSummary; odds: number | null }[];
}) {
  const eligible = rows.filter(
      (x) => !x.r.smallSample && x.r.success5 !== null && x.odds !== null,
    ),
    used = new Set<string>();
  const take = (label: string, ordered: typeof rows) => {
    const x = ordered.find((x) => !used.has(x.r.id));
    if (!x) return null;
    used.add(x.r.id);
    return (
      <li key={label}>
        <span className="pick-label">{label}</span>
        <HuntLink href={"/hunts/" + x.r.slug}>{x.r.name}</HuntLink> ·{" "}
        {Math.round((x.odds ?? 0) * 100)}% odds ·{" "}
        {Math.round((x.r.success5 ?? 0) * 100)}% success
      </li>
    );
  };
  return (
    <details className="picks">
      <summary>Recommended Tags</summary>
      <p className="small muted">
        Based on the current filters and your selected point pool. Small harvest
        samples are excluded.
      </p>
      <ol>
        {take(
          "Best chance to fill",
          eligible
            .slice()
            .sort(
              (a, b) =>
                (b.odds ?? 0) * b.r.success5! - (a.odds ?? 0) * a.r.success5!,
            ),
        )}
        {take(
          "Highest success you can draw",
          eligible
            .filter((x) => (x.odds ?? 0) >= 0.1)
            .sort((a, b) => b.r.success5! - a.r.success5!),
        )}
        {take(
          "Least crowded",
          eligible
            .filter((x) => (x.odds ?? 0) >= 0.1 && x.r.huntersSqMi !== null)
            .sort((a, b) => a.r.huntersSqMi! - b.r.huntersSqMi!),
        )}
      </ol>
      <p className="small muted">
        Top trophy hunt: not ranked for Colorado. Verified antler-size
        measurements are not available; applicant demand and antlered/antlerless harvest totals
        alone do not establish trophy quality.
      </p>
    </details>
  );
}
