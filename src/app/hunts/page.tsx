import Link from 'next/link';
import { ELK_ZONES } from '@/lib/elkZones';
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

type Group = { key: string; title: string; kind: 'unit'; name: string; rows: HuntSummary[] };

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
  if (f.maxDensity) add(`≤ ${f.maxDensity} hunters/mi²`, { maxDensity: null });
  if (f.unit) add(`Unit ${f.unit}`, { unit: '' });
  if (f.zone) add(`${f.zone} elk zone`, { zone: '' });
  if (f.q) add(`"${f.q}"`, { q: '' });
  return out;
}

export default async function Filtering({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const { residency } = await getResidency(sp.as);
  const nr = residency === 'NONRESIDENT';
  const rf = residencyFields(residency);
  const [rows, fav] = await Promise.all([
    db.huntSummary.findMany({ where: buildWhere(f, residency), orderBy: buildOrder(f, residency), take: MAX_ROWS }),
    getFavorites(),
  ]);

  // Everything is listed by unit: one card per unit + species. General seasons first (for nonresidents they
  // carry the unit's / zone's tag odds, so the Regular Deer tag and elk zone A/B tag rows would only repeat
  // them), then the controlled hunts. A controlled hunt (or tag) covering several units appears in each.
  const visible = f.type === 'NRTAG' ? rows : rows.filter((r) => !r.nrTag || r.tagCode?.startsWith('WD'));
  const groups = new Map<string, Group>();
  for (const r of visible) {
    const us = r.type === 'GENERAL' && !r.nrTag ? [r.unit ?? r.units[0]] : r.units;
    for (const u of us) {
      if (!u || (f.unit && u !== f.unit) || (f.zone && !ELK_ZONES[f.zone].includes(u))) continue;
      const key = `${r.species}|${u}`;
      const g = groups.get(key) ?? groups.set(key, { key, kind: 'unit', name: u, rows: [], title: `Unit ${u} · ${r.species === 'ELK' ? 'Elk' : 'Deer'}` }).get(key)!;
      g.rows.push(r);
    }
  }
  const list = [...groups.values()];
  // inside a card: general seasons (and the white-tailed tag) first, then controlled hunts; the chosen sort is kept within each
  for (const g of list) g.rows.sort((a, b) => (a.type === 'CONTROLLED' ? 1 : 0) - (b.type === 'CONTROLLED' ? 1 : 0));
  const matched = [...new Set(rows.flatMap((r) => r.units))].filter((u) => !f.zone || ELK_ZONES[f.zone].includes(u));
  const unitInfo = new Map(
    (await db.unit.findMany({ where: { name: { in: list.map((g) => g.name) } }, select: { name: true, elkZone: true, publicPct: true, acres: true, accessYesAcres: true } })).map((u) => [u.name, u]),
  );

  const best = (g: Group, k: keyof HuntSummary) => {
    const v = g.rows.map((r) => r[k] as number | null).filter((x): x is number => x !== null && x !== undefined);
    return v.length ? Math.max(...v) : null;
  };

  return (
    <main className="filtering">
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap matched={matched} selected={f.unit} chips={chips(f, nr)} showZones={f.species !== 'DEER'} zone={f.zone} />
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
          const u = unitInfo.get(g.name);
          const gen = g.rows.find((r) => r.type === 'GENERAL' && !r.nrTag) ?? first;
          const ay = u?.acres ? ((u.accessYesAcres ?? 0) / u.acres) * 100 : null;
          const desc = [u?.elkZone ? `${u.elkZone} elk zone` : '', `${g.rows.length} hunt${g.rows.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
          const big = best(g, 'bigPct5');
          return (
            <article key={g.key} className={`ucard ${f.unit === g.name ? 'sel' : ''}`}>
              <h2 className="star-head">
                <Star kind="unit" id={g.name} saved={fav.units.has(g.name)} signedIn={fav.signedIn} />
                <Link href={unitHref(g.name, f)}>{g.title}</Link>
              </h2>
              <p className="desc">{desc}</p>
              <div className="ustats">
                <div>Trophy<b>{pct(big)}</b></div>
                <div>Public Land<b>{pct100(u?.publicPct ?? first.publicPct)}</b></div>
                <div>Access Yes!<b>{ay !== null ? `${ay < 1 && ay > 0 ? '<1' : Math.round(ay)}%` : '-'}</b></div>
                <div>{first.species === 'DEER' ? 'Deer' : 'Hunts'}<b style={{ fontSize: first.species === 'DEER' ? '1rem' : undefined }}>{first.species === 'DEER' ? (gen.deerType ? DEERTYPE[gen.deerType] : '-') : g.rows.length}</b></div>
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
                          {r.nrTag ? `${tagLabel(r)}${r.tagCode ? ` · ${r.tagCode}` : ''}` : <>{r.huntNumber ? `Hunt ${r.huntNumber} · ` : r.type === 'GENERAL' ? 'General · ' : ''}{WEAPON[r.weapon]} · {ANTLER[r.antlerClass]}</>}
                        </Link>
                        {r.nrTag && <span className="pill ctl">NR Tag Draw</span>}
                      </span>
                      <span className="small muted">
                        {r.nrTag ? (r.quota !== null ? `${int(r.quota)} NR tags${r.quotaYear ? ` (${r.quotaYear})` : ''}${r.capped ? ' · capped' : ''}` : '-') : r.type === 'GENERAL' ? (r.tags ? `${int(r.tags)} tags` : nr ? (r.tagCode ? `NR tag: ${r.tagCode}` : 'NR tag required') : 'OTC') : `${int(r.tags)} tags`}
                      </span>
                    </div>
                    <div className="dates">
                      {r.nrTag
                        ? (seasonsSummary(r.tagSeasons) || `Nonresident general tag · ${r.species === 'ELK' ? `units ${r.units.join(', ')}` : `unit ${r.unit}`} · seasons: see the regulations`)
                        : <>{r.type === 'CONTROLLED' ? `Area ${r.areaName}${r.units.length > 1 ? ` (units ${r.units.join(', ')})` : ''} · ` : ''}{r.type === 'GENERAL' && !/^Unit \S+ General/i.test(r.name) ? `${r.name} · ` : ''}{r.type === 'GENERAL' && seasonsSummary(r.tagSeasons) ? seasonsSummary(r.tagSeasons) : r.openDate ? range(r.openDate, r.closeDate) : 'Dates: see regulations'}</>}
                    </div>
                    <div className="hrow-stats">
                      <div>Draw Odds{r.oddsLastYear ? ` ${r.oddsLastYear}` : ''}
                        <b>
                          {r.type === 'GENERAL' && !r.nrTag && !(nr && oddsLast !== null) ? (nr ? 'Tag' : 'OTC') : pct(oddsLast, oddsLast !== null && oddsLast < 0.1 ? 1 : 0)}
                          {r.type === 'CONTROLLED' && <Delta now={oddsLast} prev={r[rf.oddsPrev]} kind="pts" good="up" />}
                        </b>
                        {r.type === 'CONTROLLED' && <span className="sub">5-yr {pct(odds, odds !== null && odds < 0.1 ? 1 : 0)}</span>}
                        {r.nrTag && <span className="sub">1st choice</span>}
                        {nr && r.type === 'GENERAL' && !r.nrTag && <span className="sub">{nrTagLine(r.nrTagOdds)}</span>}
                      </div>
                      <div>Success{r.harvestLastYear ? ` ${r.harvestLastYear}` : ''}
                        <b>{pct(r.successLast)}<Delta now={r.successLast} prev={r.successPrev} kind="pts" good="up" /></b>
                        <span className="sub">
                          {f.sort === 'harvest' ? `5-yr harvest ${int(r.harvest5)}` : f.sort === 'hunters' || f.sort === 'huntersLow' ? `5-yr hunters ${int(r.hunters5)}` : `${r.type === 'GENERAL' && r.harvestYears > 0 && r.harvestYears < 5 ? `${r.harvestYears}-yr` : '5-yr'} ${pct(r.success5)}`}
                        </span>
                      </div>
                      <div>Applicants{r.oddsLastYear ? ` ${r.oddsLastYear}` : ''}
                        <b>
                          {r.type === 'GENERAL' && !r.nrTag && !(nr && apps !== null) ? '-' : int(apps)}
                          {r.type === 'CONTROLLED' && <Delta now={apps} prev={r[rf.appsPrev]} kind="pct" good="down" />}
                        </b>
                        {r.type === 'CONTROLLED' && r.appsLast !== null && <span className="sub">all {int(r.appsLast)}</span>}
                      </div>
                      <div title="Average hunters per year for this hunt / season, per square mile of its area">Hunters/Mi²
                        <b>{density(r.huntersSqMi)}</b>
                        {r.hunters5 && r.harvestYears ? <span className="sub">{int(r.hunters5 / r.harvestYears)}/yr</span> : null}
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

/** Under a general season's odds (nonresidents): which tag the odds are for. Two elk tags: both odds. */
function nrTagLine(v: unknown): string {
  const t = (v as { label: string; code: string; odds: number | null }[] | null) ?? [];
  if (!t.length) return 'No NR tag data';
  const p = (o: number | null) => (o === null ? '-' : `${(o * 100).toFixed(o < 0.1 ? 1 : 0)}%`);
  if (t.length > 1 && t[0].label.includes(' tag') && !t[0].code.startsWith('RD')) return t.map((x) => `${x.label.split(' ').slice(-2).join(' ')} ${p(x.odds)}`).join(' · ');
  return `${t[0].code} · 1st choice`;
}

/** Hunters per square mile: one decimal under 10, whole numbers above. */
function density(v: number | null): string {
  if (v === null || v === undefined) return '-';
  return v < 0.1 ? '<0.1' : v < 10 ? v.toFixed(1) : String(Math.round(v));
}

/** Unit page link that keeps what Filtering was narrowed to (species, hunt type, a single weapon). */
function unitHref(unit: string, f: Filters): string {
  const q = new URLSearchParams();
  if (f.species) q.set('species', f.species);
  if (f.type === 'GENERAL' || f.type === 'CONTROLLED') q.set('type', f.type);
  if (f.weapon.length === 1 && f.weapon[0] !== 'SHORT_RANGE') q.set('weapon', f.weapon[0]);
  return `/units/${encodeURIComponent(unit)}${q.size ? `?${q}` : ''}`;
}

