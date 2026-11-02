import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { residencyFields } from '@/lib/finder';
import { historyFor } from '@/lib/history';
import { pct, pct100, int, range, WEAPON, ANTLER } from '@/lib/format';
import { UnitMap } from '@/components/UnitMap';
import { LandBar } from '@/components/LandBar';
import { SuccessChart, HarvestChart, QualityChart } from '@/components/Charts';

export const dynamic = 'force-dynamic';

export default async function UnitPage({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name).toUpperCase();
  const unit = await db.unit.findUnique({ where: { name } });
  if (!unit) notFound();
  const { residency } = await getResidency();
  const rf = residencyFields(residency);
  const nr = residency === 'NONRESIDENT';
  const hunts = await db.huntSummary.findMany({
    where: { units: { has: name } },
    orderBy: [{ species: 'asc' }, { type: 'asc' }, { openDate: 'asc' }],
  });
  const gen = (species: 'DEER' | 'ELK', weapon: 'ANY' | 'ARCHERY') =>
    hunts.find((h) => h.type === 'GENERAL' && h.species === species && h.weapon === weapon);
  const [deerAny, elkAny, elkArch] = await Promise.all(
    [gen('DEER', 'ANY'), gen('ELK', 'ANY'), gen('ELK', 'ARCHERY')].map((h) => (h ? historyFor(h) : Promise.resolve([]))),
  );

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/map">← Back To Unit Map</Link> · <Link href={`/hunts?unit=${encodeURIComponent(unit.name)}`}>Filter Hunts In This Unit</Link></p>
      <h1>Unit {unit.name}</h1>
      <div className="muted">{unit.elkZone ? `${unit.elkZone} elk zone · ` : ''}{unit.acres ? `${int(unit.acres)} acres` : ''}</div>
      {unit.boundaryChanged2022 && <div className="note">IDFG changed this unit&apos;s boundary in 2022. Harvest numbers before 2022 cover different ground.</div>}

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
          <UnitMap nr={nr} focus={unit.name} height="360px" />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Who manages the land</h3>
          <LandBar shares={unit.landOwnership as { manager: string; pct: number }[] | null} />
          <p className="small muted">Managing agency, not owner. State land is mostly open to hunting; check access on the ground.</p>
        </div>
      </div>

      <h2>Hunts in unit {unit.name}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="results">
          <thead>
            <tr><th>Hunt</th><th>Season</th><th>Weapon</th><th>Animal</th><th className="num">Tags</th><th className="num">{nr ? 'NR' : 'Res'} odds</th><th className="num">Success</th></tr>
          </thead>
          <tbody>
            {hunts.map((h) => (
              <tr key={h.id}>
                <td><Link href={`/hunts/${encodeURIComponent(h.id)}`}>{h.huntNumber ? `${h.species === 'DEER' ? 'Deer' : 'Elk'} ${h.huntNumber}` : h.name}</Link>{h.youthOnly && <span className="pill">Youth</span>}</td>
                <td className="small">{range(h.openDate, h.closeDate)}</td>
                <td>{WEAPON[h.weapon]}</td>
                <td>{h.species === 'DEER' ? 'Deer' : 'Elk'} · {ANTLER[h.antlerClass]}</td>
                <td className="num">{h.type === 'GENERAL' ? (h.tags ? int(h.tags) : 'OTC') : int(h.tags)}</td>
                <td className="num">{h.type === 'GENERAL' ? '-' : pct(h[rf.odds5], 1)}</td>
                <td className="num">{pct(h.success5)}</td>
              </tr>
            ))}
            {!hunts.length && <tr><td colSpan={7} className="muted">No deer or elk hunts listed for this unit.</td></tr>}
          </tbody>
        </table>
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
