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
import { readNmSettings, NM_POOL_LABEL, type NmPool } from '@/lib/nmSettings';
import { int, pct as pct0, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { nmPersonal, nmPo, nmLicense, nmLicenseFee, nmUnitLabel, NM_BAG, NM_FEES, NM_DRAW_2026, NM_WEAPON_LABEL, type NmOddsTable } from '@/lib/nmHunt';
import { LandBar } from '@/components/LandBar';
import { SuccessChart, HarvestChart, OddsChart, ApplicantsChart, ChoiceChart } from '@/components/Charts';
import type { YearPoint } from '@/lib/history';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const POOLS: NmPool[] = ['res', 'nr', 'out'];

/** A New Mexico deer or elk hunt: a public draw (NMDOW's random-number lottery, no points), a landowner-authorized
 *  private-land draw, or an over-the-counter private-land deer hunt. Laid out like Idaho's hunt page. */
export async function NmHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string } }) {
  const po = nmPo(s);
  const table = s.oddsByPts as unknown as NmOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : 'deer';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const set = readNmSettings(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = set.res === 'NONRESIDENT';
  const lic = nmLicense(s);
  const otc = lic === 'otc';
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const mine = nmPersonal(s, set, mode);
  const lastYear = po?.year ?? 2026;
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds === 'last' ? 'last' : '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = await db.unit.findMany({ where: { state: 'NM', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvest = (po?.harvest ?? []).filter((h) => h.hunters);
  const harvestSeries: YearPoint[] = harvest.map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, antlered: h.male, antlerless: h.female,
    success: h.hunters && h.harvest !== null && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  // the second line of the odds chart is the hunter's own nonresident pool (outfitter or not)
  const other: NmPool = set.outfitter ? 'out' : 'nr';
  const drawSeries: YearPoint[] = Object.entries(po?.history ?? {}).map(([y, h]) => ({
    year: Number(y), permits: h.licenses, resApps: h.res[0], nrApps: h.nr[0] + h.out[0],
    resOdds: h.res[0] ? Math.min(1, h.res[1] / h.res[0]) : null, nrOdds: h[other][0] ? Math.min(1, h[other][1] / h[other][0]) : null,
  })).sort((a, b) => a.year - b.year);
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const fee = nmLicenseFee(s, nr);
  const notes: string[] = [];
  if (s.privateOnly) notes.push(otc ? 'Private land only · landowner permission' : 'Private land only · landowner authorization code');
  if (otc) notes.push('Over the counter, no draw');
  if (!mine.eligible) notes.push('Residents only');
  if (po?.residentOnly) notes.push('NM residents only');
  if (po?.wmaOnly) notes.push('WMA only');
  if (po?.publicOnly) notes.push('Public land only');
  if (po?.mobility) notes.push('Mobility-impaired hunters only');
  if (po?.military) notes.push('Military only');
  if (po?.onceInALifetime) notes.push('Once in a lifetime');
  if (po?.cwd) notes.push('CWD sampling rules');
  const choice = po?.choices2026?.[mine.pool];
  const projV = table?.proj?.[mine.pool]?.[0], lastV = table?.last?.[mine.pool]?.[0];

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="NM" />
        {s.units[0] ? <> · <Link href={`/hunts?states=NM&unit=NM:${s.units[0]}&species=${s.species}`}>New Mexico {spLabel} hunts in {nmUnitLabel(s.units[0])}</Link></> : null}
      </p>
      <h1 className="star-head">New Mexico {s.name} <TrophyMark score={s.scoreTrophy} hunt={s} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {s.youthOnly && <b>Youth only · </b>}
        {otc ? 'Over the counter (private land)' : lic === 'private' ? 'Private-land draw' : 'Draw'} · hunt {s.tagCode} · {huntWeaponLabel(s)}
        {' · '}{NM_BAG[po?.bag ?? ''] ?? po?.bag}
        {!otc && s.tags !== null ? ` · ${int(s.tags)} licenses (2026–27)` : ''}
        {po?.feeType && po.feeType !== 'Standard' ? ` · ${po.feeType} license` : ''}
        {' · '}{s.units.length > 6 ? `${s.units.length} GMUs` : s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('NM', u))}`}>{nmUnitLabel(u)}</HuntLink></span>)}
        {po?.area && !/^(?:[Ee]xcluding|[Ii]ncluding)/.test(po.area) ? ` · ${po.area}` : ''}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}

      {/* 1. Can I get it? */}
      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{otc ? 'Your license' : `Your ${mine.projected ? 'next-draw (estimated)' : lastYear} odds · ${NM_POOL_LABEL[mine.pool].toLowerCase()}`}</div>
          <div className="co-big">{otc ? 'No draw' : pct(mine.odds)} {!otc && mine.odds !== null && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {otc ? <>Buy this license over the counter. It&apos;s valid only on private land in {s.units.map(nmUnitLabel).join(', ')}, with the landowner&apos;s written permission; NMDOW doesn&apos;t limit how many it sells.</>
              : !mine.eligible ? <>NMDOW doesn&apos;t issue this license to nonresidents{s.species === 'ELK' && po?.bag === 'A' ? ' (antlerless elk are for residents only)' : po?.wmaOnly ? ' (WMA draw hunts are for residents only)' : ''}.</>
              : <>{mine.basis}. No points: first-timers have the same chance as anyone in their pool. {mine.projected ? <HuntLink href={q({ odds: 'last' })} scroll={false}>See the {lastYear} draw</HuntLink> : po?.projected ? <HuntLink href={q({ odds: null })} scroll={false}>See the next-draw estimate</HuntLink> : null}</>}
            {!set.set && !otc && <> <Link href="/account#hunting-preferences">Set your New Mexico residency and pool</Link> for your own odds.</>}
          </div>
        </div>
        {!otc && (
          <div className="card co-need">
            <div className="k">{lastYear} first choice, every pool (NMDOW)</div>
            {POOLS.map((p) => {
              const h = po?.history?.[String(lastYear)]?.[p];
              return <div key={p} className={`co-need-row${p === mine.pool ? ' me' : ''}`}><span>{NM_POOL_LABEL[p].replace(/ \(.*\)$/, '')}</span><b>{h && h[0] ? pct(Math.min(1, h[1] / h[0])) : '–'}</b><span className="small muted">{h ? `${int(h[1])} of ${int(h[0])} drew` : 'no applicants'}</span></div>;
            })}
            <div className="small muted">Pools: residents get at least 84% of licenses, the outfitter pool 10%, nonresidents without an outfitter 6%.</div>
          </div>
        )}
      </div>

      {/* 2. Do I want it? */}
      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}${s.harvestLastYear ? `, to ${s.harvestLastYear}` : ''}${s.hunters5 !== null ? ` · ${int(s.hunters5)} hunter-seasons` : ''}${s.smallSample ? ' · Small sample' : ''}` : 'no NMDOW harvest report for this code'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? (po?.wmaOnly || po?.area ? 'hunt is limited to part of the GMU' : 'no estimate') : 'this hunt, whole GMU'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.privateOnly ? '0%' : s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{s.privateOnly ? 'private land only' : po?.wmaOnly ? 'WMA only' : s.units.length > 1 ? `${s.units.length} GMUs` : `of ${nmUnitLabel(s.units[0] ?? '')}`}</div></div>
        {!otc && <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pct(fill)}</div><div className="small muted">odds × success</div></div>}
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {/* 3. The charts */}
      {!otc && drawSeries.length > 0 && <>
        <h2 id="odds">Draw Odds By Year</h2>
        {po?.projected && mine.eligible && <div className="co-oddsbar"><span className="seg light" role="group" aria-label="Which drawing">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mine.projected} scroll={false}>Next draw (estimated): {pct(projV)}</HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={!mine.projected} scroll={false}>{lastYear} draw: {pct(lastV)}</HuntLink>
        </span></div>}
        <div className="grid2"><OddsChart data={drawSeries} nr={mine.pool !== 'res'} /><ApplicantsChart data={drawSeries} /></div>
        <p className="small muted">First-choice drawn ÷ first-choice applicants in each pool, from NMDOW&apos;s Complete Drawing Odds reports, {drawSeries[0]?.year}–{lastYear} (NMDOW renumbered every hunt for 2023, so earlier years are a different hunt). The dashed line is {other === 'out' ? 'the outfitter pool' : 'nonresidents without an outfitter'}; &ldquo;nonresident applicants&rdquo; counts both outfitter and non-outfitter applicants. The next-draw estimate {mine.pool === 'res' ? 'pools the last two draws' : 'leans on the last draw, pulled toward the last three by how few applied'}: tested on 2021–2026, it beat &ldquo;same as last year&rdquo; for every pool. NMDOW renumbers every hunt and resets license numbers for 2027–28; until that booklet is out, the estimate is for this hunt as it stands.</p>
        {choice && <>
          <h3>{lastYear} applications by choice · {NM_POOL_LABEL[mine.pool].replace(/ \(.*\)$/, '').toLowerCase()}</h3>
          <ChoiceChart applied={[...choice.apps, 0]} drew={choice.drew} />
          <p className="small muted">Every application is a random number, examined whole: 1st, then 2nd, then 3rd choice. A later 1st-choice applicant can find a hunt already gone to an earlier applicant&apos;s 2nd or 3rd choice, so a hunt as a backup choice rarely draws when it&apos;s popular. The 4th choice is NMDOW&apos;s later drawing for leftover licenses of the same weapon (any deer or elk, antlerless included).</p>
        </>}
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">NMDOW has no harvest report for this hunt code in 2023–2025.</p>}

      {/* 4. The details, folded */}
      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">{otc ? 'no draw' : 'random draw, no points'}</span></summary>
        {otc ? <p><b>Over the counter, private land only.</b> NMDOW sells these deer licenses without a draw. They&apos;re valid only on private land in this hunt&apos;s GMUs, and only with the landowner&apos;s written permission, so access is the real limit. A private-land license also exists for most other deer draw codes; see the booklet&apos;s private-land deer section.</p>
          : <p><b>A pure lottery.</b> New Mexico has no preference or bonus points. Every application gets a random sequence number, and NMDOW examines each application whole, in that order: your 1st choice if your pool still has a license, then your 2nd, then your 3rd. Residents get at least 84% of each hunt&apos;s licenses, applicants with a New Mexico outfitter 10%, and nonresidents without one 6%. A resident applying with nonresidents draws only if both pools have a license. {s.species === 'DEER' || s.species === 'ELK' ? 'After the main draw, leftover deer and elk licenses go to applicants who marked a 4th choice (any license of the same weapon).' : ''}</p>}
        {lic === 'private' && <p><b>Private land only.</b> This draw hunt is for private land in {s.units.map(nmUnitLabel).join(', ')}; you need an authorization code from a participating landowner to apply. It counts as 0% public land.</p>}
        {po?.wmaOnly && <p><b>WMA only.</b> The hunt is limited to the Wildlife Management Area named in the booklet; nonresidents can&apos;t apply for WMA draw hunts.</p>}
        {po?.mobility && <p><b>Mobility-impaired.</b> Only hunters with NMDOW&apos;s mobility-impaired card can apply.</p>}
        {po?.military && <p><b>Military only.</b> McGregor Range hunts are for active-duty military, and are subject to Fort Bliss access rules.</p>}
        {s.youthOnly && <p><b>Youth only.</b> Applicants must be 17 or younger on opening day, with a Hunter Education number (or, for deer, a mentor-youth number). 2026–27 booklet p. 19.</p>}
      </details>
      {!otc && (
        <details className="card fold">
          <summary><span>What it costs</span><span className="small muted">{nr ? 'nonresident' : 'resident'}</span></summary>
          <div className="htable-wrap"><table><tbody>
            <tr><th>Game-hunting license (to apply, not refunded)</th><td className="num">{usd(NM_FEES.gameHunting[nr ? 'nr' : 'res'])}</td></tr>
            <tr><th>Habitat Management &amp; Access Validation (not refunded)</th><td className="num">{usd(NM_FEES.hmav)}</td></tr>
            <tr><th>Habitat stamp (Forest Service or BLM land, not refunded)</th><td className="num">{usd(NM_FEES.habitatStamp)}</td></tr>
            <tr><th>{s.species === 'ELK' ? 'Elk' : 'Deer'} license, charged when you apply</th><td className="num">{fee === null ? 'Not issued' : usd(fee)}</td></tr>
            <tr><th>Kept if you don&apos;t draw (application fee)</th><td className="num">{usd(NM_FEES.appFee[nr ? 'nr' : 'res'])}</td></tr>
          </tbody></table></div>
          <p className="small muted">2026–27 Hunting Rules and Information pp. 15–17; NMDOW&apos;s 2027–28 Draw Hunt License Fees sheet lists the same license prices (checked {NM_FEES.checked}). NMDOW charges the full license fee with the application and refunds it, less the application fee, if you don&apos;t draw. Residents 18–64 pay the prices shown; junior and senior residents pay less. <a href={NM_FEES.source} target="_blank" rel="noreferrer">Booklet</a></p>
        </details>
      )}
      {land && (
        <details className="card fold">
          <summary><span>Who manages the land</span><span className="small muted">{s.privateOnly ? 'private land only' : s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
          <LandBar shares={land} />
          <p className="small muted">Public ownership is not permission to cross private land. State trust land counts as state land; hunting it needs only a valid license. Tribal land is closed unless the tribe permits, and White Sands and McGregor Range (Defense) are closed or permit-only. BLM Surface Management Agency, measured over NMDOW&apos;s GMUs.{po?.landNote ? ` ${po.landNote}.` : ''}</p>
        </details>
      )}
      <details className="card fold" open={otc}>
        <summary><span>Season (2026–27)</span><span className="small muted">{po?.dates ?? ''}</span></summary>
        <div className="htable-wrap"><table><tbody>
          <tr><th>Dates</th><td>{po?.dates || '–'}{po?.datesFrom ? <span className="small muted"> (same dates as {po.datesFrom}, which ran with it in 2025)</span> : null}</td></tr>
          <tr><th>Weapon</th><td>{NM_WEAPON_LABEL[s.weapon] ?? s.weapon}{po?.restrictedMuzzle ? ' (restricted muzzleloader)' : ''}</td></tr>
          <tr><th>Bag limit</th><td>{po?.bag} · {NM_BAG[po?.bag ?? ''] ?? '–'}</td></tr>
          <tr><th>Area</th><td>{po?.header || s.areaName}</td></tr>
          <tr><th>Draw (2026)</th><td>Applications closed {NM_DRAW_2026.deadline}; results {NM_DRAW_2026.results}. NMDOW posts the 2027 dates with the 2027–28 booklet.</td></tr>
        </tbody></table></div>
      </details>
      {harvest.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvest.length} season{harvest.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">Licenses</th><th className="num">Hunters</th><th className="num">{s.species === 'ELK' ? 'Bulls' : 'Bucks'}</th><th className="num">{s.species === 'ELK' ? 'Cows' : 'Does'}</th><th className="num">Success</th><th className="num">Days</th></tr></thead>
            <tbody>{harvest.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}–{String(h.year + 1).slice(2)}</td><td className="num">{int(h.licenses)}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.male)}</td><td className="num">{int(h.female)}</td><td className="num">{pct0(h.success)}</td><td className="num">{h.days ?? '–'}</td></tr>)}</tbody></table></div>
          <p className="small muted">NMDOW deer and elk harvest reports (estimated from mandatory hunter reports).{s.species === 'ELK' ? ' Elk reports print no hunter count, so hunters = estimated harvest ÷ success.' : ''}</p>
        </details>
      )}
      <p className="small muted">Source: NMDOW 2026–27 Hunting Rules and Information, Complete Drawing Odds reports 2023–2026, deer and elk harvest reports 2023–24 to 2025–26, NMDOW Game Management Units. Land: BLM Surface Management Agency. Confirm dates and rules with NMDOW before you apply.</p>
    </main>
  );
}
