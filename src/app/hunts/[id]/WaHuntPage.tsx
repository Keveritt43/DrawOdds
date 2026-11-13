import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow } from '@/components/HuntCards';
import { Star } from '@/components/Star';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPointsStore } from '@/lib/points';
import { readWaPoints, WA_POINT_TYPES, WA_DEER_TAGS, WA_ELK_TAGS } from '@/lib/waPoints';
import { int, pct as pct0, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { waPersonal, waLicense, waPo, WA_WEAPON_LABEL, type WaOddsTable } from '@/lib/waHunt';
import { LandBar } from '@/components/LandBar';
import { SuccessChart, HarvestChart } from '@/components/Charts';
import { WaOddsPointsChart, WaDrawHistory } from '@/components/WaCharts';
import type { YearPoint } from '@/lib/history';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
const unitLabel = (u: string) => (/^DA/.test(u) ? `Deer Area ${u.slice(2)}` : /^EA/.test(u) ? `Elk Area ${u.slice(2)}` : `GMU ${u}`);

/** A Washington deer or elk hunt: a special permit or multi-season tag (WDFW's weighted-point drawing, odds
 *  estimated) or a general season (over the counter). Laid out like Idaho's, Montana's and Utah's hunt pages. */
export async function WaHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string } }) {
  const po = waPo(s);
  const table = s.oddsByPts as unknown as WaOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : 'deer';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readWaPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const lic = waLicense(s);
  const gen = lic === 'general';
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const mine = waPersonal(s, pts, mode);
  const lastYear = po?.year ?? 2025, projYear = po?.projYear ?? 2027;
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds === 'last' ? 'last' : '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = lic === 'multi' ? [] : await db.unit.findMany({ where: { state: 'WA', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvest = (po?.harvest ?? []).filter((h) => h.hunters);
  const harvestSeries: YearPoint[] = harvest.map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, success: h.hunters && h.harvest !== null && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  // draw history: WDFW's published any-choice applications and permits, by drawing year
  const drawSeries: YearPoint[] = Object.entries(po?.demand ?? {}).filter(([, d]) => d.apps).map(([y, d]) => ({
    year: Number(y), permits: d.permits, resApps: d.apps, resPermits: d.permits, resOdds: d.apps && d.permits !== null ? Math.min(1, d.permits / d.apps) : null,
  })).sort((a, b) => a.year - b.year);
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const ptLabel = mine.type ? WA_POINT_TYPES.find((t) => t.key === mine.type)!.label.toLowerCase() : null;
  const myTag = s.species === 'DEER' ? WA_DEER_TAGS.find(([k]) => k === pts.deerTag)?.[1] : WA_ELK_TAGS.find(([k]) => k === pts.elkTag)?.[1];
  const notes: string[] = [];
  if (s.privateOnly) notes.push('Private land only');
  if (gen) notes.push('Over the counter, no draw');
  if (/\bQ\b/.test(po?.notes ?? '')) notes.push('Timberland access fees possible');
  if (mine.tagOk === false) notes.push(`Your ${myTag ?? 'saved'} tag can't apply`);
  const lastArr = table?.last?.res ?? [], projArr = table?.proj?.res ?? [];

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="WA" />
        {s.units[0] && lic !== 'multi' ? <> · <Link href={`/hunts?states=WA&unit=WA:${s.units[0]}&species=${s.species}`}>Washington {spLabel} hunts in {unitLabel(s.units[0])}</Link></> : null}
      </p>
      <h1 className="star-head">Washington {s.name} <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {gen ? `General season · ${WA_WEAPON_LABEL[s.weapon] ?? s.weapon}` : `${po?.category ?? 'Special permit'} · hunt ${s.tagCode}`}
        {!gen && s.tags !== null ? ` · ${int(s.tags)} ${lic === 'multi' ? 'tags' : 'permits'} (2026)` : ''}
        {po?.tag && !gen ? ` · tag: ${po.tag}` : ''}
        {gen && po?.side ? ` · ${po.side === 'EAST' ? 'Eastern' : 'Western'} Washington elk tag (${s.tagCode})` : ''}
        {' · '}{lic === 'multi' ? 'Statewide' : s.units.length > 6 ? `${s.units.length} GMUs` : s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('WA', u))}`}>{unitLabel(u)}</HuntLink></span>)}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}

      {/* 1. Can I get it? */}
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{gen ? 'Your tag' : `Your ${mine.projected ? `${projYear} projected` : lastYear} odds · estimated`}</div>
          <div className="co-big">{pct(mine.odds)} {mine.odds !== null && !gen && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {gen ? <>Buy a general {spLabel} tag over the counter{s.species === 'ELK' ? ' (Eastern or Western Washington, one weapon)' : ' (one weapon)'} and hunt this GMU&apos;s general season. This GMU&apos;s 2026 dates and legal {spLabel} for your weapon are under Season, from WDFW&apos;s 2026 pamphlet.</>
              : <>{mine.basis}. {mine.projected ? <HuntLink href={q({ odds: 'last' })} scroll={false}>See the {lastYear} estimate</HuntLink> : <HuntLink href={q({ odds: null })} scroll={false}>See the {projYear} projection</HuntLink>}</>}
            {!pts.set && !gen && <> <Link href="/account#hunting-preferences">Set your Washington points</Link> for your own odds.</>}
          </div>
        </div>
        {!gen && (
          <div className="card co-need">
            <div className="k">Applications and permits (WDFW)</div>
            {drawSeries.slice(-3).reverse().map((d) => <div key={d.year} className="co-need-row"><span>{d.year}</span><b>{pct(d.resOdds ?? null)}</b><span className="small muted">{int(d.resPermits ?? null)} {lic === 'multi' ? 'tags' : 'permits'} · {int(d.resApps ?? null)} applications (any choice)</span></div>)}
            {!drawSeries.length && <div className="small muted">WDFW has published no applications for this hunt.</div>}
          </div>
        )}
      </div>

      {/* 2. Do I want it? */}
      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}${s.harvestLastYear ? `, to ${s.harvestLastYear}` : ''}` : 'no WDFW estimate'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? 'no WDFW estimate' : gen ? 'this GMU and weapon' : 'this hunt'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.privateOnly ? '0%' : s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{s.privateOnly ? 'private land only' : lic === 'multi' ? 'all GMUs' : s.units.length > 1 ? `${s.units.length} units` : `of ${unitLabel(s.units[0] ?? '')}`}</div></div>
        {!gen && <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pct(fill)}</div><div className="small muted">odds × success</div></div>}
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {/* 3. The charts */}
      {!gen && table && <>
        <h2 id="odds">Odds At Every Point Level</h2>
        <div className="co-oddsbar"><span className="seg light" role="group" aria-label="Which drawing">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mine.projected} scroll={false}>Next drawing ({projYear}, projected)</HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={!mine.projected} scroll={false}>{lastYear} estimate</HuntLink>
        </span></div>
        <WaOddsPointsChart main={mine.projected ? projArr : lastArr} other={mine.projected ? lastArr : projArr} myPoints={mine.points} year={mine.projected ? projYear : lastYear} otherYear={mine.projected ? lastYear : projYear} projected={mine.projected} />
        <p className="small muted">Estimated. WDFW stopped publishing draw results by point level after 2020. {po?.seed === 'own' ? `This hunt starts from WDFW's own ${po?.seedYear ?? 2020} table of applicants at every point level` : `This hunt has no point table of its own, so it starts from the ${po?.category ?? 'category'} hunts' pooled ${po?.seedYear ?? 2020} mix`}, rolled forward a year at a time: everyone who didn&apos;t draw comes back with one more point, winners leave, and new applicants make up the count WDFW published that year. The {projYear} line rolls forward twice more with {lastYear}&apos;s applications and the 2026 permits. Tested on WDFW&apos;s 2018, 2019 and 2020 results, this beat last year&apos;s odds every year.{lic === 'multi' && s.species === 'DEER' ? ' Multi-season deer: thousands of drawn tags go unbought every year and are then sold to applicants who didn\'t draw, so a deer applicant\'s real chance of a tag is higher than these drawn odds.' : ''}</p>
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">No WDFW harvest estimate for this {gen ? 'GMU and weapon' : 'hunt'}.</p>}
      {!gen && drawSeries.length > 1 && <>
        <h2>Draw History</h2>
        <WaDrawHistory data={drawSeries.map((d) => ({ year: d.year, apps: d.resApps ?? null, permits: d.resPermits ?? null }))} />
        <p className="small muted">Permits ÷ every application that listed this hunt, at any choice: a rough guide only, since a hunt&apos;s winners are mostly high-point applicants.</p>
      </>}

      {/* 4. The details, folded */}
      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">{gen ? 'no draw' : 'weighted points'}</span></summary>
        {gen && <p><b>Over the counter, no draw.</b> Washington sells general deer and elk tags over the counter to residents and nonresidents. A deer tag is for one weapon (modern firearm, archery or muzzleloader); an elk tag is for one weapon and one side of the state (Eastern: EF, EA, EM; Western: WF, WA, WM). This GMU{s.species === 'ELK' && po?.side ? ` is in ${po.side === 'EAST' ? 'Eastern' : 'Western'} Washington` : ''}.</p>}
        {!gen && <p><b>A weighted drawing.</b> You earn one point each year you apply in a category ({ptLabel ?? 'this category'}). Each application gets your points plus this year&apos;s, squared, in random numbers, and the best one ranks you in the whole category&apos;s queue: 0 banked points = 1 entry, 2 = 9, 4 = 25. WDFW then goes down the queue giving each applicant their highest hunt choice that still has permits (up to four choices; two for Quality). So zero points can still draw, more points help a lot, and drawing resets that category&apos;s points to zero. Residents and nonresidents are in the same drawing; groups of up to {lic === 'multi' ? '2' : '8'} average their points.</p>}
        {!gen && po?.tag && <p><b>Tag required to apply:</b> {po.tag}.{myTag ? ` Yours: ${myTag}.` : ' Save your general tag in Account to check.'} Multi-season tag holders can apply with any weapon{s.species === 'ELK' ? ' and either side' : ''}.</p>}
        {s.privateOnly && <p><b>Private land only.</b> WDFW limits this permit to private land; you need landowner permission before you apply. It counts as 0% public land.</p>}
        {po?.pointsMeaning && <p className="small muted">{po.pointsMeaning}</p>}
      </details>
      {!gen && lastArr.length > 0 && (
        <details className="card fold">
          <summary><span>Odds table, every point level</span><span className="small muted">estimated</span></summary>
          <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Points held</th><th className="num">Entries</th><th className="num">{lastYear} (est.)</th><th className="num">{projYear} (proj.)</th></tr></thead>
            <tbody>{(() => {
              const top = Math.min(lastArr.length - 1, Math.max(10, (mine.points ?? 0) + 3, lastArr.findIndex((v) => v >= 0.995) + 1 || 20));
              return Array.from({ length: top + 1 }, (_, n) => {
                const isMe = mine.points === n;
                return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}><td>{isMe ? <b>{n} · you</b> : n}</td><td className="num">{(n + 1) ** 2}</td><td className="num">{pct(lastArr[n])}</td><td className="num">{pct(projArr[n] ?? null)}</td></tr>;
              });
            })()}</tbody></table></div>
        </details>
      )}
      {land && (
        <details className="card fold">
          <summary><span>Who manages the land</span><span className="small muted">{s.privateOnly ? 'private land only' : s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
          <LandBar shares={land} />
          <p className="small muted">Public ownership is not permission to cross private land. DNR trust land counts as state land. Much of western Washington&apos;s private land is industrial timberland, often open only with a paid access permit. Tribal land is closed unless the tribe permits. BLM Surface Management Agency, measured over WDFW&apos;s units.</p>
        </details>
      )}
      {(po?.dates || po?.legal) && (
        <details className="card fold" open={gen}>
          <summary><span>Season (2026)</span><span className="small muted">{po?.dates}</span></summary>
          <div className="htable-wrap"><table><tbody>
            <tr><th>Dates</th><td>{po?.dates || '–'}</td></tr>
            <tr><th>Legal animal</th><td>{po?.legal || '–'}</td></tr>
            <tr><th>Area</th><td>{gen ? s.areaName : po?.area || '–'}</td></tr>
            {gen ? <tr><th>Not shown</th><td className="small muted">Youth, 65+, hunters-with-disabilities and Master Hunter seasons, and Deer/Elk Area rules: see the pamphlet.</td></tr>
              : <tr><th>Hunt notes</th><td>{po?.notes || '–'} <span className="small muted">(letters are explained in the pamphlet&apos;s hunt-notes key)</span></td></tr>}
          </tbody></table></div>
        </details>
      )}
      {harvest.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvest.length} season{harvest.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Hunters</th><th className="num">Harvest</th><th className="num">Success</th></tr></thead>
            <tbody>{harvest.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters && h.harvest !== null ? h.harvest / h.hunters : null)}</td></tr>)}</tbody></table></div>
          <p className="small muted">WDFW game harvest reports{gen ? `, general season, GMU ${s.units[0]}, ${(WA_WEAPON_LABEL[s.weapon] ?? '').toLowerCase()}` : ', this hunt'}.</p>
        </details>
      )}
      <p className="small muted">Source: WDFW 2026 Big Game Hunting Seasons and Regulations (special permit tables, with each year&apos;s applications 2020–2025), WDFW special hunt drawing results by point level (2018–2020), WDFW game harvest reports (2013–2025), WDFW GMUs. Land: BLM Surface Management Agency. Confirm dates and rules with WDFW before you apply.</p>
    </main>
  );
}
