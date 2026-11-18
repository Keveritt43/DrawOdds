import Link from 'next/link';
import { huntWeaponLabel } from '@/lib/huntWeaponLabel';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow, TrophyMark } from '@/components/HuntCards';
import { Star } from '@/components/Star';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPointsStore } from '@/lib/points';
import { readNvPoints, NV_POINT_TYPES } from '@/lib/nvPoints';
import { int, pct as pct0, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { nvPersonal, NV_POOL_LABEL, type NvOddsTable, type NvPointOdds, type NvPool } from '@/lib/nvHunt';
import { LandBar } from '@/components/LandBar';
import { OddsChart, ApplicantsChart, SuccessChart, HarvestChart } from '@/components/Charts';
import { UtOddsPointsChart } from '@/components/UtCharts';
import type { YearPoint } from '@/lib/history';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** A Nevada deer or elk hunt: NDOW's bonus-point draw, resident and nonresident tags as two pools. Laid out like
 *  Idaho's and Utah's hunt pages. */
export async function NvHuntPage({ s, sp }: { s: HuntSummary; sp: { pool?: string } }) {
  const po = s.pointOdds as unknown as NvPointOdds | null;
  const table = s.oddsByPts as unknown as NvOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : 'mule deer';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readNvPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const mine = nvPersonal(s, pts, nr);
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const myPool: NvPool = nr ? 'nr' : 'res';
  const pool: NvPool = sp.pool === 'res' || sp.pool === 'nr' ? sp.pool : po?.pools?.[myPool] ? myPool : 'res';
  const year = po?.year ?? 2025, regs = po?.regsYear ?? 2026;
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ pool: sp.pool ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = await db.unit.findMany({ where: { state: 'NV', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvestSeries: YearPoint[] = (po?.harvest ?? []).map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, success: h.hunters > 0 && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  const years = new Set<string>();
  for (const p of ['res', 'nr'] as NvPool[]) for (const y of Object.keys(po?.pools?.[p]?.history ?? {})) years.add(y);
  const drawSeries: YearPoint[] = [...years].sort().map((y) => {
    const r = po?.pools?.res?.history?.[y], n = po?.pools?.nr?.history?.[y];
    return { year: Number(y), resApps: r?.apps ?? null, nrApps: n?.apps ?? null, resPermits: r?.drew ?? null, nrPermits: n?.drew ?? null,
      resOdds: r?.apps ? Math.min(1, r.drew / r.apps) : null, nrOdds: n?.apps ? Math.min(1, n.drew / n.apps) : null };
  });
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const notes: string[] = [];
  if (po?.residentsOnly) notes.push('Residents only');
  if (s.youthOnly) notes.push('Junior hunters (12–17) only');
  const ptLabel = mine.type ? NV_POINT_TYPES.find((t) => t.key === mine.type)!.label.toLowerCase() : `${spLabel}`;
  const huntable = s.huntablePct, closed = s.publicPct !== null && huntable !== null ? s.publicPct - huntable : 0;

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="NV" />
        {s.units[0] ? <> · <Link href={`/hunts?states=NV&unit=NV:${s.units[0]}&species=${s.species}`}>Nevada {spLabel} hunts in unit {s.units[0]}</Link></> : null}
      </p>
      <h1 className="star-head">Nevada {s.name} <TrophyMark score={s.scoreTrophy} hunt={s} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        NDOW hunt {s.tagCode} · {huntWeaponLabel(s)}{s.tags !== null ? ` · ${int(s.tags)} tags (${regs} quota)` : ''}
        {' · '}{s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('NV', u))}`}>Unit {u}</HuntLink></span>)}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}

      <div className="co-top">
        <div className="card co-mine">
          <div className="k">Your {year} odds · {NV_POOL_LABEL[myPool]}</div>
          <div className="co-big">{pct(mine.odds)} {mine.odds !== null && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {mine.basis}. Shown as it last drew: NDOW publishes results by bonus point after each draw ({year} is the latest), and no forecast of the next draw tested better than repeating the last one.
            {!pts.set && <> <Link href="/account#hunting-preferences">Set your Nevada points</Link> for your own odds.</>}
          </div>
        </div>
        {po?.pools && (
          <div className="card co-need">
            <div className="k">{year} first-choice applicants · {regs} tags</div>
            {(['res', 'nr'] as NvPool[]).map((p) => {
              const pl = po.pools[p];
              if (!pl) return <div key={p} className="co-need-row"><span>{NV_POOL_LABEL[p]}</span><b>–</b><span className="small muted">{p === 'nr' ? 'residents only' : 'no resident tags'}</span></div>;
              if (!pl.levels) return <div key={p} className="co-need-row"><span>{NV_POOL_LABEL[p]}</span><b>–</b><span className="small muted">{int(pl.quota)} tags in {regs}; new or changed hunt, no {year} draw</span></div>;
              const apps = pl.levels.reduce((a, l) => a + l[1], 0), drew = pl.levels.reduce((a, l) => a + l[2], 0);
              return <div key={p} className="co-need-row"><span>{NV_POOL_LABEL[p]}</span><b>{pct(apps ? drew / apps : null)}</b><span className="small muted">{int(drew)} of {int(apps)} first choices drew in {year} ({int(pl.quotaLast)} tags) · {int(pl.quota)} tags in {regs}</span></div>;
            })}
          </div>
        )}
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}, both pools` : 'no NDOW figure'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? 'no NDOW figure' : 'this hunt over its units'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{closed >= 1 ? `${Math.round(closed)}% is closed military or DOE land` : s.units.length > 1 ? `${s.units.length} units` : 'of the unit'}</div></div>
        <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pct(fill)}</div><div className="small muted">odds × success</div></div>
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {table && Object.keys(table.last ?? {}).length > 0 && <>
        <h2 id="odds">Odds At Every Bonus Point Level</h2>
        <UtOddsPointsChart res={table.last.res ?? []} nr={table.last.nr ?? []} myPoints={mine.points} mine={myPool} year={year} kind="bonus" />
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">No NDOW harvest figures for this hunt.</p>}
      {drawSeries.length > 1 && <>
        <h2>Draw History</h2>
        <div className="grid2"><OddsChart data={drawSeries} nr={nr} /><ApplicantsChart data={drawSeries} /></div>
      </>}

      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">bonus points, squared</span></summary>
        <p><b>Points squared, plus one.</b> In NDOW&apos;s draw each application gets {`(bonus points)² + 1`} random draw numbers and keeps the lowest; tags go to the lowest numbers, and every first choice is filled before any second choice. So 0 points is 1 number, 3 points is 10, 5 points is 26, 10 points is 101. These odds re-run that rule on NDOW&apos;s {year} bonus point report for this hunt (first-choice applicants and how many drew at each point level). The rule fits NDOW&apos;s 2022–2025 reports far better than any other weighting tested. You earn a {ptLabel} point when you apply and don&apos;t draw (with a hunting license), or by buying one; drawing uses them up, and missing two years in a row loses them.</p>
        {po?.residentsOnly && <p><b>Residents only.</b> NDOW has no nonresident tag for this hunt.</p>}
        <p className="small muted">{po?.pointsMeaning}</p>
      </details>
      {po?.pools?.[pool]?.levels && (
        <details className="card fold">
          <summary><span>Odds table, every point level</span><span className="small muted">{year} draw</span></summary>
          <span className="seg light" role="group" aria-label="Pool">
            {(['res', 'nr'] as NvPool[]).filter((p) => po.pools[p]?.levels).map((p) => <HuntLink key={p} className="seg-link" href={q({ pool: p === myPool ? null : p })} aria-pressed={pool === p} scroll={false}>{NV_POOL_LABEL[p]}</HuntLink>)}
          </span>
          <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Your points</th><th className="num">Applicants</th><th className="num">Drew (NDOW)</th><th className="num">{year} odds</th></tr></thead>
            <tbody>{(() => {
              const arr = table?.last[pool] ?? [];
              const lv = po.pools[pool]!.levels!;
              const top = Math.max(...lv.map((l) => l[0]), mine.points ?? 0, 5);
              return Array.from({ length: top + 1 }, (_, k) => top - k).map((n) => {
                const l = lv.find((x) => x[0] === n);
                const isMe = pool === myPool && mine.points === n;
                return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}><td>{isMe ? <b>{n} · you</b> : n}</td><td className="num">{l ? int(l[1]) : '0'}</td><td className="num">{l ? `${int(l[2])} (${pct(l[1] ? l[2] / l[1] : null)})` : '–'}</td><td className="num">{pct(arr[Math.min(n, arr.length - 1)] ?? null)}</td></tr>;
              });
            })()}</tbody></table></div>
          <p className="small muted">{year} first-choice applicants and tags drawn, by bonus points held when applying (NDOW&apos;s Bonus Point and Application Choice Trends report). The odds column is the modelled chance at each level from NDOW&apos;s rule; it smooths levels where a handful of applicants were lucky or not.</p>
        </details>
      )}
      <details className="card fold">
        <summary><span>Who manages the land</span><span className="small muted">{s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
        {land && <LandBar shares={land} />}
        <p className="small muted">Public ownership is not permission to cross private land. Military ranges (Nellis/NTTR, Hawthorne, Fallon) and the Nevada National Security Site count as public ownership but are closed to the public{closed >= 1 ? `; they are ${Math.round(closed)}% of this hunt's units, left out of the huntable share` : ''}. Tribal land is closed unless the tribe permits. BLM Surface Management Agency, measured over NDOW&apos;s hunt units.</p>
      </details>
      <details className="card fold">
        <summary><span>Season ({regs})</span></summary>
        <p>{po?.season || '–'} ({s.openDate?.toISOString().slice(0, 10)} to {s.closeDate?.toISOString().slice(0, 10)})</p>
      </details>
      {harvestSeries.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvestSeries.length} season{harvestSeries.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Hunters afield</th><th className="num">Successful</th><th className="num">Success</th></tr></thead>
            <tbody>{(po?.harvest ?? []).slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td></tr>)}</tbody></table></div>
          <p className="small muted">NDOW Big Game Hunt Statistics for this unit group and season, residents and nonresidents together.</p>
        </details>
      )}
      <details className="card fold">
        <summary><span>What it costs</span></summary>
        <div className="cost-lines"><p>Nevada fees are not loaded yet. Applying needs a Nevada hunting license; the tag fee is charged if you draw. <a href="https://www.ndow.org/apply-buy/apply-buy-hunting/">See NDOW&apos;s current fees and deadlines</a>.</p></div>
      </details>
      <p className="small muted">Source: NDOW {year} Bonus Point and Application Choice Trends reports (2022–{year}), {regs} big game quotas (CR 26-11), NDOW Big Game Hunt Statistics 2022–2025, NDOW hunt units. Land: BLM Surface Management Agency. Confirm dates and rules with NDOW before you apply.</p>
    </main>
  );
}
