import Link from 'next/link';
import { recentBoundaryChanges } from '@/lib/boundaries';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getResidency } from '@/lib/residency';
import { residencyFields } from '@/lib/finder';
import { historyFor } from '@/lib/history';
import { pct, pct100, int, range, WEAPON, ANTLER, DEERTYPE } from '@/lib/format';
import { OddsChart, ApplicantsChart, HarvestChart, SuccessChart, QualityChart } from '@/components/Charts';
import { LandBar } from '@/components/LandBar';
import { Star } from '@/components/Star';

export const dynamic = 'force-dynamic';

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const s = await db.huntSummary.findUnique({ where: { id }, include: { hunt: true } });
  if (!s) notFound();
  const { residency } = await getResidency();
  const session = await auth();
  const rf = residencyFields(residency);
  const nr = residency === 'NONRESIDENT';
  const [history, area, unitRows, saved] = await Promise.all([
    historyFor(s),
    s.areaId ? db.huntArea.findUnique({ where: { areaId: s.areaId } }) : null,
    db.unit.findMany({ where: { name: { in: s.units } } }),
    session?.user ? db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null,
  ]);

  // context for controlled hunts: general-season success in the main unit, same weapon
  let compare: { label: string; data: Awaited<ReturnType<typeof historyFor>> } | undefined;
  const mainUnit = ((area?.units as { unit: string; pct: number }[] | null) ?? [])[0]?.unit ?? s.units[0];
  if (s.type === 'CONTROLLED' && mainUnit) {
    const gen = await db.huntSummary.findFirst({ where: { type: 'GENERAL', species: s.species, unit: mainUnit, weapon: s.weapon } });
    if (gen) compare = { label: `General season, unit ${mainUnit}`, data: await historyFor(gen) };
  }
  const land = (area?.landOwnership ?? (unitRows.length === 1 ? unitRows[0].landOwnership : null)) as { manager: string; pct: number }[] | null;
  const title = s.huntNumber ? `${s.species === 'DEER' ? 'Deer' : 'Elk'} controlled hunt ${s.huntNumber}` : s.name;
  const ctl = s.type === 'CONTROLLED';
  const rows = history.filter((h) => h.permits != null || h.resApps != null || h.hunters != null).sort((a, b) => b.year - a.year);
  const drawn = rows.filter((h) => h.permits != null || h.resApps != null);
  const harvested = rows.filter((h) => h.hunters != null);
  const sum = (xs: typeof rows, f: (h: (typeof rows)[number]) => number | null | undefined) => xs.slice(0, 5).reduce((a, h) => a + (f(h) ?? 0), 0);
  const ratio = (d?: number | null, a?: number | null) => (a ? `${((100 * (d ?? 0)) / a).toFixed(1)}%` : '-');
  const n = (v?: number | null) => (v != null ? int(v) : '-');
  const renumbered = new Set(history.map((h) => h.huntNumber).filter(Boolean)).size > 1;

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href="/hunts">← Back To Filtering</Link></p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>{title}</h1>
          <div className="muted">
            {s.type === 'GENERAL' ? `${s.name} · unit ${s.unit}` : `Hunt area ${s.areaName}`} · {s.openDate ? range(s.openDate, s.closeDate) : 'dates: see regulations'} ·{' '}
            {WEAPON[s.weapon]} · {ANTLER[s.antlerClass]}
            {s.tags ? ` · ${int(s.tags)} tags` : s.type === 'GENERAL' ? ' · over the counter' : ' · unlimited tags'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
          <span className="btn" style={{ padding: '4px 10px' }}><Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></span>
          <a className="btn" target="_blank" rel="noreferrer"
            href={s.huntId > 0 ? `https://fishandgame.idaho.gov/ifwis/huntplanner/hunt?id=${s.huntId}` : `https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-${s.hunt.year}.pdf`}>
            {s.huntId > 0 ? 'IDFG Page' : 'IDFG Regulations'}
          </a>
        </div>
      </div>

      <div className="stats">
        {s.type === 'CONTROLLED' && (
          <>
            <div className="stat"><div className="k">{nr ? 'Nonresident' : 'Resident'} odds, 5-yr</div><div className="v">{pct(s[rf.odds5], 1)}</div></div>
            <div className="stat"><div className="k">{drawn[0] ? `${drawn[0].year} draw` : 'Last draw'}</div><div className="v">{pct(s[rf.oddsLast], 1)}</div></div>
            <div className="stat"><div className="k">{nr ? 'Resident' : 'Nonresident'} odds, 5-yr</div><div className="v" style={{ color: 'var(--muted)' }}>{pct(nr ? s.resOdds5 : s.nrOdds5, 1)}</div></div>
            <div className="stat"><div className="k">Draw + fill, per year</div><div className="v">{pct(s[rf.tagAndFill], 1)}</div></div>
          </>
        )}
        <div className="stat"><div className="k">Hunter success, 5-yr</div><div className="v">{pct(s.success5)}</div></div>
        <div className="stat"><div className="k">{s.species === 'DEER' ? 'Mule 4+ share' : '6+ bull share'}</div><div className="v">{pct(s.bigPct5)}</div></div>
        {s.species === 'DEER' && <div className="stat"><div className="k">Deer</div><div className="v" style={{ fontSize: 18 }}>{s.deerType ? `${DEERTYPE[s.deerType]} (${pct100(s.whitetailPct5)} WT)` : '-'}</div></div>}
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(s.publicPct)}</div></div>
        <div className="stat"><div className="k">Access Yes!</div><div className="v">{s.accessYesPct !== null ? `${s.accessYesPct > 0 && s.accessYesPct < 1 ? '<1' : Math.round(s.accessYesPct)}%` : '-'}</div></div>
        <div className="stat"><div className="k">Huntable (public + AY!)</div><div className="v">{pct100(s.huntablePct)}</div></div>
      </div>

      {s.smallSample && <div className="note">Fewer than 50 hunters over 5 years. One or two animals swing the success rate a lot. Don&apos;t read much into a single year.</div>}
      {recentBoundaryChanges(s.units) && <div className="note">IDFG changed the boundary of unit {recentBoundaryChanges(s.units)!.units.join(', ')} in {recentBoundaryChanges(s.units)!.year}. Earlier years may cover different ground.</div>}
      {renumbered && <div className="note">IDFG renumbered this hunt over the years (hunt numbers: {[...new Set(history.map((h) => h.huntNumber).filter(Boolean))].join(', ')}). History is matched by hunt area and tag count; check the IDFG page if a year looks off.</div>}
      {nr && s.type === 'CONTROLLED' && (s.nrAppsLast ?? 0) < 30 && <div className="note">Very few nonresident applicants or tags here. Nonresident odds swing hard on 0-2 tags a year.</div>}

      <div className="grid2" style={{ marginTop: 12 }}>
        {s.type === 'CONTROLLED' && <OddsChart data={history} nr={nr} />}
        {s.type === 'CONTROLLED' && <ApplicantsChart data={history} />}
        <SuccessChart data={history} compare={compare} />
        <HarvestChart data={history} />
        <QualityChart data={history} species={s.species} />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Land and access</h3>
          <LandBar shares={land} />
          <p className="small">
            {(s.accessYesCount ?? 0) > 0 ? `${s.accessYesCount} Access Yes! properties, about ${int(s.accessYesAcres)} acres. Access Yes! is mostly private land leased for hunter access, so it is counted separately from public land.` : 'No Access Yes! properties.'}{' '}
            {area?.acres ? `Hunt area is about ${int(area.acres)} acres.` : ''}
          </p>
          <h3>Units</h3>
          <div>
            {(((area?.units as { unit: string; pct: number }[] | null) ?? s.units.map((u) => ({ unit: u, pct: 0 })))).map((u) => (
              <Link key={u.unit} href={`/units/${encodeURIComponent(u.unit)}`} className="pill" style={{ textDecoration: 'none' }}>
                Unit {u.unit}{u.pct ? ` · ${u.pct}%` : ''}
              </Link>
            ))}
          </div>
          {area?.description && <p className="small muted">{area.description.slice(0, 600)}</p>}
        </div>
      </div>
      {rows.length > 0 && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3>Year By Year</h3>
          <table className="results compact">
            <thead>
              <tr>
                <th>Year</th>
                {ctl && <><th>Hunt</th><th className="num">Tags</th><th className="num">Res Drew / Applied</th><th className="num">Res %</th><th className="num">NR Drew / Applied</th><th className="num">NR %</th></>}
                <th className="num">Hunters</th><th className="num">Harvest</th><th className="num">Success</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.year}>
                  <td>{h.year}</td>
                  {ctl && <><td>{h.huntNumber ?? '-'}</td><td className="num">{n(h.permits)}</td>
                    <td className="num">{h.resApps ? `${n(h.resPermits)} / ${n(h.resApps)}` : '-'}</td><td className="num">{ratio(h.resPermits, h.resApps)}</td>
                    <td className="num">{h.nrApps ? `${n(h.nrPermits)} / ${n(h.nrApps)}` : '-'}</td><td className="num">{ratio(h.nrPermits, h.nrApps)}</td></>}
                  <td className="num">{n(h.hunters)}</td><td className="num">{n(h.harvest)}</td><td className="num">{ratio(h.harvest, h.hunters)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>5-yr</td>
                {ctl && <><td /><td className="num">{int(sum(drawn, (h) => h.permits))}</td>
                  <td className="num">{int(sum(drawn, (h) => h.resPermits))} / {int(sum(drawn, (h) => h.resApps))}</td><td className="num">{ratio(sum(drawn, (h) => h.resPermits), sum(drawn, (h) => h.resApps))}</td>
                  <td className="num">{int(sum(drawn, (h) => h.nrPermits))} / {int(sum(drawn, (h) => h.nrApps))}</td><td className="num">{ratio(sum(drawn, (h) => h.nrPermits), sum(drawn, (h) => h.nrApps))}</td></>}
                <td className="num">{int(sum(harvested, (h) => h.hunters))}</td><td className="num">{int(sum(harvested, (h) => h.harvest))}</td>
                <td className="num">{ratio(sum(harvested, (h) => h.harvest), sum(harvested, (h) => h.hunters))}</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {ctl ? 'Drawing = first choice. ' : ''}5-yr = the last 5 {ctl ? 'drawings and the last 5 harvest years (harvest is reported a season after the draw)' : 'harvest years'}, totaled: drawn ÷ applied and harvest ÷ hunters, not an average of yearly percents.
          </p>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        Odds = permits / first-choice applicants. Success = harvest / hunters, from IDFG harvest reports (expanded estimates).
        Mule/whitetail and trophy counts are back-calculated from IDFG&apos;s rounded percentages: direction, not precision.
      </p>
    </main>
  );
}
