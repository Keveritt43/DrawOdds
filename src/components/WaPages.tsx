import Link from 'next/link';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import { waPo, waPersonal, waLicense, waIsMsg, WA_MSG_FEES, type WaOddsTable, type WaPointOdds } from '@/lib/waHunt';
import { WaOddsPointsChart } from './WaCharts';
import { StatePlanner, type PlanApp, type PlanOpt, type PlanPrereq, type PlanTimelineStep } from './StatePlanner';

/**
 * Washington's How The Draw Works, What Changed and Application Planner: the same questions as the other states'
 * pages, with WDFW's rules (2026 Big Game Hunting Seasons and Regulations pamphlet pp. 15-19; checked against WDFW's
 * own point-level results in docs/states/wa-onboarding.md §3 and §5).
 *
 * Dates: the 2026 pamphlet (special permits Apr 20 - May 20, 2026; multi-season Dec 1, 2026 - Mar 31, 2027).
 * Fees: WDFW's big-game license page, checked Nov 12, 2026 (no season year on the page).
 */

const LIMITED = new Set(['SENIOR_DEER', 'SENIOR_ELK', 'DISABLED_DEER', 'DISABLED_ELK', 'MASTER_DEER', 'MASTER_ELK', 'MOOSE_SENIOR', 'MOOSE_DISABLED', 'SHEEP_DIS_EWE', 'SHEEP_DIS_JUV']);
const MSG_TYPES = new Set(['MOOSE_BULL', 'MOOSE_ANTLERLESS', 'MOOSE_YOUTH', 'MOOSE_SENIOR', 'MOOSE_DISABLED', 'GOAT', 'SHEEP_RAM', 'SHEEP_EWE', 'SHEEP_JUV', 'SHEEP_YOUTH', 'SHEEP_DIS_EWE', 'SHEEP_DIS_JUV']);
const ONCE_TYPES = new Set(['MOOSE_BULL', 'GOAT', 'SHEEP_RAM']);
const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
type Row = { id: string; slug: string; name: string; species: string; type: string; tagCode: string | null; tags: number | null; privateOnly: boolean; youthOnly: boolean;
  pointOdds: unknown; oddsByPts: unknown; success5: number | null; smallSample: boolean };
const SELECT = { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, youthOnly: true, pointOdds: true, oddsByPts: true, success5: true, smallSample: true } as const;

const FEES: [string, string, string, string][] = [
  ['Deer license (includes the general tag)', '$61.70', '$599.07', '$29.82'],
  ['Elk license (includes the general tag)', '$69.29', '$685.60', '$29.82'],
  ['Deer + elk license', '$116.85', '$1,020.06', '$56.13'],
  ['Special permit application, per category', '$9.61', '$152.30', '$5.05'],
  ['Quality special permit application, per category', '$18.72', '$152.30', '$5.05'],
  ['Multi-season deer or elk application', '$9.61', '$152.30', '$5.05'],
  ['Multi-season deer tag, if drawn', '$191.77', '$191.77', '$191.77'],
  ['Multi-season elk tag, if drawn', '$250.97', '$250.97', '$250.97'],
  ['Second deer tag (second-deer permits)', '$68.48', '$356.90', '$30.86'],
];

const WA_TIMELINE: PlanTimelineStep[] = [
  { when: 'Apr 20 – May 20', what: 'Special permit applications (2026). Each application buys a point.', tone: 'blaze' },
  { when: 'By end of June', what: 'Special permit results' },
  { when: 'Aug – Jan', what: 'General seasons (dates by weapon and GMU)', tone: 'good' },
  { when: 'Dec 1 – Mar 31', what: 'Multi-season tag applications for the next year', tone: 'blaze' },
  { when: 'April', what: 'Multi-season results; unbought tags go on sale' },
];

function Timeline() {
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {WA_TIMELINE.map((s) => (
        <div key={s.when} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
          <div className="k">{s.when}</div>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div>
        </div>
      ))}
    </div>
  );
}

const apps = (po: WaPointOdds | null, y: string) => po?.demand?.[y]?.apps ?? null;
const permitsIn = (po: WaPointOdds | null, y: string) => po?.demand?.[y]?.permits ?? null;

export async function WaGuide() {
  const all = (await db.huntSummary.findMany({ where: { state: 'WA' }, select: SELECT })) as unknown as Row[];
  const rows = all.filter((r) => !waIsMsg(r.species));
  const msgRows = all.filter((r) => waIsMsg(r.species));
  const msgBy = (sp: string) => msgRows.filter((r) => r.species === sp);
  const msgPermits = (sp: string) => msgBy(sp).reduce((a, r) => a + (r.tags ?? 0), 0);
  const msgEx = msgRows.filter((r) => waPo(r)?.onceInALifetime && (r.oddsByPts as WaOddsTable | null)?.proj?.nr?.length).sort((a, b) => (apps(waPo(b), '2025') ?? 0) - (apps(waPo(a), '2025') ?? 0))[0];
  const special = rows.filter((r) => waLicense(r) === 'special' && !r.youthOnly && !waPo(r)?.restricted);
  const youth = rows.filter((r) => waLicense(r) === 'special' && r.youthOnly);
  const restricted = (k: string) => rows.filter((r) => waPo(r)?.restricted && (waPo(r)?.category ?? '').includes(k));
  const multi = rows.filter((r) => waLicense(r) === 'multi');
  const general = rows.filter((r) => waLicense(r) === 'general');
  const permits = special.reduce((a, r) => a + (r.tags ?? 0), 0);
  const apps25 = special.reduce((a, r) => a + (apps(waPo(r), '2025') ?? 0), 0);
  const example = special.filter((r) => !r.privateOnly).sort((a, b) => (apps(waPo(b), '2025') ?? 0) - (apps(waPo(a), '2025') ?? 0))[0];
  const ex = example?.oddsByPts as WaOddsTable | undefined;
  const exPo = example ? waPo(example) : null;
  const ms = (sp: string) => multi.find((r) => r.species === sp);
  const msLine = (sp: string) => { const r = ms(sp); const po = r ? waPo(r) : null; return r ? `${int(r.tags ?? 0)} tags, ${int(apps(po, '2025') ?? 0)} applications in 2025` : '–'; };
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>How The Draw Works · Washington</h1>
      <p className="muted">Washington has three kinds of deer and elk hunting: <b>general seasons</b> on an over-the-counter tag, <b>special permits</b> drawn with points, and the <b>multi-season tag</b> drawing. Everything starts with a license and one general tag, and the tag you pick decides what you can hunt and apply for.</p>
      <Timeline />
      <p className="small muted">2026 dates from WDFW&apos;s 2026 Big Game Hunting Seasons and Regulations pamphlet; the multi-season window shown is for 2027 tags.</p>

      <h2>General Seasons: Pick One Tag</h2>
      <p>A deer or elk license comes with one general tag, and you choose its weapon: <b>modern firearm, archery or muzzleloader</b>. You hunt that weapon&apos;s general seasons only. Elk tags also pick a side of the state: <b>Eastern or Western Washington</b>, with no switching. No draw and no cap for residents or nonresidents. The legal animal changes by GMU and season (any buck, 3-point minimum, spike only, any elk), so check each hunt&apos;s season list. There are {int(general.length)} GMU and weapon combinations in the 2026 tables. Some GMUs are permit only (no general season at all), such as 653 White River and 485 Green River for elk.</p>

      <h2>Special Permits: Points, Squared</h2>
      <p>Special permits are applied for by <b>category</b> (Quality, Buck and Antlerless deer, Second Deer; Quality, Bull and Antlerless elk). You list up to four hunts in a category (two for Quality), all with the weapon and side your general tag allows. Each application gets <b>(points held + 1)² entries</b>: this year&apos;s application counts as a point before the draw, then the total is squared. Not drawing keeps the points plus one; drawing resets that category to zero. Residents and nonresidents are in one drawing with no nonresident cap.</p>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Points held</th><th>Entries</th><th>Against 0 points</th></tr></thead>
        <tbody>{[0, 1, 4, 9, 14, 19, 24].map((p) => <tr key={p}><td>{p}</td><td>{int((p + 1) ** 2)}</td><td>{int((p + 1) ** 2)}×</td></tr>)}</tbody></table></div>
      <p className="small muted">Groups of up to eight deer or elk hunters (two for multi-season; fewer where a hunt has fewer permits) average their points and draw as one. Points are kept separately for each category, so Quality deer points don&apos;t help a Buck deer application.</p>
      <div className="stats">
        <div className="stat"><div className="k">Special permit hunts, 2026</div><div className="v">{int(special.length)}</div><div className="small muted">deer and elk, main categories</div></div>
        <div className="stat"><div className="k">Permits, 2026</div><div className="v">{int(permits)}</div></div>
        <div className="stat"><div className="k">Applications, 2025</div><div className="v">{int(apps25)}</div><div className="small muted">every choice counted</div></div>
      </div>
      {example && ex && <>
        <h3>Example: <Link href={`/hunts/${example.slug}`}>{example.name}</Link></h3>
        <p className="small">{int(example.tags ?? 0)} permits for {int(apps(exPo, '2025') ?? 0)} applications. Squaring makes points count, but it never shuts anyone out: even here a hunter with no points has a chance, just a small one.</p>
        <WaOddsPointsChart main={ex.proj.nr ?? ex.last.nr ?? []} other={ex.last.nr ?? []} myPoints={null} year={exPo?.projYear ?? 2027} otherYear={exPo?.year ?? 2025} projected />
      </>}
      <p className="small muted"><b>These odds are estimates.</b> WDFW stopped publishing results by point level after 2020. Each hunt starts from WDFW&apos;s 2020 table of applicants at every point level (or its category&apos;s pooled table when the hunt has none) and is rolled forward a year at a time: everyone who didn&apos;t draw comes back with one more point, winners leave, and new applicants make up the count each year&apos;s pamphlet prints. Tested on WDFW&apos;s 2018, 2019 and 2020 results, this beat simply repeating last year&apos;s odds every year. Choices after the first are not modelled: a hunt&apos;s odds assume you list it first.</p>

      <h2>Youth Permits (Under 16)</h2>
      <p>Hunters <b>under 16 when they buy the license and application</b>, resident or nonresident, can apply in the <b>Deer - Youth</b> and <b>Elk - Youth</b> categories as well as the adult ones. Youth permits are drawn the same way, points squared, but each youth category has its own points. {int(youth.length)} youth hunts in 2026 ({int(youth.reduce((a, r) => a + (r.tags ?? 0), 0))} permits), many of them antlerless or any-deer hunts with far better odds than the adult categories. Youth license and application fees are a fraction of adult prices (below). Youth hunts are hidden in Find Hunts until you pick a youth category or set Youth Hunts to Include.</p>
      <p className="small muted">The youth odds are rolled forward the same way, except that only about 70% of youth who don&apos;t draw are assumed to apply again, since applicants age out at 16. That share was picked on WDFW&apos;s 2019 youth results and held on 2020&apos;s; it beat repeating last year&apos;s odds both years. Many youth also hunt general seasons with extra antlerless days; those youth general seasons are in the pamphlet.</p>

      <h2>65 And Over, Hunters With Disabilities, Master Hunters</h2>
      <p>Three more categories, each with its own points and the same squared drawing, are open only to some hunters: <b>65 or older</b> at some time during the license year ({int(restricted('65').length)} hunts in 2026), hunters <b>registered with WDFW as hunters with disabilities</b> ({int(restricted('Disabilities').length)}), and certified <b>Master Hunters</b> ({int(restricted('Master').length)}). Most are antlerless or any-deer hunts with a handful of permits. Master Hunter permits are mostly damage hunts in designated areas WDFW announces to the hunters drawn; this site shows the whole WDFW region for those. In Find Hunts these show only when you pick their category.</p>
      <p className="small muted">WDFW has never published 65+ results by point level, so 65+ hunts show applications and permits but no odds at your points (borrowing another category&apos;s point mix tested worse than not estimating). Hunters-with-disabilities and Master Hunter odds start from WDFW&apos;s 2018–2020 tables for those categories and are rolled forward like the others; that beat repeating last year&apos;s odds on 2019 and 2020.</p>

      <h2>Multi-Season Tags</h2>
      <p>A multi-season tag lets you hunt <b>every general season for that species, any weapon, either side of the state</b>, and apply for special permits with any weapon. It is drawn once a year with its own points, squared the same way. Deer: {msLine('DEER')}. Elk: {msLine('ELK')}. Winners must buy the tag, and every year thousands of drawn deer tags go unbought and are then sold to applicants who didn&apos;t draw, so a deer applicant&apos;s real chance is higher than the drawn odds.</p>

      <h2>Moose, Bighorn Sheep And Mountain Goat</h2>
      <p>The same squared drawing, applied for in the same April 20 – May 20 window, by category: <b>Any Antlered Bull Moose</b>, <b>Antlerless Moose</b>, <b>Mountain Goat</b>, <b>Any Ram</b>, <b>Adult Ewe</b>, <b>Juvenile Ram</b>, plus youth, 65+ and disabled-hunter categories. Each category keeps its own points, and you may list up to four hunts in each. 2026 has {int(msgBy('MOOSE').length)} moose hunts ({int(msgPermits('MOOSE'))} permits), {int(msgBy('BIGHORN').length)} bighorn sheep hunts ({int(msgPermits('BIGHORN'))} permits) and {int(msgBy('GOAT').length)} mountain goat hunts ({int(msgPermits('GOAT'))} permits), for tens of thousands of applications: most hunts draw well under 1% at any points.</p>
      <p><b>Once in a lifetime, but only after a harvest.</b> Bull moose, any ram and goat are once in a lifetime: once you <b>report harvesting</b> one on that category&apos;s permit (or don&apos;t file your hunting report), WDFW won&apos;t sell you another application in it. Drawing and not taking an animal doesn&apos;t end your eligibility, though it resets your points. Antlerless moose, ewe and juvenile ram can be applied for every year, even after a harvest. Goats taken on auction, raffle or conflict permits don&apos;t count; raffles and auctions are separate and open every year.</p>
      <p><b>You only buy the license if you draw:</b> {`$${WA_MSG_FEES.license.res.toFixed(2)}`} resident, {`$${WA_MSG_FEES.license.nr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} nonresident, {`$${WA_MSG_FEES.license.youth.toFixed(2)}`} youth. Applying costs {`$${WA_MSG_FEES.appHigh.res.toFixed(2)}`} (bull moose, ram, goat) or {`$${WA_MSG_FEES.app.res.toFixed(2)}`} (other categories) for residents, {`$${WA_MSG_FEES.app.nr.toFixed(2)}`} for nonresidents, and is not refunded. Groups are limited to two.</p>
      {msgEx && <>
        <h3>Example: <Link href={`/hunts/${msgEx.slug}`}>{msgEx.name}</Link></h3>
        <p className="small">{int(msgEx.tags ?? 0)} permits for {int(apps(waPo(msgEx), '2025') ?? 0)} applications in 2025.</p>
        <WaOddsPointsChart main={(msgEx.oddsByPts as WaOddsTable).proj.nr ?? []} other={(msgEx.oddsByPts as WaOddsTable).last.nr ?? []} myPoints={null} year={waPo(msgEx)?.projYear ?? 2027} otherYear={waPo(msgEx)?.year ?? 2025} projected />
      </>}
      <p className="small muted">Odds are estimated the deer-and-elk way, from WDFW&apos;s 2018–2020 moose, goat and sheep point tables rolled forward through the applications WDFW printed each year since. Checked on 2019 and 2020, that beat last year&apos;s odds for moose, goat and sheep separately; the model&apos;s average winner points since stay within what the luck of the draw explains (docs/states/wa-onboarding.md §10). Three sheep hunts are new in 2026 and the disabled-hunter ewe category has never been published by points, so those show no odds at your points. <Link href="/hunts?states=WA&draw=msg">Find Washington moose, sheep and goat hunts →</Link></p>

      <h2>What It Costs</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Item</th><th>Resident</th><th>Nonresident</th><th>Youth (under 16)</th></tr></thead>
        <tbody>{FEES.map(([k, r, n, y]) => <tr key={k}><td>{k}</td><td>{r}</td><td>{n}</td><td>{y}</td></tr>)}</tbody></table></div>
      <p className="small muted">Youth prices are the same for residents and nonresidents. WDFW&apos;s big game license page, checked Nov 12, 2026 (it carries no season year). Applying requires the matching license and tag. Confirm with WDFW before you apply.</p>
      <p><Link href="/hunts?states=WA">Find Washington hunts →</Link> · <Link href="/changes">What changed since last year</Link> · <Link href="/account#hunting-preferences">Set your Washington points</Link></p>
    </main>
  );
}

export async function WaChanges() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'WA', type: 'CONTROLLED' }, select: SELECT })) as unknown as Row[];
  const special = rows.filter((r) => waLicense(r) !== 'general');
  const cmp = special.map((r) => {
    const po = waPo(r);
    return { r, p25: permitsIn(po, '2025'), p26: r.tags, a24: apps(po, '2024'), a25: apps(po, '2025') };
  });
  // first drawing with published applications; WDFW prints NEW (or 0/0) for a hunt's first year, and the site
  // leaves out hunts with no applications yet, since there's nothing to estimate odds from
  const first = (r: Row) => Math.min(...Object.entries(waPo(r)?.demand ?? {}).filter(([, d]) => (d.apps ?? 0) > 0).map(([y]) => Number(y)));
  const fresh = cmp.filter((c) => first(c.r) >= 2024 && !c.r.privateOnly).sort((a, b) => first(b.r) - first(a.r));
  const permits = cmp.filter((c) => c.p25 !== null && c.p26 !== null && c.p25 !== c.p26 && (c.a25 ?? 0) > 0)
    .sort((a, b) => Math.abs(b.p26! - b.p25!) - Math.abs(a.p26! - a.p25!) || (b.a25 ?? 0) - (a.a25 ?? 0)).slice(0, 40);
  const swings = cmp.filter((c) => c.a24 !== null && c.a25 !== null && c.a24 >= 100 && c.a25 > 0)
    .sort((a, b) => Math.abs(b.a25! / b.a24! - 1) - Math.abs(a.a25! / a.a24! - 1)).slice(0, 40);
  const sp = (s: string) => (s === 'ELK' ? 'sp-elk' : s === 'DEER' ? 'sp-deer' : 'sp-msg');
  const name = (r: Row) => <><span className={`pill ${sp(r.species)}`}>{r.tagCode}</span> <Link href={`/hunts/${r.slug}`}>{r.name}</Link></>;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · Washington</h1>
      <p className="muted">Special permits in the 2026 pamphlet against the 2025 one: <a href="#permits">More or fewer permits ({permits.length})</a> · <a href="#apps">Application swings ({swings.length})</a> · <a href="#new">New in 2024 or 2025 ({fresh.length})</a></p>
      <p className="small">WDFW prints each hunt&apos;s previous-year applications (every choice counted) beside its permits. It renumbers hunts between years, so hunts are matched by name, tag, area and legal animal; a hunt that looks new may be an old one under a new name.</p>

      <h2 id="permits">More Or Fewer Permits</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025</th><th>2026</th><th>Change</th><th>2025 applications</th></tr></thead>
        <tbody>{permits.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.p25!)}</td><td>{int(c.p26!)}</td><td className={c.p26! > c.p25! ? 'best' : ''}>{c.p26! > c.p25! ? '+' : ''}{int(c.p26! - c.p25!)}</td><td>{c.a25 === null ? '–' : int(c.a25)}</td></tr>)}</tbody></table></div>

      <h2 id="apps">Application Swings</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2024 applications</th><th>2025 applications</th><th>Change</th><th>Permits ÷ applications, 2025</th></tr></thead>
        <tbody>{swings.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.a24!)}</td><td>{int(c.a25!)}</td><td>{c.a25! > c.a24! ? '+' : ''}{Math.round((c.a25! / c.a24! - 1) * 100)}%</td><td>{c.p25 ? pct(c.p25 / c.a25!) : '–'}</td></tr>)}</tbody></table></div>
      <p className="small muted">Hunts with at least 100 applications in 2024. 2026 applications are published in the 2027 pamphlet. Permits ÷ applications is a rough guide only: points decide who draws.</p>

      <h2 id="new">New In 2024 Or 2025</h2>
      <p className="small muted">Hunts whose first published applications are for the 2024 or 2025 drawing, so they have only a year or two of history (private-land-only hunts left out). Hunts new in 2026 (WDFW prints NEW or 0/0, such as the rebuilt Alkali antlerless hunts) have no applications yet and no odds on this site; find them in the pamphlet.</p>
      <ul>{fresh.slice(0, 80).map((c) => <li key={c.r.id}>{name(c.r)} · first drawn {first(c.r)} · {int(c.p26 ?? 0)} permits in 2026</li>)}</ul>
      <p className="small muted">General seasons: this site has the 2026 season tables only, so season changes from 2025 aren&apos;t listed yet.</p>
      <p><Link href="/guide">How the Washington draw works</Link> · <Link href="/hunts?states=WA">Find Washington hunts →</Link></p>
    </main>
  );
}

/**
 * Washington Application Planner. Each category is a separate application with up to four choices (two for Quality),
 * and points are per category, so the plan is: for each category you hold points in, which hunts to list. This page
 * shows, at the hunter's saved points, the hunts with the best estimated odds and the best draw-and-fill, limited to
 * hunts the saved general tag can apply for.
 */
export async function WaPlannerPage({ signedIn }: { signedIn: boolean }) {
  const { getPointsStore } = await import('@/lib/points');
  const { readWaPoints, WA_POINT_TYPES } = await import('@/lib/waPoints');
  const pts = readWaPoints((await getPointsStore()).store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const rows = (await db.huntSummary.findMany({ where: { state: 'WA', type: 'CONTROLLED', privateOnly: false }, select: SELECT })) as unknown as Row[];
  const scored = rows.map((r) => ({ r, ...waPersonal(r, pts) })).filter((x) => x.type !== null && x.tagOk !== false);
  const blocked = rows.map((r) => ({ r, ...waPersonal(r, pts) })).filter((x) => x.type !== null && x.tagOk === false).length;
  const fee = (row: string, youth: boolean) => Number(FEES.find(([k]) => k === row)![youth ? 3 : nr ? 2 : 1].replace(/[$,]/g, ''));
  const opts: PlanOpt[] = scored.map((x) => ({
    id: x.r.id, href: `/hunts/${x.r.slug}`, code: x.r.tagCode ?? x.r.id.slice(3), where: x.r.name, app: x.type!,
    odds: x.odds, basis: x.basis, success: x.r.success5 !== null && !x.r.smallSample ? x.r.success5 : null,
  }));
  const apps: PlanApp[] = WA_POINT_TYPES.filter((t) => opts.some((o) => o.app === t.key) && (!LIMITED.has(t.key) || pts.points[t.key] > 0)).map((t) => {
    const youth = t.key.startsWith('YOUTH') || t.key === 'MOOSE_YOUTH' || t.key === 'SHEEP_YOUTH';
    const ms = t.key === 'MS_DEER' || t.key === 'MS_ELK';
    const quality = t.key.startsWith('QUALITY');
    const msgT = MSG_TYPES.has(t.key);
    const mine = opts.filter((o) => o.app === t.key);
    const n = pts.points[t.key];
    return {
      key: t.key, label: t.label, choices: ms ? 1 : quality ? 2 : 4,
      when: ms ? 'Apply Dec 1 – Mar 31 for the next year · results in April' : 'Apply Apr 20 – May 20 (2026 dates) · results by end of June',
      points: `Your ${t.label.toLowerCase()} points: ${n} (${int((n + 1) ** 2)} entr${n === 0 ? 'y' : 'ies'}); applying adds one whether or not you draw`,
      price: msgT ? (youth ? 5.05 : (ONCE_TYPES.has(t.key) ? WA_MSG_FEES.appHigh : WA_MSG_FEES.app)[nr ? 'nr' : 'res'])
        : fee(ms ? 'Multi-season deer or elk application' : quality ? 'Quality special permit application, per category' : 'Special permit application, per category', youth),
      needs: ms || msgT ? [] : [t.species], group: youth ? 'youth' : undefined,
      later: 'When your turn comes in the drawing, WDFW gives you your first choice that still has a permit, so a later choice only counts if every earlier one is gone by then.',
      suggest: mine.filter((o) => o.odds !== null && o.success !== null).sort((a, b) => b.odds! * b.success! - a.odds! * a.success!).slice(0, 4).map((o) => o.id),
      ifDrawn: t.key === 'MS_DEER' ? [{ label: 'multi-season deer tag', amount: fee('Multi-season deer tag, if drawn', false) }]
        : t.key === 'MS_ELK' ? [{ label: 'multi-season elk tag', amount: fee('Multi-season elk tag, if drawn', false) }]
        : t.key === 'SECOND_DEER' ? [{ label: 'second deer tag', amount: fee('Second deer tag (second-deer permits)', youth) }]
        : msgT ? [{ label: `${t.species === 'MOOSE' ? 'moose' : t.species === 'GOAT' ? 'goat' : 'sheep'} license and tag`, amount: youth ? WA_MSG_FEES.license.youth : WA_MSG_FEES.license[nr ? 'nr' : 'res'] }] : undefined,
    };
  });
  const prereq: PlanPrereq[] = [false, true].flatMap((youth) => [
    { label: 'Deer license and general tag', amount: fee('Deer license (includes the general tag)', youth), covers: ['DEER'], group: youth ? 'youth' : undefined },
    { label: 'Elk license and general tag', amount: fee('Elk license (includes the general tag)', youth), covers: ['ELK'], group: youth ? 'youth' : undefined },
    { label: 'Deer + elk license', amount: fee('Deer + elk license', youth), covers: ['DEER', 'ELK'], group: youth ? 'youth' : undefined },
  ]);
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · Washington</h1>
      <StatePlanner state="WA" apps={apps} opts={opts} prereq={prereq} signedIn={signedIn} set={pts.set} setLabel="Set your Washington points and tags"
        timeline={WA_TIMELINE}
        intro={<>Each category is its own application, with its own points: list up to <b>four</b> hunts in each (<b>two</b> for Quality). Odds are WDFW-style estimates at your saved points, the 2027 projection, as a first choice. Residents and nonresidents draw together, so residency changes the cost, not the odds ({nr ? 'nonresident' : 'resident'} prices below). {blocked > 0 ? `${int(blocked)} hunts your saved general tag can't apply for are left out.` : pts.deerTag || pts.elkTag ? '' : 'Save your general tags to leave out hunts you can\'t apply for.'} 65+, hunters-with-disabilities and Master Hunter categories show once you save points in them.</>}
        costNote={<>WDFW&apos;s big game license page, checked Nov 12, 2026 (it carries no season year). A special permit application needs the matching license and general tag first, and youth prices apply if you pick a youth category. The application fee buys your point and isn&apos;t refunded. This page doesn&apos;t say whether a multi-season application needs the license too; check with WDFW. Not a complete total: no transaction fees. <Link href="/guide">How the Washington draw works</Link> · <Link href="/changes">What changed since last year</Link></>} />
      <h2>General Seasons</h2>
      <p>No application: buy your license and general tag (one weapon; elk also Eastern or Western) and hunt that weapon&apos;s seasons. <Link href="/hunts?states=WA&waLic=general">General season hunts →</Link></p>
    </main>
  );
}
