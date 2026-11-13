import { CoSpecialHuntPage } from './CoSpecialHuntPage';
import { coSpecial } from '@/lib/coSpecial';
import { HuntLink } from '@/components/HuntNavigation';
import { CoPressureEvidence } from '@/components/CoPressureNote';
import { getCoScoringContext } from '@/lib/coScoringContext';
import { CoCreepChart as CreepChart, CoOddsPointsChart as OddsPointsChart, CoHarvestCharts as HarvestCharts } from '@/components/CoCharts';
import { ScoreRow } from '@/components/HuntCards';
import { withCoScores, withCoOpportunity } from '@/lib/coScores';
import { CoAlternatives } from '@/components/CoAlternatives';
import { CoLand } from "@/components/CoLand";
import { CoUnitSeasonHunters } from "@/components/CoUnitSeasonHunters";
import { OverlappingElk } from '@/components/OverlappingElk';
import Link from 'next/link';
import { BackLink } from '@/components/BackLink';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPoints } from '@/lib/points';
import { Star } from '@/components/Star';
import { CoHerds } from '@/components/CoHerds';
import { int } from '@/lib/format';
import { unitKey } from '@/lib/states';
import {
  decodeCode,
  myOdds,
  poolFor,
  POOL_LABEL,
  CO_POOLS,
  type CoPool,
  type PointOdds,
  type PoolOdds,
  type HarvestYear,
} from '@/lib/coHunt';
import { CHANCE_LABEL, drawsToDraw, cutFromEff, RULE_CHANGE_YEAR } from '@/lib/coOdds';
import { fmtNeed, fmtCreep } from '../CoFinder';

const SHORT: Record<CoPool, string> = { res: 'Resident', nr: 'Nonres', yres: 'Youth res', ynr: 'Youth nonres' };
const pct = (o: number | null | undefined) =>
  o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`;

/** A Colorado hunt code's page: your odds, points needed and their trend, and odds at every point level. */
export async function CoHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string; pool?: string } }) {
  s = withCoScores(s,await getCoScoringContext());
  const special = coSpecial(s);
  if (special) return <CoSpecialHuntPage s={s} hunt={special} />;
  const po = s.pointOdds as unknown as PointOdds | null;
  const d = decodeCode(s.tagCode ?? "");
  const species = s.species === 'PRONGHORN' ? 'PRONGHORN' : s.species === 'ELK' ? 'ELK' : 'DEER';
  const [pts, session] = await Promise.all([getPoints('CO'), auth()]);
  const saved = session?.user
    ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } })
    : null;
  const nr = pts.res === "NONRESIDENT";
  const myPool = poolFor(nr, pts.youth);
  const pool: CoPool = (CO_POOLS as readonly string[]).includes(sp.pool ?? '') ? (sp.pool as CoPool) : myPool;
  const mode = sp.odds === "last" ? "last" : "proj";
  const p = pts[species];
  const spLabel = species.toLowerCase();
  if (po?.general && d)
    return (
      <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
        <p className="small"><BackLink state="CO" /></p>
        <h1>{s.name}</h1>
        <p>
          <b>General / over-the-counter {spLabel} license</b> · {s.tagCode}
        </p>
        <p>
          {po.general.resident ? 'Residents eligible' : 'Not available to residents'} ·{' '}
          {po.general.nonresident ? 'Nonresidents eligible' : 'Not available to nonresidents'} under the {po.general.regulationsYear}{' '}
          regulations.
        </p>
        <p className="muted">
          Eligibility and hunt boundaries are from the published regulations, not an assurance of current sales availability. Confirm rules
          for your license year with CPW.
        </p>
        <ScoreRow r={withCoOpportunity(s, (nr ? po.general.nonresident : po.general.resident) ? 1 : null, nr)} nr={nr} open />
        <h2>Dates And Units</h2>
        <p>{po.dates ? fmtDates(po.dates.start, po.dates.end) : 'See CPW regulations for dates'}</p>
        <p>
          {s.units.map((u, i) => (
            <span key={u}>
              {i ? ', ' : ''}
              <HuntLink href={`/units/${encodeURIComponent(unitKey('CO', u))}`}>{u}</HuntLink>
            </span>
          ))}
        </p>
        <p className="small muted">{po.regs?.unitText}</p>
        <h2>Hunter Success</h2>
        {po.harvest?.length ? <div className="grid2 co-graph-grid"><HarvestCharts rows={po.harvest} /></div> : null}
        {po.harvest?.length ? <Harvest rows={po.harvest} species={spLabel} /> : <p>No harvest estimate loaded for this code.</p>}
        <h2>{species === 'PRONGHORN' ? 'Pronghorn' : 'Elk'} Population</h2>
        {species === 'ELK' && <CoUnitSeasonHunters units={s.units} hunt={s} />}
        <CoLand units={s.units} />
        <CoHerds species={species} herds={po.herds ?? []} highlight={s.units} />
      </main>
    );
  if (!po || !d)
    return (
      <main className="wrap" style={{ margin: '24px auto' }}>
        <p className="small"><BackLink state="CO" /></p>
        <h1>{s.name}</h1>
        <p className="muted">No draw data for this hunt code yet.</p>
      </main>
    );
  const P = po.pools[pool];
  const mine = myOdds(po.pools[myPool], p, 'proj', po.year, myPool);
  const mineLast = myOdds(po.pools[myPool], p, 'last', po.year, myPool);
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds ?? '', pool: sp.pool ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const myPo = po.pools[myPool];
  const wait = myPo?.proj ? drawsToDraw(p, myPo.proj) : null;
  const drawYear = wait === null ? null : po.projYear + wait;

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="CO" /> · <Link href={`/hunts?states=CO&unit=CO:${d.unit}&species=${species}`}>Colorado hunts in unit {d.unit}</Link>
      </p>
      <h1 className="star-head">
        {s.name} <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label />
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Hunt code <b>{s.tagCode}</b> · {s.tags !== null ? `${int(s.tags)} licenses in ${po.year}` : ''} · List {po.list ?? '–'}
        {po.nrCapPct !== null ? ` · Nonresident cap ${po.nrCapPct}%${po.nrCap !== null ? ` (CPW report: ${po.nrCap} licenses)` : ''}` : ''}
        {po.hybridCap ? ` · Hybrid draw up to ${po.hybridCap}` : ''}
        {s.privateOnly ? ' · Private land only' : ''} ·{' '}
        <HuntLink href={`/units/${encodeURIComponent(unitKey('CO', d.unit))}`}>Unit {d.unit}</HuntLink>
      </p>
      {po.nrCapPct !== null && po.nrCap !== null && <p className="small muted">The cap count is taken from CPW&apos;s draw recap; it is not calculated from the total shown above, which can include other allocations.</p>}
      <div className="cost-lines"><h4>What It Costs</h4><p>Applying for a Colorado big-game draw requires an eligible qualifying license, an application fee and, for most adults, a habitat stamp. The big-game license is an additional cost if drawn. Amounts vary by residency, age and license; the listed items are not a complete total.</p><p><a href="https://cpw.state.co.us/activities/hunting/big-game/qualifying-license">Qualifying licenses</a> · <a href="https://cpw.state.co.us/activities/hunting/big-game">Current CPW brochure and fees</a></p></div>

      <ScoreRow r={withCoOpportunity(s, myOdds(po.pools[myPool], p, mode, po.year, myPool)?.odds ?? null, nr)} nr={nr} open />
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">
            Your {po.projYear} odds · {p} {spLabel} point{p === 1 ? '' : 's'} · {POOL_LABEL[myPool]}
          </div>
          <div className="co-big">
            {pct(mine?.odds)} <span className={`pill ch-${mine?.chance ?? 'none'}`}>{CHANCE_LABEL[mine?.chance ?? 'none']}</span>
          </div>
          <div className="small muted">
            {myPo?.proj ? `${po.projYear} cutoff, projected: ${cutRange(myPo.proj.qs)}. ` : ''}
            {mineLast?.last
              ? `In ${po.year}, ${mineLast.last.drawn} of ${mineLast.last.apps} first-choice applicants with ${p} points drew.`
              : mineLast
                ? `In ${po.year}: ${pct(mineLast.odds)} at ${p} points.`
                : ''}
            {!pts.set && <> <Link href="/account#hunting-preferences">Set your points in Account</Link> for your own odds.</>}
          </div>
          {drawYear !== null && wait! > 0 && (
            <p className="small" style={{ marginBottom: 0 }}>
              {drawYear < RULE_CHANGE_YEAR
                ? `At the cutoff's 5-year pace you'd likely draw in ${drawYear}.`
                : `At the cutoff's 5-year pace, about ${wait} more year${wait === 1 ? '' : 's'} of points (${drawYear}). But the ${RULE_CHANGE_YEAR} draw splits licenses between preference and bonus points, so that count stops meaning much after ${RULE_CHANGE_YEAR - 1}.`}
            </p>
          )}
          {wait === null && myPo?.proj && (
            <p className="small" style={{ marginBottom: 0 }}>
              The cutoff has been rising at least a point a year: points alone won&apos;t catch it under today&apos;s rules.
            </p>
          )}
        </div>
        <div className="card co-need">
          <div className="k">Points needed, {po.year} draw</div>
          <div className="co-need-row">
            <span className="res">Resident</span>
            <b>{fmtNeed(s.ptsRes, s.ptsResPct)}</b>
            <span className="small muted">creep {fmtCreep(s.creepRes)}</span>
          </div>
          <div className="co-need-row">
            <span className="nr">Nonresident</span>
            <b>{fmtNeed(s.ptsNr, s.ptsNrPct)}</b>
            <span className="small muted">creep {fmtCreep(s.creepNr)}</span>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {s.secondChoice
              ? `Licenses reached 2nd-choice applicants in ${po.year}: you can draw this as a 2nd choice and keep building points on your 1st.`
              : 'Drew out on first choices: it takes your 1st choice (and your points).'}
          </p>
        </div>
      </div>

      <h2>Season And Units</h2>
      <div className="co-facts">
        <div>
          <span className="k">Dates{po.dates ? ` (${po.dates.year})` : ''}</span>
          {po.dates ? fmtDates(po.dates.start, po.dates.end) : 'See the CPW brochure'}
          {po.dates && po.dates.year !== po.projYear ? (
            <span className="small muted"> · {po.projYear} dates aren&apos;t in the regulations yet</span>
          ) : null}
        </div>
        <div>
          <span className="k">Units</span>
          <span>{(po.regs?.units ?? [d.unit]).map((u, i) => (
            <span key={u}>
              {i ? ', ' : ''}
              <HuntLink href={`/units/${encodeURIComponent(unitKey('CO', u))}`}>{u}</HuntLink>
            </span>
          ))}</span>
          {po.regs?.guessed ? <span className="small muted"> (from the hunt code; not found in the regulations)</span> : null}
        </div>
        {po.regs?.partial && (
          <div>
            <span className="k">Where exactly</span>
            {po.regs.unitText}
          </div>
        )}
        {s.privateOnly && (
          <div>
            <span className="k">Access</span>Private land only: you need permission from a landowner in the unit before you hunt.
          </div>
        )}
      </div>

      <h2 id="trends">Hunt Trends</h2>
      <div className="co-oddsbar"><span className="seg light" role="group" aria-label="Graph draw">
        <HuntLink className="seg-link" href={q({odds:null}).replace('#odds','#trends')} aria-pressed={mode==='proj'} scroll={false}>{po.projYear} projected</HuntLink>
        <HuntLink className="seg-link" href={q({odds:'last'}).replace('#odds','#trends')} aria-pressed={mode==='last'} scroll={false}>{po.year} actual</HuntLink>
      </span><span className="seg light" role="group" aria-label="Graph applicant pool">{CO_POOLS.filter(x=>po.pools[x]).map(x=><HuntLink key={x} className="seg-link" href={q({pool:x===myPool?null:x}).replace('#odds','#trends')} aria-pressed={pool===x} scroll={false}>{SHORT[x]}</HuntLink>)}</span></div>
      <p className="small muted">Draw odds use the selected applicant pool and draw. Harvest report coverage may change by year; the table explains each source.</p>
      <div className="grid2 co-graph-grid">
        <CreepChart po={po} />
        <OddsPointsChart P={P} po={po} pool={pool} mode={mode} myPoints={pool === myPool ? p : null}/>
        {po.harvest?.length ? <HarvestCharts rows={po.harvest} /> : null}
      </div>
      <h2>Hunter Success</h2>
      {po.history.some((h) => h.sharedPool) && <p className="small muted">Some historical draws shared an applicant pool across hunt codes. Marked rows show the shared pool’s applications and cutoffs; its quota is not this code’s individual quota.</p>}
      {po.sharedPool && <p>Current draw pool shared with {po.sharedPool.codes.join(', ')}. Applicant counts and odds describe this shared pool.</p>}
      {po.harvest?.length ? (
        <Harvest rows={po.harvest} species={spLabel} />
      ) : (
        <p className="muted">No harvest estimates for this hunt code yet.</p>
      )}

      <h2>Draw History</h2>
      <div className="htable-wrap">
        <table>
          <thead>
            <tr>
              <th>Draw</th>
              <th className="num">Licenses</th>
              <th className="num">1st choice apps</th>
              <th>Res needed</th>
              <th>Nonres needed</th>
              <th>NR cap</th>
            </tr>
          </thead>
          <tbody>
            {po.history
              .slice()
              .reverse()
              .map((h) => {
                const at = (pl: CoPool) => po.pools[pl]?.history.find((x) => x.year === h.year);
                const cell = (pl: CoPool) => {
                  const x = at(pl);
                  return x?.eff === null || x?.eff === undefined ? (x?.text ?? '–') : effText(x.eff, x.text);
                };
                return (
                  <tr key={h.year}>
                    <td>{h.year}{h.sharedPool ? ' · shared pool' : ''}</td>
                    <td className="num">{h.sharedPool ? `${h.sharedPool.codeDrawn ?? '–'} issued; pool quota ${h.sharedPool.poolQuota ?? '–'}` : h.quota ?? '–'}</td>
                    <td className="num">{h.apps1 ?? '–'}</td>
                    <td>{cell('res')}</td>
                    <td>{cell('nr')}</td>
                    <td>{h.nrCapPct !== null ? `${h.nrCapPct}%` : '–'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <h2 id="odds">Odds At Every Point Level</h2>
      <div className="co-oddsbar">
        <span className="seg light" role="group" aria-label="Which draw">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mode === 'proj'} scroll={false}>
            {po.projYear} projected
          </HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={mode === 'last'} scroll={false}>
            {po.year} actual
          </HuntLink>
        </span>
        <span className="seg light" role="group" aria-label="Applicant pool">
          {CO_POOLS.filter((x) => po.pools[x]).map((x) => (
            <HuntLink key={x} className="seg-link" href={q({ pool: x === myPool ? null : x })} aria-pressed={pool === x} scroll={false}>
              {SHORT[x]}
            </HuntLink>
          ))}
        </span>
      </div>
      {P ? (
        <Ladder P={P} po={po} mode={mode} pool={pool} me={pool === myPool ? p : null} />
      ) : (
        <p className="muted">Nobody in this pool applied in {po.year}.</p>
      )}
      <p className="small muted">
        {mode === 'proj'
          ? `${po.projYear} planning scenario: unsuccessful first-choice applicants return to this hunt with one additional point; successful applicants leave. Supply stays at the latest observed pool allocation. The projected cutoff cannot fall below the latest draw or returning-cohort cutoff. Entrants, applicants switching hunts and future quotas can change the result; this is not a calibrated forecast.`
          : `What happened in the ${po.year} primary draw: first-choice applicants and how many drew, by preference points. A few applicants above the cutoff sometimes don't draw; CPW doesn't say why.`}
        {P?.hybrid ? ` Hybrid draw: ${pct(P.hybrid)} of 5+ point applicants below the cutoff drew at random.` : ''}
      </p>
      <p className="small muted">
        Sources: Colorado Parks and Wildlife Draw Recap reports, harvest estimates and Chapter W-2 big game regulations. Not affiliated with
        CPW; confirm hunt codes, dates and rules in the current big game brochure.
      </p>
      <h2>{species === 'ELK' ? 'Elk' : species === 'DEER' ? 'Deer' : 'Pronghorn'} Population</h2>
      <CoHerds species={species} herds={po.herds ?? []} highlight={po.regs?.units ?? [d.unit]} />

      <CoPressureEvidence r={s} />
      <CoAlternatives hunt={s} pool={myPool} points={p} mode={mode} />
      <OverlappingElk hunt={s} />
      <CoUnitSeasonHunters units={s.units} hunt={s} />
      <CoLand units={s.units} />
    </main>
  );
}

/** "most likely 6-7 points (1 in 10: 4 or fewer; 1 in 10: 9 or more)" from the projection's deciles. */
function cutRange(qs: number[]): string {
  const at = (e: number) => cutFromEff(e).pts;
  const n = qs.length;
  const mid = [at(qs[Math.floor(n * 0.3)]), at(qs[Math.ceil(n * 0.7) - 1])];
  const lo = at(qs[0]),
    hi = at(qs[n - 1]);
  const m = mid[0] === mid[1] ? `${mid[0]} point${mid[0] === 1 ? '' : 's'}` : `${mid[0]}–${mid[1]} points`;
  const tails = [
    lo < mid[0] ? `1 in 10 chance it's ${lo === 0 ? '0 (every 1st choice draws)' : `${lo} or fewer`}` : '',
    hi > mid[1] ? `1 in 10 it's ${hi} or more` : '',
  ].filter(Boolean);
  return `most likely ${m}${tails.length ? ` (${tails.join(', ')})` : ''}`;
}

function fmtDates(a: string, b: string): string {
  if (!Number.isFinite(Date.parse(a)) || !Number.isFinite(Date.parse(b)) || Date.parse(b) < Date.parse(a)) return 'Dates need CPW verification';
  const f = (iso: string, y = false) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(y ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return `${f(a)} – ${f(b, true)}`;
}

function Harvest({ rows, species }: { rows: HarvestYear[]; species: string }) {
  const last5 = rows.slice(-5);
  const h = last5.reduce((a, r) => a + r.harvest, 0),
    n = last5.reduce((a, r) => a + r.hunters, 0);
  const basis = (b: HarvestYear['basis']) =>
    b === 'code' ? 'This hunt code' : b === 'units' ? 'Its units, this season (limited licenses)' : 'Its units, every license this season';
  return (
    <>
      <p style={{ marginTop: 0 }}>
        <b>{n ? `${Math.round((h / n) * 100)}%` : '–'}</b> over the last {last5.length} season{last5.length === 1 ? '' : 's'} (
        {h.toLocaleString('en-US')} {species} taken by {n.toLocaleString('en-US')} hunters).
      </p>
      <div className="htable-wrap">
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th className="num">Hunters</th>
              <th className="num">Harvest</th>
              <th className="num">Success</th>
              <th className="num">Days / animal</th>
              <th>Counted from</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td className="num">{r.hunters.toLocaleString('en-US')}</td>
                  <td className="num">{r.harvest.toLocaleString('en-US')}</td>
                  <td className="num">
                    {r.hunters ? `${Math.round((r.harvest / r.hunters) * 100)}%` : '–'}
                    {r.few ? '*' : ''}
                  </td>
                  <td className="num">{r.days && r.harvest ? (r.days / r.harvest).toFixed(1) : '–'}</td>
                  <td className="small muted">{basis(r.basis)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        CPW harvest survey estimates. Before 2025 CPW reported by unit and season, not hunt code, so earlier seasons add up the code&apos;s
        units{rows.some((r) => r.few) ? '; * few hunters responded' : ''}.
      </p>
    </>
  );
}

function effText(eff: number, text: string | null): string {
  if (eff === 0) return text && /choice|leftover/i.test(text) ? `0: all drew (${text})` : '0: all drew';
  const { pts, pct: share } = cutFromEff(eff);
  return `${pts} pt${pts === 1 ? '' : 's'}${share < 0.995 ? ` (${Math.round(share * 100)}%)` : ''}`;
}

function Ladder({ P, po, mode, pool, me }: { P: PoolOdds; po: PointOdds; mode: 'proj' | 'last'; pool: CoPool; me: number | null }) {
  const maxLevel = Math.max(0, ...P.levels.map((l) => l[0]), me ?? 0);
  const rows = [];
  for (let k = maxLevel; k >= 0; k--) {
    const lv = P.levels.find((l) => l[0] === k);
    const o = myOdds(P, k, mode, po.year, pool);
    if (!lv && k !== me && mode === 'last') continue;
    rows.push({ k, apps: lv?.[1] ?? 0, drew: lv?.[2] ?? 0, o });
  }
  return (
    <div className="htable-wrap">
      <table className="co-ladder">
        <thead>
          <tr>
            <th className="num">Points</th>
            <th className="num">Applied ({po.year})</th>
            <th className="num">Drew</th>
            <th>{mode === 'proj' ? `${po.projYear} odds` : `${po.year} odds`}</th>
            <th>Chance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ k, apps, drew, o }) => {
            const ch = o ? o.chance : 'none';
            const v = o?.odds ?? 0;
            return (
              <tr key={k} className={k === me ? 'me' : undefined}>
                <td className="num">
                  {k}
                  {k === me ? <span className="small muted"> · you</span> : ''}
                </td>
                <td className="num">{apps || '–'}</td>
                <td className="num">{apps ? drew : '–'}</td>
                <td>
                  <span className="co-bar">
                    <i>
                      <s style={{ width: `${Math.round(v * 100)}%` }} />
                    </i>
                    <em>{pct(o?.odds)}</em>
                  </span>
                </td>
                <td>
                  <span className={`pill ch-${ch}`}>{CHANCE_LABEL[ch]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
