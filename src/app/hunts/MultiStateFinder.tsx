import Link from 'next/link';
import { searchHunts } from '@/lib/searchData';
import { param, type SearchParams, type SearchResult } from '@/lib/multiStateSearch';
import { STATES, unitKey } from '@/lib/states';
import { searchUnitKey } from '@/lib/searchStates';
import { SearchStates } from '@/components/SearchStates';
import { SearchSettings } from '@/components/SearchSettings';
import { FilterRail } from '@/components/FilterRail';
import { CoSearchFilters } from '@/components/CoSearchFilters';
import { HuntMap, type MatchStat } from '@/components/HuntMap';
import { HuntCard } from '@/components/HuntCards';
import { CoHuntCard } from '@/components/CoHuntCard';
import { getFavorites } from '@/lib/favorites';
import { residencyFields } from '@/lib/finder';
import { chanceOf } from '@/lib/coOdds';
import { huntHref } from '@/lib/huntSlug';
import { pct, WEAPON, SPECIES_LABEL, range } from '@/lib/format';
import { seasonsSummary } from '@/lib/tagSeasons';
import { ID_RESTRICTIONS, CO_RESTRICTIONS } from '@/lib/multiStateSearch';
import { SortSelect } from '@/components/SortSelect';

const PAGE_SIZE = 40;
const SORTS: [string, string][] = [['opp', 'Opportunity'], ['score', 'Quality'], ['odds', 'My odds'], ['best', 'Draw and fill'], ['success', 'Harvest success'], ['public', 'Public land'], ['densityLow', 'Fewest hunters per sq mi'], ['open', 'Opening date'], ['alpha', 'State / unit'], ['big', 'Trophy potential'], ['harvest', 'Most harvest'], ['hunters', 'Most hunters'], ['huntersLow', 'Fewest hunters'], ['apps', 'Most applicants (my residency)'], ['appsLow', 'Fewest applicants (my residency)'], ['tags', 'Most tags'], ['leftover', 'Leftover tags (Idaho)'], ['pts', 'Points needed (Colorado)'], ['creep', 'Point creep (Colorado)'], ['unit', 'Unit']];
const max = (values: (number | null)[]) => { const finite = values.filter((v): v is number => v !== null && Number.isFinite(v)); return finite.length ? Math.max(...finite) : null; };

export async function MultiStateFinder({ sp }: { sp: SearchParams }) {
  const [{ states, settings, results, overlaps }, fav] = await Promise.all([searchHunts(sp), getFavorites()]);
  const sort = param(sp, 'sort') || 'opp';
  const view = param(sp, 'view');
  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v !== undefined && k !== 'reset') p.set(k, Array.isArray(v) ? v.join(',') : v);
    p.set('states', states.join(','));
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    return `?${p}`;
  };
  const groups = new Map<string, SearchResult[]>();
  for (const x of results) for (const unit of x.r.units) {
    const key = searchUnitKey(x.r.state, unit);
    const rows = groups.get(key) ?? [];
    rows.push(x); groups.set(key, rows);
  }
  const stats: Record<string, MatchStat> = {};
  for (const [key, rows] of groups) {
    const successRows = rows.filter(x => x.r.hunters5 !== null && x.r.harvest5 !== null && x.r.hunters5 > 0);
    const hunters = successRows.reduce((n, x) => n + x.r.hunters5!, 0);
    const crowd = rows.map(x => x.r.huntersSqMi).filter((v): v is number => v !== null && Number.isFinite(v));
    stats[key] = { score: max(rows.map(x => x.r.scoreQuality)), odds: max(rows.map(x => x.odds)),
      fill: max(rows.map(x => x.odds !== null && x.r.success5 !== null ? x.odds * x.r.success5 : null)),
      success: hunters ? successRows.reduce((n, x) => n + x.r.harvest5!, 0) / hunters : null,
      public: max(rows.map(x => x.r.publicPct)), crowd: crowd.length ? Math.min(...crowd) : null,
      huntable: null, objBull: null, objCow: null };
  }
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const total = view === 'unit' ? entries.length : results.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(param(sp, 'page')) || 1)));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mode = param(sp, 'odds') === 'last' ? 'last' : 'proj';
  const renderCard = (x: SearchResult, key: string) => <div key={key} className="search-result">
    <p className="small search-result-context"><b>{STATES[x.r.state as keyof typeof STATES].name}</b> · {x.nr ? 'Nonresident' : 'Resident'}{x.r.state === 'CO' && settings.CO.youth ? ' · Youth pool' : ''} · {x.basis} · Opportunity {x.opportunity ?? '—'}{x.r.scoreQuality === null ? ' · Incomplete scoring data' : ''}</p>
    {x.r.state === 'CO' ? <CoHuntCard r={x.r} preScored hasOtcElk={overlaps[x.r.id] === true} odds={x.odds} chance={chanceOf(x.odds, 0, x.odds ?? 0)} points={x.points ?? 0} nr={x.nr} mode={mode} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />
      : <article className="ucard single"><HuntCard r={x.r} c={{ nr: x.nr, rf: residencyFields(x.nr ? 'NONRESIDENT' : 'RESIDENT'), favHunts: fav.hunts, signedIn: fav.signedIn, sort }} /></article>}
  </div>;
  return <main className={`filtering${view === 'table' ? ' tablemode' : ''}`}>
    <section className="f-map" aria-label="Map of matching units across selected states"><HuntMap key={states.join(',')} states={states} matched={[...groups.keys()]} selected={param(sp, 'unit')} stats={{ units: stats, areas: {} }} chips={param(sp, 'unit') ? [{ label: `Unit ${param(sp, 'unit')}`, href: `/hunts${q({ unit: null, page: null })}` }] : []} /></section>
    <section className="f-list" aria-label="Results">
      <div className="f-head"><div className="f-title"><h1>Find A Hunt</h1></div><SearchStates /><SearchSettings states={states} settings={settings} />
        <div className="f-sub"><span><b>{results.length}</b> hunt options · {states.map(s => `${STATES[s].name}: ${results.filter(x => x.r.state === s).length}`).join(' · ')}</span></div>
        <div className="f-sub"><span>Sort by</span><SortSelect value={sort} options={SORTS} /></div>
        <div className="f-sub"><div className="seg light" role="group" aria-label="List by">{[['hunt', 'By hunt'], ['unit', 'By unit'], ['table', 'Table']].map(([value, label]) => <Link key={value} className="seg-link" aria-pressed={(view || 'hunt') === value} href={`/hunts${q({ view: value, page: null })}`} scroll={false}>{label}</Link>)}</div><a className="small" href={`/api/export${q({ page: null })}`}>Download CSV</a><Link className="small" href={`/hunts?states=${states.join(',')}&sort=opp&minScore=0&antler=ANTLERED`}>Reset filters</Link></div>
        <p className="small muted">Opportunity = Quality × √your tag odds. Idaho uses historical draw odds; Colorado uses your points and {mode === 'proj' ? 'projected' : 'historical'} odds. Unknown scores sort after ranked hunts. Report years and season dates vary; details show the underlying evidence.</p>
        {[...ID_RESTRICTIONS, ...CO_RESTRICTIONS].some(k => !!param(sp, k)) && <p role="status" className="small">State-specific restrictions are active. Their filters explain which states can match.</p>}
      </div>
      {!results.length && <div className="ucard"><h2>No Hunts Match</h2><p>Remove a filter or adjust your states. State-specific restrictions can exclude the other states.</p></div>}
      {view === 'table' ? <div className="htable-wrap"><table className="htable"><thead><tr>{['State', 'Hunt', 'Species', 'Units', 'Weapon', 'Season dates', 'Your odds', 'Odds basis', 'Success', 'Public land', 'Quality', 'Opportunity'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{shown.map(x => <tr key={x.r.id}><td>{x.r.state}</td><td><Link href={huntHref(x.r)}>{x.r.name}</Link></td><td>{SPECIES_LABEL[x.r.species]}</td><td>{x.r.units.join(', ')}</td><td>{WEAPON[x.r.weapon]}</td><td>{seasonsSummary(x.r.tagSeasons) || range(x.r.openDate, x.r.closeDate)}</td><td>{pct(x.odds)}</td><td>{x.basis}</td><td>{pct(x.r.success5)}</td><td>{x.r.publicPct === null ? '—' : `${Math.round(x.r.publicPct)}%`}</td><td>{x.r.scoreQuality ?? '—'}</td><td>{x.opportunity ?? '—'}</td></tr>)}</tbody></table></div>
        : view === 'unit' ? entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(([key, rows]) => { const [state, unit] = key.split(':'); return <div key={key} className="ucard"><h2><Link href={`/units/${unitKey(state, unit)}`}>{STATES[state as keyof typeof STATES].name} · Unit {unit}</Link></h2>{rows.map(x => renderCard(x, x.r.id))}</div>; })
          : shown.map(x => renderCard(x, x.r.id))}
      {pages > 1 && <nav className="search-pagination" aria-label="Results pages">{page > 1 && <Link className="btn" href={`/hunts${q({ page: String(page - 1) })}`} scroll={false}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn" href={`/hunts${q({ page: String(page + 1) })}`} scroll={false}>Next</Link>}</nav>}
    </section>
    <FilterRail residency={settings.ID} states={states}>{states.includes('CO') && <CoSearchFilters />}</FilterRail>
  </main>;
}
