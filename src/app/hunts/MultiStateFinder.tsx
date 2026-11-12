import { FilterPresets } from '@/components/FilterPresets';
import { withPresetEdit } from '@/lib/filterPresets';
import { HuntLink, RememberFinderNavigation } from '@/components/HuntNavigation';
import Link from 'next/link';
import { searchHunts } from '@/lib/searchData';
import { param, type SearchParams, type SearchResult } from '@/lib/multiStateSearch';
import { STATES, unitKey } from '@/lib/states';
import { MtFinderNotice } from '@/components/MtHome';
import { searchDraw, searchUnitKey, searchUnitLabel } from '@/lib/searchStates';
import { SearchStates } from '@/components/SearchStates';
import { FilterRail } from '@/components/FilterRail';
import { CoSearchFilters } from '@/components/CoSearchFilters';
import { HuntMap, type MatchStat } from '@/components/HuntMap';
import { HuntCard } from '@/components/HuntCards';
import { CoHuntCard } from '@/components/CoHuntCard';
import { WyHuntCard } from '@/components/WyHuntCard';
import { WySearchFilters } from '@/components/WySearchFilters';
import { MtHuntCard } from '@/components/MtHuntCard';
import { MtSearchFilters } from '@/components/MtSearchFilters';
import { wyWilderness } from '@/lib/wyWilderness';
import { getFavorites } from '@/lib/favorites';
import { residencyFields } from '@/lib/finder';
import { chanceOf } from '@/lib/coOdds';
import { huntHref } from '@/lib/huntSlug';
import { pct, WEAPON, SPECIES_LABEL, range } from '@/lib/format';
import { seasonsSummary } from '@/lib/tagSeasons';
import { SortSelect } from '@/components/SortSelect';
import { DRAW_LABEL } from '@/lib/species';
import { CompareToggle } from '@/components/Compare';

const PAGE_SIZE = 40;
const SORTS: [string, string][] = [['opp', 'Opportunity'], ['score', 'Quality'], ['odds', 'My odds'], ['best', 'Draw and fill'], ['success', 'Harvest success'], ['public', 'Public land'], ['densityLow', 'Fewest hunters per sq mi'], ['open', 'Opening date'], ['alpha', 'State / unit'], ['big', 'Trophy potential'], ['harvest', 'Most harvest'], ['hunters', 'Most hunters'], ['huntersLow', 'Fewest hunters'], ['apps', 'Most applicants (my residency)'], ['appsLow', 'Fewest applicants (my residency)'], ['tags', 'Most tags'], ['leftover', 'Leftover tags (Idaho)'], ['pts', 'Points needed (Colorado, Wyoming NR)'], ['creep', 'Point creep (Colorado, Wyoming NR)'], ['unit', 'Unit']];
const max = (values: (number | null)[]) => { const finite = values.filter((v): v is number => v !== null && Number.isFinite(v)); return finite.length ? Math.max(...finite) : null; };

export async function MultiStateFinder({ sp }: { sp: SearchParams }) {
  const [{ header, states, settings, results, overlaps, wySavedSpecial, indexed }, fav] = await Promise.all([searchHunts(sp), getFavorites()]);
  // Montana's notice stands in for an empty state: once Montana rows are imported it is not shown
  const mtEmpty = states.includes('MT') && !indexed.MT;
  const draw = searchDraw(param(sp, 'draw'), param(sp, 'species').toUpperCase());
  const msg = draw === 'MSG';
  const stateCounts = states.map(state => ({ state, count: results.filter(x => x.r.state === state).length }));
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
      // public + access program: Idaho's Access Yes!, Montana's Block Management Type 1 (never Type 2). Other
      // states have no measured program, so no value rather than public land relabelled.
      huntable: key.startsWith('ID:') || key.startsWith('MT:') ? max(rows.map(x => x.r.huntablePct)) : null, objBull: null, objCow: null,
      // Wyoming only: read from data/wy/wilderness.json at render time, so no production row carries it. An area the
      // build measured and found none in is 0, not unknown; other states are not measured at all.
      wilderness: key.startsWith('WY:') ? wyWilderness(key.slice(3))?.pct ?? 0 : null };
  }
  const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  // Idaho's general seasons share unit/weapon harvest data. Preserve its existing card grouping.
  const cards = new Map<string, { x: SearchResult; also: SearchResult['r'][] }>();
  for (const x of results) {
    const key = x.r.state === 'ID' && x.r.type === 'GENERAL' && !x.r.nrTag ? `ID:${x.r.species}:${x.r.unit ?? x.r.units[0]}:${x.r.weapon}` : x.r.id;
    const existing = cards.get(key);
    if (existing) existing.also.push(x.r);
    else cards.set(key, { x, also: [] });
  }
  const total = view === 'unit' ? entries.length : view === 'table' ? results.length : cards.size;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(param(sp, 'page')) || 1)));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mode = param(sp, 'odds') === 'last' ? 'last' : 'proj';
  const selectedUnit = param(sp, 'unit');
  const renderCard = (x: SearchResult, key: string, also: SearchResult['r'][] = []) => <div key={key} className="search-result">
    <details className="small search-result-context"><summary><b>{STATES[x.r.state as keyof typeof STATES].name}</b> · {x.nr ? 'Nonresident' : 'Resident'} · Opportunity {x.opportunity ?? '—'}</summary><p>{x.basis}{x.r.state === 'CO' && settings.CO.youth ? ' · Youth pool' : ''}{x.r.state === 'WY' && x.nr && settings.WY?.wySpecial ? ' · Special pool' : ''}{x.r.scoreQuality === null ? ' · Incomplete scoring data' : ''}</p></details>
    {x.r.state === 'MT' ? <MtHuntCard r={x.r} odds={x.odds} parts={x.mtParts} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />
      : x.r.state === 'WY' ? <WyHuntCard r={x.r} odds={x.odds} points={x.points} nr={x.nr} special={settings.WY?.wySpecial === true} poolLink={param(sp, 'wyPool')} mode={mode} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />
      : x.r.state === 'CO' ? <CoHuntCard r={x.r} preScored hasOtcElk={overlaps[x.r.id] === true} odds={x.odds} chance={chanceOf(x.odds, 0, x.odds ?? 0)} points={x.points} nr={x.nr} mode={mode} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />
      : <article className="ucard single"><HuntCard r={x.r} also={also} c={{ nr: x.nr, rf: residencyFields(x.nr ? 'NONRESIDENT' : 'RESIDENT'), favHunts: fav.hunts, signedIn: fav.signedIn, sort }} /></article>}
  </div>;
  return <main className={`filtering multi-state-finder${view === 'table' ? ' tablemode' : ''}`}>
    <section className="f-map" aria-label="Map of matching units across selected states"><HuntMap key={`${states.join(',')}:${draw}:${msg || states.includes('WY') || states.includes('MT') ? param(sp, 'species') : ''}`} states={states} searchGroup={draw} species={msg || states.includes('WY') || states.includes('MT') ? param(sp, 'species').toUpperCase() : ''} matched={[...groups.keys()]} selected={selectedUnit} stats={{ units: stats, areas: {} }} chips={selectedUnit ? [{ label: `Unit ${searchUnitLabel(selectedUnit)}`, href: `/hunts${q({ unit: null, page: null })}` }] : []} /></section>
    <section className="f-list" aria-label="Results">
      <RememberFinderNavigation />
      <div className="search-intro">
        <h1>Find A Hunt</h1>
        <div className="seg light" role="group" aria-label="Hunt species group">
          {(['DEP', 'MSG'] as const).map(group => <Link key={group} className="seg-link" aria-pressed={group === draw} href={group === draw ? q({}) : withPresetEdit(`/hunts?states=${states.join(',')}&draw=${group.toLowerCase()}`, sp.editPreset)}>{DRAW_LABEL[group]}</Link>)}
          {msg && states.length === 1 && <Link className="seg-link" href={q({ states: 'CO,ID', draw: 'msg', unit: null, page: null })}>Search both states</Link>}
        </div>
        <details className="search-setup">
          <summary>States &amp; Settings</summary>
          <p className="small muted search-state-counts">{stateCounts.map(({ state, count }) => `${STATES[state].name}: ${count}`).join(' · ')}</p>
          <SearchStates />
          <Link className="small" href="/account#hunting-preferences">Edit hunting preferences in Account</Link>
          <details className="small muted search-ranking"><summary>How these rankings compare</summary><p>Opportunity = Quality × √your tag odds. Idaho uses historical draw odds; {msg ? 'Colorado uses published first-choice results at your saved regular and weighted points, residency and age group. Before points are saved, rates are pooled previews.' : `Colorado uses your points and ${mode === 'proj' ? 'projected' : 'historical'} odds.`}{states.includes('WY') ? ' Wyoming nonresidents: your points in the regular or special pool (preference draw, then random draw); antelope and deer are projected, elk shows the last draw. Wyoming residents: estimated random-draw odds.' : ''}{states.includes('MT') ? ' Montana: permits, antelope and B licenses are projected for the next draw (FWP\'s weighted draw re-run on the last one, backtested), at your bonus points for that license type, if you buy a point this year; general licenses are over the counter for residents and need the combination draw (its last draw) for nonresidents.' : ''} Unknown scores sort after ranked hunts. Report years and season dates vary; details show the underlying evidence.</p></details>
        </details>
      </div>
      <div className="f-head search-toolbar">
        <div className="f-sub search-sort"><span><b>{results.length}</b> hunt options</span><span className="search-sort-control"><span>Sort by</span><SortSelect value={sort} options={SORTS} /></span></div>
        <div className="f-sub"><div className="seg light" role="group" aria-label="List by">{[['hunt', 'By hunt'], ['unit', 'By unit'], ['table', 'Table']].map(([value, label]) => <Link key={value} className="seg-link" aria-pressed={(view || 'hunt') === value} href={`/hunts${q({ view: value, page: null })}`} scroll={false}>{label}</Link>)}</div><a className="small" href={`/api/export${q({ page: null })}`}>Download CSV</a><Link className="small" href={withPresetEdit(`/hunts?states=${states.join(',')}${msg ? '&draw=msg' : '&antler=ANTLERED'}&sort=opp&minScore=0`, sp.editPreset)}>Reset filters</Link></div>
      </div>
      {mtEmpty && <MtFinderNotice only={states.length === 1} />}
      {!results.length && !(mtEmpty && states.length === 1) && <div className="ucard"><h2>No Hunts Match</h2><p>Remove a filter or adjust your states. State-specific filters narrow only the states named in their notes.</p></div>}
      {view === 'table' ? <div className="htable-wrap"><table className="htable"><thead><tr><th aria-label="Compare" />{['State', 'Hunt', 'Species', 'Units', 'Weapon', 'Season dates', 'Your odds', 'Odds basis', 'Success', 'Public land', 'Quality', 'Opportunity'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{shown.map(x => <tr key={x.r.id}><td><CompareToggle id={x.r.id} label={x.r.name} compact /></td><td>{x.r.state}</td><td><HuntLink href={huntHref(x.r) + (x.r.state === 'WY' && param(sp, 'wyPool') ? `?pool=${param(sp, 'wyPool')}` : '')}>{x.r.name}</HuntLink></td><td>{SPECIES_LABEL[x.r.species]}</td><td>{x.r.units.join(', ')}</td><td>{WEAPON[x.r.weapon]}</td><td>{seasonsSummary(x.r.tagSeasons) || range(x.r.openDate, x.r.closeDate)}</td><td>{pct(x.odds)}</td><td>{x.basis}</td><td>{pct(x.r.success5)}</td><td>{x.r.publicPct === null ? '—' : `${Math.round(x.r.publicPct)}%`}</td><td>{x.r.scoreQuality ?? '—'}</td><td>{x.opportunity ?? '—'}</td></tr>)}</tbody></table></div>
        : view === 'unit' ? entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(([key, rows]) => { const [state, unit] = key.split(':'); return <div key={key} className="ucard"><h2><HuntLink href={`/units/${unitKey(state, unit)}`}>{STATES[state as keyof typeof STATES].name} · Unit {unit}</HuntLink></h2>{rows.map(x => renderCard(x, x.r.id))}</div>; })
          : [...cards.entries()].slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(([key, { x, also }]) => renderCard(x, key, also))}
      {pages > 1 && <nav className="search-pagination" aria-label="Results pages">{page > 1 && <Link className="btn" href={`/hunts${q({ page: String(page - 1) })}`} scroll={false}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="btn" href={`/hunts${q({ page: String(page + 1) })}`} scroll={false}>Next</Link>}</nav>}
    </section>
    <FilterRail residency={settings.ID} states={states} draw={draw}
      presets={<FilterPresets key={fav.userId} owner={fav.userId} state={header.code} states={states} />}
      drawFilters={!msg && states.includes('CO') && <CoSearchFilters part="points" />}
      stateFilters={msg ? {} : { CO: <CoSearchFilters part="state" />, WY: <WySearchFilters nr={settings.WY?.res !== 'RESIDENT'} savedSpecial={wySavedSpecial} />, MT: <MtSearchFilters nr={settings.MT?.res !== 'RESIDENT'} /> }} />
  </main>;
}
