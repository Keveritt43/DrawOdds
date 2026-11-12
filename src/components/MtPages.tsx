import Link from 'next/link';
import { db } from '@/lib/db';
import draws from '../../data/mt/draws.json';
import districtHistory from '../../data/mt/district-history.json';
import { huntHref } from '@/lib/huntSlug';
import { int } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { mtComboOdds, mtCutoff, mtCutoffHistory, mtLatestYear, mtLicense } from '@/lib/mtOdds';
import { mtChanges, mtLatestDraw, mtDay, MT_APPS, MT_DATES_SOURCE, MT_DATES_CHECKED, MT_DATES_YEAR, type MtChangeRow } from '@/lib/mtPlan';
import { mtDistricts, type MtPointOdds, type MtOddsTable } from '@/lib/mtHunt';
import { MT_BONUS_TYPES, type MtBonusType } from '@/lib/mtPoints';
import { MtComboPointsChart, MtCutoffHistoryChart, MtOddsPointsChart } from './MtCharts';

/**
 * Montana's How The Draw Works and What Changed pages. They answer the same questions as Idaho's and Colorado's
 * (when, how the draw picks, what to do about it; what moved since last year) with Montana's own rules: two point
 * systems at once, permits that ride on a general license, and B licenses sold over the counter.
 */

type DrawEntry = { license: string; code: string; quota: number | string; pools: Record<string, { apps: number[]; succ: number[] }> };
const DRAWS = (draws as unknown as { years: Record<string, Record<string, DrawEntry>> }).years;
const pct = (o: number | null | undefined, dp = 0) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${(o * 100).toFixed(dp)}%`);
const TYPE_LABEL: Record<MtBonusType, string> = Object.fromEntries(MT_BONUS_TYPES.map((t) => [t.key, t.label])) as Record<MtBonusType, string>;
const LICENSE_TYPE: Record<string, MtBonusType> = {
  'Deer Permit': 'DEER_PERMIT', 'Elk Permit': 'ELK_PERMIT', 'Antelope License': 'ANTELOPE',
  'Deer B License': 'DEER_B', 'Elk B License': 'ELK_B', 'Antelope B License': 'ANTELOPE_B',
};

/** Statewide first/second/third-choice results by license type, resident and nonresident pools together. */
function choiceStats(year: number) {
  const out = new Map<MtBonusType, { apps: number[]; succ: number[] }>();
  for (const e of Object.values(DRAWS[String(year)] ?? {})) {
    const t = LICENSE_TYPE[e.license];
    if (!t) continue;
    const s = out.get(t) ?? { apps: [0, 0, 0], succ: [0, 0, 0] };
    for (const p of ['res', 'nr']) for (let i = 0; i < 3; i++) { s.apps[i] += e.pools[p]?.apps[i] ?? 0; s.succ[i] += e.pools[p]?.succ[i] ?? 0; }
    out.set(t, s);
  }
  return MT_BONUS_TYPES.map((t) => ({ key: t.key, label: t.label, ...(out.get(t.key) ?? { apps: [0, 0, 0], succ: [0, 0, 0] }) }));
}

function Timeline() {
  const steps: { when: string; what: string; tone?: 'blaze' | 'good' }[] = [
    { when: 'Mar 1', what: 'Applications open online (5 am)' },
    { when: mtDay('2026-04-01'), what: 'Nonresident combination licenses · deer permits · elk permits', tone: 'blaze' },
    { when: 'Mid-April', what: 'Combination and permit results' },
    { when: mtDay('2026-06-01'), what: 'Antelope · Antelope B · Deer B · Elk B', tone: 'blaze' },
    { when: 'Mid-June', what: 'Deer B and Elk B results' },
    { when: 'Jun 15', what: 'Over-the-counter Deer B and Elk B go on sale', tone: 'good' },
    { when: 'Jul 1 – Dec 31', what: 'Nonresident preference point only, $100' },
    { when: 'Early August', what: 'Antelope results' },
  ];
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {steps.map((s) => (
        <div key={s.when + s.what} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
          <div className="k">{s.when}</div>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div>
        </div>
      ))}
    </div>
  );
}

export async function MtGuide() {
  const year = mtLatestYear('biggame-elk');
  const cut = mtCutoff('biggame-elk');
  const zero = mtComboOdds('biggame-elk', 0)?.odds ?? null;
  const one = mtComboOdds('biggame-elk', 1)?.odds ?? null;
  const drawYear = 2026;
  // what 2 points and 0 points drew, over the draws where the cutoff sat at 2 (the dead-zone years)
  const hist = mtCutoffHistory('biggame-elk').filter((h) => h.cutoff === 2);
  const y0 = hist[0]?.year;
  const range = (a: (number | null)[], dp: number) => { const v = a.filter((x): x is number => x != null); return v.length ? `${Math.min(...v).toFixed(dp)}–${Math.max(...v).toFixed(dp)}%` : null; };
  const atTwo = range(hist.map((h) => h.cutoffPct), 0), zeroRange = range(hist.map((h) => h.zeroPct), 0);
  const choices = choiceStats(drawYear);
  // A permit with a real climb by points, to show what squared bonus points do. Picked by data, not by name.
  const showcase = (await db.huntSummary.findMany({ where: { state: 'MT', type: 'CONTROLLED', species: 'ELK' }, orderBy: { appsLast: 'desc' }, take: 40 }))
    .find((h) => {
      const t = h.oddsByPts as unknown as MtOddsTable | null;
      const r = t?.last?.res ?? [];
      return (h.pointOdds as unknown as MtPointOdds | null)?.license === 'Elk Permit' && r.length >= 10 && r[0] > 0 && r[0] < 0.05 && r[Math.min(9, r.length - 1)] > 0.2;
    });
  const st = showcase?.oddsByPts as unknown as MtOddsTable | undefined;
  return (
    <main className="wrap" style={{ maxWidth: 900, margin: '24px auto 48px' }}>
      <h1>How The Montana Draw Works</h1>
      <p className="lead-sum">The short version: <b>Montana runs two point systems at once.</b> Nonresidents draw their general deer and elk license (a combination license) with <b>preference points</b>, capped at 3, where holding a point or two can be worse than holding none. Everything else, permits, antelope and B licenses, residents and nonresidents alike, is drawn with <b>bonus points, squared</b>.</p>

      <h2>Your Montana Year</h2>
      <Timeline />
      <p className="small muted">{MT_DATES_YEAR} dates from <a href={MT_DATES_SOURCE}>FWP&apos;s application and drawing dates</a> (checked {MT_DATES_CHECKED}; deadlines 11:45 pm Mountain). FWP hadn&apos;t posted {MT_DATES_YEAR + 1} dates yet; they are usually the same days, but check before you count on it. The Antelope B deadline is from the {MT_DATES_YEAR} regulations. <Link href="/planner">Plan your applications</Link></p>

      <h2>What Needs What</h2>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>Application</th><th>Deadline ({MT_DATES_YEAR})</th><th>Points</th><th>Nonresident needs a combination license?</th></tr></thead>
        <tbody>{MT_APPS.map((a) => (
          <tr key={a.key}><td><b>{a.label}</b><div className="small muted">{a.what}</div></td><td>{mtDay(a.deadline)}</td><td>{a.key === 'COMBO' ? 'Preference, max 3' : 'Bonus, squared'}</td>
            <td>{a.key === 'COMBO' ? 'It is the combination license' : a.key === 'DEER_PERMIT' || a.key === 'ELK_PERMIT' ? <b>Yes</b> : 'No'}</td></tr>
        ))}
          <tr><td><b>Over-the-counter Deer B and Elk B</b><div className="small muted">B licenses with an unlimited quota. No draw.</div></td><td>On sale Jun 15</td><td>None</td><td>No</td></tr>
        </tbody>
      </table></div>
      <p className="small muted">Residents buy their general deer and elk licenses over the counter and need no combination draw. A permit is <b>not an extra animal</b>: it restricts your general license to a district, season or animal. B licenses are extra, antlerless animals.</p>

      <h2>Nonresident Combination: Preference Points</h2>
      <ul>
        <li><b>75% by points, 25% at random for zero-point applicants only.</b> Licenses go to the most points first until 75% are gone; the last 25% are drawn at random among applicants holding <b>no</b> points.</li>
        <li>So anyone with points but below the cutoff misses both halves. {year && cut && one !== null && zero !== null && <>In the {year} Big Game / Elk draw everyone above {cut.label} points drew, {cut.label} points drew <b>{pct(cut.pct == null ? null : cut.pct / 100)}</b>, 1 point drew <b>{pct(one)}</b>, and zero points drew <b>{pct(zero, 1)}</b>. (Party applications average their members&apos; points, so some hold 2.2 or 1.5.)</>}</li>
        <li>Points cap at 3. You buy a point when you apply; a combination applicant can&apos;t buy one later in the year. You lose them all when you draw, and when you don&apos;t apply in consecutive years: a $100 point-only purchase (Jul 1 – Dec 31, for those who didn&apos;t apply) does <b>not</b> keep them.</li>
        <li>The Big Game and Elk Combinations are one drawing; the Deer Combination is a separate one. Which one you apply for is set on <Link href="/account#hunting-preferences">your account</Link>, and every nonresident deer or elk page uses it.</li>
      </ul>
      <div className="grid2">
        <MtComboPointsChart licenseKey="biggame-elk" title={`${year ?? ''} Big Game / Elk draw: chance by preference points`} />
        <MtCutoffHistoryChart licenseKey="biggame-elk" title="What it took, draw by draw" />
      </div>
      <p className="small"><Link href="/montana">Both combination draws in full, at your points →</Link></p>

      <h2>Permits, Antelope And B Licenses: Bonus Points, Squared</h2>
      <ul>
        <li>Every applicant gets one chance; bonus points add more. FWP squares them: in FWP&apos;s own example, 10 points is (10 × 10) + 1 = 101 chances.</li>
        <li><b>Buy a point with your application or your banked points don&apos;t count that year.</b> The point you buy counts in that same drawing.</li>
        <li>Points build until you draw, one balance per license type (deer permit, elk permit, antelope, Deer B, Elk B, Antelope B). Drawing a type resets that type only.</li>
        <li>Residents and nonresidents draw in separate pools; landowner pools are separate again.</li>
        <li>Each application takes three choices, but later choices only get what first choices left. In {drawYear}:</li>
      </ul>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>License type</th><th>1st choice drew</th><th>2nd choice drew</th><th>3rd choice drew</th></tr></thead>
        <tbody>{choices.map((c) => (
          <tr key={c.key}><td>{c.label}</td>{[0, 1, 2].map((i) => <td key={i}>{int(c.succ[i])} <span className="small muted">of {int(c.apps[i])} ({pct(c.apps[i] ? c.succ[i] / c.apps[i] : null, 1)})</span></td>)}</tr>
        ))}</tbody>
      </table></div>
      <p className="small muted">Statewide, resident and nonresident pools together, from FWP&apos;s {drawYear} drawing statistics. Every hunt card shows how many 2nd-choice applicants drew in that hunt.</p>
      {showcase && st && <>
        <h3>What squared points look like: <Link href={huntHref(showcase)}>{showcase.name}</Link></h3>
        <MtOddsPointsChart res={st.last.res ?? []} nr={st.last.nr ?? []} noBuy={{ res: st.noBuy?.res ?? null, nr: st.noBuy?.nr ?? null }} myPoints={null} mine="res" year={(showcase.pointOdds as unknown as MtPointOdds).year} />
      </>}

      <h2>Over-The-Counter B Licenses</h2>
      <p>Deer B and Elk B licenses with an unlimited quota aren&apos;t drawn: FWP sells them from June 15, and a nonresident needs no combination license for them. <Link href="/hunts?states=MT&mtLic=b">Find them in Find Hunts</Link> (each says &ldquo;Over the counter&rdquo;, with its fee).</p>

      <h2>Strategy That Follows From This</h2>
      <ul>
        <li><b>Nonresidents: 0 or the cutoff, nothing in between.</b> {year && one !== null && zero !== null && <>In {year}, 1 point drew {pct(one)} and 0 points {pct(zero, 1)}. </>}At 1 point you have two routes to a license next year: apply again and buy a point at application, which is the only time a combination applicant can buy one (you won&apos;t draw, but you reach 2 points{atTwo ? `, which drew ${atTwo} since ${y0}` : ''}), or skip the drawing, lose the point and come back at 0 for the random draw{zeroRange ? ` (${zeroRange} since ${y0})` : ''}.</li>
        <li><b>Buy a bonus point every year for every type you care about,</b> even with a long-shot first choice: skipping a year wastes the squared growth.</li>
        <li><b>A permit is worth only as much as your combination odds.</b> A nonresident&apos;s chance to hunt a permit is both draws; every nonresident permit card shows the two parts.</li>
        <li><b>Use 2nd and 3rd choices on hunts that reached them.</b> In most permit hunts they drew nothing; B licenses are where later choices pay off.</li>
        <li><b>Odds here are the last draw, not a forecast.</b> The Fish and Wildlife Commission withheld about 2,500 nonresident general deer licenses for the 2026–2027 seasons, so the trend is not a safe guide. See <Link href="/changes">What Changed</Link>.</li>
      </ul>

      <h2>Costs</h2>
      <p>Nonresident combination licenses on FWP&apos;s current fee schedule (no season year printed; checked Nov 10, 2026): Big Game $1,312, Elk $1,112, Deer $760. From the 2025 regulations: preference point $100, bonus points $2 resident, $20 nonresident, per license type, and a nonrefundable $5 application fee per license or permit. <a href="https://fwp.mt.gov/buyandapply/hunting-licenses/nonresident-licenses/fees">FWP nonresident fees</a></p>
      <p className="small muted">Rules here are summarized from FWP&apos;s regulations, application dates and bonus-point pages and its drawing statistics. FWP&apos;s documents are the final word. <Link href="/about">Where Montana&apos;s numbers come from</Link></p>
    </main>
  );
}

const OWN = (r: MtChangeRow & { tagCode?: string | null; units?: string[] }) => (
  <Link href={huntHref(r)}>{r.name}</Link>
);

export async function MtChanges() {
  const rows = (await db.huntSummary.findMany({
    where: { state: 'MT', type: 'CONTROLLED' },
    select: { id: true, slug: true, name: true, areaName: true, species: true, pointOdds: true, resOddsLast: true, nrOddsLast: true, resOddsPrev: true, nrOddsPrev: true, oddsYears: true, tagCode: true, units: true },
  })) as unknown as (MtChangeRow & { tagCode: string | null; units: string[] })[];
  const year = mtLatestDraw(rows) ?? 2026;
  const { quota, apps, fresh } = mtChanges(rows, year);
  const prev = new Set(Object.keys(DRAWS[String(year - 1)] ?? {})), now = new Set(Object.keys(DRAWS[String(year)] ?? {}));
  const dropped = [...prev].filter((k) => !now.has(k)).sort().map((k) => ({ k, e: DRAWS[String(year - 1)][k] }));
  const H = districtHistory as unknown as { deerElk: Record<string, Record<string, number | null>>; antelope: Record<string, Record<string, number | null>>; stableIou: number };
  const prior = String(year - 2); // FWP sets districts in two-year regulation cycles
  const redrawn = (['deerElk', 'antelope'] as const).flatMap((set) => Object.entries(H[set])
    .filter(([, v]) => v[String(year)] != null && (v[prior] == null || v[prior]! < H.stableIou))
    .map(([d, v]) => ({ set, d, iou: v[prior] })));
  const combos = ['biggame-elk', 'deer'].map((k) => ({ k, name: mtLicense(k)?.shortName ?? k, h: mtCutoffHistory(k).filter((x) => x.year >= year - 1) }));
  const sp = (s: string) => (s === 'PRONGHORN' ? 'sp-pronghorn' : s === 'ELK' ? 'sp-elk' : 'sp-deer');

  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · Montana</h1>
      <p className="muted">The {year} drawing against {year - 1}: <a href="#combo">Combination draw</a> · <a href="#quota">More or fewer licenses ({quota.length})</a> · <a href="#apps">Applicant swings ({Math.min(apps.length, 40)})</a> · <a href="#new">New ({fresh.length})</a> · <a href="#dropped">Gone ({dropped.length})</a> · <a href="#districts">Redrawn districts ({redrawn.length})</a></p>

      <h2 id="combo">Nonresident Combination Draw</h2>
      <div className="stats">
        {combos.flatMap(({ k, name, h }) => h.length === 2 ? [
          <div key={k + 'c'} className="stat"><div className="k">{name}: at the cutoff ({h[1].cutoff ?? '–'} pts)</div><div className="v">{h[1].cutoffPct != null ? `${h[1].cutoffPct.toFixed(0)}%` : '–'}</div><div className="small muted">{h[0].cutoffPct != null ? `${h[0].cutoffPct.toFixed(0)}% in ${year - 1}` : ''}</div></div>,
          <div key={k + 'z'} className="stat"><div className="k">{name}: zero points</div><div className="v">{h[1].zeroPct != null ? `${h[1].zeroPct.toFixed(1)}%` : '–'}</div><div className="small muted">{h[0].zeroPct != null ? `${h[0].zeroPct.toFixed(1)}% in ${year - 1}` : ''}</div></div>,
          <div key={k + 'n'} className="stat"><div className="k">{name}: licenses drawn</div><div className="v">{int(h[1].drawn)}</div><div className="small muted">{int(h[0].drawn)} in {year - 1}</div></div>,
        ] : [])}
      </div>
      <p className="small muted">The cutoff is the point level licenses ran out at. The Fish and Wildlife Commission withheld about 2,500 nonresident general deer licenses for the 2026–2027 seasons; the {year} draw already reflects it. <Link href="/montana">The full combination draw →</Link></p>

      <h2 id="quota">More Or Fewer Licenses</h2>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>Hunt</th><th>{year - 1}</th><th>{year}</th><th>Change</th><th>Odds {year}</th></tr></thead>
        <tbody>{quota.map((q) => (
          <tr key={q.row.id}><td><span className={`pill ${sp(q.row.species)}`}>{TYPE_LABEL[q.app]}</span> {OWN(q.row)}<div className="small muted">{mtDistricts((q.row as unknown as { units: string[] }).units)}</div></td>
            <td>{int(q.prev)}</td><td>{int(q.last)}</td>
            <td className={q.last > q.prev ? 'best' : ''}>{q.last > q.prev ? '+' : ''}{int(q.last - q.prev)} ({Math.round(((q.last - q.prev) / Math.max(1, q.prev)) * 100)}%)</td>
            <td>{pct(q.row.resOddsLast)} res · {pct(q.row.nrOddsLast)} NR</td></tr>
        ))}</tbody>
      </table></div>
      {!quota.length && <p className="muted">No drawn license changed its quota.</p>}

      <h2 id="apps">Biggest Applicant Swings</h2>
      <p className="small muted">First-choice applicants, resident and nonresident, in hunts with at least 50 the year before. More applicants for the same licenses means lower odds at every point level.</p>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>Hunt</th><th>{year - 1}</th><th>{year}</th><th>Change</th><th>Resident odds</th></tr></thead>
        <tbody>{apps.slice(0, 40).map((q) => (
          <tr key={q.row.id}><td><span className={`pill ${sp(q.row.species)}`}>{TYPE_LABEL[q.app]}</span> {OWN(q.row)}</td>
            <td>{int(q.prev)}</td><td>{int(q.last)}</td>
            <td>{q.last > q.prev ? '+' : ''}{Math.round(((q.last - q.prev) / q.prev) * 100)}%</td>
            <td>{pct(q.row.resOddsPrev)} → {pct(q.row.resOddsLast)}</td></tr>
        ))}</tbody>
      </table></div>

      <h2 id="new">New In The {year} Drawing</h2>
      <p className="small muted">No draw under this code in any year since 2021. It may be new, or renumbered from an old code.</p>
      {fresh.length ? <ul>{fresh.map((f) => <li key={f.row.id}>{OWN(f.row)} · {mtDistricts((f.row as unknown as { units: string[] }).units)}</li>)}</ul> : <p className="muted">None.</p>}

      <h2 id="dropped">In {year - 1}, Gone In {year}</h2>
      {dropped.length ? <ul>{dropped.map(({ k, e }) => <li key={k}>{e.license} {e.code} ({typeof e.quota === 'number' ? `${int(e.quota)} licenses` : e.quota} in {year - 1})</li>)}</ul> : <p className="muted">None.</p>}

      <h2 id="districts">Districts Redrawn For {year}</h2>
      <p className="small muted">Districts whose {year} outline overlaps the {prior} one by less than {Math.round(H.stableIou * 100)}% (or that are new), measured from FWP&apos;s past-years district maps. Harvest from before the change describes different ground, so those district pages leave it out.</p>
      {redrawn.length ? <ul>{redrawn.map((r) => (
        <li key={r.set + r.d}><Link href={`/units/${encodeURIComponent(unitKey('MT', `${r.set === 'antelope' ? 'A' : ''}${r.d}`))}`}>{r.set === 'antelope' ? 'Antelope ' : 'Deer/elk '}HD {r.d}</Link> · {r.iou == null ? `no district ${r.d} in ${prior}` : `${Math.round(r.iou * 100)}% the same ground as ${prior}`}</li>
      ))}</ul> : <p className="muted">None.</p>}
      <p className="small muted">From FWP&apos;s drawing statistics, {year - 1} and {year}. Odds are first-choice draws. A quota change doesn&apos;t tell you next year&apos;s odds.</p>
    </main>
  );
}
