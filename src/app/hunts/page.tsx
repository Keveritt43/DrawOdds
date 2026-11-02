import Link from 'next/link';
import { seasonsSummary } from '@/lib/tagSeasons';
import { recentBoundaryChanges } from '@/lib/boundaries';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { parseFilters, buildWhere, buildOrder, residencyFields, toQuery, type Filters } from '@/lib/finder';
import { FilterRail } from '@/components/FilterRail';
import { HuntMap } from '@/components/HuntMap';
import { SortSelect } from '@/components/SortSelect';
import { pct, pct100, int, range, WEAPON, ANTLER, DEERTYPE } from '@/lib/format';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Filtering: Find An Idaho Hunt - DrawOdds' };

const MAX_ROWS = 800;

type Group = { key: string; title: string; kind: 'unit' | 'area' | 'zone'; name: string; rows: HuntSummary[] };

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
  const [rows, fav] = await Promise.all([
    db.huntSummary.findMany({ where: buildWhere(f, residency), orderBy: buildOrder(f, residency), take: MAX_ROWS }),
    getFavorites(),
  ]);

  // group into unit / area cards, in the order the sort put their best hunt
  const groups = new Map<string, Group>();
  for (const r of rows) {
    // nonresident elk tags are per zone; deer tags are per unit and sit with that unit's general seasons
    const kind: Group['kind'] = r.nrTag && !r.unit ? 'zone' : r.type === 'GENERAL' ? 'unit' : 'area';
    const name = (kind === 'unit' ? r.unit : r.areaName) ?? '?';
    const key = `${r.species}|${kind}|${name}`;
    const g = groups.get(key) ?? groups.set(key, {
      key, kind, name, rows: [],
      title: kind === 'zone' ? `${name} · Elk` : `${kind === 'unit' ? 'Unit' : 'Hunt Area'} ${name} · ${r.species === 'ELK' ? 'Elk' : 'Deer'}`,
    }).get(key)!;
    g.rows.push(r);
  }
  const list = [...groups.values()];
  // looking at one unit: its general seasons first, then the controlled hunt areas (sort order kept within each)
  if (f.unit) list.sort((a, b) => (a.kind === 'area' ? 1 : 0) - (b.kind === 'area' ? 1 : 0));
  // within a unit card: the nonresident tag(s) first for nonresidents, then the general seasons
  for (const g of list) if (g.kind === 'unit') g.rows.sort((a, b) => Number(b.nrTag) - Number(a.nrTag));
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
          const desc = g.kind === 'zone'
            ? `Units ${first.units.join(', ')}`
            : g.kind === 'area'
            ? (first.areaId ? areas.get(first.areaId)?.description : null) ?? (first.units.length ? `Units ${first.units.join(', ')}` : '')
            : unitInfo.get(g.name)?.elkZone ? `${unitInfo.get(g.name)!.elkZone} elk zone` : '';
          const big = best(g, 'bigPct5');
          return (
            <article key={g.key} className={`ucard ${f.unit && first.units.includes(f.unit) ? 'sel' : ''}`}>
              <h2 className="star-head">
                {g.kind === 'unit' && <Star kind="unit" id={g.name} saved={fav.units.has(g.name)} signedIn={fav.signedIn} />}
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
                const oddsLast = r[rf.oddsLast];
                return (
                  <div key={r.id} className="hrow">
                    <div className="hrow-top">
                      <span className="star-head">
                        <Star kind="hunt" id={r.huntId} saved={fav.hunts.has(r.huntId)} signedIn={fav.signedIn} />
                        <Link href={`/hunts/${encodeURIComponent(r.id)}`}>
                          {r.nrTag ? `${tagLabel(r)}${r.tagCode ? ` · ${r.tagCode}` : ''}` : <>{r.huntNumber ? `Hunt ${r.huntNumber} · ` : ''}{WEAPON[r.weapon]} · {ANTLER[r.antlerClass]}</>}
                        </Link>
                        {r.nrTag && <span className="pill ctl">NR Tag Draw</span>}
                      </span>
                      <span className="small muted">
                        {r.nrTag ? (r.quota !== null ? `${int(r.quota)} NR tags${r.quotaYear ? ` (${r.quotaYear})` : ''}${r.capped ? ' · capped' : ''}` : '-') : r.type === 'GENERAL' ? (r.tags ? `${int(r.tags)} tags` : nr ? 'NR tag required' : 'OTC') : `${int(r.tags)} tags`}
                      </span>
                    </div>
                    <div className="dates">
                      {r.nrTag
                        ? (seasonsSummary(r.tagSeasons) || `Nonresident general tag · ${r.species === 'ELK' ? `units ${r.units.join(', ')}` : `unit ${r.unit}`} · seasons: see the regulations`)
                        : <>{r.type === 'GENERAL' ? `${r.name} · ` : ''}{r.openDate ? range(r.openDate, r.closeDate) : 'Dates: see regulations'}</>}
                    </div>
                    <div className="hrow-stats">
                      <div>Draw Odds{r.oddsLastYear ? ` ${r.oddsLastYear}` : ''}
                        <b>
                          {r.type === 'GENERAL' && !r.nrTag ? (nr ? 'Tag' : 'OTC') : pct(oddsLast, oddsLast !== null && oddsLast < 0.1 ? 1 : 0)}
                          {r.type === 'CONTROLLED' && <Delta now={oddsLast} prev={r[rf.oddsPrev]} kind="pts" good="up" />}
                        </b>
                        {r.type === 'CONTROLLED' && <span className="sub">5-yr {pct(odds, odds !== null && odds < 0.1 ? 1 : 0)}</span>}
                        {r.nrTag && <span className="sub">1st choice</span>}
                      </div>
                      <div>Success{r.harvestLastYear ? ` ${r.harvestLastYear}` : ''}
                        <b>{pct(r.successLast)}<Delta now={r.successLast} prev={r.successPrev} kind="pts" good="up" /></b>
                        <span className="sub">
                          {f.sort === 'harvest' ? `5-yr harvest ${int(r.harvest5)}` : f.sort === 'hunters' || f.sort === 'huntersLow' ? `5-yr hunters ${int(r.hunters5)}` : `5-yr ${pct(r.success5)}`}
                        </span>
                      </div>
                      <div>Applicants{r.oddsLastYear ? ` ${r.oddsLastYear}` : ''}
                        <b>
                          {r.type === 'GENERAL' && !r.nrTag ? '-' : int(apps)}
                          {r.type === 'CONTROLLED' && <Delta now={apps} prev={r[rf.appsPrev]} kind="pct" good="down" />}
                        </b>
                        {r.type === 'CONTROLLED' && r.appsLast !== null && <span className="sub">all {int(r.appsLast)}</span>}
                      </div>
                    </div>
                    <div>
                      {r.youthOnly && <span className="pill">Youth</span>}
                      {r.smallSample && <span className="pill warn" title="Fewer than 50 hunters over 5 years">Small Sample</span>}
                      {recentBoundaryChanges(r.units) && <span className="pill warn" title="IDFG changed this unit's boundary recently; earlier years cover different ground">Boundary Changed {recentBoundaryChanges(r.units)!.year}</span>}
                      {r.type === 'CONTROLLED' && r.oddsYears < 3 && <span className="pill warn">New / Short History</span>}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
        <p className="small muted" style={{ padding: '12px 16px' }}>
          Odds: {nr ? 'nonresident' : 'resident'}, first choice, from the latest drawing; success from the latest harvest report.
          Arrows compare with the year before (odds and success in percentage points, applicants in percent). Green is better for you,
          orange is worse. Filters and sorting use the 5-year numbers shown underneath, which swing less.
        </p>
      </section>

      <FilterRail residency={residency} />
    </main>
  );
}

/** Year-over-year change. kind "pts": percentage-point change of a 0-1 ratio; "pct": relative change of a count. */
function Delta({ now, prev, kind, good }: { now: number | null | undefined; prev: number | null | undefined; kind: 'pts' | 'pct'; good: 'up' | 'down' }) {
  if (now == null || prev == null) return null;
  const d = kind === 'pts' ? (now - prev) * 100 : prev ? ((now - prev) / prev) * 100 : null;
  if (d === null || Math.abs(d) < (kind === 'pts' ? 0.5 : 3)) return null;
  const better = (d > 0) === (good === 'up');
  const v = Math.abs(d);
  return (
    <span className={`delta ${better ? 'up' : 'down'}`} title={kind === 'pts' ? 'Change from the year before, percentage points' : 'Change from the year before'}>
      {d > 0 ? '▲' : '▼'}{kind === 'pts' ? (v < 10 ? v.toFixed(1) : Math.round(v)) : Math.round(v)}{kind === 'pts' ? ' pts' : '%'}
    </span>
  );
}

/** "A Tag" / "Regular Deer Tag" / "White-tailed Deer Tag" for a nonresident general tag row. */
function tagLabel(r: HuntSummary): string {
  if (r.species === 'ELK') return `${(r.id.split(':')[3] ?? '').toUpperCase()} Tag`;
  return r.tagCode?.startsWith('WD') ? 'White-tailed Deer Tag' : 'Regular Deer Tag';
}
