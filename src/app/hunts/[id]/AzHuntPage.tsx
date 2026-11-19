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
import { readAzPoints } from '@/lib/azPoints';
import { int, pct as pct0, density } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { opportunity } from '@/lib/score';
import { azPersonal, azBonusCut, AZ_POOL_LABEL, AZ_LICENSES, type AzOddsTable, type AzPointOdds, type AzPool } from '@/lib/azHunt';
import { LandBar } from '@/components/LandBar';
import { ApplicantsChart, SuccessChart, HarvestChart } from '@/components/Charts';
import { UtOddsPointsChart } from '@/components/UtCharts';
import type { YearPoint } from '@/lib/history';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** An Arizona deer or elk hunt: AZGFD's bonus-point draw (20% bonus pass, then weighted random passes), resident and
 *  nonresident applicants as two pools under the 10% nonresident cap. Laid out like Idaho's and Nevada's hunt pages. */
export async function AzHuntPage({ s, sp }: { s: HuntSummary; sp: { pool?: string } }) {
  const po = s.pointOdds as unknown as AzPointOdds | null;
  const table = s.oddsByPts as unknown as AzOddsTable | null;
  const spLabel = s.species === 'ELK' ? 'elk' : 'deer';
  const [store, session] = await Promise.all([getPointsStore(), auth()]);
  const pts = readAzPoints(store.store as Record<string, unknown>);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const mine = azPersonal(s, pts, nr);
  const chance = chanceOf(mine.odds, 0, mine.odds ?? 0);
  const myPool: AzPool = nr ? 'nr' : 'res';
  const pool: AzPool = sp.pool === 'res' || sp.pool === 'nr' ? sp.pool : myPool;
  const year = po?.year ?? 2026;
  const cut = azBonusCut(s, nr);
  const lic = AZ_LICENSES.find((l) => l.value === po?.license)?.label;
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ pool: sp.pool ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) v === null ? u.delete(k) : u.set(k, v);
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const unitRows = await db.unit.findMany({ where: { state: 'AZ', name: { in: s.units } }, select: { name: true, acres: true, landOwnership: true } });
  const landTotal = unitRows.reduce((a, u) => a + (u.acres ?? 0), 0);
  const landMix = new Map<string, number>();
  for (const u of unitRows) for (const o of (u.landOwnership ?? []) as { manager: string; pct: number }[]) landMix.set(o.manager, (landMix.get(o.manager) ?? 0) + (o.pct * (u.acres ?? 0)) / (landTotal || 1));
  const land = landTotal ? [...landMix.entries()].map(([manager, pct]) => ({ manager, pct })) : null;
  const harvestSeries: YearPoint[] = (po?.harvest ?? []).map((h) => ({ year: h.year, hunters: h.hunters, harvest: h.harvest, success: h.hunters > 0 && h.harvest <= h.hunters ? h.harvest / h.hunters : null }));
  const drawSeries: YearPoint[] = Object.entries(po?.history ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([y, h]) => ({
    year: Number(y), resApps: h.resApps ?? h.apps ?? null, nrApps: h.nrApps ?? null, resPermits: h.permits ?? null, nrPermits: null, resOdds: null, nrOdds: null,
  }));
  const lastApps = (p: AzPool) => (po?.pools?.[p]?.levels ?? []).reduce((a, l) => a + l[1], 0);
  drawSeries.push({ year, resApps: lastApps('res'), nrApps: lastApps('nr'), resPermits: s.permitsLast, nrPermits: null, resOdds: s.resOddsLast, nrOdds: s.nrOddsLast });
  const fill = mine.odds !== null && s.success5 !== null ? mine.odds * s.success5 : null;
  const notes: string[] = [];
  if (po?.nrCap === 0) notes.push('No nonresident permits');
  if (s.youthOnly) notes.push('Youth hunters (10–17) only');
  if (po?.restricted) notes.push('CHAMP permit required');
  const huntable = s.huntablePct, closed = s.publicPct !== null && huntable !== null ? s.publicPct - huntable : 0;

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small">
        <BackLink state="AZ" />
        {s.units[0] ? <> · <Link href={`/hunts?states=AZ&unit=AZ:${s.units[0]}&species=${s.species}`}>Arizona {spLabel} hunts in unit {s.units[0]}</Link></> : null}
      </p>
      <h1 className="star-head">Arizona {s.name} <TrophyMark score={s.scoreTrophy} hunt={s} /> <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        AZGFD hunt {s.tagCode} ({year}) · {lic ?? huntWeaponLabel(s)}{s.tags !== null ? ` · ${int(s.tags)} permits` : ''}{po?.nrCap ? ` (nonresidents at most ${int(po.nrCap)})` : ''}
        {' · '}{s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<HuntLink href={`/units/${encodeURIComponent(unitKey('AZ', u))}`}>Unit {u}</HuntLink></span>)}
      </p>
      {notes.length > 0 && <p style={{ margin: '4px 0 8px' }}>{notes.map((n) => <span key={n} className="pill warn">{n}</span>)}</p>}

      <div className="co-top">
        <div className="card co-mine">
          <div className="k">Your {year} odds · {AZ_POOL_LABEL[myPool]}</div>
          <div className="co-big">{pct(mine.odds)} {mine.odds !== null && <span className={`pill ch-${chance}`}>{CHANCE_LABEL[chance]}</span>}</div>
          <div className="small muted">
            {mine.basis}. Shown as it last drew: AZGFD publishes results by bonus point after each draw ({year} is the latest), and no forecast of the next draw tested better than repeating the last one. AZGFD renumbers hunts every year; this is the {year} hunt.
            {!pts.set && <> <Link href="/account#hunting-preferences">Set your Arizona points</Link> for your own odds.</>}
          </div>
        </div>
        {po?.pools && (
          <div className="card co-need">
            <div className="k">{year} draw · {int(s.permitsLast)} permits</div>
            {(['res', 'nr'] as AzPool[]).map((p) => {
              const lv = po.pools[p]?.levels ?? [];
              const apps = lv.reduce((a, l) => a + l[1], 0);
              const c = po.cut?.[p];
              const o = p === 'res' ? s.resOddsLast : s.nrOddsLast;
              return <div key={p} className="co-need-row"><span>{AZ_POOL_LABEL[p]}</span><b>{apps ? pct(o) : '–'}</b><span className="small muted">{apps ? `${int(apps)} first choices · ` : 'no first-choice applicants · '}{c ? `bonus pass drew every first choice above ${c[0]} pts${c[1] > 0 ? `, ${pct(c[1])} at ${c[0]}` : ''}` : 'no bonus-pass permits by points'}</span></div>;
            })}
          </div>
        )}
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Hunter success</div><div className="v">{pct0(s.success5)}</div><div className="small muted">{s.harvestYears ? `${s.harvestYears} season${s.harvestYears === 1 ? '' : 's'}, this hunt` : 'no AZGFD figure for this hunt'}</div></div>
        <div className="stat"><div className="k">Hunters / mi²</div><div className="v">{density(s.huntersSqMi)}</div><div className="small muted">{s.huntersSqMi === null ? 'no AZGFD figure' : po?.portion ? 'over the whole unit; the hunt area is a part of it' : 'this hunt over its units'}</div></div>
        <div className="stat"><div className="k">Public land</div><div className="v">{s.publicPct === null ? '–' : `${Math.round(s.publicPct)}%`}</div><div className="small muted">{closed >= 1 ? `${Math.round(closed)}% is military land, closed or by permit` : s.units.length > 1 ? `${s.units.length} units` : 'of the unit'}</div></div>
        <div className="stat"><div className="k">Draw and fill</div><div className="v">{fill === null ? '–' : pct(fill)}</div><div className="small muted">odds × success</div></div>
      </div>
      <ScoreRow r={{ ...s, scoreOppRes: nr ? null : opportunity(s.scoreQuality, mine.odds), scoreOppNr: nr ? opportunity(s.scoreQuality, mine.odds) : null }} nr={nr} open />

      {table && Object.keys(table.last ?? {}).length > 0 && <>
        <h2 id="odds">Odds At Every Bonus Point Level</h2>
        <p className="small muted">Group bonus points: your {spLabel} bonus points plus the loyalty and hunter education points.</p>
        <UtOddsPointsChart res={table.last.res ?? []} nr={table.last.nr ?? []} myPoints={mine.points} mine={myPool} year={year} kind="bonus" />
      </>}
      <h2>Hunter Success</h2>
      {harvestSeries.length > 0 ? <div className="grid2"><SuccessChart data={harvestSeries} /><HarvestChart data={harvestSeries} /></div> : <p className="muted">No AZGFD harvest figures matched to this hunt (new or changed hunts have none).</p>}
      {drawSeries.length > 1 && <>
        <h2>Draw History</h2>
        <p className="small muted">The same hunt in earlier draws, followed across AZGFD&apos;s yearly renumbering (hunt numbers in the table below).</p>
        <div className="grid2"><ApplicantsChart data={drawSeries} /></div>
      </>}

      <h2>Details</h2>
      <details className="card fold">
        <summary><span>How these odds work</span><span className="small muted">bonus pass, then points + 1 numbers</span></summary>
        <p><b>The bonus pass.</b> Up to 20% of the permits go first to applications with the most group bonus points, checking each one&apos;s 1st and 2nd choices; zero points can&apos;t draw here. {cut ? `In ${year} it reached ${cut[0]} points for ${nr ? 'nonresidents' : 'residents'}: every first choice above that drew${cut[1] > 0 ? `, and ${pct(cut[1])} of those at ${cut[0]}` : ''}.` : `In ${year} no ${nr ? 'nonresident' : 'resident'} permit went by points here.`}</p>
        <p><b>The random passes.</b> Everyone left gets a new random number for the application, plus one more for every point, and AZGFD keeps the lowest. So 0 points is 1 number and 9 points is 10. Applications are read in order of their numbers, 1st then 2nd choice. These odds re-run that on AZGFD&apos;s {year} Bonus Point Report for this hunt and match AZGFD&apos;s published first-choice draws. Points + 1 numbers fits AZGFD&apos;s 2021–2026 reports far better than any other weighting tested.</p>
        <p><b>Nonresidents</b> get at most 10% of a hunt&apos;s permits{po?.nrCap ? ` (${int(po.nrCap)} here)` : ''}, and in the bonus pass at most half of that; nonresident odds are worked out on their own.</p>
        <p className="small muted">{po?.pointsMeaning}</p>
      </details>
      {po?.pools?.[pool]?.levels && (
        <details className="card fold">
          <summary><span>Odds table, every point level</span><span className="small muted">{year} draw</span></summary>
          <span className="seg light" role="group" aria-label="Pool">
            {(['res', 'nr'] as AzPool[]).filter((p) => po.pools[p]?.levels?.length).map((p) => <HuntLink key={p} className="seg-link" href={q({ pool: p === myPool ? null : p })} aria-pressed={pool === p} scroll={false}>{AZ_POOL_LABEL[p]}</HuntLink>)}
          </span>
          <div className="htable-wrap"><table className="co-ladder"><thead><tr><th>Your points</th><th className="num">1st choice</th><th className="num">2nd choice</th><th className="num">Drew (both choices)</th><th className="num">{year} odds</th></tr></thead>
            <tbody>{(() => {
              const arr = table?.last[pool] ?? [];
              const lv = po.pools[pool]!.levels!;
              const top = Math.max(...lv.map((l) => l[0]), mine.points ?? 0, 5);
              return Array.from({ length: top + 1 }, (_, k) => top - k).map((n) => {
                const l = lv.find((x) => x[0] === n);
                const isMe = pool === myPool && mine.points === n;
                return <tr key={n} className={isMe ? 'me' : undefined} aria-current={isMe ? 'true' : undefined}><td>{isMe ? <b>{n} · you</b> : n}</td><td className="num">{l ? int(l[1]) : '0'}</td><td className="num">{l ? int(l[2]) : '0'}</td><td className="num">{l ? `${int(l[4])}${l[3] ? ` (${int(l[3])} bonus pass)` : ''}` : '–'}</td><td className="num">{pct(arr[Math.min(n, arr.length - 1)] ?? null)}</td></tr>;
              });
            })()}</tbody></table></div>
          <p className="small muted">{year} applicants and permits issued in the bonus and 1st/2nd-choice passes, by group bonus points (AZGFD&apos;s Bonus Point Report). Permits drawn count both choices, so a level can show more permits than first-choice applicants. The odds column is a first choice&apos;s modelled chance from AZGFD&apos;s rule.</p>
        </details>
      )}
      <details className="card fold">
        <summary><span>Who manages the land</span><span className="small muted">{s.publicPct === null ? '' : `${Math.round(s.publicPct)}% public`}</span></summary>
        {land && <LandBar shares={land} />}
        <p className="small muted">Public ownership is not permission to cross private land. Military land (Barry M. Goldwater Range, Yuma Proving Ground, Fort Huachuca) counts as public ownership but is closed or open only by permit{closed >= 1 ? `; they are ${Math.round(closed)}% of this hunt's units, left out of the huntable share` : ''}. State trust land counts as state land. Tribal land is closed unless the tribe permits. BLM Surface Management Agency, measured over AZGFD&apos;s game management units{po?.portion ? '; this hunt covers part of its unit, so the shares are the whole unit\'s' : ''}.</p>
      </details>
      <details className="card fold">
        <summary><span>Season ({year})</span></summary>
        <p>{s.takeMethod} · {lic} · {s.openDate?.toISOString().slice(0, 10)} to {s.closeDate?.toISOString().slice(0, 10)}{po?.notes?.length ? ` · regulation notes ${po.notes.join(', ')}` : ''}</p>
      </details>
      {harvestSeries.length > 0 && (
        <details className="card fold">
          <summary><span>Harvest by season</span><span className="small muted">{harvestSeries.length} season{harvestSeries.length === 1 ? '' : 's'}</span></summary>
          <div className="htable-wrap"><table><thead><tr><th>Season</th><th>Hunt no.</th><th className="num">Hunters afield</th><th className="num">Successful</th><th className="num">Success</th></tr></thead>
            <tbody>{(po?.harvest ?? []).slice().reverse().map((h) => <tr key={h.year}><td>{h.year}</td><td>{h.hunt}</td><td className="num">{int(h.hunters)}</td><td className="num">{int(h.harvest)}</td><td className="num">{pct0(h.hunters ? h.harvest / h.hunters : null)}</td></tr>)}</tbody></table></div>
          <p className="small muted">AZGFD draw-hunt harvest questionnaire results for this hunt, under each year&apos;s hunt number; residents and nonresidents together.</p>
        </details>
      )}
      <details className="card fold">
        <summary><span>What it costs</span></summary>
        <div className="cost-lines"><p>Arizona fees are not loaded yet. Applying needs an Arizona hunting license and an application fee; the tag fee is charged only if you draw. <a href="https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/">See AZGFD&apos;s current fees and deadlines</a>.</p></div>
      </details>
      <p className="small muted">Source: AZGFD {year} Bonus Point Report and Bonus / 1-2 Pass draw reports, Draw Odds reports 2021–2025, {year} hunt regulations, draw-hunt harvest summaries 2021–2025, AZGFD game management units. Land: BLM Surface Management Agency. Confirm dates and rules with AZGFD before you apply.</p>
    </main>
  );
}
