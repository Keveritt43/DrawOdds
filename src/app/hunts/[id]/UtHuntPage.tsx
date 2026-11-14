import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow, TrophyMark } from '@/components/HuntCards';
import { Star } from '@/components/Star';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPointsStore } from '@/lib/points';
import { readUtPoints, UT_POINT_TYPES } from '@/lib/utPoints';
import { int, pct as pct0, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { utKind, utPersonal, utProjects, UT_POOL_LABEL, type UtOddsTable, type UtPointOdds, type UtPool } from '@/lib/utHunt';
import { LandBar } from '@/components/LandBar';
import { OddsChart, ApplicantsChart, SuccessChart, HarvestChart } from '@/components/Charts';
import { UtOddsPointsChart } from '@/components/UtCharts';
import type { YearPoint } from '@/lib/history';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
const WEAPON_LABEL: Record<string, string> = { ANY: 'Any legal weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };

/** A Utah deer or elk hunt: limited entry / CWMU (bonus points), general buck deer (preference points), or general
 *  bull elk (over the counter). Laid out like Idaho's and Montana's hunt pages. */
export async function UtHuntPage({ s, sp }: { s: HuntSummary; sp: { pool?: string; odds?: string } }) {
  const po = s.pointOdds as unknown as UtPointOdds | null;
  const table = s.oddsByPts as unknown as UtOddsTable | null;
  const spLabel = ({ ELK: 'elk', DEER: 'deer', PRONGHORN: 'pronghorn', BISON: 'bison' } as Record<string, string>)[s.species] ?? 'big game';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readUtPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const kind = utKind(s);
  const otc = kind === 'otc';
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const mine = utPersonal(s, pts, nr, mode);
  const canProject = !!po?.projected; // some pool of this hunt is projected
  const projYear = po?.projYear ?? (po?.year ?? 2026) + 1;
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const myPool: UtPool = nr ? 'nr' : 'res';
  const pool: UtPool = sp.pool === 'res' || sp.pool === 'nr' ? sp.pool : myPool;
  const year = po?.year ?? 2026;
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ pool: sp.pool ?? '', odds: sp.odds === 'last' ? 'last' : '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = await db.unit.findMany({ where: { state: 'UT', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvestSeries: YearPoint[] = (po?.harvest ?? []).map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, success: h.hunters > 0 && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  // draw history: 2021-2025 DWR reports plus this year's pools
  const drawSeries: YearPoint[] = [];
  for (const [y, p] of Object.entries(po?.history ?? {})) drawSeries.push({ year: Number(y), resApps: p.res?.apps ?? null, nrApps: p.nr?.apps ?? null, resPermits: p.res?.drew ?? null, nrPermits: p.nr?.drew ?? null, resOdds: p.res?.apps ? Math.min(1, p.res.drew / p.res.apps) : null, nrOdds: p.nr?.apps ? Math.min(1, p.nr.drew / p.nr.apps) : null });
  if (po?.pools && !otc) {
    const sum = (k: UtPool, i: 1 | 2) => (po.pools[k]?.levels ?? []).reduce((a, l) => a + l[i], 0);
    drawSeries.push({ year, permits: s.tags, resApps: sum('res', 1) || null, nrApps: sum('nr', 1) || null, resPermits: sum('res', 2) || null, nrPermits: sum('nr', 2) || null,
      resOdds: sum('res', 1) ? sum('res', 2) / sum('res', 1) : null, nrOdds: sum('nr', 1) ? sum('nr', 2) / sum('nr', 1) : null });
  }
  drawSeries.sort((a, b) => a.year - b.year);
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const notes: string[] = [];
  if (s.privateOnly) notes.push('Private land only (CWMU)');
  if (s.youthOnly) notes.push('Youth only');
  if (otc) notes.push('Over the counter, no draw');
  if (s.privateOnly && nr) notes.push('Residents only in the public draw');
  const ptLabel = mine.type ? UT_POINT_TYPES.find((t) => t.key === mine.type)!.label.toLowerCase() : null;
  const seasons = ((s.tagSeasons as unknown as { seasons?: { weapon: string; dates: { open: string | null; close: string | null }[]; notes?: string }[] })?.seasons) ?? [];

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="UT" />
        {s.units[0] ? <> · <Link href={`/hunts?states=UT&unit=UT:${s.units[0]}&species=${s.species}`}>Utah {spLabel} hunts on this boundary</Link></> : null}
      </p>
      <h1 className="star-head">Utah {s.name} <TrophyMark score={s.scoreTrophy} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Hunt {s.tagCode} · {WEAPON_LABEL[s.weapon] ?? s.weapon}
        {otc ? ' · Statewide permit cap' : s.tags !== null ? ` · ${int(s.tags)} permits (${year} draw)` : ''}
        {' · '}{s.units.length > 6 ? `${s.units.length} hunt boundaries` : s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('UT', u))}`}>{s.units.length === 1 ? (s.areaName ?? `Boundary ${u}`) : `Boundary ${u}`}</HuntLink></span>)}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}
      <div className="cost-lines"><h4>What It Costs</h4><p>Adult {nr ? 'nonresident' : 'resident'} hunting license: <b>{nr ? '$144' : '$40'}</b> (DWR fee schedule checked November 12, 2026). {otc ? 'The permit is purchased separately; availability may be capped.' : <>The 2026 application fee is <b>{nr ? '$21' : '$10'}</b> per species; the permit price depends on the hunt and is additional if drawn.</>} A 2.2% transaction fee may apply. These items are not a complete total.</p><p><a href="/api/state?code=UT&amp;next=%2Fguide">See Utah draw and permit fees</a> · <a href="https://wildlife.utah.gov/fees">Current DWR fee schedule</a></p></div>

      {/* 1. Can I draw it? */}
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{otc ? 'Your permit' : `Your ${mine.projected ? `${projYear} projected` : year} odds · ${UT_POOL_LABEL[myPool]}`}</div>
          <div className="co-big">{pct(mine.odds)} {mine.odds !== null && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {otc ? 'Sold over the counter until the statewide cap is reached (any bull and spike permits go on sale in July).' : <>{mine.basis}.{' '}{!utProjects(po, myPool) ? <>Shown as it last drew: no forecast of Utah&apos;s {nr ? 'nonresident' : 'resident'} {spLabel} draw tested better than repeating the last one.</> : mine.projected ? <HuntLink href={q({ odds: 'last' })} scroll={false}>See the {year} draw</HuntLink> : <HuntLink href={q({ odds: null })} scroll={false}>See the {projYear} projection</HuntLink>}</>}
            {!pts.set && !otc && <> <Link href="/account#hunting-preferences">Set your Utah points</Link> for your own odds.</>}
          </div>
        </div>
        {!otc && po?.pools && (
          <div className="card co-need">
            <div className="k">{year} permits and first-choice applicants</div>
            {(['res', 'nr'] as UtPool[]).map((p) => {
              const pl = po.pools[p];
              if (!pl) return <div key={p} className="co-need-row"><span>{UT_POOL_LABEL[p]}</span><b>–</b><span className="small muted">no {p === 'nr' ? 'nonresident' : 'resident'} permits</span></div>;
              const apps = pl.levels.reduce((a, l) => a + l[1], 0), drew = pl.levels.reduce((a, l) => a + l[2], 0);
              return <div key={p} className="co-need-row"><span>{UT_POOL_LABEL[p]}</span><b>{pct(apps ? drew / apps : null)}</b><span className="small muted">{int(drew)} of {int(apps)} drew · {int(pl.quota)} reported quota{kind === 'bonus' && pl.maxPointQuota !== null ? ` (${int(pl.maxPointQuota)} to the most points)` : ''}{drew > pl.quota ? <> · first-choice successes exceed the listed quota; <a href="https://wildlife.utah.gov/en-us/rules/r657-62">DWR rules allow some unused reserved permits to return or cross pools</a>, but this report&apos;s specific difference is not verified.</> : ''}</span></div>;
            })}
          </div>
        )}
      </div>

      {/* 2. Do I want it? */}
      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}${s.harvestLastYear === 2025 ? ' (2025 preliminary)' : ''}` : 'no DWR estimate'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? 'no DWR estimate' : otc ? 'statewide hunt over its units' : 'this hunt'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.privateOnly ? '0%' : s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{s.privateOnly ? 'private land only' : s.units.length > 1 ? `${s.units.length} boundaries` : 'of the boundary'}</div></div>
        {!otc && <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pct(fill)}</div><div className="small muted">odds × success</div></div>}
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {/* 3. The charts */}
      {!otc && table && <>
        <h2 id="odds">Odds At Every {kind === 'bonus' ? 'Bonus' : 'Preference'} Point Level</h2>
        {canProject && <div className="co-oddsbar"><span className="seg light" role="group" aria-label="Which draw">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mine.projected} scroll={false}>Next draw (projected)</HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={!mine.projected} scroll={false}>{year} actual</HuntLink>
        </span></div>}
        {mine.projected
          ? <UtOddsPointsChart res={table.proj.res ?? []} nr={table.proj.nr ?? []} myPoints={mine.points} mine={myPool} year={projYear} kind={kind === 'bonus' ? 'bonus' : 'preference'} projected />
          : <UtOddsPointsChart res={table.last.res ?? []} nr={table.last.nr ?? []} myPoints={mine.points} mine={myPool} year={year} kind={kind === 'bonus' ? 'bonus' : 'preference'} />}
        {mine.projected && <p className="small muted">The {projYear} projection rolls the {year} applicants forward: everyone who didn&apos;t draw comes back with one more point, new applicants start at 0, and drawing resets a hunter&apos;s points; permits as in {year}. Each pool is projected only where that beat repeating the last draw in the 2026 test (predicted from earlier years only) and over 2023–2026 together.{(['res', 'nr'] as UtPool[]).filter((p) => po?.pools?.[p] && !utProjects(po, p)).map((p) => ` The ${UT_POOL_LABEL[p].toLowerCase()} line repeats the ${year} draw: no ${UT_POOL_LABEL[p].toLowerCase()} projection passed.`).join('')}</p>}
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">No DWR harvest estimate for this hunt number.</p>}
      {!otc && drawSeries.length > 1 && <>
        <h2>Draw History</h2>
        <div className="grid2"><OddsChart data={drawSeries} nr={nr} /><ApplicantsChart data={drawSeries} /></div>
      </>}

      {/* 4. The details, folded */}
      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">{otc ? 'no draw' : kind === 'bonus' ? 'bonus points' : 'preference points'}</span></summary>
        {otc && <p><b>Over the counter, no draw.</b> Utah sells general-season bull elk permits over the counter, to residents and nonresidents, until each statewide cap is reached. This permit is valid on the {s.areaName?.toLowerCase()} listed for it ({s.units.length} hunt boundaries).</p>}
        {kind === 'bonus' && <p><b>Bonus points, two rounds.</b> Half of each pool&apos;s permits, rounded up, go to the applicants with the most {ptLabel ?? spLabel} bonus points, on their first choice (a pool with one permit skips this round). Everyone left goes into a random draw where each applicant gets one chance plus one for every bonus point. So zero points can still draw, and every point helps. These odds re-run that draw on the {year} applicants and permits; checked against DWR&apos;s published results for 2021–2026, it reproduces them. Drawing costs all your points for the species{s.species === 'BISON' ? ', and bison is once in a lifetime: after drawing you can never apply for bison again' : s.species === 'PRONGHORN' ? ', and limited-entry buck pronghorn then has a 2-year waiting period' : ', and limited-entry buck deer and bull elk then have a 5-year waiting period'}.</p>}
        {kind === 'preference' && <p><b>Preference points, a strict line.</b> General buck deer permits go to the applicants with the most preference points first, unit by unit (20% of each unit&apos;s permits are set aside for youth). The odds at each level are DWR&apos;s printed {year} first-choice rates. Later choices matter here: in 2026, 6.4% of general deer permits statewide went to hunters on a second or later choice. Drawing resets your general deer points to zero.</p>}
        {s.privateOnly && <p><b>CWMU.</b> A Cooperative Wildlife Management Unit permit is valid only on that private property, with the operator&apos;s rules; the public draw has no nonresident permits for it. It counts as 0% public land.</p>}
        <p className="small muted">{po?.pointsMeaning}</p>
      </details>
      {!otc && po?.pools?.[pool] && (
        <details className="card fold">
          <summary><span>Odds table, every point level</span><span className="small muted">{year} draw</span></summary>
          <span className="seg light" role="group" aria-label="Pool">
            {(['res', 'nr'] as UtPool[]).map((p) => <HuntLink key={p} className="seg-link" href={q({ pool: p === myPool ? null : p })} aria-pressed={pool === p} scroll={false}>{UT_POOL_LABEL[p]}</HuntLink>)}
          </span>
          <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Your points</th><th className="num">Applicants</th><th className="num">Drew (DWR)</th><th className="num">{year} odds</th></tr></thead>
            <tbody>{(() => {
              const arr = table?.last[pool] ?? [];
              const lv = po.pools[pool]!.levels;
              const top = Math.max(arr.length - 1, ...lv.map((l) => l[0]), mine.points ?? 0);
              return Array.from({ length: top + 1 }, (_, k) => top - k).map((n) => {
                const l = lv.find((x) => x[0] === n);
                const isMe = pool === myPool && mine.points === n;
                return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}><td>{isMe ? <b>{n} · you</b> : n}</td><td className="num">{l ? int(l[1]) : '0'}</td><td className="num">{l ? `${int(l[2])} (${pct(l[1] ? l[2] / l[1] : null)})` : '–'}</td><td className="num">{pct(arr[Math.min(n, arr.length - 1)] ?? null)}</td></tr>;
              });
            })()}</tbody></table></div>
          <p className="small muted">{year} first-choice applicants and permits drawn, by points held when applying. {kind === 'bonus' ? 'The odds column is the modelled chance at each level (it smooths levels where a handful of applicants were lucky or not); the drew column is what DWR printed.' : 'The odds column is DWR\'s printed rate, never falling as points rise.'}</p>
        </details>
      )}
      <details className="card fold">
        <summary><span>Who manages the land</span><span className="small muted">{s.privateOnly ? 'private land only' : s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
        {land && <LandBar shares={land} />}
        <p className="small muted">{s.privateOnly ? 'This permit is valid on the CWMU\'s private land only. ' : ''}Public ownership is not permission to cross private land; Utah trust lands (SITLA) are counted as state land and have their own access rules. Tribal land is closed unless the tribe permits. BLM Surface Management Agency, measured over DWR&apos;s hunt boundaries.</p>
      </details>
      <details className="card fold">
        <summary><span>Seasons ({year})</span><span className="small muted">{seasons.length} season{seasons.length === 1 ? '' : 's'}</span></summary>
        <div className="htable-wrap"><table><thead><tr><th>Weapon</th><th>Opens</th><th>Closes</th><th>Notes</th></tr></thead>
          <tbody>{seasons.map((x, i) => <tr key={i}><td>{WEAPON_LABEL[x.weapon] ?? x.weapon}</td><td>{x.dates[0]?.open ?? '–'}</td><td>{x.dates[0]?.close ?? '–'}</td><td className="small">{x.notes || '–'}</td></tr>)}</tbody></table></div>
      </details>
      {harvestSeries.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvestSeries.length} season{harvestSeries.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Hunters afield</th><th className="num">Harvest</th><th className="num">Success</th></tr></thead>
            <tbody>{(po?.harvest ?? []).slice().reverse().map((h) => <tr key={h.year}><td>{h.year}{h.preliminary ? ' (preliminary)' : ''}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td></tr>)}</tbody></table></div>
          <p className="small muted">DWR&apos;s estimates for this hunt number. DWR&apos;s own success figure is computed from raw survey answers, so it can differ slightly from harvest ÷ hunters.</p>
        </details>
      )}
      <p className="small muted">Source: Utah DWR {year} draw results (utahdraws.com), DWR drawing odds reports 2021–2025, DWR harvest reports (2025 preliminary), the {year} Big Game Application and Field Regulations guidebooks, DWR hunt boundaries. Land: BLM Surface Management Agency. Confirm dates and rules with DWR before you apply.</p>
    </main>
  );
}
