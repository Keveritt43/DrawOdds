import { huntWeaponLabel } from '@/lib/huntWeaponLabel';
import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow, TrophyMark } from '@/components/HuntCards';
import { Star } from '@/components/Star';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPointsStore } from '@/lib/points';
import { readOrPoints, OR_POINT_TYPES } from '@/lib/orPoints';
import { int, pct as pct0, pctOdds, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { orPersonal, orPo, orIsGeneral, orPrefCutoff, orUnitLabel, OR_WEAPON_LABEL, OR_FEES, OR_DEADLINE_2026, type OrOddsTable } from '@/lib/orHunt';
import { LandBar } from '@/components/LandBar';
import { SuccessChart, HarvestChart } from '@/components/Charts';
import { OrOddsPointsChart, OrDrawHistory } from '@/components/OrCharts';
import type { YearPoint } from '@/lib/history';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** An Oregon deer or elk hunt: a controlled hunt (ODFW's preference-point draw) or a general season (over the
 *  counter). Laid out like Idaho's, Utah's and Washington's hunt pages. */
export async function OrHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string } }) {
  const po = orPo(s);
  const table = s.oddsByPts as unknown as OrOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : 'deer';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readOrPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const pool = nr ? 'nr' : 'res';
  const gen = orIsGeneral(s);
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const mine = orPersonal(s, pts, nr, mode);
  const lastYear = po?.year ?? 2026, projYear = po?.projYear ?? 2027;
  const hasProj = !!po?.projected?.includes(pool) && !!table?.proj?.[pool]?.length;
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds === 'last' ? 'last' : '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = await db.unit.findMany({ where: { state: 'OR', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvest = (po?.harvest ?? []).filter((h) => h.hunters);
  const harvestSeries: YearPoint[] = harvest.map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, success: h.hunters && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  const demand = Object.entries(po?.demand ?? {}).map(([y, d]) => ({ year: Number(y), ...d })).sort((a, b) => a.year - b.year);
  const drawSeries = demand.map((d) => ({ year: d.year, apps: nr ? d.nrApps : d.resApps, drawn: nr ? d.nrDrawn : d.resDrawn, cutoff: d.prefCutoff }));
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const ptLabel = mine.type ? OR_POINT_TYPES.find((t) => t.key === mine.type)!.label : null;
  const cut = gen ? null : orPrefCutoff(po, pool);
  const notes: string[] = [];
  if (s.privateOnly) notes.push('Private land only');
  if (po?.privateLimited) notes.push('Private lands limit access');
  if (gen) notes.push('Over the counter, no draw');
  if (po?.newHunt && !gen) notes.push('New hunt area for 2026');
  if (nr && !gen && (po?.demand?.[String(lastYear)]?.nrDrawn ?? 0) === 0) notes.push('No nonresident drew in 2026');
  const lastArr = table?.last?.[pool] ?? [], projArr = table?.proj?.[pool] ?? [];
  const tagFee = s.species === 'ELK' ? OR_FEES.elkTag : OR_FEES.deerTag;

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="OR" />
        {s.units[0] ? <> · <Link href={`/hunts?states=OR&unit=OR:${s.units[0]}&species=${s.species}`}>Oregon {spLabel} hunts in {orUnitLabel(s.units[0])}</Link></> : null}
      </p>
      <h1 className="star-head">Oregon {s.name} <TrophyMark score={s.scoreTrophy} hunt={s} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {s.youthOnly && <b>Youth only · </b>}
        {gen ? `General season · ${OR_WEAPON_LABEL[s.weapon] ?? s.weapon}` : `Controlled hunt ${s.tagCode} · ${po?.series ?? ''} series · ${huntWeaponLabel(s)}`}
        {!gen && s.tags !== null ? ` · ${int(s.tags)} tags (2026)` : ''}
        {' · '}{s.units.length > 6 ? `${s.units.length} units` : s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('OR', u))}`}>{orUnitLabel(u)}</HuntLink></span>)}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}

      {/* 1. Can I get it? */}
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{gen ? 'Your tag' : `Your ${mine.projected ? `${projYear} projected` : `${lastYear} draw`} odds · ${nr ? 'nonresident' : 'resident'}`}</div>
          <div className="co-big">{pctOdds(mine.odds)} {mine.odds !== null && !gen && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {gen ? <>Buy the {po?.tag ?? 'general tag'} over the counter and hunt this unit&apos;s general season. 2026 dates and the legal {spLabel} are under Season, from ODFW&apos;s 2026 regulations.</>
              : <>{mine.basis}. {hasProj ? <>{mine.projected ? <HuntLink href={q({ odds: 'last' })} scroll={false}>See the {lastYear} draw</HuntLink> : <HuntLink href={q({ odds: null })} scroll={false}>See the {projYear} projection</HuntLink>}.</> : `The ${projYear} projection didn't beat the last draw in testing for ${nr ? 'nonresident' : 'resident'} ${po?.series === '200' ? 'elk' : po?.series === '600' ? 'antlerless deer' : 'buck deer'}, so this is the ${lastYear} draw.`}</>}
            {!pts.set && !gen && <> <Link href="/account#hunting-preferences">Set your Oregon points</Link> for your own odds.</>}
          </div>
        </div>
        {!gen && (
          <div className="card co-need">
            <div className="k">Point cutoff (one queue for both residencies, ODFW)</div>
            {demand.slice(-3).reverse().map((d) => <div key={d.year} className="co-need-row"><span>{d.year}</span><b>{d.prefCutoff === null ? (d.drawn >= d.apps ? 'All drew' : 'Random only') : `${d.prefCutoff} pts`}</b><span className="small muted">{int(d.tags)} tags · {int(d.apps)} first-choice applicants{nr ? ` (${int(d.nrApps)} nonresident, ${int(d.nrDrawn)} drew)` : ''}</span></div>)}
            {cut && <div className="small muted">{lastYear}: {cut.share >= 0.995 ? `everyone at ${cut.points}+ points drew by preference` : `${Math.round(cut.share * 100)}% of ${cut.points}-point ${nr ? 'nonresidents' : 'residents'} drew by preference; more points drew every time`}.</div>}
          </div>
        )}
      </div>

      {/* 2. Do I want it? */}
      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}${s.harvestLastYear ? `, to ${s.harvestLastYear}` : ''}${s.hunters5 !== null ? ` · ${int(s.hunters5)} hunter-seasons` : ''}${s.smallSample ? ' · Small sample' : ''}` : po?.newHunt ? 'new hunt area for 2026: no harvest yet' : 'no matching ODFW harvest'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? (po?.publicPctSource === 'odfw' ? 'part of a unit: area not measured' : 'no ODFW estimate') : gen ? 'this unit and season' : 'this hunt'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.privateOnly ? '0%' : s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{s.privateOnly ? 'private land only' : po?.publicPctSource === 'odfw' ? 'ODFW\'s figure for the hunt area' : s.units.length > 1 ? `${s.units.length} units` : `of ${orUnitLabel(s.units[0] ?? '')}`}</div></div>
        {!gen && <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pctOdds(fill)}</div><div className="small muted">odds × success</div></div>}
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {/* 3. The charts */}
      {!gen && lastArr.length > 0 && <>
        <h2 id="odds">Odds At Every Point Level</h2>
        {hasProj && <div className="co-oddsbar"><span className="seg light" role="group" aria-label="Which drawing">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mine.projected} scroll={false}>Next draw ({projYear}, projected)</HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={!mine.projected} scroll={false}>{lastYear} draw</HuntLink>
        </span></div>}
        <OrOddsPointsChart main={mine.projected ? projArr : lastArr} other={hasProj ? (mine.projected ? lastArr : projArr) : []} myPoints={mine.points} year={mine.projected ? projYear : lastYear} otherYear={mine.projected ? lastYear : projYear} projected={mine.projected} pool={pool} />
        <p className="small muted">From ODFW&apos;s {lastYear} draw report: how many first-choice {nr ? 'nonresidents' : 'residents'} applied and drew in the preference phase at each point level, and how many drew at random. ODFW uses one random number per application for both phases, so applicants who lost the tie at the point cutoff also hold poor numbers for the random draw: at the cutoff your odds are the better of the two, not both added. {hasProj ? `The ${projYear} line assumes points creep up a quarter point a year, the method that beat last draw's odds for ${nr ? 'nonresident' : 'resident'} ${po?.series === '200' ? 'elk' : 'buck deer'} when tested on 2022–2026.` : ''}</p>
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">{po?.newHunt && !gen ? 'ODFW drew this hunt area for the first time in 2026; its first harvest report comes out in spring 2027.' : `No matching ODFW harvest history for this ${gen ? 'unit and season' : 'hunt'}.`}</p>}
      {!gen && <p className="small muted">A season counts only when that year&apos;s draw report lists this hunt number under the same name, so a renumbered hunt doesn&apos;t inherit someone else&apos;s history.</p>}
      {!gen && drawSeries.length > 1 && <>
        <h2>Draw History</h2>
        <OrDrawHistory data={drawSeries} />
        <p className="small muted">First-choice applicants and tags drawn for {nr ? 'nonresidents' : 'residents'}; the point cutoff is the fewest points that drew in the preference phase (both residencies).</p>
      </>}

      {/* 4. The details, folded */}
      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">{gen ? 'no draw' : 'preference points'}</span></summary>
        {gen && <p><b>Over the counter, no draw.</b> Oregon sells general deer and elk tags over the counter to residents and nonresidents. A hunter holds one deer tag and one elk tag a year (a few additional tags aside), so a general tag and a controlled tag for the same species don&apos;t go together.</p>}
        {!gen && <p><b>Preference points, with a random share.</b> You get a point ({ptLabel ?? 'this series'}) each year you apply and don&apos;t draw your first choice, or buy a point saver. 75% of each hunt&apos;s tags go to the first-choice applicants with the most points; applicants with 0 points never draw in this phase. The other 25% go at random to everyone left, so anyone can draw. Drawing your first choice resets that series to 0, whether or not you buy the tag. Only first choices use points: second to fifth choices only get tags left after every first choice.</p>}
        {!gen && <p><b>Nonresidents</b> can draw at most 5% of a hunt&apos;s deer or elk tags, so a hunt with fewer than 20 tags has none for nonresidents. ODFW&apos;s guides and outfitters program also takes tags equal to half of last year&apos;s nonresident draw before the drawing (unsold ones return to it), which is why nonresident draws often stop short of 5%.</p>}
        {s.youthOnly && <p><b>Youth only.</b> Open to youth hunters only; check ODFW&apos;s youth rules for ages and the adult who must go along.</p>}
        {s.privateOnly && <p><b>Private land only.</b> This hunt is on private land: you need landowner permission before you apply. It counts as 0% public land.</p>}
        {po?.privateLimited && !s.privateOnly && <p><b>Private lands limit access.</b> ODFW marks this hunt &quot;*&quot;: don&apos;t apply unless you have access to a place to hunt.</p>}
        {po?.boundary && <p className="small"><b>Hunt area.</b> {po.boundary}{po.boundary.length >= 600 ? '…' : ''}</p>}
      </details>
      {!gen && lastArr.length > 0 && (
        <details className="card fold">
          <summary><span>Odds table, every point level</span><span className="small muted">{nr ? 'nonresident' : 'resident'}</span></summary>
          <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Points</th><th className="num">Applied ({lastYear})</th><th className="num">Drew by points</th><th className="num">{lastYear} odds</th>{hasProj && <th className="num">{projYear} (proj.)</th>}</tr></thead>
            <tbody>{(() => {
              const rows = new Map((po?.pools?.[pool]?.rows ?? []).map(([p, n, d]) => [p, { n, d }]));
              const top = Math.min(lastArr.length - 1, Math.max(8, (mine.points ?? 0) + 3, Math.max(0, ...rows.keys()) + 1));
              return Array.from({ length: top + 1 }, (_, n) => {
                const isMe = mine.points === n;
                const r = rows.get(n);
                return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}><td>{isMe ? <b>{n} · you</b> : n}</td><td className="num">{r ? int(r.n) : '–'}</td><td className="num">{r ? int(r.d) : '–'}</td><td className="num">{pctOdds(lastArr[n])}</td>{hasProj && <td className="num">{pctOdds(projArr[n] ?? null)}</td>}</tr>;
              });
            })()}</tbody></table></div>
        </details>
      )}
      <details className="card fold">
        <summary><span>What it costs</span><span className="small muted">{nr ? 'nonresident' : 'resident'}, {OR_FEES.year}</span></summary>
        <div className="htable-wrap"><table><tbody>
          <tr><th>Hunting license (needed to apply)</th><td className="num">{usd(OR_FEES.license[nr ? 'nr' : 'res'])}</td></tr>
          {!gen && <tr><th>Controlled hunt application, per series</th><td className="num">{usd(OR_FEES.application)}</td></tr>}
          <tr><th>{s.species === 'ELK' ? 'Elk' : 'Deer'} tag{gen ? '' : ' (only if drawn)'}</th><td className="num">{usd(tagFee[nr ? 'nr' : 'res'])}</td></tr>
        </tbody></table></div>
        <p className="small muted">2026 Oregon Big Game Hunting Regulations fee table. {gen ? '' : `Applications for the 100, 200 and 600 series were due ${OR_DEADLINE_2026}; check ODFW for 2027. `}Youth, senior and pioneer prices differ. <a href={OR_FEES.source} target="_blank" rel="noreferrer">ODFW regulations</a></p>
      </details>
      {land && (
        <details className="card fold">
          <summary><span>Who manages the land</span><span className="small muted">{s.privateOnly ? 'private land only' : s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
          <LandBar shares={land} />
          <p className="small muted">{po?.publicPctSource === 'odfw' ? `The hunt covers part of ${s.units.length > 1 ? 'these units' : 'this unit'}; the bar is the whole unit, the ${Math.round(s.publicPct ?? 0)}% public above is ODFW's figure for the hunt area. ` : ''}Public ownership is not permission to cross private land. Much of western Oregon&apos;s private land is industrial timberland, some open only with a paid or reserved access permit; ODFW&apos;s Access &amp; Habitat areas are open by agreement. Tribal land is closed. BLM Surface Management Agency, measured over ODFW&apos;s units.</p>
        </details>
      )}
      {(po?.dates || po?.legal) && (
        <details className="card fold" open={gen}>
          <summary><span>Season (2026)</span><span className="small muted">{po?.dates}</span></summary>
          <div className="htable-wrap"><table><tbody>
            <tr><th>Dates</th><td>{po?.dates || '–'}</td></tr>
            <tr><th>Legal animal</th><td>{po?.legal || '–'}</td></tr>
            <tr><th>Area</th><td>{s.areaName || '–'}</td></tr>
            {!gen && <tr><th>Tag</th><td>Controlled {po?.series} series tag ({po?.section})</td></tr>}
          </tbody></table></div>
        </details>
      )}
      {harvest.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvest.length} season{harvest.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Hunters</th><th className="num">Harvest</th><th className="num">Success</th></tr></thead>
            <tbody>{harvest.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td></tr>)}</tbody></table></div>
          <p className="small muted">ODFW harvest summaries (estimates from mandatory harvest reporting){gen ? `, general season, ${orUnitLabel(s.units[0])}` : ', this hunt, summed over the units ODFW lists it in'}. A hunter who hunted two units is counted in both.</p>
        </details>
      )}
      <p className="small muted">Source: ODFW 2026 Oregon Big Game Hunting Regulations (hunt tables, seasons, fees), ODFW controlled hunt draw reports 2021–2026, ODFW harvest summaries 2021–2025, ODFW wildlife management units and 2026 Eastern Oregon deer hunt areas. Land: BLM Surface Management Agency. Confirm dates and rules with ODFW before you apply.</p>
    </main>
  );
}
