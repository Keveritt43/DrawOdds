import Link from 'next/link';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import type { NvPointOdds, NvPool } from '@/lib/nvHunt';
import backtest from '../../data/nv/backtest.json';

/**
 * Nevada's How The Draw Works, What Changed and Application Planner pages: the questions Idaho's, Utah's and
 * Washington's answer (when, how the draw picks, what moved since last year, what to put on the application), with
 * NDOW's rules. Dates: NDOW's 2026 big game application calendar (checked 2026-11-17; 2027 not posted). Rules: NDOW's
 * 2026 Big Game Application FAQ. Odds: NDOW's 2025 bonus point reports; fees are not loaded yet.
 */
const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
type Row = { id: string; slug: string; name: string; species: string; tagCode: string | null; tags: number | null; success5: number | null; smallSample: boolean; pointOdds: unknown; oddsByPts: unknown };

function Timeline() {
  const steps: { when: string; what: string; tone?: 'blaze' | 'good' }[] = [
    { when: 'Mar 23', what: 'Main big game draw opens (2026)' },
    { when: 'May 13', what: 'Applications and bonus-point purchases close', tone: 'blaze' },
    { when: 'May 29', what: 'Main draw results' },
    { when: 'Jun 8–15', what: 'Second draw: leftover and returned tags', tone: 'good' },
  ];
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {steps.map((s) => <div key={s.when} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
        <div className="k">{s.when}</div><div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div></div>)}
    </div>
  );
}

/** Statewide 2025 first-choice results by points for one category and pool, from every hunt's NDOW table. */
function statewide(rows: Row[], cat: (c: string) => boolean, pool: NvPool) {
  const by = new Map<number, [number, number]>();
  for (const r of rows) {
    const po = r.pointOdds as NvPointOdds | null;
    if (!po || !cat(po.category)) continue;
    for (const [p, a, d] of po.pools?.[pool]?.levels ?? []) { const c = by.get(p) ?? [0, 0]; c[0] += a; c[1] += d; by.set(p, c); }
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
}

export async function NvGuide() {
  const rows = await db.huntSummary.findMany({ where: { state: 'NV' } }) as unknown as Row[];
  const deer = (c: string) => c.startsWith('deer-') && !c.startsWith('deer-jr');
  const bull = (c: string) => c.startsWith('elk-bull');
  const bands = (lv: [number, [number, number]][]) => {
    const B: [string, number, number][] = [['0', 0, 0], ['1–2', 0, 0], ['3–5', 0, 0], ['6–9', 0, 0], ['10–14', 0, 0], ['15+', 0, 0]];
    for (const [p, [a, d]] of lv) { const i = p === 0 ? 0 : p <= 2 ? 1 : p <= 5 ? 2 : p <= 9 ? 3 : p <= 14 ? 4 : 5; B[i][1] += a; B[i][2] += d; }
    return B;
  };
  const tables: [string, [string, number, number][]][] = [
    ['Antlered mule deer · resident', bands(statewide(rows, deer, 'res'))], ['Antlered mule deer · nonresident', bands(statewide(rows, deer, 'nr'))],
    ['Antlered elk · resident', bands(statewide(rows, bull, 'res'))], ['Antlered elk · nonresident', bands(statewide(rows, bull, 'nr'))],
  ];
  const r = backtest.rule.logLik as Record<string, number>;
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>How Nevada&apos;s Draw Works</h1>
      <p className="muted">Every Nevada deer and elk tag on this site is drawn. NDOW runs one main draw in spring, then a second draw for leftover tags.</p>
      <Timeline />
      <h2>Bonus points, squared</h2>
      <p>Each application gets <b>(bonus points)² + 1</b> random draw numbers and keeps the lowest. Tags go to the lowest numbers, and NDOW fills every first choice before it looks at any second choice. So zero points still draws sometimes, and points pay off fast: 3 points is 10 numbers, 5 is 26, 10 is 101.</p>
      <p>We checked that rule against NDOW&apos;s own 2022–2025 reports: across {int(backtest.rule.hunts)} hunt tables, points² + 1 fits the first-choice results better than (points + 1)², points + 1 or no weighting (log-likelihood {Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}).</p>
      <ul>
        <li>Each hunt category has its own points: antlered mule deer, junior mule deer, antlered elk, antlerless elk and spike elk.</li>
        <li>You earn a point when you apply and don&apos;t draw (you need a hunting license on file), or you can buy one instead of applying.</li>
        <li>Drawing uses your points for that category. Missing two years in a row of applying in a category loses them.</li>
        <li>Up to 5 choices per category, and resident and nonresident tags are separate quotas. Junior and spike elk tags are residents only.</li>
      </ul>
      <h2>What points bought in 2025</h2>
      <p className="small muted">First-choice applicants and how many drew, every hunt in the category added up (NDOW 2025 bonus point reports). A statewide rate hides big differences between hunts: check each hunt&apos;s own table.</p>
      <div className="grid2">
        {tables.map(([title, B]) => <div key={title} className="card"><h3 style={{ marginTop: 0 }}>{title}</h3>
          <table className="co-ladder"><thead><tr><th>Points</th><th className="num">First choices</th><th className="num">Drew</th></tr></thead>
            <tbody>{B.map(([b, a, d]) => <tr key={b}><td>{b}</td><td className="num">{int(a)}</td><td className="num">{int(d)} ({pct(a ? d / a : null)})</td></tr>)}</tbody></table></div>)}
      </div>
      <h2>Why the odds aren&apos;t projected</h2>
      <p>NDOW publishes results by point level after each draw; the latest is 2025 (the 2026 report should come out early 2027). We tested rolling the last draw forward a year (everyone who missed comes back with a point, winners start over) against simply repeating the last draw, predicting 2023, 2024 and 2025 from earlier years only. It won some years and lost others for both residents and nonresidents, so every Nevada page shows the 2025 draw, labelled.</p>
      <p className="small muted">Sources: <a href="https://www.ndow.org/blog/bonus-point-data/">NDOW bonus point data</a>, <a href="https://www.ndow.org/apply-buy/apply-buy-hunting/">2026 application calendar</a>, NDOW 2026 Big Game Application FAQ, CR 26-11 quotas. <Link href="/hunts?states=NV">Find Nevada hunts</Link>.</p>
    </main>
  );
}

export async function NvChanges() {
  const rows = await db.huntSummary.findMany({ where: { state: 'NV' }, orderBy: { tagCode: 'asc' } }) as unknown as Row[];
  const diff = rows.map((r) => {
    const po = r.pointOdds as NvPointOdds | null;
    const now = (po?.pools?.res?.quota ?? 0) + (po?.pools?.nr?.quota ?? 0);
    const had = (po?.pools?.res?.quotaLast ?? null) === null && (po?.pools?.nr?.quotaLast ?? null) === null ? null : (po?.pools?.res?.quotaLast ?? 0) + (po?.pools?.nr?.quotaLast ?? 0);
    return { r, now, had, d: had === null ? null : now - had };
  });
  const fresh = diff.filter((x) => x.had === null);
  const moved = diff.filter((x) => x.d !== null && x.d !== 0).sort((a, b) => Math.abs(b.d!) - Math.abs(a.d!));
  const sum = (sp: string, k: 'now' | 'had') => diff.filter((x) => x.r.species === sp && x.had !== null).reduce((a, x) => a + (x[k] ?? 0), 0);
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>What Changed In Nevada</h1>
      <p className="muted">2026 tag quotas (CR 26-11, adopted May 9, 2026) against the 2025 draw, hunt by hunt. 2027 quotas are set next May.</p>
      <div className="stats">
        <div className="stat"><div className="k">Mule deer tags</div><div className="v">{int(sum('DEER', 'now'))}</div><div className="small muted">{int(sum('DEER', 'had'))} on the same hunts in 2025</div></div>
        <div className="stat"><div className="k">Elk tags</div><div className="v">{int(sum('ELK', 'now'))}</div><div className="small muted">{int(sum('ELK', 'had'))} on the same hunts in 2025</div></div>
        <div className="stat"><div className="k">New or changed hunts</div><div className="v">{fresh.length}</div><div className="small muted">no 2025 table to compare</div></div>
      </div>
      <h2>Biggest quota changes</h2>
      <div className="htable-wrap"><table><thead><tr><th>Hunt</th><th className="num">2025</th><th className="num">2026</th><th className="num">Change</th></tr></thead>
        <tbody>{moved.slice(0, 40).map((x) => <tr key={x.r.id}><td><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link></td><td className="num">{int(x.had)}</td><td className="num">{int(x.now)}</td><td className="num">{x.d! > 0 ? '+' : ''}{x.d}</td></tr>)}</tbody></table></div>
      {fresh.length > 0 && <><h2>New or changed for 2026</h2><ul>{fresh.map((x) => <li key={x.r.id}><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link> · {int(x.now)} tags</li>)}</ul></>}
      <p className="small muted">2025 numbers are the tags NDOW printed on each hunt&apos;s 2025 bonus point report, residents and nonresidents together.</p>
    </main>
  );
}

export async function NvPlannerPage() {
  const { getPointsStore } = await import('@/lib/points');
  const { readNvPoints, NV_POINT_TYPES, nvPointType } = await import('@/lib/nvPoints');
  const { nvPersonal } = await import('@/lib/nvHunt');
  const pts = readNvPoints((await getPointsStore()).store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const rows = await db.huntSummary.findMany({ where: { state: 'NV' } }) as unknown as Row[];
  const apps = NV_POINT_TYPES.map((t) => {
    const opts = rows.filter((r) => nvPointType((r.pointOdds as NvPointOdds | null)?.category) === t.key).map((r) => ({ r, m: nvPersonal(r, pts, nr) }))
      .filter((x) => x.m.odds !== null).map((x) => ({ ...x, fill: x.r.success5 !== null && !x.r.smallSample ? x.m.odds! * x.r.success5 : null }));
    const best = [...opts].sort((a, b) => (b.fill ?? -1) - (a.fill ?? -1)).slice(0, 5);
    const surest = [...opts].sort((a, b) => b.m.odds! - a.m.odds!).slice(0, 5);
    return { t, n: pts.points[t.key], best, surest, count: opts.length };
  }).filter((a) => a.count > 0);
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>Nevada Application Planner</h1>
      <p className="muted">One application per hunt category, up to 5 choices each, in order. First choices are filled before any second choice, so your first choice is where your points matter. Odds: NDOW&apos;s 2025 draw at your saved Nevada points, {nr ? 'nonresident' : 'resident'}.{!pts.set && <> <Link href="/account#hunting-preferences">Set your Nevada points</Link> first.</>}</p>
      <Timeline />
      {apps.map((a) => <section key={a.t.key} className="card" style={{ margin: '14px 0' }}>
        <h2 style={{ marginTop: 0 }}>{a.t.label} · {a.n} point{a.n === 1 ? '' : 's'}</h2>
        <div className="grid2">
          {[['Best draw and fill', a.best], ['Most likely to draw', a.surest]].map(([title, list]) => <div key={title as string}><h3>{title as string}</h3><ol>
            {(list as typeof a.best).map((x) => <li key={x.r.id}><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link> · {pct(x.m.odds)} draw{x.fill !== null ? ` · ${pct(x.fill)} draw and fill` : ''}</li>)}
          </ol></div>)}
        </div>
      </section>)}
      <p className="small muted">Fees are not loaded yet: <a href="https://www.ndow.org/apply-buy/apply-buy-hunting/">see NDOW</a>. You need a Nevada hunting license to apply or earn a point. Dates are NDOW&apos;s 2026 calendar; 2027 dates were not posted on Nov 17, 2026.</p>
    </main>
  );
}
