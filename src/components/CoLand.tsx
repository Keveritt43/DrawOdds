import { coLandSummary, CO_LAND_SOURCE, CO_LAND_DATE } from "@/lib/coLand";
export function CoLand({ units }: { units: string[] }) {
  const d = coLandSummary(units);
  return (
    <section>
      <h2>Land Ownership And Access</h2>
      {d ? (
        <>
          <p>
            <b>{d.publicPct.toFixed(1)}% public</b> · {d.privatePct.toFixed(1)}%
            private · {d.tribalPct.toFixed(1)}% tribal ·{" "}
            {d.unknownPct.toFixed(1)}% unmapped/other
          </p>
          <p>
            {Math.round(d.acres).toLocaleString()} acres across{" "}
            {units.length === 1
              ? "this unit"
              : "all " + units.length + " units"}
            .
          </p>
        </>
      ) : (
        <p>Ownership coverage is unavailable for this unit.</p>
      )}
      <p className="small muted">
        Public surface ownership does not establish legal entry or hunting
        permission. State trust, military, parks and other public lands may have
        restrictions; private and tribal lands require authorization. No Access
        Yes! acreage is included in Colorado.
      </p>
      <p className="small">
        Source:{" "}
        <a href={CO_LAND_SOURCE}>BLM Colorado Surface Management Agency</a>,
        retrieved {CO_LAND_DATE}; intersected with CPW GMUs in equal-area
        projection EPSG:5070.
      </p>
    </section>
  );
}
