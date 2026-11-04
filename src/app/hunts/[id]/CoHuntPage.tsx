import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getPoints } from '@/lib/points';
import { Star } from '@/components/Star';
import { int } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { decodeCode, myOdds, poolFor, POOL_LABEL, CO_POOLS, type CoPool, type PointOdds, type PoolOdds } from '@/lib/coHunt';
import { CHANCE_LABEL, drawsToDraw, cutFromEff, RULE_CHANGE_YEAR } from '@/lib/coOdds';
import { fmtNeed, fmtCreep } from '../CoFinder';

const pct = (o: number | null | undefined) => (o === null || o === undefined ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** A Colorado hunt code's page: your odds, points needed and their trend, and odds at every point level. */
export async function CoHuntPage({ s, sp }: { s: HuntSummary; sp: { odds?: string; pool?: string } }) {
  const po = s.pointOdds as unknown as PointOdds | null;
  const d = decodeCode(s.tagCode ?? '');
  const species = s.species === 'ELK' ? 'ELK' : 'DEER';
  const [pts, session] = await Promise.all([getPoints('CO'), auth()]);
  const saved = session?.user ? await db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null;
  const nr = pts.res === 'NONRESIDENT';
  const myPool = poolFor(nr, pts.youth);
  const pool: CoPool = (CO_POOLS as readonly string[]).includes(sp.pool ?? '') ? (sp.pool as CoPool) : myPool;
  const mode = sp.odds === 'last' ? 'last' : 'proj';
  const p = pts[species];
  const spLabel = species === 'DEER' ? 'deer' : 'elk';
  if (!po || !d) return <main className="wrap" style={{ margin: '24px auto' }}><h1>{s.name}</h1><p className="muted">No draw data for this hunt code yet.</p></main>;
  const P = po.pools[pool];
  const mine = myOdds(po.pools[myPool], p, 'proj', po.year);
  const mineLast = myOdds(po.pools[myPool], p, 'last', po.year);
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ odds: sp.odds ?? '', pool: sp.pool ?? '' }).filter(([, v]) => v));
    for (const [k, v] of Object.entries(patch)) (v === null ? u.delete(k) : u.set(k, v));
    return `/hunts/${s.slug}${u.size ? `?${u}` : ''}#odds`;
  };
  const myPo = po.pools[myPool];
  const wait = myPo?.proj ? drawsToDraw(p, myPo.proj) : null;
  const drawYear = wait === null ? null : po.projYear + wait;

  return (
    <main className="wrap co-hunt" style={{ margin: '20px auto 48px' }}>
      <p className="small"><Link href={`/hunts?unit=${d.unit}${species === 'ELK' ? '&species=ELK' : ''}`}>← Colorado hunts in unit {d.unit}</Link></p>
      <h1 className="star-head">{s.name} <Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Hunt code <b>{s.tagCode}</b> · {s.tags !== null ? `${int(s.tags)} licenses in ${po.year}` : ''} · List {po.list ?? '–'}
        {po.nrCapPct !== null ? ` · Nonresident cap ${po.nrCapPct}% (${po.nrCap})` : ''}{po.hybridCap ? ` · Hybrid draw up to ${po.hybridCap}` : ''}
        {s.privateOnly ? ' · Private land only' : ''} · <Link href={`/units/${encodeURIComponent(unitKey('CO', d.unit))}`}>Unit {d.unit}</Link>
      </p>

      <div className="co-top">
        <div className="card co-mine">
          <div className="k">Your {po.projYear} odds · {p} {spLabel} point{p === 1 ? '' : 's'} · {POOL_LABEL[myPool]}</div>
          <div className="co-big">{pct(mine?.odds)} <span className={`pill ch-${mine?.chance ?? 'none'}`}>{CHANCE_LABEL[mine?.chance ?? 'none']}</span></div>
          <div className="small muted">
            {mine && mine.lo !== mine.hi ? `Could be ${pct(mine.lo)} to ${pct(mine.hi)}, depending on where the cutoff lands. ` : ''}
            {mineLast?.last ? `In ${po.year}, ${mineLast.last.drawn} of ${mineLast.last.apps} first-choice applicants with ${p} points drew.` : mineLast ? `In ${po.year}: ${pct(mineLast.odds)} at ${p} points.` : ''}
            {!pts.set && ' Set your points in the header for your own odds.'}
          </div>
          {drawYear !== null && wait! > 0 && (
            <p className="small" style={{ marginBottom: 0 }}>
              {drawYear < RULE_CHANGE_YEAR
                ? `At the cutoff's 5-year pace you'd likely draw in ${drawYear}.`
                : `At the cutoff's 5-year pace, about ${wait} more year${wait === 1 ? '' : 's'} of points (${drawYear}). But the ${RULE_CHANGE_YEAR} draw splits licenses between preference and bonus points, so that count stops meaning much after ${RULE_CHANGE_YEAR - 1}.`}
            </p>
          )}
          {wait === null && myPo?.proj && <p className="small" style={{ marginBottom: 0 }}>The cutoff has been rising at least a point a year: points alone won&apos;t catch it under today&apos;s rules.</p>}
        </div>
        <div className="card co-need">
          <div className="k">Points needed, {po.year} draw</div>
          <div className="co-need-row"><span className="res">Resident</span><b>{fmtNeed(s.ptsRes, s.ptsResPct)}</b><span className="small muted">creep {fmtCreep(s.creepRes)}</span></div>
          <div className="co-need-row"><span className="nr">Nonresident</span><b>{fmtNeed(s.ptsNr, s.ptsNrPct)}</b><span className="small muted">creep {fmtCreep(s.creepNr)}</span></div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {s.secondChoice ? `Licenses reached 2nd-choice applicants in ${po.year}: you can draw this as a 2nd choice and keep building points on your 1st.` : 'Drew out on first choices: it takes your 1st choice (and your points).'}
          </p>
        </div>
      </div>

      <h2>Point Creep</h2>
      <CreepChart po={po} />

      <h2>Draw History</h2>
      <div className="htable-wrap">
        <table>
          <thead><tr><th>Draw</th><th className="num">Licenses</th><th className="num">1st-choice apps</th><th>Resident drawn out at</th><th>Nonresident drawn out at</th><th>NR cap</th></tr></thead>
          <tbody>
            {po.history.slice().reverse().map((h) => {
              const at = (pl: CoPool) => po.pools[pl]?.history.find((x) => x.year === h.year);
              const cell = (pl: CoPool) => { const x = at(pl); return x?.eff === null || x?.eff === undefined ? (x?.text ?? '–') : effText(x.eff, x.text); };
              return <tr key={h.year}><td>{h.year}</td><td className="num">{h.quota ?? '–'}</td><td className="num">{h.apps1 ?? '–'}</td><td>{cell('res')}</td><td>{cell('nr')}</td><td>{h.nrCapPct !== null ? `${h.nrCapPct}%` : '–'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <h2 id="odds">Odds At Every Point Level</h2>
      <div className="co-oddsbar">
        <span className="seg light" role="group" aria-label="Which draw">
          <Link className="seg-link" href={q({ odds: null })} aria-pressed={mode === 'proj'} scroll={false}>{po.projYear} projected</Link>
          <Link className="seg-link" href={q({ odds: 'last' })} aria-pressed={mode === 'last'} scroll={false}>{po.year} actual</Link>
        </span>
        <span className="seg light" role="group" aria-label="Applicant pool">
          {CO_POOLS.filter((x) => po.pools[x]).map((x) => <Link key={x} className="seg-link" href={q({ pool: x === myPool ? null : x })} aria-pressed={pool === x} scroll={false}>{POOL_LABEL[x]}</Link>)}
        </span>
      </div>
      {P ? <Ladder P={P} po={po} mode={mode} me={pool === myPool ? p : null} /> : <p className="muted">Nobody in this pool applied in {po.year}.</p>}
      <p className="small muted">
        {mode === 'proj'
          ? `${po.projYear} odds: the ${po.year} cutoff plus how far cutoffs at this level moved from one draw to the next, ${po.history[0]?.year ?? ''}–${po.year}, across every Colorado ${spLabel} hunt. Odds are averaged over those outcomes. Tested on past draws: last year's cutoff beat every fancier forecast we tried.`
          : `What happened in the ${po.year} primary draw: first-choice applicants and how many drew, by preference points. A few applicants above the cutoff sometimes don't draw; CPW doesn't say why.`}
        {P?.hybrid ? ` Hybrid draw: ${pct(P.hybrid)} of 5+ point applicants below the cutoff drew at random.` : ''}
      </p>
      <p className="small muted">Source: Colorado Parks and Wildlife Draw Recap reports. Not affiliated with CPW; confirm hunt codes, dates and rules in the current big game brochure.</p>
    </main>
  );
}

function effText(eff: number, text: string | null): string {
  if (eff === 0) return text && /choice|leftover/i.test(text) ? `Every 1st choice drew (${text})` : 'Every 1st choice drew';
  const { pts, pct: share } = cutFromEff(eff);
  return `${pts} pt${pts === 1 ? '' : 's'}${share < 0.995 ? ` · ${Math.round(share * 100)}% drew at ${pts}` : ''}`;
}

function Ladder({ P, po, mode, me }: { P: PoolOdds; po: PointOdds; mode: 'proj' | 'last'; me: number | null }) {
  const maxLevel = Math.max(0, ...P.levels.map((l) => l[0]), me ?? 0);
  const rows = [];
  for (let k = maxLevel; k >= 0; k--) {
    const lv = P.levels.find((l) => l[0] === k);
    const o = myOdds(P, k, mode, po.year);
    if (!lv && k !== me && mode === 'last') continue;
    rows.push({ k, apps: lv?.[1] ?? 0, drew: lv?.[2] ?? 0, o });
  }
  return (
    <div className="htable-wrap">
      <table className="co-ladder">
        <thead><tr><th className="num">Points</th><th className="num">Applied ({po.year})</th><th className="num">Drew</th><th>{mode === 'proj' ? `${po.projYear} odds` : `${po.year} odds`}</th><th>Chance</th></tr></thead>
        <tbody>
          {rows.map(({ k, apps, drew, o }) => {
            const ch = o ? o.chance : 'none';
            const v = o?.odds ?? 0;
            return (
              <tr key={k} className={k === me ? 'me' : undefined}>
                <td className="num">{k}{k === me ? <span className="small muted"> · you</span> : ''}</td>
                <td className="num">{apps || '–'}</td>
                <td className="num">{apps ? drew : '–'}</td>
                <td><span className="co-bar"><i><s style={{ width: `${Math.round(v * 100)}%` }} /></i><em>{pct(o?.odds)}{mode === 'proj' && o && o.lo !== o.hi ? <span className="muted"> ({pct(o.lo)}–{pct(o.hi)})</span> : ''}</em></span></td>
                <td><span className={`pill ch-${ch}`}>{CHANCE_LABEL[ch]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Effective points needed per draw, resident and nonresident, with the next draw's projected range. */
function CreepChart({ po }: { po: PointOdds }) {
  const W = 640, H = 230, L = 36, R = 16, T = 12, B = 28;
  const years = [...po.history.map((h) => h.year), po.projYear];
  const series = (['res', 'nr'] as const).map((k) => ({ k, P: po.pools[k] })).filter((x) => x.P);
  const vals = series.flatMap(({ P }) => [...P!.history.map((h) => h.eff ?? 0), P!.proj?.hi ?? 0]);
  const ymax = Math.max(2, Math.ceil(Math.max(...vals) + 0.5));
  const x = (y: number) => L + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / ymax);
  const step = ymax > 12 ? 4 : ymax > 6 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(ymax / step) + 1 }, (_, i) => i * step);
  const color = { res: 'var(--res)', nr: 'var(--nr)' };
  return (
    <figure className="co-creep" style={{ margin: 0 }}>
      <div className="legend small"><span><i style={{ background: 'var(--res)' }} />Resident</span><span><i style={{ background: 'var(--nr)' }} />Nonresident</span><span className="muted">Bars: {po.projYear} projected range (10th–90th percentile)</span></div>
      <div className="htable-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Points needed by draw year, ${years[0]} to ${po.projYear}`}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text></g>)}
          {years.map((yr) => <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{yr}{yr === po.projYear ? '*' : ''}</text>)}
          {series.map(({ k, P }) => {
            const pts = P!.history.filter((h) => h.eff !== null) as { year: number; eff: number }[];
            const pr = P!.proj;
            return (
              <g key={k}>
                <polyline fill="none" stroke={color[k]} strokeWidth="2.5" points={pts.map((h) => `${x(h.year)},${y(h.eff)}`).join(' ')} />
                {pts.map((h) => <circle key={h.year} cx={x(h.year)} cy={y(h.eff)} r="3.5" fill={color[k]} />)}
                {pr && (
                  <>
                    <line x1={x(po.projYear) + (k === 'nr' ? 5 : -5)} x2={x(po.projYear) + (k === 'nr' ? 5 : -5)} y1={y(pr.lo)} y2={y(pr.hi)} stroke={color[k]} strokeWidth="6" strokeOpacity=".35" strokeLinecap="round" />
                    <circle cx={x(po.projYear) + (k === 'nr' ? 5 : -5)} cy={y(pr.eff)} r="4" fill="var(--card)" stroke={color[k]} strokeWidth="2" />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="small muted">Points needed with the share drawn at the cutoff as a fraction: 6 points with 60% drawing plots as 6.4. *Projected.</figcaption>
    </figure>
  );
}

