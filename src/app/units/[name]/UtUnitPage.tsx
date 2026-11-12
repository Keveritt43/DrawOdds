import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readUtPoints } from '@/lib/utPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, utLicense, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { UtHuntCard } from '@/components/UtHuntCard';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ['le', 'Limited entry'], ['general', 'General deer'], ['otc', 'General elk'], ['cwmu', 'CWMU']],
} as const;

/**
 * A Utah DWR hunt boundary, laid out like Idaho's unit page. Utah draws hunts on hunt boundaries, not management
 * units: one hunt can use several boundaries, and boundaries for different species and hunt types overlap. So this
 * page is one boundary, and lists every deer and elk hunt that uses it.
 */
export async function UtUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'UT', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'UT', units: { has: name } }, orderBy: [{ species: 'asc' }, { type: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readUtPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, UT: pts } as unknown as HunterSettings;
  const key = unitKey('UT', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'last'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || utLicense(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  // the boundary's DWR name: a single-boundary hunt carries it as its area name
  const label = rows.find((h) => h.units.length === 1)?.areaName ?? `Boundary ${name}`;
  const tribal = (unit.landOwnership as { manager: string; pct: number }[] | null)?.find((o) => o.manager === 'TRIBAL')?.pct ?? 0;

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts?states=UT">← Find Hunts</Link> · <Link href={`/hunts?states=UT&unit=UT:${name}`}>Filter Hunts On This Boundary</Link></p>
      <h1 className="star-head">Utah Hunt Boundary: {label} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">DWR boundary {name}{unit.acres ? ` · ${int(unit.acres)} acres` : ''} · Utah draws hunts on DWR hunt boundaries; boundaries for other species and hunt types overlap this one</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Hunts using it</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this boundary. Public ownership is not permission to cross private land; Utah trust lands (SITLA) count as state land and have their own access rules.</p>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="UT">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      <h2 id="hunts">Hunts On {label}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Utah points</Link> for odds at your points.</p>}
      <div className="uh-filters">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
          <div key={k} className="seg light" role="group" aria-label={k}>
            {FILTERS[k].map(([v, l]) => {
              const cur = { species: fSpecies, type: fType }[k];
              return <Link key={v || 'all'} href={href({ [k]: v })} scroll={false} aria-pressed={cur === v} className="seg-link">{l}</Link>;
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · odds are {nr ? 'nonresident' : 'resident'}, at your saved points, as the 2026 draw ran</p>
      <div className="uh-cards">
        {shown.map((x) => <UtHuntCard key={x.r.id} r={x.r} odds={x.odds} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No deer or elk hunts use this boundary.'}</p>}
      </div>
      <p className="small muted">Source: Utah DWR 2026 draw results, harvest reports and hunt boundaries; land from BLM&apos;s Surface Management Agency map. Confirm with DWR before you apply.</p>
    </main>
  );
}
