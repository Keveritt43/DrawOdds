import Link from "next/link";
import { db } from "@/lib/db";
import { REPORT_CATALOG } from "@/sync/co/manifest";
import { CO_LAND_SOURCE, CO_LAND_DATE } from "@/lib/coLand";
export function CoGuide() {
  return (
    <main className="wrap" style={{ maxWidth: 860, margin: "24px auto 48px" }}>
      <h1>How The Colorado Draw Works</h1>
      <p>
        Colorado deer and elk primary draws use preference points through 2027.
        Your resident/nonresident and youth pool matters. Set separate deer and
        elk points in the header.
      </p>
      <h2>Primary Draw</h2>
      <p>
        First-choice licenses generally go to applicants with more points first.
        Drawing a first choice uses the species points. Later choices are
        considered after earlier choices; a hunt reaching later choices can be a
        backup while building points. Some high-point hunts have a hybrid
        allocation; inspect the hunt’s actual pool results.
      </p>
      <h2>2027 Planning Scenario</h2>
      <p>
        Unsuccessful first-choice applicants return with one additional point,
        successful applicants leave, and supply stays at its latest observed
        allocation. Projected cutoffs cannot fall below the last draw or
        returning-cohort cutoff. This is a conservative scenario, not a
        guarantee: applicants can switch hunts, new people apply, and quotas
        change.
      </p>
      <h2>Secondary Draw And General Licenses</h2>
      <p>
        Secondary draw reports describe a separate pool with youth priority and
        do not establish primary preference-point odds. General/OTC eligibility
        depends on residency, weapon, unit and current regulations. An OTC
        listing does not establish that a license is currently available.
      </p>
      <h2>2028 Rule Change</h2>
      <p>
        Colorado’s published rules change the draw to a split preference/bonus
        system from 2028. The 2027 model must not be extrapolated through that
        change.
      </p>
      <p>
        <a href="https://cpw.state.co.us/activities/hunting/big-game/primary-draw">
          CPW primary draw and current application information
        </a>{" "}
        ·{" "}
        <a href="https://cpw.state.co.us/sites/default/files/dam/vkxkfhhfq6/chw2-as-approved-jan-2026.pdf">
          Published W-2 rules
        </a>{" "}
        · <Link href="/planner">Plan Colorado choices</Link>
      </p>
    </main>
  );
}
export function CoAbout() {
  return (
    <main className="wrap" style={{ maxWidth: 860, margin: "24px auto 48px" }}>
      <h1>Colorado Data &amp; Methods</h1>
      <p>
        Public CPW reports provide deer and elk primary/secondary draw results,
        drawn-out thresholds, harvest, population and OTC sales. Automatic
        refresh is disabled; source years are shown explicitly.
      </p>
      <h2>Harvest And Crowding</h2>
      <p>
        Success is total harvest divided by total hunters across up to five
        available seasons. Hunters per square mile is hunters per year divided
        by the area covered by those counts. From 2025, code-specific estimates
        are used where published; older reports use broader unit/weapon/season
        estimates. Shared estimates must not be added across tags. The
        unit-season table uses the latest published unit report rather than
        pretending a multi-unit OTC count belongs to one unit.
      </p>
      <h2>Land</h2>
      <p>
        <a href={CO_LAND_SOURCE}>BLM surface management polygons</a> were
        retrieved {CO_LAND_DATE}, intersected with CPW GMUs in EPSG:5070, and
        unioned within ownership categories to avoid duplicate acreage. Public,
        private, tribal and unmapped shares remain distinct. Ownership is not
        legal hunting access: check roads, closures, state trust restrictions,
        military and park rules, and permission. Colorado has no Access Yes!
        component. State access-program filters are separate from ownership.
      </p>
      <h2>Draw Projections</h2>
      <p>
        2027 scenarios advance failed applicants by one point, remove winners
        and hold supply fixed; cutoffs cannot decline. Primary and secondary
        draws remain separate. Shared-code pools are labeled, and code-issued
        counts are distinguished from pooled quotas.
      </p>
      <h2>Quality And Trophy</h2>
      <p>
        Colorado Quality is not published as a validated state rating. Deer/elk
        harvest sex counts and herd bull/cow ratios are not trophy-size
        measurements. No trophy ranking is fabricated from them.
      </p>
      <h2>Source Reports</h2>
      <ul>
        {REPORT_CATALOG.map((r) => (
          <li key={r.species + r.kind + r.year}>
            <a href={r.url}>
              {r.species} · {r.label}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
export async function CoChanges() {
  const rows = await db.huntSummary.findMany({
    where: { state: "CO", type: "CONTROLLED" },
    orderBy: { tagCode: "asc" },
  });
  const changed = rows
    .filter(
      (r) =>
        r.permitsLast !== null &&
        r.permitsPrev !== null &&
        r.permitsLast !== r.permitsPrev,
    )
    .sort(
      (a, b) =>
        Math.abs(b.permitsLast! - b.permitsPrev!) -
        Math.abs(a.permitsLast! - a.permitsPrev!),
    );
  return (
    <main className="wrap" style={{ margin: "24px auto 48px" }}>
      <h1>What Changed · Colorado</h1>
      <p>
        Latest primary-draw license supply versus the preceding year. A quota
        change does not establish future draw odds or current availability.
      </p>
      <table>
        <thead>
          <tr>
            <th>Hunt</th>
            <th>Previous licenses</th>
            <th>Latest licenses</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={"/hunts/" + r.slug}>
                  {r.tagCode} · {r.name}
                </Link>
              </td>
              <td>{r.permitsPrev}</td>
              <td>{r.permitsLast}</td>
              <td>{r.permitsLast! - r.permitsPrev!}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>First Year In Available Draw Records</h2>
      <ul>
        {rows
          .filter((r) => r.oddsYears === 1)
          .map((r) => (
            <li key={r.id}>
              <Link href={"/hunts/" + r.slug}>
                {r.name} · {r.tagCode}
              </Link>
            </li>
          ))}
      </ul>
      <p className="small muted">
        First observed does not prove a newly established season; records start
        in 2021. Shared historical pools are explained on individual hunts.
      </p>
    </main>
  );
}
export function CoScore() {
  return (
    <main className="wrap" style={{ maxWidth: 820, margin: "24px auto" }}>
      <h1>Colorado Hunt Metrics</h1>
      <p>
        Colorado cards show your point-based draw scenario, harvest success,
        hunter density, public ownership and draw-and-fill. Quality and trophy
        ratings are not published until the state model and trophy measurements
        have been validated.
      </p>
      <p>
        Draw-and-fill multiplies your selected draw probability by observed
        harvest success. It is a planning estimate, not a promise. Land
        percentages describe ownership, not permission.
      </p>
      <Link href="/about">Colorado sources and methods</Link>
    </main>
  );
}
