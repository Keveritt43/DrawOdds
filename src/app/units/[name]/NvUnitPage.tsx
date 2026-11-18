import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readNvPoints } from '@/lib/nvPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, nvCategoryGroup, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { NvHuntCard } from '@/components/NvHuntCard';
import { nvPo } from '@/lib/nvHunt';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';
import { SuccessChart, HarvestChart } from '@/components/Charts';
import type { YearPoint } from '@/lib/history';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ['deer', 'Antlered deer'], ['junior', 'Junior deer'], ['bull', 'Antlered elk'], ['spike', 'Spike elk'], ['cow', 'Antlerless elk']],
} as const;

/** An NDOW hunt unit, laid out like Idaho's unit page: land, map, hunter success, and every deer and elk hunt whose
 *  unit group includes it (Nevada hunts cover unit groups, so one hunt appears on each of its units). */
export async function NvUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'NV', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'NV', units: { has: name } }, orderBy: [{ species: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readNvPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, NV: pts } as unknown as HunterSettings;
  const key = unitKey('NV', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'last'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const group = (r: CoScored) => nvCategoryGroup(nvPo(r)?.category);
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || group(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  // hunter success on hunts drawn on this unit alone (multi-unit hunts can't be split by unit)
  const own = rows.filter((h) => h.units.length === 1);
  const trend = (sp: 'DEER' | 'ELK'): YearPoint[] => {
    const by = new Map<number, { hunters: number; harvest: number }>();
    for (const h of own.filter((x) => x.species === sp)) for (const y of nvPo(h)?.harvest ?? []) {
      const c = by.get(y.year) ?? { hunters: 0, harvest: 0 }; c.hunters += y.hunters; c.harvest += y.harvest; by.set(y.year, c);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, hunters: v.hunters, harvest: v.harvest, success: v.hunters ? v.harvest / v.hunters : null }));
  };
  const deerTrend = trend('DEER'), elkTrend = trend('ELK');
  const own_ = (unit.landOwnership as { manager: string; pct: number }[] | null) ?? [];
  const tribal = own_.find((o) => o.manager === 'TRIBAL')?.pct ?? 0;
  const closed = own_.filter((o) => o.manager === 'DOD').reduce((a, o) => a + o.pct, 0);

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts?states=NV">← Find Hunts</Link> · <Link href={`/hunts?states=NV&unit=NV:${name}`}>Filter Hunts In This Unit</Link></p>
      <h1 className="star-head">Nevada Hunt Unit {name} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">NDOW hunt unit {name}{unit.acres ? ` · ${int(unit.acres)} acres` : ''} · Nevada tags cover unit groups, so most hunts below include neighbouring units too</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div>{closed >= 1 && <div className="small muted">{Math.round(closed)}% military, closed</div>}</div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Hunts using it</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={own_} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this unit. Public ownership is not permission to cross private land; military ranges and the Nevada National Security Site are public but closed to the public.</p>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="NV">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      {(deerTrend.length > 1 || elkTrend.length > 1) && <>
        <h2>Hunter Success, Hunts On This Unit Alone</h2>
        {deerTrend.length > 1 && <><h3>Mule deer</h3><div className="grid2"><SuccessChart data={deerTrend} /><HarvestChart data={deerTrend} /></div></>}
        {elkTrend.length > 1 && <><h3>Elk</h3><div className="grid2"><SuccessChart data={elkTrend} /><HarvestChart data={elkTrend} /></div></>}
      </>}

      <h2 id="hunts">Hunts In Unit {name}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Nevada points</Link> for odds at your points.</p>}
      <div className="uh-filters">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
          <div key={k} className="seg light" role="group" aria-label={k}>
            {FILTERS[k].filter(([v]) => !v || { species: fSpecies, type: fType }[k] === v || evaluated.some((x) => (k === 'species' ? x.r.species : group(x.r)) === v)).map(([v, l]) => {
              const cur = { species: fSpecies, type: fType }[k];
              return <Link key={v || 'all'} href={href({ [k]: v })} scroll={false} aria-pressed={cur === v} className="seg-link">{l}</Link>;
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · odds are {nr ? 'nonresident' : 'resident'}, at your saved points, from NDOW&apos;s 2025 draw</p>
      <div className="uh-cards">
        {shown.map((x) => <NvHuntCard key={x.r.id} r={x.r} odds={x.odds} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No deer or elk hunts use this unit.'}</p>}
      </div>
      <p className="small muted">Source: NDOW 2025 bonus point reports, 2026 quotas (CR 26-11), Big Game Hunt Statistics 2022–2025 and hunt units; land from BLM&apos;s Surface Management Agency map. Confirm with NDOW before you apply.</p>
    </main>
  );
}
