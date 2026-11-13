import Link from 'next/link';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import { waPo, waPersonal, waLicense, type WaOddsTable, type WaPointOdds } from '@/lib/waHunt';
import { WaOddsPointsChart } from './WaCharts';

/**
 * Washington's How The Draw Works, What Changed and Application Planner: the same questions as the other states'
 * pages, with WDFW's rules (2026 Big Game Hunting Seasons and Regulations pamphlet pp. 15-19; checked against WDFW's
 * own point-level results in docs/states/wa-onboarding.md §3 and §5).
 *
 * Dates: the 2026 pamphlet (special permits Apr 20 - May 20, 2026; multi-season Dec 1, 2026 - Mar 31, 2027).
 * Fees: WDFW's big-game license page, checked Nov 12, 2026 (no season year on the page).
 */

const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o < 0.01 ? `${(o * 100).toFixed(1)}%` : `${Math.round(o * 100)}%`);
type Row = { id: string; slug: string; name: string; species: string; type: string; tagCode: string | null; tags: number | null; privateOnly: boolean; youthOnly: boolean;
  pointOdds: unknown; oddsByPts: unknown; success5: number | null; smallSample: boolean; huntCategory: string | null };
const SELECT = { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, youthOnly: true, pointOdds: true, oddsByPts: true, success5: true, smallSample: true, huntCategory: true } as const;

const FEES: [string, string, string][] = [
  ['Deer license (includes the general tag)', '$61.70', '$599.07'],
  ['Elk license (includes the general tag)', '$69.29', '$685.60'],
  ['Deer + elk license', '$116.85', '$1,020.06'],
  ['Special permit application, per category', '$9.61', '$152.30'],
  ['Quality special permit application, per category', '$18.72', '$152.30'],
  ['Multi-season deer or elk application', '$9.61', '$152.30'],
  ['Multi-season deer tag, if drawn', '$191.77', '$191.77'],
  ['Multi-season elk tag, if drawn', '$250.97', '$250.97'],
  ['Second deer tag (second-deer permits)', '$68.48', '$356.90'],
];

function Timeline() {
  const steps: { when: string; what: string; tone?: 'blaze' | 'good' }[] = [
    { when: 'Apr 20 – May 20', what: 'Special permit applications (2026). Each application buys a point.', tone: 'blaze' },
    { when: 'By end of June', what: 'Special permit results' },
    { when: 'Aug – Jan', what: 'General seasons (dates by weapon and GMU)', tone: 'good' },
    { when: 'Dec 1 – Mar 31', what: 'Multi-season tag applications for the next year', tone: 'blaze' },
    { when: 'April', what: 'Multi-season results; unbought tags go on sale' },
  ];
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {steps.map((s) => (
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
  const rows = (await db.huntSummary.findMany({ where: { state: 'WA' }, select: SELECT })) as unknown as Row[];
  const special = rows.filter((r) => waLicense(r) === 'special');
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

      <h2>Multi-Season Tags</h2>
      <p>A multi-season tag lets you hunt <b>every general season for that species, any weapon, either side of the state</b>, and apply for special permits with any weapon. It is drawn once a year with its own points, squared the same way. Deer: {msLine('DEER')}. Elk: {msLine('ELK')}. Winners must buy the tag, and every year thousands of drawn deer tags go unbought and are then sold to applicants who didn&apos;t draw, so a deer applicant&apos;s real chance is higher than the drawn odds.</p>

      <h2>What It Costs</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Item</th><th>Resident</th><th>Nonresident</th></tr></thead>
        <tbody>{FEES.map(([k, r, n]) => <tr key={k}><td>{k}</td><td>{r}</td><td>{n}</td></tr>)}</tbody></table></div>
      <p className="small muted">WDFW&apos;s big game license page, checked Nov 12, 2026 (it carries no season year). Applying requires the matching license and tag. Confirm with WDFW before you apply.</p>
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
  const fresh = cmp.filter((c) => c.a25 === null && !c.r.privateOnly);
  const permits = cmp.filter((c) => c.p25 !== null && c.p26 !== null && c.p25 !== c.p26)
    .sort((a, b) => Math.abs(b.p26! - b.p25!) - Math.abs(a.p26! - a.p25!) || (b.a25 ?? 0) - (a.a25 ?? 0)).slice(0, 40);
  const swings = cmp.filter((c) => c.a24 !== null && c.a25 !== null && c.a24 >= 100)
    .sort((a, b) => Math.abs(b.a25! / b.a24! - 1) - Math.abs(a.a25! / a.a24! - 1)).slice(0, 40);
  const sp = (s: string) => (s === 'ELK' ? 'sp-elk' : 'sp-deer');
  const name = (r: Row) => <><span className={`pill ${sp(r.species)}`}>{r.tagCode}</span> <Link href={`/hunts/${r.slug}`}>{r.name}</Link></>;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · Washington</h1>
      <p className="muted">Special permits in the 2026 pamphlet against the 2025 one: <a href="#permits">More or fewer permits ({permits.length})</a> · <a href="#apps">Application swings ({swings.length})</a> · <a href="#new">New or renamed ({fresh.length})</a></p>
      <p className="small">WDFW prints each hunt&apos;s previous-year applications (every choice counted) beside its permits. It renumbers hunts between years, so hunts are matched by name, tag, area and legal animal; a hunt that looks new may be an old one under a new name.</p>

      <h2 id="permits">More Or Fewer Permits</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025</th><th>2026</th><th>Change</th><th>2025 applications</th></tr></thead>
        <tbody>{permits.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.p25!)}</td><td>{int(c.p26!)}</td><td className={c.p26! > c.p25! ? 'best' : ''}>{c.p26! > c.p25! ? '+' : ''}{int(c.p26! - c.p25!)}</td><td>{c.a25 === null ? '–' : int(c.a25)}</td></tr>)}</tbody></table></div>

      <h2 id="apps">Application Swings</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2024 applications</th><th>2025 applications</th><th>Change</th><th>Permits ÷ applications, 2025</th></tr></thead>
        <tbody>{swings.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.a24!)}</td><td>{int(c.a25!)}</td><td>{c.a25! > c.a24! ? '+' : ''}{Math.round((c.a25! / c.a24! - 1) * 100)}%</td><td>{c.p25 ? pct(c.p25 / c.a25!) : '–'}</td></tr>)}</tbody></table></div>
      <p className="small muted">Hunts with at least 100 applications in 2024. 2026 applications are published in the 2027 pamphlet. Permits ÷ applications is a rough guide only: points decide who draws.</p>

      <h2 id="new">New Or Renamed Hunts</h2>
      <p className="small muted">In the 2026 pamphlet with no 2025 applications printed (WDFW marks them NEW); private-land-only hunts left out.</p>
      <ul>{fresh.slice(0, 80).map((c) => <li key={c.r.id}>{name(c.r)} · {int(c.p26 ?? 0)} permits</li>)}</ul>
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
export async function WaPlannerPage() {
  const { getPointsStore } = await import('@/lib/points');
  const { readWaPoints, WA_POINT_TYPES } = await import('@/lib/waPoints');
  const pts = readWaPoints((await getPointsStore()).store as Record<string, unknown>);
  const rows = (await db.huntSummary.findMany({ where: { state: 'WA', type: 'CONTROLLED', privateOnly: false, youthOnly: false }, select: SELECT })) as unknown as Row[];
  const scored = rows.map((r) => ({ r, ...waPersonal(r, pts) })).filter((x) => x.odds !== null && x.type !== null);
  const groups = WA_POINT_TYPES.map((t) => {
    const all = scored.filter((x) => x.type === t.key);
    const usable = all.filter((x) => x.tagOk !== false);
    const best = (f: (x: (typeof all)[number]) => number | null) => usable.filter((x) => f(x) !== null).sort((a, b) => f(b)! - f(a)!).slice(0, 8);
    return { t, points: pts.points[t.key], n: all.length, blocked: all.length - usable.length,
      byOdds: best((x) => x.odds), byFill: best((x) => (x.odds !== null && x.r.success5 !== null && !x.r.smallSample ? x.odds * x.r.success5 : null)) };
  });
  const tagNote = [pts.deerTag ? `deer tag ${pts.deerTag.toLowerCase()}` : null, pts.elkTag ? `elk tag ${pts.elkTag}` : null].filter(Boolean).join(', ');
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · Washington</h1>
      <p className="muted">Your estimated odds at your saved points, the 2027 projection. Residents and nonresidents draw together, so residency changes the cost, not the odds. {pts.set ? (tagNote ? `Hunts your saved ${tagNote} can't apply for are left out.` : 'Save your general tags to leave out hunts you can\'t apply for.') : <><Link href="/account#hunting-preferences">Set your Washington points and tags</Link> first: these assume zero points.</>}</p>
      <Timeline />
      <p className="small">Each category is its own application: list up to <b>four</b> hunts (<b>two</b> for Quality), and you earn one point in that category whether or not you draw. Odds here assume the hunt is your first choice; WDFW tries your later choices only if the earlier ones don&apos;t draw you, so put the hunt you most want first and safer hunts after it.</p>
      {groups.filter((g) => g.n > 0).map((g) => (
        <section key={g.t.key}>
          <h2>{g.t.label} · {g.points} point{g.points === 1 ? '' : 's'} <span className="small muted">({int((g.points + 1) ** 2)} entries)</span></h2>
          {g.n === 1 ? (
            <p>{g.byOdds[0] ? <><Link href={`/hunts/${g.byOdds[0].r.slug}`}>{g.byOdds[0].r.name}</Link>: {pct(g.byOdds[0].odds)} at your points.</> : 'Your saved tag can\'t apply for this.'}</p>
          ) : (
            <div className="grid2">
              {[['Best odds at your points', g.byOdds], ['Best draw and fill', g.byFill]].map(([title, list]) => (
                <div key={title as string} className="card">
                  <h3 style={{ marginTop: 0 }}>{title as string}</h3>
                  <div className="cmp-wrap"><table className="cmp-table"><tbody>{(list as typeof g.byOdds).map((x) => (
                    <tr key={x.r.id}><td><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link><div className="small muted">Hunt {x.r.tagCode} · {int(x.r.tags ?? 0)} permits</div></td><td>{pct(x.odds)}</td><td className="small muted">{x.r.success5 !== null ? `${pct(x.r.success5)} success` : '–'}</td></tr>
                  ))}</tbody></table></div>
                  {!(list as typeof g.byOdds).length && <p className="small muted">No hunts with enough data.</p>}
                </div>
              ))}
            </div>
          )}
          {g.blocked > 0 && <p className="small muted">{g.blocked} more hunt{g.blocked === 1 ? '' : 's'} in this category need a different weapon or side than your saved tag.</p>}
        </section>
      ))}
      <h2>General Seasons</h2>
      <p>No application: buy your license and general tag (one weapon; elk also Eastern or Western) and hunt that weapon&apos;s seasons. <Link href="/hunts?states=WA&waLic=general">General season hunts →</Link></p>
      <p className="small muted">2026 pamphlet dates and permits; odds estimated from WDFW&apos;s 2018–2020 point tables and 2021–2025 applications. <Link href="/guide">How the Washington draw works</Link> · <Link href="/changes">What changed since last year</Link></p>
    </main>
  );
}
