import { HuntLink } from '@/components/HuntNavigation';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { overlapsElk } from '@/lib/overlappingSeasons';
import { dateRange } from '@/lib/coDisplay';
import type { UnitTables } from '@/sync/co/harvest';
import { coSeasonKind } from '@/lib/coSeasonKind';
import { coLandUnit } from '@/lib/coLand';
/** Shared by Idaho and Colorado; dates must really overlap, not merely touch an enclosing season envelope. */
export async function OverlappingElk({ hunt }: { hunt: HuntSummary }) {
  if (hunt.type !== 'CONTROLLED' || !['DEER', 'ELK'].includes(hunt.species) || !hunt.units.length) return null;
  const candidates = await db.huntSummary.findMany({
    where: { state: hunt.state, species: 'ELK', units: { hasSome: hunt.units }, id: { not: hunt.id } },
    orderBy: [{ type: 'asc' }, { openDate: 'asc' }],
  });
  const unitReports = hunt.state === 'CO' ? await db.stateReport.findMany({where:{state:'CO',species:'ELK',kind:'harvest-unit'},orderBy:{year:'desc'}}) : [];
  const rows = candidates.filter((h) => overlapsElk(hunt, h));
  return (
    <section style={{ marginTop: 28 }}>
      <h2>Elk Seasons Open At The Same Time</h2>
      <p className="small muted">
        Same unit and at least one overlapping date. Each season requires its own valid license and eligibility; listing it does not
        establish that tags are currently available.
        {hunt.state === 'CO' && ' Limited-hunt counts and success cover the full hunt code, including units outside this overlap. Counts are annual averages for up to five reported years; success is weighted by hunters. Density is shown only for single-unit codes. OTC code totals cannot be attributed to these units.'}
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
                <th>Hunters/yr · hunt coverage</th>
                <th>Hunters/mi²</th>
                {hunt.state === 'CO' && <th>Harvest success</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const h = ((r.pointOdds as {harvest?: {year:number; basis:string; hunters:number; harvest:number}[]} | null)?.harvest ?? []).filter(x => x.basis === 'code' && x.hunters > 0 && x.harvest >= 0 && x.harvest <= x.hunters).sort((a,b) => b.year-a.year).slice(0,5);
                const valid = hunt.state === 'CO' && r.type !== 'GENERAL' && h.length > 0;
                const hunters = h.reduce((n,x) => n+x.hunters,0), harvested = h.reduce((n,x) => n+x.harvest,0);
                const acres = r.units.length === 1 ? coLandUnit(r.units[0])?.acres : null;
                return (
                <tr key={r.id}>
                  <td>
                    <HuntLink href={`/hunts/${r.slug ?? encodeURIComponent(r.id)}`}>{r.name}</HuntLink>
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
                    {r.units.length > 1 && (hunt.state !== 'CO' || valid)
                      ? hunt.state === 'CO' ? " · all units: " + r.units.join(', ') : " · all " + r.units.length + " units"
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
      {hunt.state === 'CO' && rows.filter(r=>r.type==='GENERAL').flatMap(r=>{
        const shared=r.units.filter(u=>hunt.units.includes(u)), kind=coSeasonKind(r.tagCode);
        return shared.map(unit=>{
          const report=unitReports.find(rep=>{const data=rep.data as unknown as UnitTables; return kind && !data.ambiguous?.some(a=>!a.split && a.kind===kind && a.unit===unit) && data.totals[kind]?.some(x=>x.unit===unit)});
          const row=report && kind ? (report.data as unknown as UnitTables).totals[kind]?.find(x=>x.unit===unit) : null;
          return row && report ? <p key={r.id+unit} className="small">Unit {unit} · {r.name}: {report.year} unit-season total, all elk licenses: {row.hunters?.toLocaleString() ?? '—'} hunters · {row.harvest?.toLocaleString() ?? '—'} harvested. This is not an OTC-only count. <a href={report.source}>CPW report</a></p> : null;
        });
      })}
    </section>
  );
}
