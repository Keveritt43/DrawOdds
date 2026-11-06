import type { HuntSummary } from "@prisma/client";
import { coSeasonKind } from '@/lib/coSeasonKind';
import { overlapsElk } from "@/lib/overlappingSeasons";
import { db } from "@/lib/db";
import type { UnitTables } from "@/sync/co/harvest";
const labels: Record<string, string> = {
  rifle1: "1st Rifle",
  rifle2: "2nd Rifle",
  rifle3: "3rd Rifle",
  rifle4: "4th Rifle",
  archery: "Archery",
  muzzle: "Muzzleloader",
};
/** Unit/season survey estimates, never a statewide OTC code total assigned to one unit. */
export async function CoUnitSeasonHunters({ units, hunt }: { units: string[]; hunt?: HuntSummary }) {
  const reports = await db.stateReport.findMany({
    where: { state: "CO", kind: "harvest-unit" },
    orderBy: { year: "desc" },
  });
  const codes = await db.huntSummary.findMany({
    where: { state: "CO", units: { hasSome: units } },
    orderBy: { tagCode: "asc" },
  });
  const matches = (r: HuntSummary) => !hunt || r.id === hunt.id || overlapsElk(hunt, {...r, species: 'ELK'});
  const relevant = codes.filter(matches);
  const latestCodes = relevant.flatMap((r) => {
    if (r.type === "GENERAL" && (!hunt || r.species !== "ELK" || !overlapsElk(hunt, r))) return [];
    const hs =
      (
        r.pointOdds as {
          harvest?: {
            year: number;
            basis: string;
            hunters: number;
            harvest: number;
          }[];
        } | null
      )?.harvest ?? [];
    const h = hs
      .filter((x) => x.basis === "code")
      .sort((a, b) => b.year - a.year)[0];
    return h ? [{ r, h }] : [];
  });
  const year = reports[0]?.year;
  if (!year) return null;
  const latest = reports.filter((r) => r.year === year);
  return (
    <section style={{ marginTop: 28 }}>
      {latestCodes.length > 0 && (
        <>
          <h2>Hunters By Hunt Code</h2>
          <p className="small muted">
            Latest code-specific estimates. Multi-unit codes are labeled “Multiple”; counts spanning multiple units are not assigned to one unit.
            OTC counts are unavailable by unit; other code counts cover all listed units. Do not add overlapping tag counts as unique hunters.
          </p>
          <div className="htable-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hunt code</th>
                  <th>Season</th>
                  <th>Survey year</th>
                  <th>Covered units</th>
                  <th>Hunters</th>
                  <th>Harvest</th>
                  <th>Harvest %</th>
                </tr>
              </thead>
              <tbody>
                {latestCodes.map(({ r, h }) => (
                  <tr key={r.id}>
                    <td>
                      <a href={"/hunts/" + r.slug}>{r.tagCode}</a>
                    </td>
                    <td>{r.takeMethod}</td>
                    <td>{h.year}</td>
                    <td>{r.units.length > 1 ? "Multiple" : r.units.join(", ")}</td>
                    <td>{r.type === "GENERAL" ? "—" : h.hunters.toLocaleString()}</td>
                    <td>{r.type === "GENERAL" ? "—" : h.harvest.toLocaleString()}</td>
                    <td>{r.type !== "GENERAL" && h.hunters > 0 && h.harvest <= h.hunters ? `${Math.round(h.harvest / h.hunters * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h2>Hunters In These Units By Season</h2>
      <p className="small muted">
        CPW {year} unit/season estimates, all licenses in each season. {hunt && "Only seasons with a loaded hunt sharing a unit and overlapping an open date are shown."} These
        show hunting pressure across tags; counts are not limited to your tag
        and should not be added across overlapping hunt codes. Exact 2025 code
        counts remain in each hunt’s harvest history.
      </p>
      <div className="htable-wrap">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Species</th>
              <th>Season</th>
              <th>Hunters</th>
              <th>Harvest</th>
              <th>Harvest %</th>
              <th>Hunters/mi²</th>
            </tr>
          </thead>
          <tbody>
            {await Promise.all(
              units.map(async (unit) => {
                const area = await db.unit.findUnique({
                  where: { state_name: { state: "CO", name: unit } },
                  select: { acres: true },
                });
                return latest.flatMap((r) =>
                  Object.entries(
                    (r.data as unknown as UnitTables).totals,
                  ).flatMap(([kind, rows]) => {
                    const t = r.data as unknown as UnitTables;
                    if (
                      t.ambiguous?.some(
                        (a) => !a.split && a.kind === kind && a.unit === unit,
                      )
                    )
                      return [];
                    return (rows ?? [])
                      .filter((x) => x.unit === unit && (!hunt || relevant.some(h => h.units.includes(unit) && h.species === r.species && coSeasonKind(h.tagCode) === kind)))
                      .map((x) => (
                        <tr key={unit + r.species + kind}>
                          <td>{unit}</td>
                          <td>{r.species === "ELK" ? "Elk" : "Deer"}</td>
                          <td>{labels[kind] ?? kind}</td>
                          <td>{x.hunters?.toLocaleString() ?? "—"}</td>
                          <td>{x.harvest?.toLocaleString() ?? "—"}</td>
                          <td>{x.hunters && x.harvest != null && x.harvest <= x.hunters ? `${Math.round(x.harvest / x.hunters * 100)}%` : "—"}</td>
                          <td>
                            {area?.acres && x.hunters !== undefined
                              ? (x.hunters / (area.acres / 640)).toFixed(2)
                              : "—"}
                          </td>
                        </tr>
                      ));
                  }),
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p className="small">
        Sources:{" "}
        {latest.map((r) => (
          <a key={r.id} href={r.source} target="_blank" rel="noreferrer">
            {r.species} {r.year} CPW harvest report ·{" "}
          </a>
        ))}
      </p>
    </section>
  );
}
