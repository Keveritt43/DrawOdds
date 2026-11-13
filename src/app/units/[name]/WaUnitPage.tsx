import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readWaPoints } from '@/lib/waPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { evaluateHunt, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { waLicense } from '@/lib/waHunt';
import { WaHuntCard } from '@/components/WaHuntCard';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';
import waUnits from '../../../../data/wa/land.json';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All hunts'], ['general', 'General season'], ['special', 'Special permits']],
} as const;
type LandRec = { accessAcres?: number; accessPrograms?: Record<string, number>; tribalPct?: number };
const kindOf = (name: string) => (/^DA/.test(name) ? 'Deer Area' : /^EA/.test(name) ? 'Elk Area' : 'GMU');
const lower = (kind: string) => (kind === 'GMU' ? 'GMU' : kind.toLowerCase());

/**
 * A WDFW game management unit (or Deer / Elk Area), laid out like Idaho's unit page: land, the unit on the map,
 * WDFW's private-lands access programs, and every general-season and special-permit deer and elk hunt on it.
 * Statewide multi-season tags aren't listed on unit pages.
 */
export async function WaUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'WA', name } } });
  if (!unit) notFound();
  const [store, fav, all] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'WA', units: { has: name } }, orderBy: [{ species: 'asc' }, { type: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const rows = all.filter((h) => !(h.pointOdds as { multiSeason?: boolean } | null)?.multiSeason);
  const pts = readWaPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, WA: pts } as unknown as HunterSettings;
  const key = unitKey('WA', name);
  const fSpecies = FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'proj'));
  evaluated.sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const typeOf = (r: CoScored) => (waLicense(r) === 'general' ? 'general' : 'special');
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || typeOf(x.r) === fType));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };
  const general = rows.filter((h) => h.type === 'GENERAL');
  const label = general[0]?.areaName?.replace(/^GMU \d+ /, '') ?? rows.find((h) => h.units.length === 1)?.areaName ?? '';
  const kind = kindOf(name);
  const title = `${kind} ${name.replace(/^(DA|EA)/, '')}${label && kind === 'GMU' ? `: ${label}` : ''}`;
  const lr = (waUnits as { units: Record<string, LandRec> }).units[name];
  const tribal = (unit.landOwnership as { manager: string; pct: number }[] | null)?.find((o) => o.manager === 'TRIBAL')?.pct ?? 0;
  const side = (rows.find((h) => h.species === 'ELK' && h.type === 'GENERAL')?.pointOdds as { side?: string } | null)?.side;

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts?states=WA">← Find Hunts</Link> · <Link href={`/hunts?states=WA&unit=WA:${name}`}>Filter Hunts In This {kind}</Link></p>
      <h1 className="star-head">Washington {title} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">WDFW {lower(kind)} {name.replace(/^(DA|EA)/, '')}{unit.acres ? ` · ${int(unit.acres)} acres` : ''}{side ? ` · ${side === 'EAST' ? 'Eastern' : 'Western'} Washington elk tag` : ''}{kind !== 'GMU' ? ' · special-permit area inside one or more GMUs' : ''}</div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        {tribal > 0.5 && <div className="stat"><div className="k">Tribal land</div><div className="v">{Math.round(tribal)}%</div><div className="small muted">closed unless the tribe permits</div></div>}
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Private-lands access</div><div className="v">{lr?.accessAcres ? int(lr.accessAcres) : '0'}</div><div className="small muted">acres in WDFW programs</div></div>
        <div className="stat"><div className="k">Hunts</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this {lower(kind)}. Public ownership is not permission to cross private land. DNR trust land counts as state land; much of western Washington&apos;s private land is industrial timberland, often open only with a paid access permit.</p>
      </div>
      {kind === 'GMU' && <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="WA">
          <UnitMap nr={nr} focus={name} height="480px" bare savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>}

      <section className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ marginTop: 0 }}>Private Lands Access</h3>
        {lr?.accessAcres ? <>
          <p className="small" style={{ margin: '0 0 6px' }}>{int(lr.accessAcres)} acres of private land open to hunting through WDFW&apos;s access programs. Each program has its own rules (sign in, register, written permission or a reservation): check WDFW&apos;s <a href="https://wdfw.wa.gov/hunting/locations/private-lands" target="_blank" rel="noreferrer">private lands map</a> before you go.</p>
          <div className="cmp-wrap"><table className="small" style={{ width: '100%' }}><tbody>
            {Object.entries(lr.accessPrograms ?? {}).sort((a, b) => b[1] - a[1]).map(([p, a]) => <tr key={p}><td>{p}</td><td style={{ textAlign: 'right' }}>{int(a)} ac</td></tr>)}
          </tbody></table></div>
        </> : <p className="small muted" style={{ margin: 0 }}>No WDFW private-lands access properties here.</p>}
      </section>

      <h2 id="hunts">Hunts In {kind} {name.replace(/^(DA|EA)/, '')}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Washington points</Link> for odds at your points.</p>}
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
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · special-permit odds are estimated for the 2027 drawing at your saved points; residents and nonresidents share one drawing. Multi-season tags are statewide and listed in Find Hunts.</p>
      <div className="uh-cards">
        {shown.map((x) => <WaHuntCard key={x.r.id} r={x.r} odds={x.odds} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} tagOk={x.waTagOk} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No deer or elk hunts in this unit.'}</p>}
      </div>
      <p className="small muted">Source: WDFW 2026 Big Game pamphlet, game harvest reports and GMU / Deer Area / Elk Area boundaries; private-lands access from WDFW; land from BLM&apos;s Surface Management Agency map. Confirm with WDFW before you hunt.</p>
    </main>
  );
}
