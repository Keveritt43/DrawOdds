import { FilterPresets } from '@/components/FilterPresets';
import { withPresetEdit } from '@/lib/filterPresets';
import { HuntLink } from '@/components/HuntNavigation';
import { matchesHuntSeason } from "@/lib/huntSeasonFilter";
import { savedFilters } from "@/lib/savedFilters";
import { restoresSavedFilters } from "@/lib/filterPreferences";
import { migrationUnits } from '@/lib/migrations';
import { dayLabel } from '@/lib/seasonDays';
import { huntHref } from '@/lib/huntSlug';
import { unitObjective, OBJ_NUM } from '@/lib/elkObjectives';
import { unitOrder } from '@/lib/format';
import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { getResidency, getDraw, getState } from '@/lib/residency';
import { CoFinder } from './CoFinder';
import { MultiStateFinder } from './MultiStateFinder';
import { SyncState } from '@/components/SyncState';
import { searchDraw, combinedFinderRedirect } from '@/lib/searchStates';
import { SearchStates } from '@/components/SearchStates';
import { DRAW_SPECIES, AREA_SPECIES, SIZE_LABEL, type SpeciesKey } from '@/lib/species';
import { parseFilters, buildWhere, buildOrder, residencyFields, toQuery, zoneUnits, type Filters } from '@/lib/finder';
import { FilterRail } from '@/components/FilterRail';
import { HuntMap } from '@/components/HuntMap';
import { SortSelect } from '@/components/SortSelect';
import { RememberQuery, LAST_HUNTS_COOKIE } from '@/components/BackLink';
import { redirect } from 'next/navigation';
import { HuntTable } from '@/components/HuntTable';
import { HuntCard, ZoneCard, TopPicks, choosePicks, type CardCtx } from '@/components/HuntCards';
import { pct, pct100, WEAPON, DEERTYPE, SPECIES_LABEL, TROPHY_LABEL, antlerLabel } from '@/lib/format';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { Term } from '@/components/Term';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Find A Hunt' };

const MAX_ROWS = 800;
const PER_PAGE = 30;

/** Active filters as removable chips over the map (residency isn't a filter: it's the switch above the list). */
function chips(f: Filters, query: (patch: Partial<Filters>) => string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const add = (label: string, patch: Partial<Filters>) => out.push({ label, href: `/hunts${query({ ...patch, page: 1 })}` });
  const sex = (a: string) => (f.species ? antlerLabel(f.species, a) : ({ ANTLERED: 'Bucks & bulls', ANTLERLESS: 'Does & cows', EITHER: 'Either sex' } as Record<string, string>)[a] ?? a);
  if (f.species) add(SPECIES_LABEL[f.species], { species: '' });
  if (f.type) add(f.type === 'CONTROLLED' ? 'Controlled' : f.type === 'NRTAG' ? 'NR general tag draw' : 'General', { type: '' });
  f.weapon.forEach((w) => add(WEAPON[w], { weapon: f.weapon.filter((x) => x !== w) }));
  f.antler.forEach((a) => add(sex(a), { antler: f.antler.filter((x) => x !== a) }));
  f.deerType.forEach((d) => add(DEERTYPE[d], { deerType: f.deerType.filter((x) => x !== d) }));
  if (f.dayFrom !== null && f.dayTo !== null) add(`${f.dayMode === 'end' ? 'Ends' : 'Open'} ${dayLabel(f.dayFrom)} – ${dayLabel(f.dayTo)}`, { dayFrom: null, dayTo: null, dayMode: 'open' });
  if (f.months.length) add(`Open: ${f.months.map((m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]).join(', ')}`, { months: [] });
  if (f.minOdds) add(`Odds ${f.minOdds}%-100%`, { minOdds: null });
  if (f.minSuccess) add(`Success ${f.minSuccess}%+`, { minSuccess: null });
  if (f.minBig) add(`Trophy ${f.minBig}%+`, { minBig: null });
  if (f.minPublic) add(`Public ${f.minPublic}%+`, { minPublic: null });
  if (f.minAccessYes) add(`Access Yes! ${f.minAccessYes}%+`, { minAccessYes: null });
  if (f.minHuntable) add(`Huntable ${f.minHuntable}%+`, { minHuntable: null });
  if (f.accessYes) add('Has Access Yes!', { accessYes: false });
  if (f.leftover) add('Had leftover tags', { leftover: false });
  if (f.migration) add(f.migration === 'yes' ? 'Has migration study' : 'No migration study', { migration: '' });
  if (f.bullObj.length) add(`Bulls ${f.bullObj.map((x) => x.toLowerCase()).join('/')} objective`, { bullObj: [] });
  if (f.cowObj.length) add(`Cows ${f.cowObj.map((x) => x.toLowerCase()).join('/')} objective`, { cowObj: [] });
  if (f.minScore) add(f.sort === 'opp' && f.minScore === 50 ? 'Quality 50+ (Opportunity sort)' : `Score ${f.minScore}+`, { minScore: f.sort === 'opp' ? 0 : null });
  if (f.minOpp) add(`Opportunity ${f.minOpp}+`, { minOpp: null });
  if (f.minTags) add(`${f.minTags}+ tags`, { minTags: null });
  if (f.maxDensity) add(`≤ ${f.maxDensity} hunters/mi²`, { maxDensity: null });
  if (f.unit) add(`Unit ${f.unit}`, { unit: '' });
  for (const z of f.zones) add(`${z} elk zone`, { zones: f.zones.filter((x) => x !== z) });
  if (f.q) add(`"${f.q}"`, { q: '' });
  return out;
}

/** The most common value: "the 2026 draw" when nearly every row is from it. */
function mode(xs: (number | null | undefined)[]): number | null {
  const c = new Map<number, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

type Listing = { kind: 'hunt'; key: string; r: HuntSummary; also: HuntSummary[] } | { kind: 'zone'; key: string; zone: string; rows: HuntSummary[] };
type Group = { key: string; title: string; kind: 'unit' | 'area'; name: string; species: string; rows: HuntSummary[] };

export default async function Filtering({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (sp.states !== undefined) {
    const picked = String(Array.isArray(sp.states) ? sp.states[0] : sp.states).split(',').filter(Boolean);
    return <>{picked.length === 1 && <SyncState code={picked[0]} />}<MultiStateFinder sp={sp} /></>;
  }
  const state = (await getState(sp.state)).code;
  // Wyoming and Montana live only in the combined finder
  const combined = combinedFinderRedirect(state, sp);
  if (combined) redirect(combined);
  if (state === 'CO' && searchDraw(Array.isArray(sp.draw) ? sp.draw[0] : sp.draw, Array.isArray(sp.species) ? sp.species[0] : sp.species) === 'MSG') {
    redirect(`/hunts?${new URLSearchParams(Object.entries({ ...sp, states: 'CO', draw: 'msg' }).flatMap(([k,v]) => v === undefined ? [] : [[k, Array.isArray(v) ? v.join(',') : v]]))}`);
  }
  if(state==='CO'&&sp.sex!==undefined&&sp.antler===undefined){const sexes=(Array.isArray(sp.sex)?sp.sex.join(','):sp.sex).split(',');sp.antler=sexes.includes('E')?'ALL':sexes.map(x=>x==='F'?'ANTLERLESS':'ANTLERED').join(',');}
  // A bare /hunts reopens the saved search. Any URL that names something of its own is left exactly as it arrived.
  if (restoresSavedFilters(sp)) {
    const p = new URLSearchParams(await savedFilters(state));
    if (!p.has("antler")) p.set("antler", "ANTLERED");
    redirect("/hunts?" + p);
  }
  if (state === "CO") return <CoFinder sp={sp} />;
  const f = parseFilters(sp);
  const { residency } = await getResidency(sp.as, state);
  // one drawing at a time: a species from the other drawing (an old link) is dropped
  const draw = await getDraw(sp.draw);
  if (f.species && !DRAW_SPECIES[draw].includes(f.species)) f.species = '';
  // deer type only means something for deer (a stale Quick Start pick would empty an elk search)
  if (f.species && f.species !== "DEER") f.deerType = [];
  const msg = draw === "MSG";
  // species shown by their own hunt areas on the map (pronghorn; moose, sheep and goat)
  const areaSp = (msg ? (f.species ? [f.species] : DRAW_SPECIES.MSG) : f.species === 'PRONGHORN' ? ['PRONGHORN'] : []) as SpeciesKey[];
  const areaKey = (r: HuntSummary) => `${r.species}:${r.areaName}`;
  const nr = residency === "NONRESIDENT";
  const rf = residencyFields(residency);
  const [candidateRows, fav] = await Promise.all([
    db.huntSummary.findMany({
      where: buildWhere(f, residency, draw, f.migration ? await migrationUnits() : {}),
      orderBy: buildOrder(f, residency),
    }),
    getFavorites(),
  ]);
  const rows = candidateRows.filter((r) => matchesHuntSeason(r, f));
  // alphabetical: unit / area names in human order (4 before 10, 20A right after 20)
  if (f.sort === 'alpha') rows.sort((a, b) => unitOrder(a.areaName ?? a.unit, b.areaName ?? b.unit) || (a.huntNumber ?? 0) - (b.huntNumber ?? 0) || (a.tagCode ?? '').localeCompare(b.tagCode ?? ''));
  const c: CardCtx = { nr, rf, favHunts: fav.hunts, signedIn: fav.signedIn, sort: f.sort };

  // Elk: the zone A / B tag is the listing (it carries the seasons, odds and quota), so the per-weapon general
  // elk rows would repeat it. Deer: the general seasons carry the Regular Deer tag; the White-tailed tag stays.
  const zu = f.zones.length ? zoneUnits(f.zones) : null;
  const visible = f.type === 'NRTAG' ? rows : rows.filter((r) =>
    r.nrTag ? r.species === 'ELK' || !!r.tagCode?.startsWith('WD') : !(r.type === 'GENERAL' && r.species === 'ELK'));

  // ---- by hunt (default): each hunt once; an elk zone's A and B tags share one card
  const listings: Listing[] = [];
  if (f.view === 'hunt') {
    const zones = new Map<string, Listing & { kind: 'zone' }>();
    const gens = new Map<string, Listing & { kind: 'hunt' }>();
    for (const r of visible) {
      if (r.nrTag && r.species === 'ELK') {
        const zone = r.id.split(':')[2] ?? '?';
        const z = zones.get(zone);
        if (z) z.rows.push(r);
        else {
          const l = { kind: 'zone' as const, key: `zone:${zone}`, zone, rows: [r] };
          zones.set(zone, l);
          listings.push(l);
        }
      } else if (r.type === 'GENERAL' && !r.nrTag) {
        // a unit's general seasons for one weapon share the unit's harvest numbers and (for nonresidents) its tag:
        // one card with all their dates
        const key = `gen:${r.species}:${r.unit ?? r.units[0]}:${r.weapon}`;
        const g = gens.get(key);
        if (g) g.also.push(r);
        else {
          const l = { kind: 'hunt' as const, key, r, also: [] as HuntSummary[] };
          gens.set(key, l);
          listings.push(l);
        }
      } else listings.push({ kind: 'hunt', key: r.id, r, also: [] });
    }
  }

  // ---- by unit: one card per unit + species, a hunt touching several units shows under each
  const groups = new Map<string, Group>();
  if (f.view === 'unit') {
    for (const r of visible) {
      if (AREA_SPECIES.includes(r.species as SpeciesKey)) {
        if (f.unit && !r.units.includes(f.unit)) continue;
        const key = `${r.species}|${r.areaName}`;
        const g = groups.get(key) ?? groups.set(key, { key, kind: 'area', name: r.areaName ?? '?', species: r.species, rows: [], title: `${SPECIES_LABEL[r.species]} Area ${r.areaName}` }).get(key)!;
        g.rows.push(r);
        continue;
      }
      const us = r.type === 'GENERAL' && !r.nrTag ? [r.unit ?? r.units[0]] : r.units;
      for (const u of us) {
        if (!u || (f.unit && u !== f.unit) || (zu && !zu.includes(u))) continue;
        const key = `${r.species}|${u}`;
        const g = groups.get(key) ?? groups.set(key, { key, kind: 'unit', name: u, species: r.species, rows: [], title: `Unit ${u} · ${SPECIES_LABEL[r.species]}` }).get(key)!;
        g.rows.push(r);
      }
    }
    for (const g of groups.values()) g.rows.sort((a, b) => (a.type === 'CONTROLLED' ? 1 : 0) - (b.type === 'CONTROLLED' ? 1 : 0));
  }
  const glist = [...groups.values()];
  // table: every hunt and tag on its own row (elk zone tags one row each)
  const tableRows = f.view === "table" ? visible : [];
  const total = f.view === 'hunt' ? listings.length : f.view === 'table' ? tableRows.length : glist.length;
  const shown = Math.min(total, PER_PAGE * f.page);

  // highlight what was asked for: the clicked unit only, or the zone's units, or every unit with a match
  const matched = f.unit ? [f.unit] : [...new Set(rows.flatMap((r) => r.units))].filter((u) => !zu || zu.includes(u));
  // map shading from the matching hunts themselves: per unit (pronghorn: per hunt area) the best odds, pooled
  // success, least crowded hunt, and the land numbers - so whatever "Shade" shows is about these results
  const stats = await matchStats(rows, nr, rf, zu);
  const unitInfo = new Map(
    f.view === 'unit'
      ? (await db.unit.findMany({ where: { state: 'ID', name: { in: glist.map((g) => g.name) } }, select: { name: true, elkZone: true, publicPct: true, acres: true, accessYesAcres: true } })).map((u) => [u.name, u])
      : [],
  );

  // which years the numbers come from (they differ: the draw is this year, the latest harvest report last season)
  const oddsYear = mode(rows.map((r) => r.oddsLastYear));
  const harvestYear = mode(rows.map((r) => r.harvestLastYear));
  const quotaYear = mode(rows.filter((r) => r.nrTag).map((r) => r.quotaYear));

  // start here: one standout per reason, real samples only, bucks/bulls unless antlerless was asked for
  const picks = ['best', 'odds', 'success', 'score', 'opp'].includes(f.sort) && f.page === 1 && visible.length >= 6
    ? choosePicks(
        visible.filter((r) => (r.type === 'CONTROLLED' || (nr && r.nrTag)) && !r.smallSample && !r.youthOnly && (f.antler.length ? true : r.antlerClass !== 'ANTLERLESS')),
        c,
        // residents: the best general season / uncapped elk zone tag, bought over the counter
        nr ? [] : visible.filter((r) => r.type === 'GENERAL' && !r.smallSample && !(r.nrTag && r.capped) && (f.antler.length ? true : r.antlerClass !== 'ANTLERLESS')),
      )
    : [];

  const query = (patch: Partial<Filters>) => {
    const value = toQuery(f, patch);
    if (!sp.state && !sp.draw && sp.restore !== "1" && !sp.as) return value;
    const p = new URLSearchParams(value);
    if (typeof sp.editPreset === 'string') p.set('editPreset', sp.editPreset);
    if (sp.state || sp.restore === "1") p.set("state", state);
    if (sp.draw) p.set("draw", draw.toLowerCase());
    if (sp.as === "nr" || sp.as === "res") p.set("as", sp.as);
    if (sp.restore === "1") p.set("restore", "1");
    if ((patch.antler ?? f.antler).length === 0) p.set("antler", "ALL");
    return "?" + p;
  };
  const activeChips = chips(f, query);
  const more = `/hunts${query({ page: f.page + 1 })}`;
  const sortHref = (s: string) => `/hunts${query({ sort: s as Filters['sort'], page: 1 })}`;
  const viewHref = (v: 'hunt' | 'unit' | 'table') => `/hunts${query({ view: v, page: 1 })}`;

  return (
    <main className={`filtering${f.view === 'table' ? ' tablemode' : ''}`}>
      <RememberQuery owner={fav.userId}/>
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap matched={areaSp.length ? [] : matched} selected={f.unit} chips={activeChips} nr={nr} species={f.species} showZones={!msg && (f.species === 'ELK' || f.species === '')} zones={f.zones}
          areaSpecies={areaSp.join(',')}
          matchedAreas={[...new Set(rows.filter((r) => areaSp.includes(r.species as SpeciesKey) && r.areaName).map(areaKey))]}
          selectedArea={areaSp.length && f.q ? `${f.species || areaSp[0]}:${f.q.toUpperCase()}` : ''} stats={stats} />
      </section>

      <section className="f-list" aria-label="Results">
        <div className="f-head">
          <div className="f-title">
            <h1>Find A Hunt</h1>
          </div>
          <SearchStates draw={draw} />
          {draw === 'MSG' && <Link className="small" href={`/hunts?states=CO,ID&draw=msg${f.species ? `&species=${f.species}` : ''}`}>Search Idaho and Colorado</Link>}
          <div className="f-sub">
            <span><b>{total}</b> {f.view === 'unit' ? 'units' : total === 1 ? 'result' : 'results'} · sort by</span>
            <SortSelect value={f.sort} />
            {activeChips.length > 0 && <a className="small reset-all" href={withPresetEdit(sp.editPreset ? '/hunts?state=ID&restore=1&antler=ANTLERED&draw='+draw.toLowerCase() : '/hunts?reset=1', sp.editPreset)}>Reset all filters</a>}
            <a className="small csv" href={`/api/export${query({ page: 1 })}`} title="Every result with odds, success, crowding and tags, for a spreadsheet">Download CSV</a>
            <span className="seg light view-seg" role="group" aria-label="List by">
              <Link className="seg-link" href={viewHref('hunt')} aria-pressed={f.view === 'hunt'} scroll={false}>By hunt</Link>
              <Link className="seg-link" href={viewHref('unit')} aria-pressed={f.view === 'unit'} scroll={false}>By unit</Link>
              <Link className="seg-link" href={viewHref('table')} aria-pressed={f.view === 'table'} scroll={false} title="Every hunt in one sortable table">Table</Link>
            </span>
          </div>
          {(oddsYear || harvestYear) && (
            <p className="f-years">
              {oddsYear ? `Odds: ${oddsYear} draw` : ''}{oddsYear && harvestYear ? ' · ' : ''}{harvestYear ? `Success: ${harvestYear} season (${harvestYear + 1} posts next spring)` : ''}{quotaYear ? ` · NR tag quotas: ${quotaYear}` : ''}
            </p>
          )}
        </div>
        {!total && (
          <div className="ucard">
            <h2>No Hunts Match</h2>
            <p className="muted">Loosen a slider or remove a chip on the map. <Link href="/hunts">Clear all filters</Link>.</p>
          </div>
        )}
        {picks.length > 0 && f.view !== 'table' && <TopPicks picks={picks} c={c} />}
        {f.view === 'table' && total > 0 && <HuntTable rows={tableRows.slice(0, shown)} c={c} sortHref={sortHref} />}

        {f.view === 'hunt' && listings.slice(0, shown).map((l) => (l.kind === 'zone'
          ? <ZoneCard key={l.key} zone={l.zone} rows={l.rows} c={c} />
          : <article key={l.key} className="ucard single"><HuntCard r={l.r} also={l.also} c={c} /></article>))}

        {f.view === 'unit' && glist.slice(0, shown).map((g) => {
          const first = g.rows[0];
          const u = unitInfo.get(g.name);
          const gen = g.rows.find((r) => r.type === 'GENERAL' && !r.nrTag) ?? first;
          const ay = u?.acres ? ((u.accessYesAcres ?? 0) / u.acres) * 100 : null;
          const desc = g.kind === 'area'
            ? [`Units ${first.units.join(', ')}`, `${g.rows.length} hunt${g.rows.length === 1 ? '' : 's'}`].join(' · ')
            : [g.species === 'ELK' && u?.elkZone ? `${u.elkZone} elk zone` : '', `${g.rows.length} hunt${g.rows.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
          const bigs = g.rows.map((r) => r.bigPct5).filter((x): x is number => x !== null);
          const big = bigs.length ? Math.max(...bigs) : null;
          const unitHref = (() => {
            const q = new URLSearchParams();
            if (f.species) q.set('species', f.species);
            if (f.type === 'GENERAL' || f.type === 'CONTROLLED') q.set('type', f.type);
            if (f.weapon.length === 1 && f.weapon[0] !== 'SHORT_RANGE') q.set('weapon', f.weapon[0]);
            return `/units/${encodeURIComponent(g.name)}${q.size ? `?${q}` : ''}`;
          })();
          return (
            <article key={g.key} className={`ucard ${f.unit === g.name ? 'sel' : ''}`}>
              <h2 className="star-head">
                {g.kind === 'unit' && <Star kind="unit" id={g.name} saved={fav.units.has(g.name)} signedIn={fav.signedIn} />}
                <HuntLink href={g.kind === 'unit' ? unitHref : huntHref(first)}>{g.title}</HuntLink>
              </h2>
              <p className="desc">{desc}</p>
              <div className="ustats">
                {TROPHY_LABEL[g.species] && <div><Term k="trophy">{TROPHY_LABEL[g.species]}</Term><b>{pct(big)}</b></div>}
                {SIZE_LABEL[g.species as SpeciesKey] && <div>{SIZE_LABEL[g.species as SpeciesKey]}<b>{(() => { const v = g.rows.map((r) => r.avgSize5).filter((x): x is number => x !== null); return v.length ? `${Math.max(...v).toFixed(1)}"` : '-'; })()}</b></div>}
                <div>Public Land<b>{pct100(g.kind === 'area' ? first.publicPct : u?.publicPct ?? first.publicPct)}</b></div>
                <div>Access Yes!<b>{g.kind === 'area' ? (first.accessYesPct !== null ? `${first.accessYesPct < 1 && first.accessYesPct > 0 ? '<1' : Math.round(first.accessYesPct)}%` : '-') : ay !== null ? `${ay < 1 && ay > 0 ? '<1' : Math.round(ay)}%` : '-'}</b></div>
                {g.species === 'DEER' ? <div>Deer<b style={{ fontSize: '1rem' }}>{gen.deerType ? DEERTYPE[gen.deerType] : '-'}</b></div> : <div>Hunts<b>{g.rows.length}</b></div>}
              </div>
              {g.rows.map((r) => <HuntCard key={r.id} r={r} c={c} inUnit />)}
            </article>
          );
        })}

        {shown < total && (
          <div className="more">
            <Link className="btn" href={more} scroll={false}>Show {Math.min(PER_PAGE, total - shown)} more</Link>
            <span className="small muted"> Showing {shown} of {total}</span>
          </div>
        )}
        <p className="small muted" style={{ padding: '12px 16px' }}>
          {f.view === 'table'
            ? <>Odds are {nr ? 'nonresident' : 'resident'} first-choice odds: &quot;Odds 5-yr&quot; totals the last five drawings, &quot;Latest&quot; is the most recent one. Success, crowding and trophy share are 5-year numbers. Click a column header to sort.</>
            : <>Big numbers are 5-year {nr ? 'nonresident' : 'resident'} first-choice odds and 5-year success; the small line under each shows the latest year, with an arrow against the year before (green is better for you) when the numbers are big enough to mean much. Filters and sorting use the 5-year numbers, which swing less. Tap any label with a ? for what it means.</>}
        </p>
      </section>

      <FilterRail residency={residency} draw={draw} presets={<FilterPresets key={fav.userId} owner={fav.userId} state="ID" draw={draw} />} />
    </main>
  );
}

type Stat = { objBull: number | null; objCow: number | null; score: number | null; odds: number | null; fill: number | null; success: number | null; crowd: number | null; public: number | null; huntable: number | null; wilderness: number | null };

/** Per-unit and per-hunt-area numbers of the matching hunts, for the map's "Shade" options. */
async function matchStats(rows: HuntSummary[], nr: boolean, rf: ReturnType<typeof residencyFields>, zu: string[] | null) {
  const acc = new Map<string, { score: number | null; odds: number | null; fill: number | null; hunters: number; harvest: number; crowd: number | null; public: number | null; huntable: number | null }>();
  // elk zone tags carry the same general-season hunters as the general rows: don't count those twice
  const hasGeneral = new Set(rows.filter((r) => r.type === 'GENERAL' && !r.nrTag).map((r) => r.species));
  const oddsOf = (r: HuntSummary): number | null => {
    if (r.type === 'CONTROLLED') return r[rf.odds5];
    if (nr) return r.nrOdds5; // nonresidents draw general tags too
    return r.nrTag && r.capped ? null : 1; // residents: over the counter
  };
  const add = (key: string, r: HuntSummary, land: boolean) => {
    const a = acc.get(key) ?? acc.set(key, { score: null, odds: null, fill: null, hunters: 0, harvest: 0, crowd: null, public: null, huntable: null }).get(key)!;
    const o = oddsOf(r);
    if (o !== null && (a.odds === null || o > a.odds)) a.odds = o;
    if (r.scoreQuality !== null && (a.score === null || r.scoreQuality > a.score)) a.score = r.scoreQuality;
    const fl = r.smallSample ? null : r[rf.tagAndFill];
    if (fl !== null && (a.fill === null || fl > a.fill)) a.fill = fl;
    if (r.hunters5 && !(r.nrTag && hasGeneral.has(r.species))) {
      a.hunters += r.hunters5;
      a.harvest += r.harvest5 ?? 0;
    }
    if (r.huntersSqMi !== null && (a.crowd === null || r.huntersSqMi < a.crowd)) a.crowd = r.huntersSqMi;
    if (land) {
      a.public ??= r.publicPct;
      a.huntable ??= r.huntablePct;
    }
  };
  for (const r of rows) {
    if (AREA_SPECIES.includes(r.species as SpeciesKey) && r.areaName) add(`area:${r.species}:${r.areaName}`, r, true);
    const us = r.type === 'GENERAL' && !r.nrTag ? [r.unit ?? r.units[0]] : r.units;
    for (const u of us) if (u && (!zu || zu.includes(u))) add(`unit:${u}`, r, false);
  }
  const unitNames = [...acc.keys()].filter((k) => k.startsWith('unit:')).map((k) => k.slice(5));
  const land = new Map((await db.unit.findMany({ where: { state: 'ID', name: { in: unitNames } }, select: { name: true, publicPct: true, acres: true, accessYesAcres: true } })).map((u) => [u.name, u]));
  // moose / sheep / goat hunts have a handful of tags: 10 hunter-seasons is a real sample there
  const minHunters = rows.some((r) => ['MOOSE', 'BIGHORN', 'GOAT', 'BISON'].includes(r.species)) ? 10 : 30;
  const out = { units: {} as Record<string, Stat>, areas: {} as Record<string, Stat> };
  for (const [k, a] of acc) {
    const [kind, name] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    const u = kind === 'unit' ? land.get(name) : undefined;
    const ay = u?.acres ? ((u.accessYesAcres ?? 0) / u.acres) * 100 : 0;
    const ob = kind === 'unit' ? unitObjective(name) : null;
    const st: Stat = {
      objBull: ob?.bull ? OBJ_NUM[ob.bull] : null,
      objCow: ob?.cow ? OBJ_NUM[ob.cow] : null,
      score: a.score,
      odds: a.odds,
      fill: a.fill,
      success: a.hunters >= minHunters ? a.harvest / a.hunters : null,
      crowd: a.crowd,
      public: u ? u.publicPct : a.public,
      huntable: u ? (u.publicPct !== null ? Math.min(100, u.publicPct + ay) : null) : a.huntable,
      // only Wyoming hunt areas are measured for wilderness; unmeasured is null, never 0
      wilderness: null,
    };
    (kind === 'unit' ? out.units : out.areas)[name] = st;
  }
  return out;
}
