import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { parseFilters, buildWhere, buildOrder, residencyFields, toQuery, type Filters } from '@/lib/finder';
import { FilterRail } from '@/components/FilterRail';
import { HuntMap } from '@/components/HuntMap';
import { SortSelect } from '@/components/SortSelect';
import { pct, pct100, int, range, WEAPON, ANTLER, DEERTYPE } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Filtering: Find An Idaho Hunt - DrawOdds' };

const MAX_ROWS = 800;

type Group = { key: string; title: string; kind: 'unit' | 'area'; name: string; rows: HuntSummary[] };

/** Active filters as removable chips over the map. */
function chips(f: Filters, nr: boolean): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [{ label: nr ? 'Nonresident' : 'Resident', href: '/account' }];
  const add = (label: string, patch: Partial<Filters>) => out.push({ label, href: `/hunts${toQuery(f, { ...patch, page: 1 })}` });
  if (f.species) add(f.species === 'ELK' ? 'Elk' : 'Deer', { species: '' });
  if (f.type) add(f.type === 'CONTROLLED' ? 'Controlled' : 'General', { type: '' });
  f.weapon.forEach((w) => add(WEAPON[w], { weapon: f.weapon.filter((x) => x !== w) }));
  f.antler.forEach((a) => add(ANTLER[a], { antler: f.antler.filter((x) => x !== a) }));
  f.deerType.forEach((d) => add(DEERTYPE[d], { deerType: f.deerType.filter((x) => x !== d) }));
  if (f.months.length) add(`Open: ${f.months.map((m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]).join(', ')}`, { months: [] });
  if (f.minOdds) add(`Odds ${f.minOdds}%-100%`, { minOdds: null });
  if (f.minSuccess) add(`Success ${f.minSuccess}%+`, { minSuccess: null });
  if (f.minBig) add(`Trophy ${f.minBig}%+`, { minBig: null });
  if (f.minPublic) add(`Public ${f.minPublic}%+`, { minPublic: null });
  if (f.minAccessYes) add(`Access Yes! ${f.minAccessYes}%+`, { minAccessYes: null });
  if (f.minHuntable) add(`Huntable ${f.minHuntable}%+`, { minHuntable: null });
  if (f.accessYes) add('Has Access Yes!', { accessYes: false });
  if (f.minTags) add(`${f.minTags}+ tags`, { minTags: null });
  if (f.unit) add(`Unit ${f.unit}`, { unit: '' });
  if (f.q) add(`"${f.q}"`, { q: '' });
  return out;
}

export default async function Filtering({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const { residency } = await getResidency();
  const nr = residency === 'NONRESIDENT';
  const rf = residencyFields(residency);
  const rows = await db.huntSummary.findMany({ where: buildWhere(f, residency), orderBy: buildOrder(f, residency), take: MAX_ROWS });

  // group into unit / area cards, in the order the sort put their best hunt
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const kind = r.type === 'GENERAL' ? 'unit' : 'area';
    const name = (kind === 'unit' ? r.unit : r.areaName) ?? '?';
    const key = `${r.species}|${kind}|${name}`;
    const g = groups.get(key) ?? groups.set(key, {
      key, kind, name, rows: [],
      title: `${kind === 'unit' ? 'Unit' : 'Hunt Area'} ${name} · ${r.species === 'ELK' ? 'Elk' : 'Deer'}`,
    }).get(key)!;
    g.rows.push(r);
  }
  const list = [...groups.values()];
  const matched = [...new Set(rows.flatMap((r) => r.units))];
  const areaIds = [...new Set(rows.map((r) => r.areaId).filter((x): x is number => !!x))];
  const areas = new Map(
    (await db.huntArea.findMany({ where: { areaId: { in: areaIds } }, select: { areaId: true, description: true } })).map((a) => [a.areaId, a]),
  );
  const unitNames = list.filter((g) => g.kind === 'unit').map((g) => g.name);
  const unitInfo = new Map((await db.unit.findMany({ where: { name: { in: unitNames } }, select: { name: true, elkZone: true } })).map((u) => [u.name, u]));

  const best = (g: Group, k: keyof HuntSummary) => {
    const v = g.rows.map((r) => r[k] as number | null).filter((x): x is number => x !== null && x !== undefined);
    return v.length ? Math.max(...v) : null;
  };

  return (
    <main className="filtering">
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap matched={matched} selected={f.unit} chips={chips(f, nr)} />
      </section>

      <section className="f-list" aria-label="Results">
        <div className="f-head">
          <h1>Filtering: <span>Idaho</span></h1>
          <div className="f-sub">
            <span>Sort <b>{list.length}</b> results ({rows.length}{rows.length === MAX_ROWS ? '+' : ''} hunts) by</span>
            <SortSelect value={f.sort} />
          </div>
        </div>
        {!list.length && (
          <div className="ucard">
            <h2>No Hunts Match</h2>
            <p className="muted">Loosen a slider or remove a chip on the map. <Link href="/hunts">Clear all filters</Link>.</p>
          </div>
        )}
        {list.map((g) => {
          const first = g.rows[0];
          const desc = g.kind === 'area'
            ? (first.areaId ? areas.get(first.areaId)?.description : null) ?? (first.units.length ? `Units ${first.units.join(', ')}` : '')
            : unitInfo.get(g.name)?.elkZone ? `${unitInfo.get(g.name)!.elkZone} elk zone` : '';
          const big = best(g, 'bigPct5');
          return (
            <article key={g.key} className={`ucard ${f.unit && first.units.includes(f.unit) ? 'sel' : ''}`}>
              <h2>
                <Link href={g.kind === 'unit' ? `/units/${encodeURIComponent(g.name)}` : `/hunts/${encodeURIComponent(first.id)}`}>{g.title}</Link>
              </h2>
              {desc && <p className="desc">{desc.length > 150 ? `${desc.slice(0, 150)}…` : desc}</p>}
              <div className="ustats">
                <div>Trophy<b>{pct(big)}</b></div>
                <div>Public Land<b>{pct100(first.publicPct)}</b></div>
                <div>Access Yes!<b>{first.accessYesPct !== null ? `${first.accessYesPct < 1 && first.accessYesPct > 0 ? '<1' : Math.round(first.accessYesPct)}%` : '-'}</b></div>
                <div>{first.species === 'DEER' ? 'Deer' : 'Units'}<b style={{ fontSize: first.species === 'DEER' ? '1rem' : undefined }}>{first.species === 'DEER' ? (first.deerType ? DEERTYPE[first.deerType] : '-') : first.units.length}</b></div>
              </div>
              {g.rows.map((r) => {
                const odds = r[rf.odds5];
                const apps = r[rf.appsLast];
                return (
                  <div key={r.id} className="hrow">
                    <div className="hrow-top">
                      <Link href={`/hunts/${encodeURIComponent(r.id)}`}>
                        {r.huntNumber ? `Hunt ${r.huntNumber} · ` : ''}{WEAPON[r.weapon]} · {ANTLER[r.antlerClass]}
                      </Link>
                      <span className="small muted">{r.type === 'GENERAL' ? (r.tags ? `${int(r.tags)} tags` : 'OTC') : `${int(r.tags)} tags`}</span>
                    </div>
                    <div className="dates">{r.type === 'GENERAL' ? `${r.name} · ` : ''}{r.openDate ? range(r.openDate, r.closeDate) : 'Dates: see regulations'}</div>
                    <div className="hrow-stats">
                      <div>Draw Odds<b>{r.type === 'GENERAL' ? 'OTC' : pct(odds, odds !== null && odds < 0.1 ? 1 : 0)}</b></div>
                      <div>Harvest Success<b>{pct(r.success5)}</b></div>
                      <div>Applications
                        <b>
                          {r.type === 'GENERAL' ? '-' : int(apps)}
                          {r.type === 'CONTROLLED' && !!apps && r.appsTrend !== null && Math.abs(r.appsTrend) >= 0.1 && (
                            <span className={r.appsTrend > 0 ? 'down' : 'up'} title="Last year vs 5-yr average" style={{ fontSize: '.8rem', marginLeft: 4 }}>
                              {r.appsTrend > 0 ? '▲' : '▼'}{Math.round(Math.abs(r.appsTrend) * 100)}%
                            </span>
                          )}
                        </b>
                      </div>
                    </div>
                    <div>
                      {r.youthOnly && <span className="pill">Youth</span>}
                      {r.smallSample && <span className="pill warn" title="Fewer than 50 hunters over 5 years">Small Sample</span>}
                      {r.boundaryChanged && <span className="pill warn" title="IDFG changed this unit's boundary in 2022">Boundary Changed 2022</span>}
                      {r.type === 'CONTROLLED' && r.oddsYears < 3 && <span className="pill warn">New / Short History</span>}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
        <p className="small muted" style={{ padding: '12px 16px' }}>
          Odds: {nr ? 'nonresident' : 'resident'}, first choice, 5-year total. Success: 5-year harvest / hunters. Applications: last year&apos;s
          first-choice {nr ? 'nonresident' : 'resident'} applicants (▲ = more than the 5-year average, which usually means worse odds ahead).
        </p>
      </section>

      <FilterRail residency={residency} />
    </main>
  );
}
