import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readAzPoints } from '@/lib/azPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { AzHuntCard } from '@/components/AzHuntCard';
import { azPo, AZ_LICENSES } from '@/lib/azHunt';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';
import { SuccessChart, HarvestChart } from '@/components/Charts';
import type { YearPoint } from '@/lib/history';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ...AZ_LICENSES.map((l) => [l.value, l.label] as const)],
} as const;

/** An AZGFD game management unit, laid out like Idaho's unit page: land, map, hunter success, and every deer and elk
 *  hunt whose open area includes it (multi-unit hunts appear on each unit; hunt areas such as 5B North on their GMU). */
export async function AzUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'AZ', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'AZ', units: { has: name } }, orderBy: [{ species: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readAzPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, AZ: pts } as unknown as HunterSettings;
  const key = unitKey('AZ', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'last'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const group = (r: CoScored) => azPo(r)?.license ?? '';
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || group(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  // hunter success on hunts drawn on this unit alone (multi-unit hunts can't be split by unit)
  const own = rows.filter((h) => h.units.length === 1);
  const trend = (sp: 'DEER' | 'ELK'): YearPoint[] => {
    const by = new Map<number, { hunters: number; harvest: number }>();
    for (const h of own.filter((x) => x.species === sp)) for (const y of azPo(h)?.harvest ?? []) {
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
      <p className="small"><Link href="/hunts?states=AZ">← Find Hunts</Link> · <Link href={`/hunts?states=AZ&unit=AZ:${name}`}>Filter Hunts In This Unit</Link></p>
      <h1 className="star-head">Arizona Unit {name} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">AZGFD game management unit {name}{unit.acres ? ` · ${int(unit.acres)} acres` : ''} · some hunts below cover neighbouring units too, or only part of this one (5B North, 12A West)</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div>{closed >= 1 && <div className="small muted">{Math.round(closed)}% military, closed or by permit</div>}</div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Hunts using it</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={own_} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this unit. Public ownership is not permission to cross private land; military land is public but closed or open only by permit; state trust land counts as state land.</p>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="AZ">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      {(deerTrend.length > 1 || elkTrend.length > 1) && <>
        <h2>Hunter Success, Hunts On This Unit Alone</h2>
        {deerTrend.length > 1 && <><h3>Deer</h3><div className="grid2"><SuccessChart data={deerTrend} /><HarvestChart data={deerTrend} /></div></>}
        {elkTrend.length > 1 && <><h3>Elk</h3><div className="grid2"><SuccessChart data={elkTrend} /><HarvestChart data={elkTrend} /></div></>}
      </>}

      <h2 id="hunts">Hunts In Unit {name}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Arizona points</Link> for odds at your points.</p>}
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
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · odds are {nr ? 'nonresident' : 'resident'}, at your saved points, from AZGFD&apos;s 2026 draw</p>
      <div className="uh-cards">
        {shown.map((x) => <AzHuntCard key={x.r.id} r={x.r} odds={x.odds} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No deer or elk hunts use this unit.'}</p>}
      </div>
      <p className="small muted">Source: AZGFD 2026 Bonus Point and draw reports, 2026 hunt regulations, draw-hunt harvest summaries 2021–2025 and game management units; land from BLM&apos;s Surface Management Agency map. Confirm with AZGFD before you apply.</p>
    </main>
  );
}
