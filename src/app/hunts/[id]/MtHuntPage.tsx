import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { HuntLink } from '@/components/HuntNavigation';
import { BackLink } from '@/components/BackLink';
import { ScoreRow } from '@/components/HuntCards';
import { Star } from '@/components/Star';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { int, pct as pct0 } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { mtPersonal, mtUnitLabel, MT_LICENSE_TYPE, MT_POOL_LABEL, type MtOddsTable, type MtPointOdds, type MtPool } from '@/lib/mtHunt';
import { MT_BONUS_TYPES } from '@/lib/mtPoints';
import { MtBmaBlock } from '@/components/MtBma';
import { mtCombo } from '@/lib/mtPoints';
import { mtHarvestSeries, mtDrawSeries } from '@/lib/mtSeries';
import { LandBar } from '@/components/LandBar';
import { OddsChart, ApplicantsChart, SuccessChart, HarvestChart, QualityChart } from '@/components/Charts';
import { mtProjected, type MtProjection } from '@/lib/mtProj';
import { MtOddsPointsChart, MtDeerQualityChart, MtComboPointsChart } from '@/components/MtCharts';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
const SEASON_LABEL: Record<string, string> = { early: 'Early', archery: 'Archery only', general: 'General', heritage: 'Heritage muzzleloader', late: 'Late' };

/** A Montana hunt: a general licence in one district, or a drawn permit / B licence (bonus points). */
export async function MtHuntPage({ s, sp }: { s: HuntSummary; sp: { pool?: string; odds?: string } }) {
  const po = s.pointOdds as unknown as MtPointOdds | null;
  const table = s.oddsByPts as unknown as MtOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : s.species === 'PRONGHORN' ? 'antelope' : 'deer';
  const antelope = s.species === 'PRONGHORN';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readMtPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const mine = mtPersonal(s, pts, nr, mode);
  const proj = mtProjected(s.pointOdds as unknown as MtPointOdds | null);
  const projected = mode === 'proj' && !!proj;
  const shown = mine.parts ? mine.parts.permit : mine.odds; // permit draw alone, as if the combination is drawn
  const chance = chanceOf(shown, 0, shown ?? 0);
  if (!po) return <main className="wrap" style={{ margin: '24px auto' }}><p className="small"><BackLink state="MT" /></p><h1>{s.name}</h1><p className="muted">No data for this hunt yet.</p></main>;
  const general = po.kind === 'general';
  const otc = po.kind === 'otc';
  const myPool: MtPool = nr ? 'nr' : 'res';
  const pool: MtPool = sp.pool === 'res' || sp.pool === 'nr' ? sp.pool : myPool;
  const type = MT_LICENSE_TYPE[po.license];
  const typeLabel = MT_BONUS_TYPES.find((t) => t.key === type)?.label.toLowerCase() ?? po.license.toLowerCase();
  const first = s.units[0];
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ pool: sp.pool ?? '', odds: sp.odds ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  // land across the hunt's districts, acre-weighted, for Idaho's "Who manages the land" bar
  const unitRows = await db.unit.findMany({ where: { state: 'MT', name: { in: s.units } }, select: { acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvestSeries = mtHarvestSeries(po, s.species, s.units);
  const drawSeries = mtDrawSeries(po);
  const combo = mtCombo(pts.comboType);
  const byHd = new Map<string, typeof po.regs.rows>();
  for (const r of po.regs.rows) byHd.set(r.hd, [...(byHd.get(r.hd) ?? []), r]);

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="MT" />
        {first ? <> · <Link href={`/hunts?states=MT&unit=MT:${first}&species=${s.species}`}>Montana {spLabel} hunts in {mtUnitLabel(first)}</Link></> : null}
      </p>
      <h1 className="star-head">
        Montana {s.name.toLowerCase().startsWith(spLabel) ? '' : `${spLabel[0].toUpperCase() + spLabel.slice(1)} `}{s.name} <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label />
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {s.takeMethod}
        {otc ? ` · ${s.tags !== null ? `${int(s.tags)} licenses (${po.year} quota)` : 'Unlimited'} · over the counter` : !general ? ` · ${s.tags !== null ? `${int(s.tags)} ${/Permit$/.test(po.license) ? 'permits' : 'licenses'} (${po.year} quota)` : 'Unlimited'}` : ''}
        {s.privateOnly ? ' · Valid on private land only: you need landowner permission' : ''}
        {' · '}{s.units.length > 8 ? <>{po.regs.validIn ?? `${s.units.length} districts`}</> : s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('MT', u))}`}>{mtUnitLabel(u)}</HuntLink></span>)}
      </p>

      {general && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>General license.</b> Residents buy a general {spLabel} license over the counter. Nonresidents must first draw a{' '}
          <Link href="/montana">{po.combo?.name ?? 'combination license'}</Link>: the nonresident odds below are that statewide draw&apos;s, at your
          preference points. In Montana, holding 1 or 2 points below the cutoff has drawn <b>nothing</b>, while 0 points drew from the random quarter.
        </div>
      )}
      {antelope && nr && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>No combination license needed.</b> Unlike deer and elk, a nonresident applies for a Montana antelope license on its own: the odds here are the whole story.
        </div>
      )}
      {!general && nr && po.needsGeneral && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>A permit is added to a general license.</b> As a nonresident you also need a {s.species === 'ELK' ? 'Big Game or Elk' : 'Big Game or Deer'} Combination license, drawn at the same time (<Link href="/montana">odds</Link>).
          {mine.parts ? <> The odds shown are the permit draw&apos;s, if you draw the combination; your chance of holding both is the permit at <b>{pct(mine.parts.permit)}</b> × the {mine.parts.comboName} at <b>{pct(mine.parts.combo)}</b> = <b>{pct(mine.odds)}</b>, and draw and fill and Opportunity use that. So a permit everyone draws is only as sure as your combination draw. FWP doesn&apos;t say how a permit drawn without a combination is handled, so this treats the two as independent. <Link href="/account#hunting-preferences">Change which combination you apply for</Link>.</> : null}
        </div>
      )}
      {s.species === 'DEER' && po.deer && po.deer.length === 1 && (
        <p className="small"><b>{po.deer[0] === 'MULE' ? 'Mule deer' : 'Whitetail'} only.</b> {po.mulePermit
          ? 'Only a permit lets you take a mule deer buck in this district, so success here is FWP\'s estimate of mule bucks taken over the permits issued.'
          : general ? `Success is FWP's ${po.deer[0] === 'MULE' ? 'mule deer' : 'white-tailed deer'} harvest per deer hunter in the district (FWP doesn't count hunters by deer species).`
          : 'Success is the district\'s, for all deer hunters: FWP doesn\'t count hunters by license or by deer species, so a rate for this license alone can\'t be read from its estimates.'}</p>
      )}
      {po.mulePermitNote && <p className="small muted">Mule bucks per permit: {po.mulePermitNote}. Success below is the district&apos;s, for all deer hunters.</p>}
      {otc && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>Over the counter, no draw.</b> FWP sells this B license from {po.onSale ?? 'June 15'}{po.quota === 'UNL' ? ', with no limit on numbers' : ''}, to residents and nonresidents alike; no combination license and no points are needed.
          {po.fee ? <> {po.fee.year} fee: <b>${po.fee.res}</b> resident, <b>${po.fee.nr}</b> nonresident (FWP {po.fee.year} {po.fee.pages}), plus the conservation and base hunting licenses every hunter buys.</> : null}
          {' '}You may hold up to three deer licenses a year (a general license and two B licenses, or three B licenses).
        </div>
      )}
      {!general && !otc && (
        <div className="card" style={{ margin: '12px 0' }}>
          <b>How your points map to FWP&apos;s table.</b> FWP prints the points <i>used</i> in the draw: the ones you have banked plus the one you buy with the application.
          So with {mine.points ?? 0} {typeLabel} bonus point{mine.points === 1 ? '' : 's'} on your account, buying one this year puts you on FWP&apos;s <b>{(mine.points ?? 0) + 1}-point row</b>.
          Apply without buying and your banked points are <b>not used</b>: you get one chance, the &ldquo;no point bought&rdquo; row. FWP does not define the column; this reading is ours, from the reports&apos; own structure (from 2023 no buyer is listed at 0, and the no-purchase group draws at about half the 1-point rate, as one chance against two would).
        </div>
      )}
      <p className="small muted">Harvest, success and crowding: {po.harvestBasis}. They describe the district, not this license.</p>
      <p className="small"><b>Land:</b> {s.publicPct === null ? 'not computed' : `${Math.round(s.publicPct)}% public`}{s.units.length > 1 ? ` across its ${s.units.length} districts` : ''}
        {s.privateOnly ? <b> · this license is valid on private land only: you need landowner permission, and the score counts it as 0% public</b> : null}
        <span className="muted"> · public ownership is not permission to cross private land, and state trust land has its own access rules</span></p>
      {land && <div className="card" style={{ margin: '12px 0' }}>
        <h3 style={{ marginTop: 0 }}>Who manages the land{s.units.length > 1 ? ` · ${s.units.length} districts` : ''}</h3>
        <LandBar shares={land} />
      </div>}
      <MtBmaBlock units={s.units} species={s.species} publicPct={s.privateOnly ? 0 : s.publicPct} />
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      <div className="co-top">
        <div className="card co-mine">
          <div className="k">{otc ? 'Your license' : general && !nr ? 'Your license' : `Your ${general ? `${po.combo?.year ?? po.year}` : projected ? 'next-draw' : po.year} odds · ${MT_POOL_LABEL[myPool]}`}</div>
          <div className="co-big">{pct(shown)} <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span></div>
          {mine.parts && <div className="small">If you draw the combination. Your {mine.parts.comboName} draw: <b>{pct(mine.parts.combo)}</b>; both: <b>{pct(mine.odds)}</b>{s.success5 !== null && mine.odds !== null ? <> · draw and fill <b>{pct(mine.odds * s.success5)}</b></> : null}.</div>}
          <div className="small muted">
            {mine.basis}.{otc ? '' : general ? ' The combination draw is shown as it last drew: no forecast of it beat the last draw when tested on past draws.' : projected ? <> Projected: FWP&apos;s own weighted draw (points² + 1 chances) re-run on the {po.year} applicants and licenses. Tested on 2024–2026, it predicted each draw better than the year before&apos;s printed odds. <HuntLink href={q({ odds: 'last' })} scroll={false}>See the {po.year} draw</HuntLink>.</> : <> The {po.year} draw as printed. <HuntLink href={q({ odds: null })} scroll={false}>See the projection</HuntLink>.</>}
            {!pts.set && <> <Link href="/account#hunting-preferences">Set your Montana points in Account</Link> for your own odds.</>}
          </div>
        </div>
        {!general && po.pools && (
          <div className="card co-need">
            <div className="k">{po.year} quota and first-choice applicants</div>
            {(['res', 'nr'] as MtPool[]).map((p) => <div key={p} className="co-need-row"><span>{MT_POOL_LABEL[p]}</span><b>{pct(po.pools![p].apps[0] ? po.pools![p].succ[0] / po.pools![p].apps[0] : null)}</b><span className="small muted">{int(po.pools![p].succ[0])} of {int(po.pools![p].apps[0])} drew · up to {po.pools![p].quota === 'UNL' ? 'unlimited' : int(po.pools![p].quota)}</span></div>)}
            {po.landowner && (po.landowner.loRes.apps + po.landowner.loNr.apps) > 0 && <p className="small muted">Landowner pools, drawn separately and not in these odds: {int(po.landowner.loRes.succ + po.landowner.loNr.succ)} of {int(po.landowner.loRes.apps + po.landowner.loNr.apps)} drew.</p>}
            {po.regsQuota !== undefined && po.quota !== po.regsQuota && <p className="small muted">The regulations printed {String(po.regsQuota)}{po.regsQuotaRange ? ` (range ${po.regsQuotaRange.join('–')})` : ''}; FWP set {String(po.quota)} for the draw.</p>}
          </div>
        )}
      </div>

      {general && nr && (combo.species as readonly string[]).includes(s.species) && <>
        <h2>Your Combination Draw</h2>
        <MtComboPointsChart licenseKey={combo.draw} title={`${po.combo?.names?.[combo.draw] ?? combo.label}: odds at each preference point level`} myPoints={pts.combo} />
      </>}

      <h2>Seasons ({po.regs.year} Regulations)</h2>
      {[...byHd.entries()].slice(0, 12).map(([hd, rows]) => (
        <div key={hd} className="htable-wrap">
          {byHd.size > 1 && <h3 className="small" style={{ margin: '12px 0 4px' }}>HD {hd}</h3>}
          <table><thead><tr><th>Opportunity</th>{Object.keys(SEASON_LABEL).filter((k) => rows.some((r) => r.seasons[k])).map((k) => <th key={k}>{SEASON_LABEL[k]}</th>)}<th>Restrictions</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{r.opportunity ?? '–'}{r.section ? <span className="small muted"> · {r.section}</span> : null}</td>{Object.keys(SEASON_LABEL).filter((k) => rows.some((x) => x.seasons[k])).map((k) => <td key={k}>{r.seasons[k] ?? '–'}</td>)}<td className="small">{r.details ?? '–'}{r.landLimit === 'private' ? <b> · Private land</b> : null}</td></tr>)}</tbody></table>
        </div>
      ))}
      {byHd.size > 12 && <p className="small muted">{byHd.size - 12} more districts carry this license with the same structure; see FWP&apos;s regulations for each.</p>}
      {po.regs.notes?.length ? <p className="small muted">FWP notes: {po.regs.notes.join(' · ')}</p> : null}
      {po.regs.conflicts?.length ? <p className="small"><b>FWP&apos;s regulations disagree with themselves for this license:</b> {po.regs.conflicts.map((c) => `${c.field} ${Object.entries(c.values).map(([v, h]) => `${v} in HD ${h.join(', ')}`).join(' vs ')}`).join('; ')}. Each district shows what its own table prints. Confirm with FWP.</p> : null}

      {!general && po.pools && <>
        <h2 id="odds">Odds At Every Bonus Point Level</h2>
        <div className="co-oddsbar">{proj && <span className="seg light" role="group" aria-label="Which draw">
          <HuntLink className="seg-link" href={q({ odds: null })} aria-pressed={mode === 'proj'} scroll={false}>Next draw (projected)</HuntLink>
          <HuntLink className="seg-link" href={q({ odds: 'last' })} aria-pressed={mode === 'last'} scroll={false}>{po.year} actual</HuntLink>
        </span>}<span className="seg light" role="group" aria-label="Pool">
          {(['res', 'nr'] as MtPool[]).map((p) => <HuntLink key={p} className="seg-link" href={q({ pool: p === myPool ? null : p })} aria-pressed={pool === p} scroll={false}>{MT_POOL_LABEL[p]}</HuntLink>)}
        </span></div>
        {table && (projected
          ? <MtOddsPointsChart res={(proj.res ?? []).slice(0, Math.max(table.last.res?.length ?? 0, table.last.nr?.length ?? 0, (mine.points ?? 0) + 2))} nr={(proj.nr ?? []).slice(0, Math.max(table.last.res?.length ?? 0, table.last.nr?.length ?? 0, (mine.points ?? 0) + 2))} noBuy={proj.noBuy} myPoints={mine.buying === false ? null : mine.points} mine={myPool} year={po.year} projected />
          : <MtOddsPointsChart res={table.last.res ?? []} nr={table.last.nr ?? []} noBuy={{ res: table.noBuy?.res ?? null, nr: table.noBuy?.nr ?? null }} myPoints={mine.buying === false ? null : mine.points} mine={myPool} year={po.year} />)}
        <Ladder po={po} table={table} proj={proj} pool={pool} me={pool === myPool ? mine : null} />
        <p className="small muted">{po.year} draw, first-choice applicants. The {po.year} column is FWP&apos;s printed rate, which never falls as points rise: a rate that dips at a higher level (a handful of applicants) takes the level below&apos;s. The projected column re-runs FWP&apos;s weighted draw on the same applicants and licenses, which smooths out levels where a few applicants were lucky or not, and covers levels nobody held. Landowner pools are separate and not shown.</p>
      </>}

      {po.history && po.history.length > 0 && <>
        <h2>Draw History</h2>
        <div className="grid2"><OddsChart data={drawSeries} nr={nr} /><ApplicantsChart data={drawSeries} /></div>
        <div className="htable-wrap"><table><thead><tr><th>Draw</th><th className="num">Quota</th><th className="num">Resident drew</th><th className="num">Nonresident drew</th></tr></thead>
          <tbody>{po.history.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{h.quota === 'UNL' ? 'Unlimited' : int(h.quota)}</td><td className="num">{int(h.res[1])} of {int(h.res[0])} ({pct(h.res[0] ? h.res[1] / h.res[0] : null)})</td><td className="num">{int(h.nr[1])} of {int(h.nr[0])} ({pct(h.nr[0] ? h.nr[1] / h.nr[0] : null)})</td></tr>)}</tbody></table>
          <p className="small muted">First-choice applicants. Odds by point level use only 2023 onward: FWP labelled the points column differently in 2021–2022 in a way no reading of the rules explains.</p></div>
      </>}

      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 && <div className="grid2">
        <SuccessChart data={harvestSeries} />
        <HarvestChart data={harvestSeries} />
        {s.species === 'DEER' ? <MtDeerQualityChart data={harvestSeries} /> : s.species === 'ELK' ? <QualityChart data={harvestSeries} species="ELK" /> : null}
      </div>}
      {po.harvest.length ? (
        <div className="htable-wrap"><table><thead><tr><th>Season</th><th className="num">{po.mulePermit ? 'Permits' : 'Hunters'}</th><th className="num">{po.mulePermit ? 'Mule bucks' : 'Harvest'}</th><th className="num">Success</th><th className="num">{s.species === 'ELK' ? '6+ pt bulls' : antelope ? 'Bucks' : '4+ pt bucks'}</th></tr></thead>
          <tbody>{po.harvest.slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td><td className="num">{antelope ? (h.harvest ? `${Math.round((100 * h.antlered) / h.harvest)}% of harvest` : '–') : h.antlered ? `${Math.round((100 * h.big) / h.antlered)}% of ${int(h.antlered)}` : '–'}</td></tr>)}</tbody></table>
          <p className="small muted">FWP surveys {spLabel} hunters every other year ({s.species === 'DEER' ? 'odd' : 'even'} years); in other years district hunter counts are not estimated, so those seasons are left out rather than guessed.{antelope ? ' FWP redrew many antelope districts in 2022 and again for 2026, so a season counts only where its district had the same boundary as today.' : ''} {po.harvestBasis}.</p></div>
      ) : <p className="muted">{antelope ? 'No FWP harvest estimate for a season when this license\'s districts had today\'s boundaries. FWP redrew several for 2026, so earlier estimates describe different ground and are left out.' : 'No FWP harvest estimate for this district.'}</p>}

      <p className="small muted">Source: {otc ? '' : `FWP ${po.year} ${spLabel} drawing statistics (detailed and summary reports), `}the {po.regs.year} Deer, Elk &amp; Antelope regulations and FWP harvest estimates. Land ownership: BLM Surface Management Agency. Confirm dates and rules with FWP before you apply.</p>
    </main>
  );
}

function Ladder({ po, table, proj, pool, me }: { po: MtPointOdds; table: MtOddsTable | null; proj: MtProjection | null; pool: MtPool; me: { points: number | null; buying: boolean | null } | null }) {
  const lv = po.pools![pool].levels;
  const buyers = lv.filter((l) => l[0] !== '' && l[0] !== '0');
  const noBuy = lv.filter((l) => l[0] === '' || l[0] === '0');
  const arr = table?.last[pool] ?? [];
  const top = Math.max(arr.length - 1, me?.points ?? 0);
  const printed = (L: number) => buyers.find((l) => Number(l[0]) === L);
  return (
    <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Your bonus points</th><th>FWP row (points used)</th><th className="num">Applicants</th><th className="num">Drew (printed)</th><th className="num">{po.year} odds</th>{proj?.[pool] && <th className="num">Next draw (projected)</th>}</tr></thead>
      <tbody>
        {Array.from({ length: top + 1 }, (_, k) => top - k).map((n) => {
          const p = printed(n + 1);
          const isMe = me?.buying !== false && me?.points === n;
          return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}>
            <td>{isMe ? <b>{n} + buying · you</b> : `${n} + buying`}</td><td>{n + 1}</td>
            <td className="num">{p ? int(p[1]) : '0'}</td><td className="num">{p ? `${int(p[2])} (${pct(p[1] ? p[2] / p[1] : null)})` : '–'}</td>
            <td className="num">{pct(arr[Math.min(n, arr.length - 1)] ?? null)}</td>{proj?.[pool] && <td className="num">{pct(proj[pool]![Math.min(n, proj[pool]!.length - 1)])}</td>}</tr>;
        })}
        <tr className={me?.buying === false ? 'me' : undefined}>
          <td>{me?.buying === false ? <b>Not buying a point · you</b> : 'Not buying a point'}</td><td>{noBuy.length ? (noBuy[0][0] === '' ? 'blank' : '0') : '–'}</td>
          <td className="num">{noBuy.length ? int(noBuy.reduce((a, l) => a + l[1], 0)) : '0'}</td><td className="num">{noBuy.length ? int(noBuy.reduce((a, l) => a + l[2], 0)) : '–'}</td>
          <td className="num">{pct(table?.noBuy?.[pool] ?? null)}</td>{proj?.[pool] && <td className="num">{pct(proj.noBuy[pool])}</td>}</tr>
      </tbody></table></div>
  );
}
