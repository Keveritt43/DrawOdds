import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct100 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { mtIsAntelopeUnit, mtUnitLabel, mtKind, type MtPointOdds } from '@/lib/mtHunt';
import { evaluateHunt, type HunterSettings } from '@/lib/multiStateSearch';
import type { CoScored } from '@/lib/coScores';
import { mtBmaDistrict, bmaPct } from '@/lib/mtBma';
import { mtHarvestSeries } from '@/lib/mtSeries';
import { MtBmaDistrict } from '@/components/MtBma';
import { MtHuntCard } from '@/components/MtHuntCard';
import { LandBar } from '@/components/LandBar';
import { UnitMap } from '@/components/UnitMap';
import { StateProvider } from '@/components/StateContext';
import { SuccessChart, HarvestChart, QualityChart } from '@/components/Charts';
import { MtDeerQualityChart } from '@/components/MtCharts';

type SP = { species?: string; type?: string };
const FILTERS = {
  species: [['', 'All species'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All licenses'], ['general', 'General'], ['permit', 'Permits'], ['b', 'B licenses']],
} as const;

/**
 * A Montana hunting district, laid out like Idaho's unit page (src/app/units/[name]/page.tsx) so a hunter moving
 * between states finds the same things in the same places: headline tiles, who manages the land, the district on
 * the map, the hunts as finder cards, then general-season trend charts.
 *
 * Two kinds of district: deer/elk ("261": general licences, permits and B licences) and antelope ("A320", or a
 * Region 7 portion "A701N": drawn antelope licences and Antelope B licences). They are different ground.
 */
export async function MtUnitPage({ name, sp = {} }: { name: string; sp?: SP }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'MT', name } } });
  if (!unit) notFound();
  const [store, fav, rows] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'MT', units: { has: name } }, orderBy: [{ species: 'asc' }, { type: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readMtPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const settings = { ID: pts.res, CO: { res: pts.res }, MT: pts } as unknown as HunterSettings;
  const key = unitKey('MT', name);
  const antelope = mtIsAntelopeUnit(name);
  const portion = /[NS]$/.test(name);
  const label = mtUnitLabel(name);

  const fSpecies = !antelope && FILTERS.species.some(([v]) => v && v === sp.species) ? sp.species! : '';
  const fType = FILTERS.type.some(([v]) => v && v === sp.type) ? sp.type! : '';
  const evaluated = rows.map((h) => evaluateHunt(h as unknown as CoScored, settings, 'proj'));
  // general licences first, then the rest by Opportunity, as the finder's default sort
  evaluated.sort((a, b) => (a.r.type === 'GENERAL' ? 0 : 1) - (b.r.type === 'GENERAL' ? 0 : 1) || (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const shown = evaluated.filter((x) => (!fSpecies || x.r.species === fSpecies) && (!fType || mtKind(x.r.pointOdds as unknown as MtPointOdds) === fType || (fType === 'permit' && mtKind(x.r.pointOdds as unknown as MtPointOdds) === 'antelope')));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(key)}${q.size ? `?${q}` : ''}#hunts`;
  };

  const local = antelope
    ? rows.find((h) => h.units.length === 1)?.areaName?.replace(/^HD \d+ · /, '')
    : rows.find((h) => h.type === 'GENERAL')?.areaName;
  const title = antelope
    ? `Montana Antelope ${portion ? `${label.replace(/^HD/, 'District')} of the Yellowstone` : `District ${name.slice(1)}`}`
    : `Montana Hunting District ${name}`;
  const bma = mtBmaDistrict(name);
  const bmaMain = bma.find((b) => b.species === (antelope ? 'PRONGHORN' : 'DEER')) ?? bma[0];

  // General-season trends, Idaho's three charts per species. Antelope has no general licence, so its district's
  // single-district licence carries the district's harvest (FWP estimates by district, not by licence).
  const trendOf = (species: 'DEER' | 'ELK' | 'PRONGHORN') => {
    const h = species === 'PRONGHORN'
      ? rows.find((x) => x.species === 'PRONGHORN' && x.units.length === 1 && x.units[0] === name)
      : rows.find((x) => x.type === 'GENERAL' && x.species === species);
    const po = h?.pointOdds as unknown as MtPointOdds | null;
    return { species, hunt: h, po, data: h ? mtHarvestSeries(po, species, [name]) : [] };
  };
  const trends = (antelope ? (['PRONGHORN'] as const) : (['DEER', 'ELK'] as const).filter((x) => !fSpecies || x === fSpecies)).map(trendOf);

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href={`/hunts?states=MT${antelope ? '&species=PRONGHORN' : ''}`}>← Find Hunts</Link> · <Link href={`/hunts?states=MT&unit=MT:${name}${antelope ? '&species=PRONGHORN' : ''}`}>Filter Hunts In This District</Link></p>
      <h1 className="star-head">{title} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">
        {local && !portion ? `${local} · ` : ''}{unit.acres ? `${int(unit.acres)} acres` : ''} · {antelope
          ? `FWP antelope ${portion ? 'district portion (Region 7 antelope licenses are set north and south of the Yellowstone River)' : 'hunting district'}; deer and elk districts are different ground`
          : 'FWP deer and elk hunting district; antelope districts are different ground'}
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        <div className="stat"><div className="k">Block Management Type 1</div><div className="v">{bmaMain ? bmaPct(bmaMain.bma.t1Pct) : 'None'}</div><div className="small muted">{bmaMain ? `${bmaMain.bma.n1} area${bmaMain.bma.n1 === 1 ? '' : 's'}, sign yourself in` : 'no enrolled land'}</div></div>
        <div className="stat"><div className="k">Public + Type 1</div><div className="v">{unit.publicPct !== null ? `${Math.round(Math.min(100, unit.publicPct + (bmaMain?.bma.t1Pct ?? 0)))}%` : '-'}</div></div>
        <div className="stat"><div className="k">Size</div><div className="v">{unit.acres ? int(unit.acres / 640) : '-'}</div><div className="small muted">square miles</div></div>
        <div className="stat"><div className="k">Hunts in district</div><div className="v">{rows.length}</div></div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
        <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
        <p className="small muted" style={{ marginBottom: 0 }}>Surface manager from BLM&apos;s Surface Management Agency map, measured over this district. Public ownership is not permission to cross private land; state trust land has its own access rules.</p>
      </div>
      <MtBmaDistrict unit={name} publicPct={unit.publicPct} />
      <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
        <StateProvider code="MT">
          <UnitMap nr={nr} focus={name} height="480px" bare unitSet={antelope ? 'antelope' : 'deer-elk'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
        </StateProvider>
      </div>

      <h2 id="hunts">Hunts In {antelope ? `Antelope ${label}` : label}</h2>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Montana points</Link> for odds at your points.</p>}
      {antelope && <p className="small">Montana sells no general antelope license: every antelope license is drawn, with bonus points.{nr ? ' As a nonresident you apply without a combination license.' : ''}</p>}
      <div className="uh-filters">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).filter((k) => !(antelope && k === 'species')).map((k) => (
          <div key={k} className="seg light" role="group" aria-label={k}>
            {FILTERS[k].filter(([v]) => !(antelope && k === 'type' && v === 'general')).map(([v, l]) => {
              const cur = { species: fSpecies, type: fType }[k];
              return <Link key={v || 'all'} href={href({ [k]: v })} scroll={false} aria-pressed={cur === v} className="seg-link">{antelope && v === 'permit' ? 'Antelope licenses' : l}</Link>;
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {rows.length} hunts · odds are {nr ? 'nonresident' : 'resident'}, the last draw, at your saved points</p>
      <div className="uh-cards">
        {shown.map((x) => <MtHuntCard key={x.r.id} r={x.r} odds={x.odds} parts={x.mtParts} points={x.points} nr={x.nr} basis={x.basis} saved={fav.hunts.has(x.r.huntId)} signedIn={fav.signedIn} />)}
        {!shown.length && <p className="muted">{rows.length ? 'No hunts match these filters.' : 'No hunts listed for this district.'}</p>}
      </div>

      <h2>{antelope ? 'Antelope Harvest Trends' : 'General Season Trends'}</h2>
      {trends.every((t) => !t.data.length) && <p className="muted">No FWP harvest estimate for a season when this district had today&apos;s boundary.</p>}
      {trends.filter((t) => t.data.length).map((t) => (
        <section key={t.species}>
          <h3>{t.species === 'PRONGHORN' ? 'Antelope' : `General ${t.species === 'DEER' ? 'Deer' : 'Elk'}`} · {label}</h3>
          <p className="small muted" style={{ marginTop: -6 }}>{t.po?.harvestBasis}. FWP surveys {t.species === 'DEER' ? 'deer in odd years' : `${t.species === 'ELK' ? 'elk' : 'antelope'} in even years`}; other seasons have no district estimate.</p>
          <div className="grid2">
            <SuccessChart data={t.data} />
            <HarvestChart data={t.data} />
            {t.species === 'DEER' ? <MtDeerQualityChart data={t.data} /> : t.species === 'ELK' ? <QualityChart data={t.data} species="ELK" /> : null}
          </div>
        </section>
      ))}
      <p className="small muted">Odds: the last draw, not a forecast. Over-the-counter B licenses are not listed yet. Source: FWP regulations, drawing statistics and harvest estimates; land from BLM&apos;s Surface Management Agency map. Confirm with FWP before you apply.</p>
    </main>
  );
}
