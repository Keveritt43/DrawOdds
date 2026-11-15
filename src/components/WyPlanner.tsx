import Link from 'next/link';
import { db } from '@/lib/db';
import { getPoints } from '@/lib/points';
import { wyAreaLabel, wyBasis, wyPool, wyTableOdds, WY_POOL_LABEL, type WyOddsTable, type WyPointOdds } from '@/lib/wyHunt';
import { withoutUnvalidatedWyDeerMetrics } from '@/lib/wyDeerMetrics';
import { StatePlanner, type PlanApp, type PlanOpt, type PlanTimelineStep } from './StatePlanner';

/**
 * Wyoming Application Planner: one application per species, three hunt choices each, odds at the hunter's saved
 * points and pool.
 *
 * Dates: WGFD's "Application Dates & Deadlines" page, checked Nov 14, 2026 (it prints no year).
 * Fees: WGFD's license fee list and preference-points page, checked Nov 14, 2026 (no year printed).
 * Three choices: every WGFD demand report counts 1st, 2nd and 3rd choices for every hunt (data/wy/draws.json).
 * Points: nonresident elk, deer and antelope points are bought only in the point-only period, never with an
 * application (WGFD preference-points FAQ: no point in the initial draw since 2019); not buying for two years in a
 * row loses them.
 */
const WY_TIMELINE: PlanTimelineStep[] = [
  { when: 'Jan 2', what: 'Applications open for elk, deer and antelope' },
  { when: 'Feb 2', what: 'Nonresident elk applications close', tone: 'blaze' },
  { when: 'May 21', what: 'Nonresident elk results' },
  { when: 'Jun 1', what: 'Deer, antelope and resident elk applications close', tone: 'blaze' },
  { when: 'Jun 18', what: 'Deer, antelope and resident elk results' },
  { when: 'Jul 1 – Nov 2', what: 'Nonresident preference points on sale (only way to get one)', tone: 'good' },
];

type Sp = 'ELK' | 'DEER' | 'PRONGHORN';
const LABEL: Record<Sp, string> = { ELK: 'elk', DEER: 'deer', PRONGHORN: 'antelope' };
// [regular, special, youth] for nonresidents; [adult, -, youth] for residents
const LICENSE: Record<'nr' | 'res', Record<Sp, [number, number | null, number]>> = {
  nr: { ELK: [692, 1950, 275], DEER: [374, 1200, 110], PRONGHORN: [326, 1200, 110] },
  res: { ELK: [57, null, 25], DEER: [42, null, 15], PRONGHORN: [37, null, 15] },
};
const APP_FEE = { nr: 15, res: 5 };
const POINT_FEE: Record<Sp, number> = { ELK: 52, DEER: 41, PRONGHORN: 31 };

export async function WyPlannerPage({ signedIn }: { signedIn: boolean }) {
  const pts = await getPoints('WY');
  const nr = pts.res === 'NONRESIDENT';
  const youth = pts.youth === true;
  const pool = wyPool(nr, pts.wySpecial === true && !youth);
  const rows = (await db.huntSummary.findMany({ where: { state: 'WY', type: 'CONTROLLED', privateOnly: false }, orderBy: [{ tagCode: 'asc' }] })).map(withoutUnvalidatedWyDeerMetrics);
  const opts: PlanOpt[] = [];
  for (const r of rows) {
    const po = r.pointOdds as unknown as WyPointOdds | null;
    const t = r.oddsByPts as unknown as WyOddsTable | null;
    if (!po || po.general || !t?.last?.[pool]) continue;
    const sp = (r.species === 'PRONGHORN' ? 'PRONGHORN' : r.species === 'ELK' ? 'ELK' : 'DEER') as Sp;
    const p = nr ? pts[sp] : 0;
    const mode = po.projected ? 'proj' : 'last';
    opts.push({
      id: r.id, href: `/hunts/${r.slug}`, code: r.tagCode ?? r.id, app: sp,
      where: r.tagCode?.includes('R-') ? r.name : `${r.units.map(wyAreaLabel).join(', ')} · ${r.takeMethod && r.takeMethod.length < 60 ? r.takeMethod : r.name}`,
      odds: wyTableOdds(t, mode, pool, p), basis: wyBasis(pool, mode, p, po),
      success: r.success5 !== null && !r.smallSample ? r.success5 : null,
    });
  }
  const k = nr ? 'nr' : 'res';
  const apps: PlanApp[] = (['ELK', 'DEER', 'PRONGHORN'] as Sp[]).map((sp) => {
    const [reg, special, yth] = LICENSE[k][sp];
    const license = youth ? yth : pool === 'nrs' ? special! : reg;
    const mine = opts.filter((o) => o.app === sp);
    const nrElk = nr && sp === 'ELK';
    return {
      key: sp, label: `${LABEL[sp][0].toUpperCase()}${LABEL[sp].slice(1)} (${youth ? 'youth' : nr ? WY_POOL_LABEL[pool].toLowerCase() : 'resident'})`,
      when: nrElk ? 'Apply Jan 2 – Feb 2 · results May 21' : 'Apply Jan 2 – Jun 1 · results Jun 18',
      choices: 3,
      price: license + APP_FEE[k], needs: [],
      what: `${nr ? `License $${license}${nrElk ? ' (includes fishing)' : ''}` : `License $${license}`} plus the $${APP_FEE[k]} application fee, both charged when you apply.${sp === 'DEER' ? ' Residents buy general deer licenses over the counter; this is for limited quota areas.' : sp === 'ELK' && !nr ? ' Residents buy general elk licenses over the counter; this is for limited quota areas.' : ''}`,
      points: nr
        ? `Your nonresident ${LABEL[sp]} points: ${pts[sp]}. Applying doesn't add one: buy it Jul 1 – Nov 2 ($${youth ? 10 : POINT_FEE[sp]}), and buy one at least every other year or you lose them all`
        : `Residents don't use points for ${LABEL[sp]}: every limited quota license is a random draw`,
      later: nr
        ? 'Points count only on your first choice, so a later choice can only draw in the random 25%, from licenses the first choices left.'
        : 'A later choice only gets licenses first choices left.',
      suggest: mine.filter((o) => o.odds !== null && o.success !== null).sort((a, b) => b.odds! * b.success! - a.odds! * a.success!).slice(0, 4).map((o) => o.id),
    };
  }).filter((a) => opts.some((o) => o.app === a.key));
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · Wyoming</h1>
      <StatePlanner state="WY" apps={apps} opts={opts} prereq={[]} signedIn={signedIn} set={pts.set} setLabel="Set your Wyoming points and pool"
        timeline={WY_TIMELINE}
        intro={<>One application per species, with up to <b>three</b> hunt choices in order. Odds are for a first choice at {nr ? `your saved points in the ${WY_POOL_LABEL[pool].toLowerCase()} pool` : 'the resident random draw'}: the next-draw projection where one passed our backtest, otherwise the last draw. {nr ? 'The regular and special pools draw separately; switch pools in Account.' : ''} Deer success is left off: WGFD&apos;s deer survey isn&apos;t validated per license yet.</>}
        costNote={<>WGFD charges the license price and the application fee when you apply; check WGFD&apos;s refund rules for what comes back if you don&apos;t draw. {nr ? 'Nonresident preference points are bought separately and aren\'t refundable. ' : ''}A $21.50 conservation stamp may also be required to hunt. Fees and dates from WGFD&apos;s fee list and dates page, checked Nov 14, 2026; neither prints a year. Not a complete total: no card fees. <a href="https://wgfd.wyo.gov/licenses-applications/license-fee-list">WGFD fees</a> · <a href="https://wgfd.wyo.gov/licenses-applications/application-dates-deadlines">WGFD dates</a> · <Link href="/guide">How the Wyoming draw works</Link></>} />
      <h2>General Seasons</h2>
      <p>{nr ? <>Nonresident general deer and elk licenses are drawn by region: they&apos;re in the lists above as Region licenses.</> : <>No application: residents buy general deer and elk licenses over the counter.</>} <Link href="/hunts?states=WY&type=GENERAL">General season hunts →</Link></p>
    </main>
  );
}
