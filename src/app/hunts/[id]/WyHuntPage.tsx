import Link from 'next/link';
import { WyWildernessNote } from '@/components/WyWildernessNote';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow, TrophyMark } from '@/components/HuntCards';
import { trophyForHunt } from '@/lib/trophyHunt';
import { Star } from '@/components/Star';
import { WyCreepChart, WyOddsPointsChart, WyHarvestCharts } from '@/components/WyCharts';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPoints } from '@/lib/points';
import { int, pct as pct0 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { fmtNeed, fmtCreep } from '@/lib/coDisplay';
import { prefOdds, randomOdds } from '@/lib/wyOdds';
import { wyAreaLabel, wyDates, wyPool, wyTableOdds, WY_POOL_LABEL, WY_POOL_SHORT, type WyOddsTable, type WyPointOdds, type WyPool, type WyNrPoolData } from '@/lib/wyHunt';
import { withoutUnvalidatedWyDeerMetrics, wyDeerSeries } from '@/lib/wyDeerMetrics';
import { SuccessChart } from '@/components/Charts';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
const need = (p: WyNrPoolData | undefined) => {
  if (!p) return '–';
  if (p.eff === null) return 'Everyone drew';
  const lvl = Math.floor(p.eff + 1e-9);
  return fmtNeed(lvl, 1 - (p.eff - lvl));
};

/** A Wyoming limited quota license or nonresident region license: odds for your pool, points needed, history. */
export async function WyHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string; pool?: string } }) {
  s = withoutUnvalidatedWyDeerMetrics(s);
  const po = s.pointOdds as unknown as WyPointOdds | null;
  const table = s.oddsByPts as unknown as WyOddsTable | null;
  const species = s.species === 'PRONGHORN' ? 'PRONGHORN' : s.species === 'ELK' ? 'ELK' : 'DEER';
  const spLabel = species === 'PRONGHORN' ? 'antelope' : species.toLowerCase();
  const [pts, session] = await Promise.all([getPoints('WY'), auth()]);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const myPool = wyPool(nr, pts.wySpecial === true);
  const pools = (['res', 'nr', 'nrs'] as WyPool[]).filter((x) => table?.last?.[x]);
  const pool: WyPool = pools.includes(sp.pool as WyPool) ? (sp.pool as WyPool) : myPool;
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const p = nr ? pts[species] : 0;
  const mine = wyTableOdds(table, mode, myPool, p);
  const q = (patch: Record<string, string | null>, hash = '#odds') => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds ?? '', pool: sp.pool ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}${hash}`;
  };
  if (!po) return <main className="wrap" style={{ margin: '24px auto' }}><p className="small"><BackLink state="WY" /></p><h1>{s.name}</h1><p className="muted">No draw data for this license yet.</p></main>;
  const P = pool === 'nr' ? po.pools.regular : pool === 'nrs' ? po.pools.special : undefined;
  const myP = myPool === 'nr' ? po.pools.regular : myPool === 'nrs' ? po.pools.special : undefined;
  const projected = mode === 'proj' && po.projected;
  const region = s.tagCode?.includes('R-');
  const lastPref = myP ? prefOdds(myP.pref, p) : null;
  const rnd = myP ? randomOdds(myP.random) : randomOdds(po.res?.last ?? undefined);
  const chance = chanceOf(mine, 0, mine ?? 0);
  const firstUnit = s.units[0];
  const deerSeries = (['MULE', 'WHITETAIL'] as const).map(kind => ({ kind, rows: wyDeerSeries(po, kind) }));

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="WY" />
        {firstUnit && !region ? <> · <Link href={`/hunts?states=WY&unit=WY:${firstUnit}&species=${species}`}>Wyoming {spLabel} hunts in {wyAreaLabel(firstUnit).toLowerCase()}</Link></> : null}
      </p>
      <h1 className="star-head">
        Wyoming {spLabel[0].toUpperCase() + spLabel.slice(1)} {s.name} <TrophyMark score={trophyForHunt(s)} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label />
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {s.takeMethod && s.takeMethod.length >= 120 ? 'See season restrictions below and confirm with WGFD' : s.takeMethod} · {s.tags !== null ? `${int(s.tags)} licenses (${po.regs?.year ?? po.year} quota)` : region ? 'Region quota set by WGFD' : 'Quota: see WGFD'}
        {s.privateOnly ? ' · Valid on private land: you need landowner permission' : ''}
        {' · '}{s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('WY', u))}`}>{wyAreaLabel(u)}</HuntLink></span>)}
      </p>

      {!s.privateOnly && <WyWildernessNote units={s.units} nr={nr} />}
      <div className="cost-lines"><h4>What It Costs</h4><p>{nr && species === 'DEER' && po.general ? <>For a nonresident general deer license, WGFD lists <b>$374 regular or $1,200 special</b>, plus a <b>$15 application fee</b> (fee schedule checked November 12, 2026). </> : <>Wyoming fees vary by species, license and residency{nr ? ', and the regular and special pools have different prices' : ''}. </>}WGFD charges the license price and application fee when you apply. A conservation stamp may also be required; check current prices and refund rules before applying. This is not a complete total.</p><p><a href="https://wgfd.wyo.gov/licenses-applications/license-fee-list">WGFD license fee schedule</a> · <a href="https://wgfd.wyo.gov/licenses-applications/application-process">Application and refund information</a></p></div>
      {po.general && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>General season.</b> Residents buy a general {spLabel} license over the counter. Nonresidents need the{' '}
          {po.nrRegionSlug ? <HuntLink href={`/hunts/${po.nrRegionSlug}`}>Region {po.nrRegion} nonresident general license</HuntLink> : `Region ${po.nrRegion ?? '?'} nonresident general license`}, which is drawn: the odds below are that region&apos;s.
        </div>
      )}
      {po.harvestBasis && <p className="small muted">Harvest, success and crowding for this region license come from the {po.harvestBasis}.</p>}
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine), scoreOppNr: nr ? opportunity(s.scoreQuality, mine) : null }} nr={nr} open />
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{po.general && !nr ? 'Your license' : `Your ${projected && nr ? po.projYear : po.year} odds · ${nr ? `${p} ${spLabel} point${p === 1 ? '' : 's'} · ${WY_POOL_LABEL[myPool]}` : 'Resident'}`}</div>
          <div className="co-big">{pct(mine)} <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span></div>
          <div className="small muted">
            {nr && myP ? <>
              {projected && myP.proj ? `${po.projYear} cutoff, projected: ${myP.proj.lo.toFixed(1)}–${myP.proj.hi.toFixed(1)} points. ` : ''}
              {`In ${po.year}: ${pct(lastPref)} in the preference draw at ${p} points`}{rnd !== null && (lastPref ?? 0) < 0.995 ? `, then about ${pct(rnd)} in the random draw if you missed (estimated: WGFD doesn't publish random-draw results).` : '.'}
              {mode === 'proj' && !po.projected ? ` No ${spLabel} projection passed our backtest, so this is the ${po.year} draw.` : ''}
            </> : nr ? `No ${myPool === 'nrs' ? 'special' : 'regular'} pool for this license in ${po.year}.` : po.general ? 'Residents buy a general license over the counter: no draw.' : `Estimated from ${po.year} resident first-choice applicants and quota. Residents don't use points for ${spLabel}.`}
            {nr && !pts.set && <> <Link href="/account#hunting-preferences">Set your Wyoming points in Account</Link> for your own odds.</>}
          </div>
        </div>
        {(po.pools.regular || po.pools.special) && (
          <div className="card co-need">
            <div className="k">Nonresident points needed, {po.year} draw</div>
            <div className="co-need-row"><span className="nr">Regular</span><b>{need(po.pools.regular)}</b><span className="small muted">creep {fmtCreep(s.creepNr)}</span></div>
            <div className="co-need-row"><span className="nr">Special</span><b>{need(po.pools.special)}</b><span className="small muted">{po.pools.special ? `${po.pools.special.pref.quota + (po.pools.special.random.quota ?? 0)} licenses` : 'no special pool'}</span></div>
            {wyTableOdds(table, 'last', 'nr', 0) === 1 && po.pools.regular?.eff !== null && <p className="small"><b>Everyone drew in {po.year}:</b> applicants below the preference cutoff got the random-draw licenses.</p>}
            <p className="small muted" style={{ marginBottom: 0 }}>Preference points count only on your first choice. About 25% of each pool is drawn at random among applicants who missed, so any point level has a chance there.</p>
          </div>
        )}
      </div>

      <h2>Season And Area</h2>
      <div className="co-facts">
        {(po.regs?.segments ?? []).map((g, i) => (
          <div key={i}>
            <span className="k">{po.regs!.segments.length > 1 ? `Season ${i + 1}` : 'Dates'} ({po.regs!.year})</span>
            {[g.archery ? `Archery ${wyDates(...g.archery)}` : '', g.regular ? `Regular ${wyDates(...g.regular)}` : ''].filter(Boolean).join(' · ')}
            {g.limitations ? <span className="small muted"> · {g.limitations}</span> : null}
          </div>
        ))}
        {!po.regs && <div><span className="k">Dates</span>Region general licenses are valid in the general seasons of each hunt area in the region: see those areas.</div>}
        <div><span className="k">{s.units.length > 1 ? 'Hunt areas' : 'Hunt area'}</span>{s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('WY', u))}`}>{wyAreaLabel(u)}</HuntLink></span>)}</div>
        {po.land && <div><span className="k">Land</span>{po.land.publicPct === null ? 'Not computed' : `${Math.round(po.land.publicPct)}% public`} · {int(po.land.sqmi)} mi²{po.land.accessPct ? ` · ${Math.round(po.land.accessPct)}% Walk-In / Hunter Management Areas` : ''}<span className="small muted"> · public ownership is not permission to cross private land</span></div>}
      </div>

      <h2 id="trends">Hunt Trends</h2>
      <div className="grid2 co-graph-grid">
        <WyCreepChart po={po} />
        <WyOddsPointsChart table={table} po={po} pool={pool === 'res' ? 'nr' : pool} mode={mode} myPoints={nr ? p : null} />
        {species !== 'DEER' && po.harvest.length ? <WyHarvestCharts rows={po.harvest} /> : null}
      </div>

      <h2>Hunter Success</h2>
      {species === 'DEER' ? <>
        <p className="small muted">WGFD survey estimates by hunt area and license type. The denominator is active licenses for each deer species, not unique people. A license holder may appear in both species. Combined success, density and dependent scores remain unavailable because that overlap is unknown. Region license aggregates and missing species records are not estimated. <a href="https://wgfd.wyo.gov/hunting-trapping/harvest-reports-surveys">WGFD reports</a></p>
        {deerSeries.map(({kind, rows}) => <section key={kind}><h3>{kind === 'MULE' ? 'Mule deer' : 'Whitetail'} harvest</h3>{rows.length ? <>
          <div className="grid2"><SuccessChart data={rows} title="Harvest per active license" /></div>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Active licenses</th><th className="num">Harvest</th><th className="num">Harvest / active license</th></tr></thead><tbody>{rows.slice().reverse().map(h => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.success)}</td></tr>)}</tbody></table></div>
        </> : <p className="muted">No validated species-specific estimate for this license.</p>}</section>)}
      </> : po.harvest.length ? (
        <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Hunters</th><th className="num">Harvest</th><th className="num">Success</th><th className="num">Days/hunter</th></tr></thead>
          <tbody>{po.harvest.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td><td className="num">{h.days !== null && h.hunters ? (h.days / h.hunters).toFixed(1) : '–'}</td></tr>)}</tbody></table>
          <p className="small muted">WGFD harvest survey estimates for this hunt area and license type.</p></div>
      ) : <p className="muted">No WGFD harvest estimate matched to this license.</p>}

      <h2>Draw History</h2>
      <div className="htable-wrap"><table><thead><tr><th>Draw</th><th className="num">Res quota</th><th className="num">Res 1st apps</th><th className="num">NR regular (pref + random)</th><th>NR regular needed</th><th className="num">NR special (pref + random)</th><th>NR special needed</th></tr></thead>
        <tbody>{[...new Set([...(po.res?.history ?? []).map((h) => h.year), ...(po.pools.regular?.history ?? []).map((h) => h.year)])].sort((a, b) => b - a).map((y) => {
          const r = po.res?.history.find((h) => h.year === y), g = po.pools.regular?.history.find((h) => h.year === y), x = po.pools.special?.history.find((h) => h.year === y);
          const eff = (e: number | null | undefined) => (e === null ? 'all drew' : e === undefined ? '–' : e.toFixed(1));
          return <tr key={y}><td>{y}</td><td className="num">{r?.quota ?? '–'}</td><td className="num">{r ? int(r.apps[0]) : '–'}</td><td className="num">{g ? `${g.prefQuota} + ${g.randomQuota}` : '–'}</td><td>{g ? eff(g.eff) : '–'}</td><td className="num">{x ? `${x.prefQuota} + ${x.randomQuota}` : '–'}</td><td>{x ? eff(x.eff) : '–'}</td></tr>;
        })}</tbody></table>
        <p className="small muted">"Needed" is the preference cutoff as one number: 3 points with 16% drawing at 3 = 3.8. Resident counts are WGFD's resident random-draw first choices.</p></div>

      {(po.pools.regular || po.pools.special) && <>
        <h2 id="odds">Odds At Every Point Level</h2>
        <div className="co-oddsbar">
          <span className="seg light" role="group" aria-label="Which draw">
            <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mode === 'proj'} scroll={false}>{po.projYear} projected</HuntLink>
            <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={mode === 'last'} scroll={false}>{po.year} actual</HuntLink>
          </span>
          <span className="seg light" role="group" aria-label="Pool">
            {(['nr', 'nrs'] as WyPool[]).filter((x) => table?.last?.[x]).map((x) => <HuntLink key={x} className="seg-link" href={q({ pool: x === myPool ? null : x })} aria-pressed={pool === x} scroll={false}>{WY_POOL_SHORT[x]}</HuntLink>)}
          </span>
        </div>
        {P ? <Ladder P={P} table={table} pool={pool} mode={mode} me={nr ? p : null} year={po.year} projected={po.projected} /> : <p className="muted">Pick a nonresident pool.</p>}
        <p className="small muted">{projected
          ? `${po.projYear} projection: last draw's cutoff moved by each of the year-to-year changes measured across Wyoming ${spLabel} hunts (never below the last draw); odds are the average over those outcomes. It beat last year's odds in a 2024–2026 backtest. Quotas, applicants and rule changes can move the result.`
          : `${po.year} draw: WGFD's printed first-choice preference odds by points, then the random draw estimated from its quota and first-choice applicants.`}</p>
      </>}
      <p className="small muted">Source: WGFD draw demand reports {Math.min(...(po.pools.regular?.history ?? po.res?.history ?? [{ year: po.year }]).map((h) => h.year))}–{po.year} and the {po.regs?.year ?? po.year} antelope, deer and elk regulations. Confirm dates and rules with WGFD before you apply.</p>
    </main>
  );
}

function Ladder({ P, table, pool, mode, me, year, projected }: { P: WyNrPoolData; table: WyOddsTable | null; pool: WyPool; mode: 'proj' | 'last'; me: number | null; year: number; projected: boolean }) {
  const rows = P.pref.rows.filter((r) => r[2] !== 'p');
  // WGFD prints the bottom of the ladder as one closing row ("N or fewer points"): label it once, at N
  const rest = rows.find((r) => r[2] === 'r');
  const top = Math.max(0, me ?? 0, ...rows.map((r) => r[3])) + 1;
  return (
    <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Points</th><th className="num">1st-choice applicants ({year} draw)</th><th className="num">{year} preference odds (printed)</th><th className="num">{mode === 'proj' && projected ? `${year + 1} projected, incl. random draw` : `${year} incl. random draw`}</th></tr></thead>
      <tbody>{Array.from({ length: top + 1 }, (_, k) => top - k).map((pt) => {
        const exact = rows.find((r) => r[2] === 'e' && r[3] === pt);
        const inRest = !exact && rest !== undefined && pt <= rest[3];
        const label = inRest && pt === rest[3] ? `${pt} or fewer` : String(pt);
        const apps = exact ? int(exact[4]) : inRest ? (pt === rest[3] ? `${int(rest[4])} (all ${pt} or fewer)` : '') : '0';
        return <tr key={pt} className={me === pt ? 'me' : undefined} aria-current={me === pt ? 'true' : undefined}><td>{me === pt ? <b>{label} · you</b> : label}</td><td className="num">{apps}</td><td className="num">{pct(prefOdds(P.pref, pt))}</td><td className="num">{pct(wyTableOdds(table, mode, pool, pt))}</td></tr>;
      })}</tbody></table></div>
  );
}
