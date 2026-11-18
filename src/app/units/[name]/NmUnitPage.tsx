import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readNmSettings } from '@/lib/nmSettings';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { nmLicense, nmEligible, nmRestricted } from '@/lib/nmHunt';
import { NmHuntCard } from '@/components/NmHuntCard';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ['draw', 'Public draw'], ['private', 'Private land']],
} as const;

/**
 * A New Mexico game management unit, laid out like Idaho's unit page: land, the GMU on the map and every deer and elk
 * hunt on it (public draws, landowner-authorized private-land draws and over-the-counter private-land deer).
 */
export async function NmUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'NM', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'NM', units: { has: name } }, orderBy: [{ species: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const set = readNmSettings(store.store as Record<string, unknown>);
  const nr = set.res === 'NONRESIDENT';
  const settings = { ID: set.res, CO: { res: set.res }, NM: set } as unknown as HunterSettings;
  const key = unitKey('NM', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  // statewide premium hunts list every GMU; they live in Find Hunts, not on each unit page
  const local = rows.filter((h) => h.units.length < 40);
  const usable = local.filter((h) => nmEligible(h, set) && !nmRestricted(h));
  const evaluated = usable.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'proj'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const typeOf = (r: CoScored) => (nmLicense(r) === 'draw' ? 'draw' : 'private');
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || typeOf(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  const own = (unit.landOwnership as { manager: string; pct: number }[] | null) ?? [];
  const tribal = own.find((o) => o.manager === 'TRIBAL')?.pct ?? 0;
  const hidden = local.length - usable.length;

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts?states=NM">← Find Hunts</Link> · <Link href={`/hunts?states=NM&unit=NM:${name}`}>Filter Hunts In This GMU</Link></p>
      <h1 className="star-head">New Mexico GMU {name} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">NMDOW game management unit {name}{unit.acres ? ` · ${int(unit.acres)} acres` : ''}</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Hunts</div><div className="v">{local.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={own.length ? own : null} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this GMU. Public ownership is not permission to cross private land. State trust land counts as state land. Tribal land is closed unless the tribe permits; Defense land (White Sands, McGregor Range) is closed or permit-only.</p>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="NM">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      <h2 id="hunts">Hunts In GMU {name}</h2>
      {!set.set && <p className="small"><Link href="/account#hunting-preferences">Set your New Mexico residency and pool</Link> for your own odds.</p>}
      <div className="uh-filters">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
          <div key={k} className="seg light" role="group" aria-label={k}>
            {FILTERS[k].filter(([v]) => !v || { species: fSpecies, type: fType }[k] === v || evaluated.some((x) => (k === 'species' ? x.r.species : typeOf(x.r)) === v)).map(([v, l]) => {
              const cur = { species: fSpecies, type: fType }[k];
              return <Link key={v || 'all'} href={href({ [k]: v })} scroll={false} aria-pressed={cur === v} className="seg-link">{l}</Link>;
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {usable.length} hunts · next-draw estimates for your pool, first choice; no points in New Mexico.{hidden ? ` ${hidden} hunt${hidden === 1 ? '' : 's'} not shown: ${nr ? 'resident-only, antlerless elk or WMA, or ' : ''}mobility-impaired or military only (in Find Hunts).` : ''} Statewide premium hunts are in Find Hunts.</p>
      <div className="uh-cards">
        {shown.map((x) => <NmHuntCard key={x.r.id} r={x.r} odds={x.odds} nr={x.nr} basis={x.basis} pool={x.nmPool} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{usable.length ? 'No hunts match these filters.' : 'No hunts in this GMU.'}</p>}
      </div>
      <p className="small muted">Source: NMDOW 2026–27 Hunting Rules and Information, drawing odds and harvest reports, NMDOW Game Management Units; land from BLM&apos;s Surface Management Agency map. Confirm with NMDOW before you hunt.</p>
    </main>
  );
}
