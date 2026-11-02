import Link from 'next/link';
import { seasonsSummary } from '@/lib/tagSeasons';
import { recentBoundaryChanges } from '@/lib/boundaries';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { residencyFields } from '@/lib/finder';
import { historyFor } from '@/lib/history';
import { pct, pct100, int, range, WEAPON, ANTLER } from '@/lib/format';
import { UnitMap } from '@/components/UnitMap';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { sortUnitHunts, unitHuntLabel } from '@/lib/unitHunts';
import { LandBar } from '@/components/LandBar';
import { SuccessChart, HarvestChart, QualityChart } from '@/components/Charts';

export const dynamic = 'force-dynamic';

type SP = { species?: string; type?: string; weapon?: string };
const FILTERS = {
  species: [['', 'All'], ['DEER', 'Deer'], ['ELK', 'Elk']],
  type: [['', 'All'], ['GENERAL', 'General'], ['CONTROLLED', 'Controlled']],
  weapon: [['', 'All'], ['ANY', 'Any Weapon'], ['ARCHERY', 'Archery'], ['MUZZLELOADER', 'Muzzleloader']],
} as const;

export default async function UnitPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const name = decodeURIComponent((await params).name).toUpperCase();
  const unit = await db.unit.findUnique({ where: { name } });
  if (!unit) notFound();
  const { residency } = await getResidency();
  const rf = residencyFields(residency);
  const nr = residency === 'NONRESIDENT';
  const fav = await getFavorites();
  // nonresident general tags only matter to nonresidents
  const hunts = sortUnitHunts(await db.huntSummary.findMany({ where: { units: { has: name }, ...(nr ? {} : { nrTag: false }) } }));
  const pick = (k: keyof typeof FILTERS) => (FILTERS[k].some(([v]) => v && v === sp[k]) ? sp[k]! : '');
  const fSpecies = pick('species');
  const fType = pick('type');
  const fWeapon = pick('weapon');
  const shown = hunts.filter((h) => (!fSpecies || h.species === fSpecies) && (!fType || h.type === fType) && (!fWeapon || h.weapon === fWeapon));
  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ species: fSpecies, type: fType, weapon: fWeapon, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/units/${encodeURIComponent(name)}${q.size ? `?${q}` : ''}#hunts`;
  };
  const gen = (species: 'DEER' | 'ELK', weapon: 'ANY' | 'ARCHERY') =>
    hunts.find((h) => h.type === 'GENERAL' && h.species === species && h.weapon === weapon);
  const [deerAny, elkAny, elkArch] = await Promise.all(
    [gen('DEER', 'ANY'), gen('ELK', 'ANY'), gen('ELK', 'ARCHERY')].map((h) => (h ? historyFor(h) : Promise.resolve([]))),
  );

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/map">← Back To Unit Map</Link> · <Link href={`/hunts?unit=${encodeURIComponent(unit.name)}`}>Filter Hunts In This Unit</Link></p>
      <h1 className="star-head">Unit {unit.name} <Star kind="unit" id={unit.name} saved={fav.units.has(unit.name)} signedIn={fav.signedIn} label /></h1>
      <div className="muted">{unit.elkZone ? `${unit.elkZone} elk zone · ` : ''}{unit.acres ? `${int(unit.acres)} acres` : ''}</div>
      {recentBoundaryChanges([unit.name]) && <div className="note">IDFG changed this unit&apos;s boundary in {recentBoundaryChanges([unit.name])!.year}. Harvest numbers before then cover different ground.</div>}

      <div className="stats">
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(unit.publicPct)}</div></div>
        <div className="stat"><div className="k">Private land</div><div className="v">{pct100(unit.privatePct)}</div></div>
        <div className="stat"><div className="k">Access Yes!</div><div className="v">{unit.accessYesCount && unit.acres ? `${((unit.accessYesAcres ?? 0) / unit.acres * 100) < 1 ? '<1' : Math.round((unit.accessYesAcres ?? 0) / unit.acres * 100)}%` : 'None'}</div><div className="small muted">{unit.accessYesCount ? `${int(unit.accessYesAcres)} ac` : ''}</div></div>
        <div className="stat"><div className="k">Huntable (public + AY!)</div><div className="v">{unit.publicPct !== null ? `${Math.round(Math.min(100, unit.publicPct + (unit.acres ? ((unit.accessYesAcres ?? 0) / unit.acres) * 100 : 0)))}%` : '-'}</div></div>
        <div className="stat"><div className="k">Wilderness</div><div className="v">{pct100(unit.wildernessPct)}</div></div>
        <div className="stat"><div className="k">Hunts touching unit</div><div className="v">{hunts.length}</div></div>
      </div>

      <div className="grid2">
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 360 }}>
          <UnitMap savedUnits={[...fav.units]} signedIn={fav.signedIn} nr={nr} focus={unit.name} height="360px" />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
          <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
          <p className="small muted">Managing agency, not owner. State land is mostly open to hunting; check access on the ground.</p>
        </div>
      </div>

      <h2 id="hunts">Hunts In Unit {unit.name}</h2>
      <div className="uh-filters">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
          <div key={k} className="seg light" role="group" aria-label={k}>
            {FILTERS[k].map(([v, l]) => {
              const cur = { species: fSpecies, type: fType, weapon: fWeapon }[k];
              return <Link key={v || 'all'} href={href({ [k]: v })} scroll={false} aria-pressed={cur === v} className="seg-link">{l}</Link>;
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{shown.length} of {hunts.length} hunts · odds are {nr ? 'nonresident' : 'resident'}, 5-yr</p>
      <div className="uh-list">
        {shown.map((h) => (
          <div key={h.id} className="uh-row">
            <div className="uh-name">
              <Star kind="hunt" id={h.huntId} saved={fav.hunts.has(h.huntId)} signedIn={fav.signedIn} />
              <Link href={`/hunts/${encodeURIComponent(h.id)}`}>{unitHuntLabel(h)}</Link>
              <span className={`pill ${h.type === 'GENERAL' && !h.nrTag ? '' : 'ctl'}`}>{h.nrTag ? 'NR Tag Draw' : h.type === 'GENERAL' ? 'General' : 'Controlled'}</span>
              {h.youthOnly && <span className="pill">Youth</span>}
            </div>
            <div className="uh-meta">
              {h.nrTag
                ? `${h.tagCode ?? ''}${h.quota !== null ? ` · ${int(h.quota)} NR tags${h.quotaYear ? ` (${h.quotaYear})` : ''}` : ''} · ${seasonsSummary(h.tagSeasons, 2) || (h.species === 'ELK' ? `zone units ${h.units.join(', ')}` : 'whole unit')}`
                : <>{h.type === 'GENERAL' && seasonsSummary(h.tagSeasons, 2) ? seasonsSummary(h.tagSeasons, 2) : h.openDate ? range(h.openDate, h.closeDate) : 'Dates: see regs'} · {WEAPON[h.weapon]} · {ANTLER[h.antlerClass]}
                  {h.type === 'GENERAL' ? (h.tags ? ` · ${int(h.tags)} tags` : nr ? ' · NR tag required' : ' · Over the counter') : h.tags ? ` · ${int(h.tags)} tags` : ''}</>}
            </div>
            <div className="uh-stats">
              {(h.type === 'CONTROLLED' || h.nrTag) && <span>Odds <b>{pct(h[rf.odds5], 1)}</b></span>}
              <span>Success <b>{pct(h.success5)}</b></span>
            </div>
          </div>
        ))}
        {!shown.length && <p className="muted">{hunts.length ? 'No hunts match these filters.' : 'No deer or elk hunts listed for this unit.'}</p>}
      </div>

      <h2>General season trends</h2>
      <div className="grid2">
        {deerAny.length > 0 && <SuccessChart data={deerAny} />}
        {deerAny.length > 0 && <QualityChart data={deerAny} species="DEER" />}
        {elkAny.length > 0 && <HarvestChart data={elkAny} />}
        {elkArch.length > 0 && <SuccessChart data={elkArch} compare={elkAny.length ? { label: 'Elk any weapon', data: elkAny } : undefined} />}
        {!deerAny.length && !elkAny.length && !elkArch.length && <p className="muted">No general-season harvest data for this unit.</p>}
      </div>
    </main>
  );
}
