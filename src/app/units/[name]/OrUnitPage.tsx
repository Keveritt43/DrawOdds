import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readOrPoints } from '@/lib/orPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { orIsGeneral, orPo, orUnitKind } from '@/lib/orHunt';
import { OrHuntCard } from '@/components/OrHuntCard';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';
import { SuccessChart, HarvestChart } from '@/components/Charts';
import type { YearPoint } from '@/lib/history';
import orLand from '../../../../data/or/land.json';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ['general', 'General season'], ['controlled', 'Controlled hunts']],
} as const;
type LandRec = { accessPct?: number; tribalPct?: number };

/**
 * An ODFW wildlife management unit, or a 2026 Eastern Oregon deer hunt area, laid out like Idaho's unit page: land,
 * the unit on the map, success trends, and every general-season and controlled hunt on it.
 */
export async function OrUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'OR', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'OR', units: { has: name } }, orderBy: [{ species: 'asc' }, { type: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readOrPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, OR: pts } as unknown as HunterSettings;
  const key = unitKey('OR', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'proj'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const typeOf = (r: CoScored) => (orIsGeneral(r) ? 'general' : 'controlled');
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || typeOf(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  const kind = orUnitKind(name);
  const lr = (orLand as unknown as { units: Record<string, LandRec> }).units[name];
  const general = rows.filter((h) => h.type === 'GENERAL');
  const label = general[0]?.areaName?.replace(/^WMU \d+ /, '') ?? rows.find((h) => h.units.length === 1 && h.areaName)?.areaName?.replace(/ \(\d+\)$/, '') ?? '';
  const title = kind === 'WMU' ? `${label ? `${label} ` : ''}Unit (${name})` : `Deer Hunt Area ${name}${label ? `: ${label}` : ''}`;
  const tribal = (unit.landOwnership as { manager: string; pct: number }[] | null)?.find((o) => o.manager === 'TRIBAL')?.pct ?? 0;
  // success trends: this unit's general seasons, deer and elk, year by year (ODFW harvest summaries)
  const trend = (species: string): YearPoint[] => {
    const by = new Map<number, { hunters: number; harvest: number }>();
    for (const h of general.filter((g) => g.species === species)) for (const y of orPo(h)?.harvest ?? []) {
      const c = by.get(y.year) ?? { hunters: 0, harvest: 0 };
      c.hunters += y.hunters; c.harvest += y.harvest;
      by.set(y.year, c);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, c]) => ({ year, hunters: c.hunters, harvest: c.harvest, success: c.hunters ? c.harvest / c.hunters : null }));
  };
  const elkTrend = trend('ELK'), deerTrend = trend('DEER');

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts?states=OR">← Find Hunts</Link> · <Link href={`/hunts?states=OR&unit=OR:${name}`}>Filter Hunts In This {kind === 'WMU' ? 'Unit' : 'Hunt Area'}</Link></p>
      <h1 className="star-head">Oregon {title} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">{kind === 'WMU' ? `ODFW wildlife management unit ${name}` : 'ODFW Eastern Oregon deer hunt area (new for 2026: buck deer hunts here replaced the old unit hunts)'}{unit.acres ? ` · ${int(unit.acres)} acres` : ''}</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Access &amp; Habitat</div><div className="v">{lr?.accessPct ? `${lr.accessPct < 1 ? lr.accessPct.toFixed(1) : Math.round(lr.accessPct)}%` : '0%'}</div><div className="small muted">of the unit in ODFW access areas</div></div>
        <div className="stat"><div className="k">Hunts</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this {kind === 'WMU' ? 'unit' : 'hunt area'}. Public ownership is not permission to cross private land. Much of western Oregon&apos;s private land is industrial timberland, some open only with a paid or reserved access permit. ODFW&apos;s Access &amp; Habitat program opens some private land by agreement: check ODFW&apos;s map for each area&apos;s rules.</p>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="OR">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      {(elkTrend.length > 1 || deerTrend.length > 1) && <>
        <h2>General Season Success</h2>
        {deerTrend.length > 1 && <><h3>Deer</h3><div className="grid2"><SuccessChart data={deerTrend} /><HarvestChart data={deerTrend} /></div></>}
        {elkTrend.length > 1 && <><h3>Elk</h3><div className="grid2"><SuccessChart data={elkTrend} /><HarvestChart data={elkTrend} /></div></>}
        <p className="small muted">ODFW harvest summaries, every general season in this unit added together (rifle and archery). A hunter who hunted two units is counted in both.</p>
      </>}

      <h2 id="hunts">Hunts In This {kind === 'WMU' ? 'Unit' : 'Hunt Area'}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Oregon points</Link> for odds at your points.</p>}
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
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · controlled-hunt odds at your saved points and residency{nr ? ' (nonresidents: at most 5% of a hunt\'s tags)' : ''}.</p>
      <div className="uh-cards">
        {shown.map((x) => <OrHuntCard key={x.r.id} r={x.r} odds={x.odds} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No hunts in this unit.'}</p>}
      </div>
      <p className="small muted">Source: ODFW 2026 Oregon Big Game Hunting Regulations, controlled hunt draw reports and harvest summaries; ODFW unit and deer hunt area boundaries; land from BLM&apos;s Surface Management Agency map. Confirm with ODFW before you hunt.</p>
    </main>
  );
}
