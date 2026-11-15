import Link from 'next/link';
import { StatePlanner, type PlanApp, type PlanOpt, type PlanPrereq } from './StatePlanner';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import type { UtOddsTable, UtPointOdds, UtPool } from '@/lib/utHunt';
import { UtOddsPointsChart } from './UtCharts';

/**
 * Utah's How The Draw Works and What Changed pages: the same questions as Idaho's, Colorado's and Montana's (when,
 * how the draw picks, what to do about it; what moved since last year), with Utah's rules (bonus points for
 * limited entry, preference points for general buck deer, general elk over the counter).
 *
 * Dates and fees: DWR's 2026 Big Game Application Guidebook and Field Regulations Guidebook (checked 2026-11-11);
 * 2027 dates were not posted. Odds: the 2026 draw (utahdraws.com) and DWR's 2021-2025 odds reports.
 */

const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
type Row = { id: string; slug: string; name: string; species: string; type: string; tagCode: string | null; tags: number | null; privateOnly: boolean; pointOdds: unknown; oddsByPts: unknown };

const FEES_2026: [string, string, string][] = [
  ['Hunting license, adult (required to apply; checked Nov 12, 2026, no season year on DWR\'s fee page)', '$40', '$144'],
  ['Application, per species (or point only)', '$10', '$21'],
  ['General-season buck deer permit', '$46', '$599'],
  ['Limited-entry buck deer permit', '$94', '$1,070'],
  ['General-season any bull elk permit', '$56', '$849'],
  ['Limited-entry bull elk permit', '$314', '$1,950'],
  ['Limited-entry buck pronghorn permit', '$63', '$571'],
  ['Once-in-a-lifetime bison permit', '$460', '$4,840'],
  ['Antelope Island bison permit', '$1,221', '–'],
];

function Timeline() {
  const steps: { when: string; what: string; tone?: 'blaze' | 'good' }[] = [
    { when: 'Mar 19', what: 'Big game application opens (2026)' },
    { when: 'Apr 23', what: 'Applications and bonus/preference point purchases close', tone: 'blaze' },
    { when: 'By May 31', what: 'Draw results' },
    { when: 'Jul 7', what: 'General archery elk permits on sale', tone: 'good' },
    { when: 'Jul 9', what: 'General any bull elk permits on sale', tone: 'good' },
    { when: 'Jul 16', what: 'General spike bull elk permits on sale', tone: 'good' },
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

/** Statewide 2026 limited-entry results by points: who drew in the max-point round and who in the random round. */
function statewide(rows: Row[], species: string) {
  const byPts = new Map<number, { apps: number; drew: number }>();
  let maxRound = 0, randomRound = 0, zeroDrew = 0, permits = 0;
  for (const r of rows) {
    const po = r.pointOdds as UtPointOdds | null;
    if (r.species !== species || po?.kind !== 'bonus' || r.privateOnly) continue;
    for (const pool of ['res', 'nr'] as UtPool[]) {
      const p = po.pools[pool];
      if (!p) continue;
      permits += p.quota;
      maxRound += p.maxPointQuota ?? 0;
      randomRound += p.randomQuota ?? 0;
      for (const [pts, apps, drew] of p.levels) {
        const a = byPts.get(pts) ?? { apps: 0, drew: 0 };
        a.apps += apps; a.drew += drew; byPts.set(pts, a);
        if (pts === 0) zeroDrew += drew;
      }
    }
  }
  const apps = [...byPts.values()].reduce((a, x) => a + x.apps, 0);
  return { byPts: [...byPts.entries()].sort((a, b) => a[0] - b[0]), maxRound, randomRound, zeroDrew, permits, apps };
}

export async function UtGuide() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'UT' }, select: { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, pointOdds: true, oddsByPts: true } })) as unknown as Row[];
  const elk = statewide(rows, 'ELK'), deer = statewide(rows, 'DEER');
  // an example: the limited-entry elk hunt most people applied for
  const apps = (r: Row) => Object.values((r.pointOdds as UtPointOdds | null)?.pools ?? {}).reduce((a, p) => a + (p?.levels.reduce((b, l) => b + l[1], 0) ?? 0), 0);
  const example = rows.filter((r) => r.species === 'ELK' && (r.pointOdds as UtPointOdds | null)?.kind === 'bonus' && !r.privateOnly).sort((a, b) => apps(b) - apps(a))[0];
  const ex = example?.oddsByPts as UtOddsTable | undefined;
  const genDeer = rows.filter((r) => r.type === 'GENERAL' && r.species === 'DEER');
  const genNr0 = genDeer.filter((r) => ((r.oddsByPts as UtOddsTable).last.nr ?? [0])[0] >= 0.995).length;
  const genRes0 = genDeer.filter((r) => ((r.oddsByPts as UtOddsTable).last.res ?? [0])[0] >= 0.995).length;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>How The Draw Works · Utah</h1>
      <p className="muted">Utah runs three kinds of deer and elk hunt: <b>limited entry</b> drawn with bonus points, the <b>general buck deer</b> draw with preference points, and <b>general bull elk</b> sold over the counter. Pronghorn and once-in-a-lifetime bison are bonus-point draws too. One application window covers them all.</p>
      <Timeline />
      <p className="small muted">2026 dates from DWR&apos;s Big Game Application Guidebook; DWR hasn&apos;t posted 2027 dates yet. A Utah hunting license is required to apply.</p>

      <h2>Limited Entry: Bonus Points</h2>
      <p>Each limited-entry hunt has a resident and a nonresident pool. In each pool, <b>half the permits (rounded up) go to the applicants with the most bonus points</b>, on their first choice, top level down. A pool with a single permit skips this round. Everyone else, including everyone with zero points, goes into a <b>random draw with one chance plus one per bonus point</b>. So points help in both rounds, and no one is ever shut out.</p>
      <div className="stats">
        <div className="stat"><div className="k">Limited-entry elk permits, 2026</div><div className="v">{int(elk.permits)}</div><div className="small muted">{int(elk.maxRound)} to the most points · {int(elk.randomRound)} random</div></div>
        <div className="stat"><div className="k">First-choice elk applicants</div><div className="v">{int(elk.apps)}</div></div>
        <div className="stat"><div className="k">Elk permits won at zero points</div><div className="v">{int(elk.zeroDrew)}</div><div className="small muted">all in the random round</div></div>
        <div className="stat"><div className="k">Limited-entry deer permits, 2026</div><div className="v">{int(deer.permits)}</div><div className="small muted">{int(deer.maxRound)} to the most points · {int(deer.randomRound)} random</div></div>
      </div>
      {example && ex && <>
        <h3>Example: <Link href={`/hunts/${example.slug}`}>{example.name}</Link></h3>
        <UtOddsPointsChart res={ex.last.res ?? []} nr={ex.last.nr ?? []} myPoints={null} mine="nr" year={2026} kind="bonus" />
      </>}
      <p className="small muted">The last-draw odds re-run DWR&apos;s draw on the 2026 applicants and permits; the 2027 projection rolls those applicants forward a point (everyone who didn&apos;t draw comes back one point higher, drawing resets points). It is shown only where it beat repeating the last draw, tested separately for each species and residency: bison and general buck deer for everyone, limited-entry deer, elk and pronghorn for nonresidents; resident limited-entry deer, elk and pronghorn show the 2026 draw. Checked against DWR&apos;s published results for 2021–2026 (every hunt, by point level), it reproduces them; giving everyone equal chances, or squaring points as Montana does, doesn&apos;t. Drawing costs all your bonus points for that species, and limited-entry buck deer and bull elk start a 5-year waiting period. You lose points only by drawing: there&apos;s no penalty for skipping a year in Utah&apos;s rule.</p>
      <p className="small muted">Second and later choices: in the 2026 draw they got 0.5% or less of limited-entry deer, elk and pronghorn permits and none of the bison permits, so first-choice odds tell the whole story there. General buck deer is different: 4,771 permits (6.4%), in 86 of 107 units, went to hunters on a later choice. The general deer odds shown are first-choice, so a unit you list second can still draw.</p>

      <h2>General Buck Deer: Preference Points</h2>
      <p>General-season buck deer permits are drawn unit by unit, <b>most preference points first</b>: a strict line, with no random share (20% of each unit&apos;s permits are held for youth). In 2026, {genRes0} of {genDeer.length} unit hunts drew every resident at zero points, and {genNr0} drew every nonresident at zero points. Drawing resets your general deer points to zero.</p>

      <h2>General Bull Elk: Over The Counter</h2>
      <p>Any bull, spike and archery bull elk permits are sold over the counter to residents and nonresidents until each statewide cap is reached. No draw and no points. Spike permits are valid on spike-only units, any bull permits on any bull units.</p>

      <h2>Pronghorn And Bison</h2>
      <p><b>Limited-entry buck pronghorn</b> is a bonus-point draw, exactly like limited-entry deer and elk, with its own point balance; drawing starts a 2-year waiting period. <b>Bison is once in a lifetime</b>: hunter&apos;s choice and cow-only hunts on the Henry Mountains and Book Cliffs, plus Antelope Island. Same bonus-point draw, but after drawing any bison permit you can never apply for bison in Utah again, so points only ever build until the one draw that counts.</p>
      <h2>What It Costs (2026)</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Item</th><th>Resident</th><th>Nonresident</th></tr></thead>
        <tbody>{FEES_2026.map(([k, r, n]) => <tr key={k}><td>{k}</td><td>{r}</td><td>{n}</td></tr>)}</tbody></table></div>
      <p className="small muted">2026 Big Game Application Guidebook. A 2.2% transaction fee applies; a Utah hunting license is also required. Confirm with DWR before you apply.</p>
      <p><Link href="/hunts?states=UT">Find Utah hunts →</Link> · <Link href="/changes">What changed since last year</Link> · <Link href="/account#hunting-preferences">Set your Utah points</Link></p>
    </main>
  );
}

export async function UtChanges() {
  const rows = (await db.huntSummary.findMany({ where: { state: 'UT', type: { in: ['CONTROLLED', 'GENERAL'] } }, select: { id: true, slug: true, name: true, species: true, type: true, tagCode: true, tags: true, privateOnly: true, pointOdds: true, oddsByPts: true } })) as unknown as Row[];
  const drawn = rows.filter((r) => { const k = (r.pointOdds as UtPointOdds | null)?.kind; return k === 'bonus' || k === 'preference'; });
  const sum = (po: UtPointOdds, pool: UtPool, i: 1 | 2) => po.pools[pool]?.levels.reduce((a, l) => a + l[i], 0) ?? 0;
  const cmp = drawn.map((r) => {
    const po = r.pointOdds as UtPointOdds;
    const prev = po.history?.['2025'];
    const now = { apps: sum(po, 'res', 1) + sum(po, 'nr', 1), drew: sum(po, 'res', 2) + sum(po, 'nr', 2) };
    const was = prev ? { apps: (prev.res?.apps ?? 0) + (prev.nr?.apps ?? 0), drew: (prev.res?.drew ?? 0) + (prev.nr?.drew ?? 0) } : null;
    return { r, now, was };
  });
  const fresh = cmp.filter((c) => !c.was && !c.r.privateOnly);
  const both = cmp.filter((c) => c.was && c.was.apps > 0 && c.now.apps > 0);
  const permits = both.filter((c) => c.was!.drew !== c.now.drew).sort((a, b) => Math.abs(b.now.drew - b.was!.drew) - Math.abs(a.now.drew - a.was!.drew)).slice(0, 40);
  const swings = both.filter((c) => c.was!.apps >= 50).sort((a, b) => Math.abs(b.now.apps / b.was!.apps - 1) - Math.abs(a.now.apps / a.was!.apps - 1)).slice(0, 40);
  const sp = (s: string) => (s === 'ELK' ? 'sp-elk' : 'sp-deer');
  const name = (r: Row) => <><span className={`pill ${sp(r.species)}`}>{r.tagCode}</span> <Link href={`/hunts/${r.slug}`}>{r.name}</Link></>;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed · Utah</h1>
      <p className="muted">The 2026 draw against 2025, first-choice applicants and permits drawn, residents and nonresidents together: <a href="#permits">More or fewer permits ({permits.length})</a> · <a href="#apps">Applicant swings ({swings.length})</a> · <a href="#new">New or renumbered ({fresh.length})</a></p>
      <p className="small">Utah changed draw systems in 2026 (utahdraws.com replaced DWR&apos;s printed odds reports), and DWR renumbers some hunts between years, so a hunt that looks new may be an old one under a new number.</p>

      <h2 id="permits">More Or Fewer Permits Drawn</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025</th><th>2026</th><th>Change</th><th>Odds 2026</th></tr></thead>
        <tbody>{permits.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.was!.drew)}</td><td>{int(c.now.drew)}</td><td className={c.now.drew > c.was!.drew ? 'best' : ''}>{c.now.drew > c.was!.drew ? '+' : ''}{int(c.now.drew - c.was!.drew)}</td><td>{pct(c.now.drew / c.now.apps)}</td></tr>)}</tbody></table></div>

      <h2 id="apps">Applicant Swings</h2>
      <div className="cmp-wrap"><table className="cmp-table"><thead><tr><th>Hunt</th><th>2025 applicants</th><th>2026 applicants</th><th>Change</th><th>Odds 2025 → 2026</th></tr></thead>
        <tbody>{swings.map((c) => <tr key={c.r.id}><td>{name(c.r)}</td><td>{int(c.was!.apps)}</td><td>{int(c.now.apps)}</td><td>{c.now.apps > c.was!.apps ? '+' : ''}{Math.round((c.now.apps / c.was!.apps - 1) * 100)}%</td><td>{pct(c.was!.drew / c.was!.apps)} → {pct(c.now.drew / c.now.apps)}</td></tr>)}</tbody></table></div>
      <p className="small muted">Hunts with at least 50 first-choice applicants in 2025.</p>

      <h2 id="new">New Or Renumbered Hunts</h2>
      <p className="small muted">In the 2026 draw with no 2025 odds report under the same hunt number (CWMU hunts left out).</p>
      <ul>{fresh.slice(0, 80).map((c) => <li key={c.r.id}>{name(c.r)} · {int(c.now.drew)} of {int(c.now.apps)} drew</li>)}</ul>
      <p><Link href="/guide">How the Utah draw works</Link> · <Link href="/hunts?states=UT">Find Utah hunts →</Link></p>
    </main>
  );
}

/**
 * Utah Application Planner. The max-point half of each pool goes on first choice only, so the plan that matters is
 * the first choice per species (how many later choices DWR allows is still to be confirmed: ut-onboarding.md §8). This page lists, for each of the hunter's point balances, the hunts with the best odds at
 * those points and the best draw-and-fill, so the first choice can be picked deliberately.
 */
export async function UtPlannerPage({ signedIn }: { signedIn: boolean }) {
  const { getPointsStore } = await import('@/lib/points');
  const { readUtPoints, UT_POINT_TYPES, utPointType } = await import('@/lib/utPoints');
  const { utPersonal } = await import('@/lib/utHunt');
  const pts = readUtPoints((await getPointsStore()).store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const rows = await db.huntSummary.findMany({ where: { state: 'UT', privateOnly: false, youthOnly: false }, orderBy: [{ tagCode: 'asc' }] });
  const opts: PlanOpt[] = [];
  for (const r of rows) {
    const app = utPointType(r.tagCode, r.species, r.type);
    if (!app) continue;
    const m = utPersonal(r, pts, nr);
    if (m.odds === null) continue;
    opts.push({ id: r.id, href: `/hunts/${r.slug}`, code: r.tagCode ?? r.id, where: r.name, app, odds: m.odds, basis: m.basis,
      success: r.success5 !== null && !r.smallSample ? r.success5 : null });
  }
  const fee = (row: string) => Number(FEES_2026.find(([k]) => k.startsWith(row))![nr ? 2 : 1].replace(/[$,]/g, ''));
  const PERMIT: Record<string, [string, string]> = {
    LE_DEER: ['Limited-entry buck deer permit', 'standard limited-entry buck deer permit'], LE_ELK: ['Limited-entry bull elk permit', 'standard limited-entry bull elk permit'],
    LE_PRONGHORN: ['Limited-entry buck pronghorn permit', 'limited-entry buck pronghorn permit'], BISON: ['Once-in-a-lifetime bison permit', 'bison permit'],
    GEN_DEER: ['General-season buck deer permit', 'general-season buck deer permit'],
  };
  const apps: PlanApp[] = UT_POINT_TYPES.filter((t) => opts.some((o) => o.app === t.key)).map((t) => {
    const n = pts.points[t.key];
    const gen = t.key === 'GEN_DEER';
    const mine = opts.filter((o) => o.app === t.key);
    return {
      key: t.key, label: t.label, when: 'Apply Mar 19 – Apr 23 (2026 dates) · results by May 31',
      choices: 5, choicesKnown: false, price: fee('Application, per species'), needs: ['LICENSE'],
      points: `Your ${t.label.toLowerCase()} ${t.kind} points: ${n}. Not drawing adds one`,
      what: gen
        ? 'Drawn unit by unit, most preference points first: a strict line with no random share.'
        : `Half of each hunt's permits (rounded up) go to the most bonus points, on first choices only (a one-permit pool is all random); the rest are drawn at random, with points + 1 entries.${t.key === 'BISON' ? ' Drawing any bison permit ends your Utah bison applications for life.' : ''}`,
      later: gen
        ? 'Later choices do draw in general deer: in 2026, 6.4% of permits (in 86 of 107 units) went to hunters on a later choice.'
        : 'In 2026, later choices got 0.5% or less of limited-entry deer, elk and pronghorn permits and none of the bison permits: plan as if only your first choice counts.',
      suggest: mine.filter((o) => o.odds !== null && o.success !== null).sort((a, b) => b.odds! * b.success! - a.odds! * a.success!).slice(0, 4).map((o) => o.id),
      ifDrawn: [{ label: PERMIT[t.key][1], amount: fee(PERMIT[t.key][0]) }],
    };
  });
  const prereq: PlanPrereq[] = [{ label: 'Adult hunting license', amount: fee('Hunting license, adult'), covers: ['LICENSE'] }];
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner · Utah</h1>
      <StatePlanner state="UT" apps={apps} opts={opts} prereq={prereq} signedIn={signedIn} set={pts.set} setLabel="Set your Utah points"
        timeline={[
          { when: 'Mar 19', what: 'Big game application opens (2026)' },
          { when: 'Apr 23', what: 'Applications and bonus/preference point purchases close', tone: 'blaze' },
          { when: 'By May 31', what: 'Draw results' },
          { when: 'Jul 7 – 16', what: 'General elk permits on sale, no draw', tone: 'good' },
        ]}
        intro={<>One application per species, your hunts in order. Odds are your {nr ? 'nonresident' : 'resident'} first-choice odds at your saved points: the 2027 projection where one beat the last draw in testing, otherwise the 2026 draw. Only your <b>first choice</b> can win in the max-point round. You can apply for several limited-entry species, but you can draw only <b>one</b> limited-entry or once-in-a-lifetime permit a year, in DWR&apos;s drawing order (buck deer, then bull elk, then the rest). DWR&apos;s guidebook and rule don&apos;t print how many choices an application takes; its application form does, and this page lets you plan up to five.</>}
        costNote={<>Utah charges the hunting license and the application fee when you apply; the permit is charged only if you draw (premium, multi-season and CWMU permits cost more than the standard price shown). A 2.2% transaction fee applies. 2026 Big Game Application Guidebook; the license price is from DWR&apos;s fee page, checked Nov 12, 2026. <Link href="/guide">How the Utah draw works</Link> · <Link href="/changes">What changed since last year</Link></>} />
      <h2>General Bull Elk</h2>
      <p>No application: buy an any bull, spike or archery permit over the counter from July (see the dates above). <Link href="/hunts?states=UT&species=ELK&utLic=otc">General elk hunts →</Link></p>
    </main>
  );
}
