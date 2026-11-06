import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { overlapsElk } from '@/lib/overlappingSeasons';
import { dateRange } from '@/lib/coDisplay';
import { coLandUnit } from '@/lib/coLand';
/** Shared by Idaho and Colorado; dates must really overlap, not merely touch an enclosing season envelope. */
export async function OverlappingElk({ hunt }: { hunt: HuntSummary }) {
  if (hunt.type !== 'CONTROLLED' || !['DEER', 'ELK'].includes(hunt.species) || !hunt.units.length) return null;
  const candidates = await db.huntSummary.findMany({
    where: { state: hunt.state, species: 'ELK', units: { hasSome: hunt.units }, id: { not: hunt.id } },
    orderBy: [{ type: 'asc' }, { openDate: 'asc' }],
  });
  const rows = candidates.filter((h) => overlapsElk(hunt, h));
  return (
    <section style={{ marginTop: 28 }}>
      <h2>Elk Seasons Open At The Same Time</h2>
      <p className="small muted">
        Same unit and at least one overlapping date. Each season requires its own valid license and eligibility; listing it does not
        establish that tags are currently available.
        {hunt.state === 'CO' && ' OTC and multi-unit hunt-code totals cannot be attributed to an individual unit, so their counts and success are unavailable here. Single-unit values are averages for the years reported.'}
      </p>
      {rows.length ? (
        <div className="htable-wrap">
          <table>
            <thead>
              <tr>
                <th>Elk hunt</th>
                <th>Type</th>
                <th>Shared units</th>
                <th>Dates</th>
                <th>{hunt.state === 'CO' ? 'Hunters · shared unit' : 'Hunters/yr · hunt coverage'}</th>
                <th>Hunters/mi²</th>
                {hunt.state === 'CO' && <th>Harvest success</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const h = ((r.pointOdds as {harvest?: {year:number; basis:string; hunters:number; harvest:number}[]} | null)?.harvest ?? []).filter(x => x.basis === 'code' && x.hunters > 0 && x.harvest >= 0 && x.harvest <= x.hunters).sort((a,b) => b.year-a.year).slice(0,5);
                const valid = hunt.state === 'CO' && r.type !== 'GENERAL' && r.units.length === 1 && hunt.units.length === 1 && h.length > 0;
                const hunters = h.reduce((n,x) => n+x.hunters,0), harvested = h.reduce((n,x) => n+x.harvest,0);
                const acres = coLandUnit(r.units[0])?.acres;
                return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/hunts/${r.slug ?? encodeURIComponent(r.id)}`}>{r.name}</Link>
                  </td>
                  <td>
                    {r.type === 'GENERAL' ? 'General / OTC' : 'Limited / controlled'}
                    {r.privateOnly ? ' · Private land' : ''}
                    {(r.pointOdds as { general?: { nonresident: boolean } })?.general?.nonresident === false ? ' · Residents only' : ''}
                  </td>
                  <td>{r.units.filter((u) => hunt.units.includes(u)).join(', ')}</td>
                  <td>{dateRange(r.openDate, r.closeDate) || 'See season rules'}</td>
                  <td>
                    {hunt.state === 'CO' ? (valid ? Math.round(hunters / h.length).toLocaleString() : '—') : r.hunters5 !== null && r.harvestYears
                      ? Math.round(
                          r.hunters5 / Math.min(5, r.harvestYears),
                        ).toLocaleString()
                      : "—"}
                    {hunt.state !== 'CO' && r.units.length > 1
                      ? " · all " + r.units.length + " units"
                      : ""}
                  </td>
                  <td>
                    {hunt.state === 'CO' ? (valid && acres ? (hunters / h.length / (acres / 640)).toFixed(2) : '—') : r.huntersSqMi === null ? '—' : r.huntersSqMi.toFixed(2)}
                  </td>
                  {hunt.state === 'CO' && <td>{valid ? `${Math.round(harvested / hunters * 100)}%` : '—'}</td>}
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No elk seasons with confirmed overlapping dates are loaded for these units.</p>}
    </section>
  );
}
