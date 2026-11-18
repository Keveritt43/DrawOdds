import Link from 'next/link';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import { nmPo, nmPersonal, nmLicense, nmEligible, nmRestricted, NM_FEES, NM_DRAW_2026, type NmPointOdds } from '@/lib/nmHunt';
import { StatePlanner, type PlanApp, type PlanOpt, type PlanPrereq, type PlanTimelineStep } from './StatePlanner';

/**
 * New Mexico's How The Draw Works, What Changed and Application Planner: the same questions as the other states'
 * pages, with NMDOW's rules ("How New Mexico's Draw Works", and the 2026-27 Hunting Rules and Information booklet
 * pp. 15-19), checked against NMDOW's 2019-2026 Complete Drawing Odds reports in docs/states/nm-onboarding.md.
 */

const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
type Row = { id: string; slug: string; name: string; species: string; type: string; tagCode: string | null; tags: number | null; privateOnly: boolean; youthOnly: boolean;
  pointOdds: unknown; oddsByPts: unknown; success5: number | null; smallSample: boolean; antlerClass: string };
const SELECT = { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, youthOnly: true, pointOdds: true, oddsByPts: true, success5: true, smallSample: true, antlerClass: true } as const;

const NM_TIMELINE: PlanTimelineStep[] = [
  { when: 'Jan – Mar', what: `Apply for deer and elk (2026: closed ${NM_DRAW_2026.deadline})`, tone: 'blaze' },
  { when: 'Late April', what: `Results (2026: ${NM_DRAW_2026.results}); refunds go out for unsuccessful applications` },
  { when: 'Spring', what: 'Leftover licenses go on sale, first come' },
  { when: 'Sept – Jan', what: 'Deer and elk seasons (dates by hunt)', tone: 'good' },
];

function Timeline() {
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {NM_TIMELINE.map((s) => (
        <div key={s.when} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
          <div className="k">{s.when}</div>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div>
        </div>
      ))}
    </div>
  );
}

const first = (po: NmPointOdds | null, y: string, p: 'res' | 'nr' | 'out') => po?.history?.[y]?.[p] ?? null;
const totalApps = (po: NmPointOdds | null, y: string) => (['res', 'nr', 'out'] as const).reduce((a, p) => a + (first(po, y, p)?.[0] ?? 0), 0);

export async function NmGuide() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'NM' }, select: SELECT })) as unknown as Row[];
  const draw = rows.filter((r) => nmLicense(r) === 'draw');
  const lic = draw.reduce((a, r) => a + (r.tags ?? 0), 0);
  const sum = (p: 'res' | 'nr' | 'out', i: 0 | 1) => draw.reduce((a, r) => a + (first(nmPo(r), '2026', p)?.[i] ?? 0), 0);
  const nrOnly = draw.filter((r) => nmPo(r)?.nrEligible === false).length;
  const bull = draw.filter((r) => r.species === 'ELK' && r.antlerClass === 'ANTLERED' && !r.youthOnly && !nmRestricted(r) && (first(nmPo(r), '2026', 'nr')?.[0] ?? 0) >= 100)
    .sort((a, b) => totalApps(nmPo(b), '2026') - totalApps(nmPo(a), '2026'))[0];
  const bPo = bull ? nmPo(bull) : null;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>How The Draw Works · New Mexico</h1>
      <p className="muted">New Mexico has <b>no points</b>. Every deer and elk license except a few private-land deer licenses is drawn in one random lottery each spring, and a first-time applicant has the same chance as someone who has applied for twenty years. What decides your odds is the hunt you pick and the <b>pool</b> you apply in.</p>
      <Timeline />
      <p className="small muted">2026 dates; NMDOW posts the 2027 dates with the 2027–28 booklet.</p>

      <h2>A Random Number, Then Your Choices In Order</h2>
      <p>Each application gets a random sequence number. NMDOW&apos;s computer takes the applications in that order, one whole application at a time: it tries your <b>1st choice</b>, then your <b>2nd</b>, then your <b>3rd</b>, each only if your pool still has a license for it. So a hunt can be gone to earlier applicants&apos; 2nd and 3rd choices before a later applicant&apos;s 1st choice is even looked at, and listing a popular hunt as a backup rarely draws. After the main draw, leftover deer and elk licenses go to applicants who marked a <b>4th choice</b>: any license of the same weapon, antlerless included. The odds on this site are first-choice odds.</p>

      <h2>Three Pools</h2>
      <p>By state law, at least <b>84%</b> of each hunt&apos;s licenses go to residents, <b>10%</b> to residents or nonresidents who apply with a New Mexico outfitter (a signed contract), and <b>6%</b> to nonresidents on their own. A resident who applies in a party with nonresidents draws only if both pools have a license. Nonresidents can&apos;t apply for antlerless elk, WMA hunts or the resident-only hunts ({int(nrOnly)} of {int(draw.length)} in 2026–27).</p>
      <div className="stats">
        <div className="stat"><div className="k">Draw hunts, 2026–27</div><div className="v">{int(draw.length)}</div><div className="small muted">deer and elk</div></div>
        <div className="stat"><div className="k">Licenses</div><div className="v">{int(lic)}</div></div>
        <div className="stat"><div className="k">Residents, 2026</div><div className="v">{pct(sum('res', 1) / (sum('res', 0) || 1))}</div><div className="small muted">{int(sum('res', 1))} of {int(sum('res', 0))} first choices drew</div></div>
        <div className="stat"><div className="k">Nonresidents, 2026</div><div className="v">{pct(sum('nr', 1) / (sum('nr', 0) || 1))}</div><div className="small muted">{int(sum('nr', 1))} of {int(sum('nr', 0))}, no outfitter</div></div>
        <div className="stat"><div className="k">Outfitter pool, 2026</div><div className="v">{pct(sum('out', 1) / (sum('out', 0) || 1))}</div><div className="small muted">{int(sum('out', 1))} of {int(sum('out', 0))}</div></div>
      </div>
      {bull && bPo && <>
        <h3>Example: <Link href={`/hunts/${bull.slug}`}>{bull.name}</Link></h3>
        <p className="small">{int(bull.tags ?? 0)} licenses in 2026. First choices that drew: residents {first(bPo, '2026', 'res')?.[1]} of {int(first(bPo, '2026', 'res')?.[0] ?? 0)}, nonresidents {first(bPo, '2026', 'nr')?.[1]} of {int(first(bPo, '2026', 'nr')?.[0] ?? 0)}, outfitter pool {first(bPo, '2026', 'out')?.[1]} of {int(first(bPo, '2026', 'out')?.[0] ?? 0)}. Six percent of a small hunt can round to one or two licenses, so a nonresident&apos;s odds swing with how many applied.</p>
      </>}
      <p className="small muted"><b>Next-draw estimates.</b> With no points, nothing carries over but demand. Residents&apos; estimate pools the last two draws; the nonresident and outfitter pools use the last draw pulled toward the last three by how few applied (small pools swing more). Chosen on 2021, 2022 and 2025 and checked on 2026, each beat &ldquo;same as last year&rdquo; for its pool (docs/states/nm-onboarding.md §4). <b>For 2027–28 NMDOW is rewriting the deer and elk rules and renumbering every hunt</b>; until that booklet is out, the estimate is for each hunt as it stands now. The Attorney General&apos;s Oct 2026 opinion that the 10% outfitter set-aside is unconstitutional is not binding; the legislature may change the pools in the January 2027 session.</p>

      <h2>Private Land</h2>
      <p>In Units 2A, 2B, 2C, 4 and 5A, private-land deer licenses are drawn too, but you need an authorization code from a participating landowner to apply. In Units 8, 46, 54, 55A and 55B, private-land deer licenses are sold over the counter with no limit (2026–27 booklet p. 53). Private-land elk (EPLUS landowner authorizations) aren&apos;t on this site. Private-land-only hunts are hidden in Find Hunts unless you show them.</p>

      <h2>What It Costs</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Item</th><th>Resident</th><th>Nonresident</th></tr></thead><tbody>
        <tr><td>Game-hunting license (needed to apply, not refunded)</td><td>{usd(NM_FEES.gameHunting.res)}</td><td>{usd(NM_FEES.gameHunting.nr)}</td></tr>
        <tr><td>Habitat Management &amp; Access Validation</td><td>{usd(NM_FEES.hmav)}</td><td>{usd(NM_FEES.hmav)}</td></tr>
        <tr><td>Habitat stamp (Forest Service or BLM land)</td><td>{usd(NM_FEES.habitatStamp)}</td><td>{usd(NM_FEES.habitatStamp)}</td></tr>
        <tr><td>Deer license, standard / quality or high-demand</td><td>{usd(NM_FEES.deer.S.res)}</td><td>{usd(NM_FEES.deer.S.nr)} / {usd(NM_FEES.deer.Q.nr)}</td></tr>
        <tr><td>Elk license, standard / quality or high-demand</td><td>{usd(NM_FEES.elk.S.res)}</td><td>{usd(NM_FEES.elk.S.nr)} / {usd(NM_FEES.elk.Q.nr)}</td></tr>
        <tr><td>Antlerless elk</td><td>{usd(NM_FEES.elk.A.res)}</td><td>Not issued</td></tr>
        <tr><td>Kept from the license fee if you don&apos;t draw</td><td>{usd(NM_FEES.appFee.res)}</td><td>{usd(NM_FEES.appFee.nr)}</td></tr>
      </tbody></table></div>
      <p className="small muted">NMDOW charges the full deer or elk license fee with the application and refunds it, less the application fee, if you don&apos;t draw. 2026–27 booklet pp. 15–17; NMDOW&apos;s 2027–28 draw fee sheet lists the same license prices (checked {NM_FEES.checked}). Junior and senior residents pay less. Confirm with NMDOW before you apply.</p>
      <p><Link href="/hunts?states=NM">Find New Mexico hunts →</Link> · <Link href="/changes">What changed since last year</Link> · <Link href="/account#hunting-preferences">Set your New Mexico residency and pool</Link></p>
    </main>
  );
}

export async function NmChanges() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'NM', type: 'CONTROLLED' }, select: SELECT })) as unknown as Row[];
  const cmp = rows.map((r) => {
    const po = nmPo(r);
    return { r, l25: po?.history?.['2025']?.licenses ?? null, l26: po?.history?.['2026']?.licenses ?? null, a25: po?.history?.['2025'] ? totalApps(po, '2025') : null, a26: po?.history?.['2026'] ? totalApps(po, '2026') : null };
  });
  const lic = cmp.filter((c) => c.l25 !== null && c.l26 !== null && c.l25 !== c.l26).sort((a, b) => Math.abs(b.l26! - b.l25!) - Math.abs(a.l26! - a.l25!)).slice(0, 40);
  const swings = cmp.filter((c) => c.a25 !== null && c.a26 !== null && c.a25 >= 100 && c.a26 > 0).sort((a, b) => Math.abs(b.a26! / b.a25! - 1) - Math.abs(a.a26! / a.a25! - 1)).slice(0, 40);
  const sp = (s: string) => (s === 'ELK' ? 'sp-elk' : 'sp-deer');
  const name = (r: Row) => <><span className={`pill ${sp(r.species)}`}>{r.tagCode}</span> <Link href={`/hunts/${r.slug}`}>{r.name}</Link></>;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · New Mexico</h1>
      <p className="muted">2026 draw against 2025, same hunt codes: <a href="#licenses">More or fewer licenses ({lic.length})</a> · <a href="#apps">Application swings ({swings.length})</a> · <a href="#next">Coming for 2027–28</a></p>

      <h2 id="licenses">More Or Fewer Licenses</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025</th><th>2026</th><th>Change</th><th>2026 first choices</th></tr></thead>
        <tbody>{lic.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.l25!)}</td><td>{int(c.l26!)}</td><td className={c.l26! > c.l25! ? 'best' : ''}>{c.l26! > c.l25! ? '+' : ''}{int(c.l26! - c.l25!)}</td><td>{c.a26 === null ? '–' : int(c.a26)}</td></tr>)}</tbody></table></div>
      {!lic.length && <p className="muted">No license changes between the 2025 and 2026 draws: license numbers are set for the 2023–2027 rule.</p>}

      <h2 id="apps">Application Swings</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025 first choices</th><th>2026 first choices</th><th>Change</th></tr></thead>
        <tbody>{swings.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.a25!)}</td><td>{int(c.a26!)}</td><td>{c.a26! > c.a25! ? '+' : ''}{Math.round((c.a26! / c.a25! - 1) * 100)}%</td></tr>)}</tbody></table></div>
      <p className="small muted">Hunts with at least 100 first-choice applications in 2025, every pool together. NMDOW Complete Drawing Odds reports.</p>

      <h2 id="next">Coming For 2027–28</h2>
      <ul>
        <li><b>New deer and elk rules, new hunt codes.</b> The current rules run through March 31, 2027. NMDOW opened the deer (19.31.13) and elk (19.31.14) rules in February 2026 and is renumbering every hunt (for example ELK-2-264 becomes ELK-15-B1-ES-PUB); license numbers and seasons are being reset. This site keeps today&apos;s hunts until the 2027–28 booklet is published.</li>
        <li><b>The outfitter pool may change.</b> An Oct 2026 Attorney General opinion says the 10% outfitter set-aside violates the state constitution&apos;s anti-donation clause. It isn&apos;t binding; legislators have said they&apos;ll take it up in the January 2027 session.</li>
      </ul>
      <p><Link href="/guide">How the New Mexico draw works</Link> · <Link href="/hunts?states=NM">Find New Mexico hunts →</Link></p>
    </main>
  );
}

/**
 * New Mexico Application Planner: one deer application and one elk application, three choices each (deer and elk
 * may add a 4th choice for leftovers). This page shows, for the hunter's pool, the hunts with the best estimated
 * first-choice odds and the best draw-and-fill.
 */
export async function NmPlannerPage({ signedIn }: { signedIn: boolean }) {
  const { getPointsStore } = await import('@/lib/points');
  const { readNmSettings, NM_POOL_LABEL, nmPool } = await import('@/lib/nmSettings');
  const set = readNmSettings((await getPointsStore()).store as Record<string, unknown>);
  const nr = set.res === 'NONRESIDENT';
  const rows = (await db.huntSummary.findMany({ where: { state: 'NM', type: 'CONTROLLED', privateOnly: false }, select: SELECT })) as unknown as Row[];
  const usable = rows.filter((r) => nmEligible(r, set) && !nmRestricted(r));
  const opts: PlanOpt[] = usable.map((r) => {
    const m = nmPersonal(r, set);
    return { id: r.id, href: `/hunts/${r.slug}`, code: r.tagCode ?? r.id.slice(3), where: r.name, app: r.species, odds: m.odds, basis: m.basis,
      success: r.success5 !== null && !r.smallSample ? r.success5 : null };
  });
  const app = (sp: 'DEER' | 'ELK'): PlanApp => ({
    key: sp, label: sp === 'DEER' ? 'Deer' : 'Elk', choices: 3,
    when: `Apply in the spring draw (2026: closed ${NM_DRAW_2026.deadline}) · results late April`,
    points: `No points: ${NM_POOL_LABEL[nmPool(set)].toLowerCase()}`,
    price: NM_FEES.appFee[nr ? 'nr' : 'res'], needs: ['HUNT'],
    later: 'Your random number decides when your application is looked at; then NMDOW tries your 1st, 2nd and 3rd choice in order. A popular hunt as a 2nd or 3rd choice is usually gone by then. Marking a 4th choice puts you in the leftover drawing for any license of your 1st choice\'s weapon.',
    suggest: opts.filter((o) => o.app === sp && o.odds !== null && o.success !== null).sort((a, b) => b.odds! * b.success! - a.odds! * a.success!).slice(0, 3).map((o) => o.id),
    ifDrawn: [{ label: `${sp === 'DEER' ? 'deer' : 'elk'} license (charged with the application; refunded less the application fee if you don't draw)`,
      amount: sp === 'DEER' ? NM_FEES.deer.S[nr ? 'nr' : 'res'] : NM_FEES.elk.S[nr ? 'nr' : 'res'] }],
  });
  const prereq: PlanPrereq[] = [{ label: 'Game-hunting license + HMAV', amount: NM_FEES.gameHunting[nr ? 'nr' : 'res'] + NM_FEES.hmav, covers: ['HUNT'] }];
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · New Mexico</h1>
      <StatePlanner state="NM" apps={[app('DEER'), app('ELK')]} opts={opts} prereq={prereq} signedIn={signedIn} set={set.set} setLabel="Set your New Mexico residency and pool"
        timeline={NM_TIMELINE}
        intro={<>One deer application and one elk application, <b>three choices</b> each. No points, so nothing builds up: every year is a fresh draw. Odds are next-draw estimates for your pool ({NM_POOL_LABEL[nmPool(set)].toLowerCase()}), as a first choice.{nr ? ' Antlerless elk, WMA and resident-only hunts are left out: NMDOW doesn\'t issue them to nonresidents.' : ''} Mobility-impaired and military-only hunts are in Find Hunts.</>}
        costNote={<>NMDOW charges the full license fee when you apply and refunds it, less the application fee shown, if you don&apos;t draw; quality and high-demand hunts cost nonresidents more ($623 deer, $998 elk). A habitat stamp ($10) is also needed to hunt Forest Service or BLM land. 2026–27 booklet; 2027–28 fee sheet (same prices), checked {NM_FEES.checked}. <Link href="/guide">How the New Mexico draw works</Link> · <Link href="/changes">What changed since last year</Link></>} />
    </main>
  );
}
