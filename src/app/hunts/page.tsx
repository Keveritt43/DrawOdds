import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { parseFilters, buildWhere, buildOrder, residencyFields, toQuery, zoneUnits, type Filters } from '@/lib/finder';
import { FilterRail } from '@/components/FilterRail';
import { HuntMap } from '@/components/HuntMap';
import { SortSelect } from '@/components/SortSelect';
import { ResidencySwitch } from '@/components/ResidencySwitch';
import { RememberQuery } from '@/components/BackLink';
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
function chips(f: Filters): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const add = (label: string, patch: Partial<Filters>) => out.push({ label, href: `/hunts${toQuery(f, { ...patch, page: 1 })}` });
  const sex = (a: string) => (f.species ? antlerLabel(f.species, a) : ({ ANTLERED: 'Bucks & bulls', ANTLERLESS: 'Does & cows', EITHER: 'Either sex' } as Record<string, string>)[a] ?? a);
  if (f.species) add(SPECIES_LABEL[f.species], { species: '' });
  if (f.type) add(f.type === 'CONTROLLED' ? 'Controlled' : f.type === 'NRTAG' ? 'NR general tag draw' : 'General', { type: '' });
  f.weapon.forEach((w) => add(WEAPON[w], { weapon: f.weapon.filter((x) => x !== w) }));
  f.antler.forEach((a) => add(sex(a), { antler: f.antler.filter((x) => x !== a) }));
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
  const f = parseFilters(sp);
  const { residency } = await getResidency(sp.as);
  const nr = residency === 'NONRESIDENT';
  const rf = residencyFields(residency);
  const [rows, fav] = await Promise.all([
    db.huntSummary.findMany({ where: buildWhere(f, residency), orderBy: buildOrder(f, residency), take: MAX_ROWS }),
    getFavorites(),
  ]);
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
      if (r.species === 'PRONGHORN') {
        if (f.unit && !r.units.includes(f.unit)) continue;
        const key = `PRONGHORN|${r.areaName}`;
        const g = groups.get(key) ?? groups.set(key, { key, kind: 'area', name: r.areaName ?? '?', species: 'PRONGHORN', rows: [], title: `Pronghorn Area ${r.areaName}` }).get(key)!;
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
  const total = f.view === 'hunt' ? listings.length : glist.length;
  const shown = Math.min(total, PER_PAGE * f.page);

  // highlight what was asked for: the clicked unit only, or the zone's units, or every unit with a match
  const matched = f.unit ? [f.unit] : [...new Set(rows.flatMap((r) => r.units))].filter((u) => !zu || zu.includes(u));
  // map shading from the matching hunts themselves: per unit (pronghorn: per hunt area) the best odds, pooled
  // success, least crowded hunt, and the land numbers - so whatever "Shade" shows is about these results
  const stats = await matchStats(rows, nr, rf, zu);
  const unitInfo = new Map(
    f.view === 'unit'
      ? (await db.unit.findMany({ where: { name: { in: glist.map((g) => g.name) } }, select: { name: true, elkZone: true, publicPct: true, acres: true, accessYesAcres: true } })).map((u) => [u.name, u])
      : [],
  );

  // which years the numbers come from (they differ: the draw is this year, the latest harvest report last season)
  const oddsYear = mode(rows.map((r) => r.oddsLastYear));
  const harvestYear = mode(rows.map((r) => r.harvestLastYear));
  const quotaYear = mode(rows.filter((r) => r.nrTag).map((r) => r.quotaYear));

  // start here: one standout per reason, real samples only, bucks/bulls unless antlerless was asked for
  const picks = f.sort === 'best' && f.page === 1 && visible.length >= 6
    ? choosePicks(
        visible.filter((r) => (r.type === 'CONTROLLED' || (nr && r.nrTag)) && !r.smallSample && !r.youthOnly && (f.antler.length ? true : r.antlerClass !== 'ANTLERLESS')),
        c,
        // residents: the best general season / uncapped elk zone tag, bought over the counter
        nr ? [] : visible.filter((r) => r.type === 'GENERAL' && !r.smallSample && !(r.nrTag && r.capped) && (f.antler.length ? true : r.antlerClass !== 'ANTLERLESS')),
      )
    : [];

  const more = `/hunts${toQuery(f, { page: f.page + 1 })}`;
  const viewHref = (v: 'hunt' | 'unit') => `/hunts${toQuery(f, { view: v, page: 1 })}`;

  return (
    <main className="filtering">
      <RememberQuery />
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap matched={matched} selected={f.unit} chips={chips(f)} nr={nr} species={f.species} showZones={f.species === 'ELK' || f.species === ''} zones={f.zones}
          areaSpecies={f.species === 'PRONGHORN' ? 'PRONGHORN' : ''}
          matchedAreas={f.species === 'PRONGHORN' ? [...new Set(rows.filter((r) => r.species === 'PRONGHORN').map((r) => r.areaName ?? ''))].filter(Boolean) : []}
          selectedArea={f.species === 'PRONGHORN' ? f.q.toUpperCase() : ''} stats={stats} />
      </section>

      <section className="f-list" aria-label="Results">
        <div className="f-head">
          <div className="f-title">
            <h1>Find A Hunt</h1>
            <div className="f-res"><span>Odds for</span><ResidencySwitch value={residency} light /></div>
          </div>
          <div className="f-sub">
            <span><b>{total}</b> {f.view === 'hunt' ? (total === 1 ? 'result' : 'results') : 'units'} · sort by</span>
            <SortSelect value={f.sort} />
            <a className="small csv" href={`/api/export${toQuery(f, { page: 1 })}`} title="Every result with odds, success, crowding and tags, for a spreadsheet">Download CSV</a>
            <span className="seg light view-seg" role="group" aria-label="List by">
              <Link className="seg-link" href={viewHref('hunt')} aria-pressed={f.view === 'hunt'} scroll={false}>By hunt</Link>
              <Link className="seg-link" href={viewHref('unit')} aria-pressed={f.view === 'unit'} scroll={false}>By unit</Link>
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
        {picks.length > 0 && <TopPicks picks={picks} c={c} />}

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
                <Link href={g.kind === 'unit' ? unitHref : `/hunts/${encodeURIComponent(first.id)}`}>{g.title}</Link>
              </h2>
              <p className="desc">{desc}</p>
              <div className="ustats">
                {g.species !== 'PRONGHORN' && <div><Term k="trophy">{TROPHY_LABEL[g.species]}</Term><b>{pct(big)}</b></div>}
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
          Odds are {nr ? 'nonresident' : 'resident'} first-choice odds from the latest drawing; success is from the latest harvest report.
          Arrows compare with the year before (green is better for you) and are left off when the numbers are too small to mean much.
          Filters and sorting use the 5-year numbers, which swing less. Tap any label with a ? for what it means.
        </p>
      </section>

      <FilterRail residency={residency} />
    </main>
  );
}

type Stat = { odds: number | null; success: number | null; crowd: number | null; public: number | null; huntable: number | null };

/** Per-unit and per-hunt-area numbers of the matching hunts, for the map's "Shade" options. */
async function matchStats(rows: HuntSummary[], nr: boolean, rf: ReturnType<typeof residencyFields>, zu: string[] | null) {
  const acc = new Map<string, { odds: number | null; hunters: number; harvest: number; crowd: number | null; public: number | null; huntable: number | null }>();
  // elk zone tags carry the same general-season hunters as the general rows: don't count those twice
  const hasGeneral = new Set(rows.filter((r) => r.type === 'GENERAL' && !r.nrTag).map((r) => r.species));
  const oddsOf = (r: HuntSummary): number | null => {
    if (r.type === 'CONTROLLED') return r[rf.odds5];
    if (nr) return r.nrOdds5; // nonresidents draw general tags too
    return r.nrTag && r.capped ? null : 1; // residents: over the counter
  };
  const add = (key: string, r: HuntSummary, land: boolean) => {
    const a = acc.get(key) ?? acc.set(key, { odds: null, hunters: 0, harvest: 0, crowd: null, public: null, huntable: null }).get(key)!;
    const o = oddsOf(r);
    if (o !== null && (a.odds === null || o > a.odds)) a.odds = o;
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
    if (r.species === 'PRONGHORN' && r.areaName) add(`area:${r.areaName}`, r, true);
    const us = r.type === 'GENERAL' && !r.nrTag ? [r.unit ?? r.units[0]] : r.units;
    for (const u of us) if (u && (!zu || zu.includes(u))) add(`unit:${u}`, r, false);
  }
  const unitNames = [...acc.keys()].filter((k) => k.startsWith('unit:')).map((k) => k.slice(5));
  const land = new Map((await db.unit.findMany({ where: { name: { in: unitNames } }, select: { name: true, publicPct: true, acres: true, accessYesAcres: true } })).map((u) => [u.name, u]));
  const out = { units: {} as Record<string, Stat>, areas: {} as Record<string, Stat> };
  for (const [k, a] of acc) {
    const [kind, name] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    const u = kind === 'unit' ? land.get(name) : undefined;
    const ay = u?.acres ? ((u.accessYesAcres ?? 0) / u.acres) * 100 : 0;
    const st: Stat = {
      odds: a.odds,
      success: a.hunters >= 30 ? a.harvest / a.hunters : null,
      crowd: a.crowd,
      public: u ? u.publicPct : a.public,
      huntable: u ? (u.publicPct !== null ? Math.min(100, u.publicPct + ay) : null) : a.huntable,
    };
    (kind === 'unit' ? out.units : out.areas)[name] = st;
  }
  return out;
}
