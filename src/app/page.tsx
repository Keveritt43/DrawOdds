import Link from 'next/link';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { parseFilters, buildWhere, buildOrder, residencyFields, toQuery, PAGE_SIZE } from '@/lib/finder';
import { FilterPanel } from '@/components/FilterPanel';
import { pct, pct100, int, range, WEAPON, ANTLER, DEERTYPE } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function FinderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const { residency } = await getResidency();
  const rf = residencyFields(residency);
  const where = buildWhere(f, residency);
  const [rows, total, lastSync] = await Promise.all([
    db.huntSummary.findMany({ where, orderBy: buildOrder(f, residency), take: PAGE_SIZE, skip: (f.page - 1) * PAGE_SIZE }),
    db.huntSummary.count({ where }),
    db.syncLog.findFirst({ where: { step: 'summary', status: { in: ['OK', 'CHECK'] } }, orderBy: { finishedAt: 'desc' } }),
  ]);
  const nr = residency === 'NONRESIDENT';
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="wrap">
      <div className="finder">
        <FilterPanel f={f} residency={residency} />
        <section>
          <h1>Find a hunt</h1>
          <p className="muted small" style={{ marginTop: 0 }}>
            {int(total)} deer and elk hunts match. Odds are <b>{nr ? 'nonresident' : 'resident'}</b>, first choice, 5-year total
            (permits / applicants). Success is the 5-year total (harvest / hunters).
            {lastSync?.finishedAt ? ` Data updated ${lastSync.finishedAt.toLocaleDateString('en-US')}.` : ''}
          </p>
          {nr && (
            <div className="note">
              Nonresidents get roughly 10% of controlled-hunt tags, so on small hunts your odds rest on 0-2 tags a year. Treat
              a single-year number as noise. General-season nonresident tags are capped and can sell out.
            </div>
          )}
          {!rows.length ? (
            <div className="card">No hunts match. Loosen a filter, or <Link href="/">reset</Link>.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="results">
                <thead>
                  <tr>
                    <th>Hunt</th>
                    <th>Season</th>
                    <th className="num">Tags</th>
                    <th className="num" title="5-yr first-choice odds for your residency">{nr ? 'NR' : 'Res'} odds</th>
                    <th className="num" title="5-yr hunter success">Success</th>
                    <th className="num" title="Chance of drawing and filling in one year">Draw + fill</th>
                    <th className="num" title="Deer: mule 4+ pts / Elk: 6+ pts, share of antlered harvest">Trophy</th>
                    <th className="num">Public</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const odds = r[rf.odds5];
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/hunts/${encodeURIComponent(r.id)}`}><b>{r.huntNumber ? `${r.species === 'DEER' ? 'Deer' : 'Elk'} ${r.huntNumber}` : r.name}</b></Link>
                          <div className="small muted">
                            {r.type === 'GENERAL' ? `Unit ${r.unit} · ${r.name}` : `Area ${r.areaName ?? '?'}${r.units.length > 1 ? ` (units ${r.units.join(', ')})` : ''}`}
                          </div>
                          <span className="pill">{WEAPON[r.weapon]}</span>
                          <span className="pill">{ANTLER[r.antlerClass]}</span>
                          {r.deerType && <span className="pill">{DEERTYPE[r.deerType]}</span>}
                        </td>
                        <td className="small">{range(r.openDate, r.closeDate)}</td>
                        <td className="num">{r.type === 'GENERAL' ? (r.tags ? int(r.tags) : 'OTC') : int(r.tags)}</td>
                        <td className="num">{r.type === 'GENERAL' ? <span className="muted">no draw</span> : pct(odds, 1)}</td>
                        <td className="num">{pct(r.success5)}</td>
                        <td className="num">{r.type === 'GENERAL' ? '-' : pct(r[rf.tagAndFill], 1)}</td>
                        <td className="num">{pct(r.bigPct5)}</td>
                        <td className="num">{pct100(r.publicPct)}</td>
                        <td>
                          {r.youthOnly && <span className="pill">Youth</span>}
                          {(r.accessYesCount ?? 0) > 0 && <span className="pill good">Access Yes! {int(r.accessYesAcres)} ac</span>}
                          {r.smallSample && <span className="pill warn" title="Fewer than 50 hunters over 5 years">Small sample</span>}
                          {r.boundaryChanged && <span className="pill warn" title="IDFG changed this unit's boundary in 2022">Boundary changed 2022</span>}
                          {r.type === 'CONTROLLED' && r.oddsYears < 3 && <span className="pill warn">New / short history</span>}
                          {r.appsTrend !== null && r.appsTrend > 0.25 && <span className="pill warn" title="Last year's applicants vs 5-yr average">Applicants +{Math.round(r.appsTrend * 100)}%</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="pager">
              {f.page > 1 && <Link className="btn" href={`/${toQuery(f, { page: f.page - 1 })}`}>Previous</Link>}
              <span className="small muted">Page {f.page} of {pages}</span>
              {f.page < pages && <Link className="btn" href={`/${toQuery(f, { page: f.page + 1 })}`}>Next</Link>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
