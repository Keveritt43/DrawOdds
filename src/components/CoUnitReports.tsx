import { db } from '@/lib/db';
import { CoReportTabs } from './CoReportTabs';
import { CoHerds } from './CoHerds';
import { herdSeries } from '@/lib/coHerds';
import { fmtNeed } from '@/lib/coDisplay';
import { REPORT_CATALOG } from '@/sync/co/manifest';
import type { DrawnOutRow, SalesRow } from '@/sync/co/supplemental';
import type { RecapHunt } from '@/sync/co/recap';
import type { HerdEstimate } from '@/sync/co/population';
import type { HuntSummary } from '@prisma/client';
const labels = [
  ['draw', 'Draw Recap'],
  ['drawn-out', 'Drawn Out At'],
  ['secondary', 'Secondary Draw Recap'],
  ['harvest', 'Harvest'],
  ['population', 'Population Estimates'],
  ['otc-sales', 'Over the Counter Sales'],
] as const;
/** All CPW report categories, linked to the same deer/elk unit context. */
export async function CoUnitReports({ units, hunts }: { units: string[]; hunts: HuntSummary[] }) {
  const reports = await db.stateReport.findMany({ where: { state: 'CO' }, orderBy: { year: 'desc' } });
  const codes = new Set(hunts.map((h) => h.tagCode));
  return (
    <CoReportTabs
      panels={labels.map(([kind, label]) => ({
        id: kind,
        label,
        content: (
          <div>
            {(['DEER', 'ELK'] as const).map((species) => {
              const relevant = hunts.filter((h) => h.species === species);
              const speciesReports = reports.filter((r) => r.species === species);
              const links = REPORT_CATALOG.filter((r) => r.species === species && r.kind === kind);
              return (
                <section key={species} style={{ margin: '16px 0' }}>
                  <h3>
                    {species === 'DEER' ? 'Deer' : 'Elk'} · {label}
                  </h3>
                  {kind === 'draw' ? (
                    <div className="htable-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Hunt code</th>
                            <th>Draw</th>
                            <th>Licenses</th>
                            <th>Resident points</th>
                            <th>Nonresident points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relevant
                            .filter((h) => h.type === 'CONTROLLED')
                            .map((h) => (
                              <tr key={h.id}>
                                <td>
                                  <a href={`/hunts/${h.slug}`}>{h.tagCode}</a>
                                </td>
                                <td>{h.oddsLastYear}</td>
                                <td>{h.tags ?? 'Unlimited'}</td>
                                <td>{fmtNeed(h.ptsRes, h.ptsResPct)}</td>
                                <td>{fmtNeed(h.ptsNr, h.ptsNrPct)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      <p className="small muted">
                        Open a hunt for applicant counts and primary results at every point level, with historical draw results.
                      </p>
                    </div>
                  ) : null}
                  {kind === 'population' ? (
                    <CoHerds
                      species={species}
                      highlight={units}
                      herds={herdSeries(
                        speciesReports
                          .filter((r) => r.kind === 'population')
                          .map((r) => ({ year: r.year, herds: (r.data as unknown as { herds: HerdEstimate[] }).herds })),
                        units,
                      )}
                    />
                  ) : null}
                  {kind === 'harvest' ? (
                    <div className="htable-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Hunt / season</th>
                            <th>Years</th>
                            <th>Hunters</th>
                            <th>Harvest</th>
                            <th>Success</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relevant.map((h) => (
                            <tr key={h.id}>
                              <td>
                                <a href={`/hunts/${h.slug}`}>{h.name}</a>
                              </td>
                              <td>{h.harvestYears || '—'}</td>
                              <td>{h.hunters5?.toLocaleString() ?? '—'}</td>
                              <td>{h.harvest5?.toLocaleString() ?? '—'}</td>
                              <td>{h.success5 === null ? '—' : `${Math.round(h.success5 * 100)}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="small muted">
                        Up to five available seasons. Hunt pages list each year and whether CPW reported this code or a broader unit/season
                        estimate. Shared unit estimates must not be added across hunt codes.
                      </p>
                    </div>
                  ) : null}
                  {['drawn-out', 'secondary', 'otc-sales'].includes(kind)
                    ? speciesReports
                        .filter((r) => r.kind === kind)
                        .map((report) => {
                          const data = report.data as unknown as { rows?: DrawnOutRow[] | SalesRow[]; hunts?: RecapHunt[] };
                          const rows =
                            kind === 'secondary'
                              ? (data.hunts ?? []).filter((h) => codes.has(h.code))
                              : kind === 'drawn-out'
                                ? ((data.rows ?? []) as DrawnOutRow[]).filter((h) => codes.has(h.code))
                                : ((data.rows ?? []) as SalesRow[]);
                          return (
                            <details
                              key={report.id}
                              open={report.year === Math.max(...speciesReports.filter((r) => r.kind === kind).map((r) => r.year))}
                            >
                              <summary>
                                {report.year} · {rows.length} {kind === 'otc-sales' ? 'statewide sales codes' : 'matching hunt codes'}
                              </summary>
                              <div className="htable-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Code</th>
                                      {kind === 'drawn-out' ? (
                                        <>
                                          <th>Resident</th>
                                          <th>Nonresident</th>
                                          <th>Youth resident</th>
                                          <th>Youth nonresident</th>
                                        </>
                                      ) : kind === 'secondary' ? (
                                        <>
                                          <th>Quota</th>
                                          <th>Drawn</th>
                                          <th>Balance</th>
                                          <th>Adult res apps / drawn</th>
                                          <th>Adult NR apps / drawn</th>
                                          <th>Youth res apps / drawn</th>
                                          <th>Youth NR apps / drawn</th>
                                        </>
                                      ) : (
                                        <>
                                          <th>Adult res</th>
                                          <th>Adult NR</th>
                                          <th>Youth res</th>
                                          <th>Youth NR</th>
                                          <th>Total</th>
                                        </>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row) => {
                                      if (kind === 'drawn-out') {
                                        const r = row as DrawnOutRow;
                                        return (
                                          <tr key={r.code}>
                                            <td>{r.code}</td>
                                            {(['res', 'nr', 'yres', 'ynr'] as const).map((p) => (
                                              <td key={p}>
                                                {r.cutoff[p]?.text ?? '—'}
                                                {r.cutoff[p]?.appsAtLevel
                                                  ? ` (${r.cutoff[p]!.drawnAtLevel}/${r.cutoff[p]!.appsAtLevel})`
                                                  : ''}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      }
                                      if (kind === 'secondary') {
                                        const r = row as RecapHunt;
                                        return (
                                          <tr key={r.code}>
                                            <td>{r.code}{r.sharedCodes ? ` · shared pool: ${r.sharedCodes.join(', ')}` : ''}</td>
                                            <td>{r.sharedCodes ? `${r.quota} shared` : r.quota}</td>
                                            <td>{r.drawnTotal}</td>
                                            <td>{r.balance}</td>
                                            {(['res', 'nr', 'yres', 'ynr'] as const).map((p) => (
                                              <td key={p}>
                                                {Object.values(r.pre[p]).reduce((a, b) => a + b, 0)} /{' '}
                                                {Object.values(r.post[p]).reduce((a, b) => a + b, 0)}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      }
                                      const r = row as SalesRow;
                                      return (
                                        <tr key={r.code}>
                                          <td>{r.code}</td>
                                          <td>{r.res.toLocaleString()}</td>
                                          <td>{r.nr.toLocaleString()}</td>
                                          <td>{r.yres.toLocaleString()}</td>
                                          <td>{r.ynr.toLocaleString()}</td>
                                          <td>{r.total.toLocaleString()}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {!rows.length ? <p className="small muted">No matching codes in this report.</p> : null}
                            </details>
                          );
                        })
                    : null}
                  {kind === 'secondary' ? (
                    <p className="small muted">
                      Secondary draw uses a separate applicant pool and youth priority. Counts shown are first choice; these results do not
                      determine primary preference-point odds.
                    </p>
                  ) : null}
                  {kind === 'otc-sales' ? (
                    <p className="small muted">
                      Sales are statewide unless a code names a specific unit. Sales counts do not establish unit eligibility, hunter
                      density, or current license availability.
                    </p>
                  ) : null}
                  <p className="small">
                    CPW sources:{' '}
                    {links.map((r, i) => (
                      <span key={r.url}>
                        {i ? ' · ' : ''}
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.year}
                        </a>
                      </span>
                    ))}
                  </p>
                </section>
              );
            })}
          </div>
        ),
      }))}
    />
  );
}
