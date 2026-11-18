import Link from 'next/link';
import { db } from '@/lib/db';
import { int, pctOdds } from '@/lib/format';
import { orPo, orPersonal, orIsGeneral, OR_FEES, OR_SERIES_LABEL, type OrOddsTable } from '@/lib/orHunt';
import { OrOddsPointsChart } from './OrCharts';
import { StatePlanner, type PlanApp, type PlanOpt, type PlanPrereq, type PlanTimelineStep } from './StatePlanner';

/**
 * Oregon's How The Draw Works, What Changed and Application Planner: the same questions as the other states'
 * pages, with ODFW's rules (2026 Oregon Big Game Hunting Regulations, "How Does the Controlled Hunt Draw Work?" and
 * "Preference Points Explained"; the draw checked against ODFW's own reports in docs/states/or-onboarding.md §2).
 * Dates and fees: the 2026 regulations (a dated publication).
 */
type Row = { id: string; slug: string; name: string; species: string; type: string; tagCode: string | null; tags: number | null; privateOnly: boolean; youthOnly: boolean;
  pointOdds: unknown; oddsByPts: unknown; success5: number | null; smallSample: boolean };
const SELECT = { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, youthOnly: true, pointOdds: true, oddsByPts: true, success5: true, smallSample: true } as const;

const OR_TIMELINE: PlanTimelineStep[] = [
  { when: 'By May 15', what: 'Controlled hunt applications: 100, 200 and 600 series (2026 deadline)', tone: 'blaze' },
  { when: 'By June 12', what: 'Draw results (2026)' },
  { when: 'July 1', what: 'Leftover controlled tags on sale; point savers open for anyone who didn\'t apply (to Nov 30)' },
  { when: 'Aug – Dec', what: 'General and controlled seasons (dates by hunt)', tone: 'good' },
];

function Timeline() {
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {OR_TIMELINE.map((s) => (
        <div key={s.when} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
          <div className="k">{s.when}</div>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div>
        </div>
      ))}
    </div>
  );
}

const d26 = (r: Row) => orPo(r)?.demand?.['2026'];
const d25 = (r: Row) => orPo(r)?.demand?.['2025'];

export async function OrGuide() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'OR' }, select: SELECT })) as unknown as Row[];
  const ctl = rows.filter((r) => !orIsGeneral(r));
  const general = rows.filter((r) => orIsGeneral(r));
  const tags = ctl.reduce((a, r) => a + (r.tags ?? 0), 0);
  const apps = ctl.reduce((a, r) => a + (d26(r)?.apps ?? 0), 0);
  const nrNone = ctl.filter((r) => (d26(r)?.nrApps ?? 0) > 0 && (d26(r)?.nrDrawn ?? 0) === 0).length;
  const newEast = ctl.filter((r) => orPo(r)?.newHunt && orPo(r)?.series === '100').length;
  const example = ctl.filter((r) => !r.privateOnly && !r.youthOnly && (orPo(r)?.pools?.res?.rows?.some(([, , d]) => d > 0) ?? false))
    .sort((a, b) => (d26(b)?.apps ?? 0) - (d26(a)?.apps ?? 0))[0];
  const ex = example?.oddsByPts as OrOddsTable | undefined;
  const exPo = example ? orPo(example) : null;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>How The Draw Works · Oregon</h1>
      <p className="muted">Oregon has two kinds of deer and elk hunting: <b>general seasons</b> on an over-the-counter tag, and <b>controlled hunts</b> drawn mostly by <b>preference points</b>. You hold one deer tag and one elk tag a year, so a controlled tag and a general tag for the same species don&apos;t go together.</p>
      <Timeline />
      <p className="small muted">Dates from ODFW&apos;s 2026 Oregon Big Game Hunting Regulations; check ODFW for 2027.</p>

      <h2>Controlled Hunts: 75% By Points, 25% Random</h2>
      <p>Hunts are grouped in <b>series</b>: <b>100 buck deer, 200 elk, 600 antlerless deer</b>. Each year you send one application per series with up to five hunt choices. For each hunt, <b>75% of the tags go to the first-choice applicants with the most points</b>, highest first. Applicants with <b>0 points never draw in that phase</b>. The other 25% go at random to every first-choice applicant left. Tags still left after every first choice go at random to second choices, and so on: <b>points only count for your first choice</b>.</p>
      <p>Not drawing your first choice earns a point in that series (or buy a <b>point saver</b> instead of choosing hunts). Drawing your first choice puts that series back to 0, whether or not you buy the tag. Points don&apos;t lapse.</p>
      <p><b>The random 25% isn&apos;t a fresh lottery.</b> ODFW gives every application one random number and uses it for both phases. So if you tied at the point cutoff and lost, you lost because your number was poor, and that same number goes into the random draw. At the cutoff your chance is the better of the two phases, not both added together. We checked this against ODFW&apos;s own 2025 and 2026 reports, which print the points held by random-phase winners: a fresh lottery overstates them by about 45%, the one-number draw matches within a few percent.</p>
      <div className="stats">
        <div className="stat"><div className="k">Controlled deer and elk hunts, 2026</div><div className="v">{int(ctl.length)}</div></div>
        <div className="stat"><div className="k">Tags, 2026</div><div className="v">{int(tags)}</div></div>
        <div className="stat"><div className="k">First-choice applicants, 2026</div><div className="v">{int(apps)}</div></div>
      </div>
      {example && ex && <>
        <h3>Example: <Link href={`/hunts/${example.slug}`}>{example.name}</Link></h3>
        <p className="small">{int(example.tags ?? 0)} tags for {int(d26(example)?.apps ?? 0)} first-choice applicants in 2026. Below the point cutoff only the random share is left, so every point level below it has the same small chance; at and above it the odds jump.</p>
        <OrOddsPointsChart main={ex.last.res ?? []} other={[]} myPoints={null} year={exPo?.year ?? 2026} otherYear={exPo?.projYear ?? 2027} projected={false} pool="res" />
      </>}

      <h2>Nonresidents</h2>
      <p>Nonresidents apply in the same draw with the same points, but <b>can draw at most 5% of a hunt&apos;s deer or elk tags</b>: a hunt with fewer than 20 tags has none for them. ODFW&apos;s guides and outfitters program also takes nonresident tags equal to half of last year&apos;s nonresident draw before the drawing (unsold ones go back in). In 2026 nonresidents applied for {int(nrNone)} hunts in which no nonresident drew. The odds on this site are for your residency, from ODFW&apos;s separate resident and nonresident counts.</p>

      <h2>Next Draw vs Last Draw</h2>
      <p>Pages default to the next draw where we could do better than last year&apos;s odds. We tested a points-creep projection on ODFW&apos;s 2022–2026 draws (each year predicted from the year before, method chosen on 2022–2024 and checked on 2025–2026): it beat last year&apos;s odds only for <b>nonresident buck deer and elk</b>, so those show a 2027 projection. Everyone else sees the 2026 draw, labelled, because no projection we tried did better.</p>

      <h2>Eastern Oregon Deer Hunt Areas (New In 2026)</h2>
      <p>From 2026 ODFW draws Eastern Oregon buck deer by <b>deer hunt areas</b> drawn around mule deer herds, not wildlife management units, and Eastern Oregon archery buck deer became controlled too. That&apos;s {int(newEast)} new hunt numbers with one year of draw results and no harvest history yet (the first comes out in spring 2027). Elk, antlerless deer and Western Oregon deer still use units.</p>

      <h2>General Seasons</h2>
      <p>Western Oregon general rifle buck deer, Western Oregon general archery deer, the Cascade and Coast bull elk seasons, the Rocky Mountain spike season and general archery elk are bought over the counter, residents and nonresidents alike. This site lists them by unit ({int(general.length)} unit and season rows) with five seasons of ODFW harvest. Eastern Oregon has no general rifle buck deer or bull elk season: those are controlled.</p>

      <h2>What It Costs ({OR_FEES.year})</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Item</th><th>Resident</th><th>Nonresident</th></tr></thead>
        <tbody>
          <tr><td>Hunting license (needed to apply)</td><td>${OR_FEES.license.res}</td><td>${OR_FEES.license.nr}</td></tr>
          <tr><td>Controlled hunt application, per series</td><td>${OR_FEES.application}</td><td>${OR_FEES.application}</td></tr>
          <tr><td>Deer tag</td><td>${OR_FEES.deerTag.res}</td><td>${OR_FEES.deerTag.nr}</td></tr>
          <tr><td>Elk tag</td><td>${OR_FEES.elkTag.res}</td><td>${OR_FEES.elkTag.nr}</td></tr>
        </tbody></table></div>
      <p className="small muted">2026 Oregon Big Game Hunting Regulations fee table. A controlled tag is bought after you draw. Youth, senior and pioneer prices differ. Confirm with ODFW before you apply.</p>
      <p><Link href="/hunts?states=OR">Find Oregon hunts →</Link> · <Link href="/changes">What changed since last year</Link> · <Link href="/account#hunting-preferences">Set your Oregon points</Link></p>
    </main>
  );
}

export async function OrChanges() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'OR', type: 'CONTROLLED' }, select: SELECT })) as unknown as Row[];
  const cmp = rows.map((r) => ({ r, t25: d25(r)?.tags ?? null, t26: r.tags, a25: d25(r)?.apps ?? null, a26: d26(r)?.apps ?? null, c25: d25(r)?.prefCutoff ?? null, c26: d26(r)?.prefCutoff ?? null }));
  const tagMoves = cmp.filter((c) => c.t25 !== null && c.t26 !== null && c.t25 !== c.t26).sort((a, b) => Math.abs(b.t26! - b.t25!) - Math.abs(a.t26! - a.t25!)).slice(0, 40);
  const creep = cmp.filter((c) => c.c25 !== null && c.c26 !== null && c.c25 !== c.c26).sort((a, b) => Math.abs(b.c26! - b.c25!) - Math.abs(a.c26! - a.c25!) || (b.a26 ?? 0) - (a.a26 ?? 0)).slice(0, 40);
  const fresh = rows.filter((r) => orPo(r)?.newHunt);
  const sp = (s: string) => (s === 'ELK' ? 'sp-elk' : 'sp-deer');
  const name = (r: Row) => <><span className={`pill ${sp(r.species)}`}>{r.tagCode}</span> <Link href={`/hunts/${r.slug}`}>{r.name}</Link></>;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · Oregon</h1>
      <p className="muted">ODFW&apos;s 2026 draw against 2025: <a href="#tags">More or fewer tags ({tagMoves.length})</a> · <a href="#cutoff">Point cutoffs that moved ({creep.length})</a> · <a href="#new">New hunts ({fresh.length})</a></p>
      <p className="small">Hunts are matched by hunt number and name. The big change: Eastern Oregon buck deer moved from units to new deer hunt areas in 2026, so those hunts have new numbers and no 2025 to compare with.</p>

      <h2 id="tags">More Or Fewer Tags</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025</th><th>2026</th><th>Change</th><th>2026 first-choice applicants</th></tr></thead>
        <tbody>{tagMoves.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.t25!)}</td><td>{int(c.t26!)}</td><td className={c.t26! > c.t25! ? 'best' : ''}>{c.t26! > c.t25! ? '+' : ''}{int(c.t26! - c.t25!)}</td><td>{c.a26 === null ? '–' : int(c.a26)}</td></tr>)}</tbody></table></div>

      <h2 id="cutoff">Point Cutoffs That Moved</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025 cutoff</th><th>2026 cutoff</th><th>Applicants 2025 → 2026</th></tr></thead>
        <tbody>{creep.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{c.c25} pts</td><td>{c.c26} pts</td><td>{c.a25 === null ? '–' : int(c.a25)} → {c.a26 === null ? '–' : int(c.a26)}</td></tr>)}</tbody></table></div>
      <p className="small muted">The cutoff is the fewest points that drew in the preference phase (75% of the tags), both residencies.</p>

      <h2 id="new">New Hunts</h2>
      <ul>{fresh.slice(0, 120).map((r) => <li key={r.id}>{name(r)} · {int(r.tags ?? 0)} tags · {pctOdds(d26(r) && d26(r)!.apps ? Math.min(1, d26(r)!.drawn / d26(r)!.apps) : null)} of first choices drew</li>)}</ul>
      <p><Link href="/guide">How the Oregon draw works</Link> · <Link href="/hunts?states=OR">Find Oregon hunts →</Link></p>
    </main>
  );
}

/** Oregon Application Planner: one application per series with up to five choices; points only count for the
 *  first choice. Shows, at the hunter's saved points and residency, the hunts with the best odds and draw-and-fill. */
export async function OrPlannerPage({ signedIn }: { signedIn: boolean }) {
  const { getPointsStore } = await import('@/lib/points');
  const { readOrPoints, OR_POINT_TYPES } = await import('@/lib/orPoints');
  const pts = readOrPoints((await getPointsStore()).store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const rows = (await db.huntSummary.findMany({ where: { state: 'OR', type: 'CONTROLLED', privateOnly: false }, select: SELECT })) as unknown as Row[];
  const scored = rows.map((r) => ({ r, ...orPersonal(r, pts, nr) })).filter((x) => x.type !== null);
  const opts: PlanOpt[] = scored.map((x) => ({
    id: x.r.id, href: `/hunts/${x.r.slug}`, code: x.r.tagCode ?? x.r.id.slice(3), where: x.r.name, app: x.type!,
    odds: x.odds, basis: x.basis, success: x.r.success5 !== null && !x.r.smallSample ? x.r.success5 : null,
  }));
  const apps: PlanApp[] = OR_POINT_TYPES.map((t) => {
    const mine = opts.filter((o) => o.app === t.key);
    return {
      key: t.key, label: OR_SERIES_LABEL[t.series], choices: 5,
      when: 'Apply by May 15 (2026 deadline) · results by June 12',
      points: `Your ${t.label.replace(/ \(.*\)/, '').toLowerCase()} points: ${pts.points[t.key]}; not drawing your first choice adds one`,
      price: OR_FEES.application, needs: ['LICENSE'],
      later: 'Points only count for your first choice. Second to fifth choices only get tags left after every first-choice applicant, at random.',
      suggest: mine.filter((o) => o.odds !== null && o.success !== null).sort((a, b) => b.odds! * b.success! - a.odds! * a.success!).slice(0, 5).map((o) => o.id),
      ifDrawn: [{ label: t.species === 'ELK' ? 'elk tag' : 'deer tag', amount: (t.species === 'ELK' ? OR_FEES.elkTag : OR_FEES.deerTag)[nr ? 'nr' : 'res'] }],
    };
  });
  const prereq: PlanPrereq[] = [{ label: 'Oregon hunting license', amount: OR_FEES.license[nr ? 'nr' : 'res'], covers: ['LICENSE'] }];
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · Oregon</h1>
      <StatePlanner state="OR" apps={apps} opts={opts} prereq={prereq} signedIn={signedIn} set={pts.set} setLabel="Set your Oregon points"
        timeline={OR_TIMELINE}
        intro={<>One application per series, up to <b>five</b> hunts each. Odds are at your saved points and residency, as a first choice ({nr ? 'nonresident: at most 5% of a hunt\'s tags, ' : ''}2027 projected where that beat the last draw in testing, else the 2026 draw).</>}
        costNote={<>2026 Oregon Big Game Hunting Regulations fee table. The application fee is per series and isn&apos;t refunded; the tag is bought only if you draw. Not a complete total: no transaction fees. <Link href="/guide">How the Oregon draw works</Link> · <Link href="/changes">What changed since last year</Link></>} />
      <h2>General Seasons</h2>
      <p>No application: buy your license and general tag and hunt that season. <Link href="/hunts?states=OR&orLic=general">General season hunts →</Link></p>
    </main>
  );
}
