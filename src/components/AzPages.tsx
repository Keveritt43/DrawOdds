import Link from 'next/link';
import { db } from '@/lib/db';
import { int } from '@/lib/format';
import type { AzPointOdds, AzPool } from '@/lib/azHunt';
import backtest from '../../data/az/backtest.json';

/**
 * Arizona's How The Draw Works, What Changed and Application Planner pages, with AZGFD's rules.
 * Dates and fees: the 2026-27 Arizona Hunting Regulations (deer: deadline June 2, 2026, permit-tags mailed by July 24)
 * and the 2026 Pronghorn and Elk Regulations (elk: deadline Feb. 3, 2026, mailed by April 1), read Nov 18, 2026.
 * AZGFD's draw site says the 2027 elk application period opens in January; 2027 dates were not posted on Nov 18.
 * Fees (same regulations): tag prices include the application fee, charged at application ($13 resident, $15
 * nonresident); the rest of the tag is charged at the draw, only if you draw.
 */
const pct = (o: number | null | undefined) => (o == null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.001 ? '<0.1%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
type Row = { id: string; slug: string; name: string; species: string; tagCode: string | null; tags: number | null; success5: number | null; smallSample: boolean; youthOnly: boolean; pointOdds: unknown; oddsByPts: unknown; resOddsLast: number | null; nrOddsLast: number | null; permitsLast: number | null };
export const AZ_FEES = {
  checked: '2026-11-18',
  source: '2026-27 Arizona Hunting Regulations, license and permit-tag fees',
  license: { RESIDENT: 57, NONRESIDENT: 160, youth: 5 },
  application: { RESIDENT: 13, NONRESIDENT: 15 },
  tag: { DEER: { RESIDENT: 58, NONRESIDENT: 315 }, ELK: { RESIDENT: 148, NONRESIDENT: 665 } },
} as const;

function Timeline() {
  const steps: { when: string; what: string; tone?: 'blaze' | 'good' }[] = [
    { when: 'January', what: 'Elk (and pronghorn) applications open; 2027 dates not posted yet' },
    { when: 'Early Feb', what: 'Elk deadline (Feb. 3 in 2026)', tone: 'blaze' },
    { when: 'By Apr 1', what: 'Elk permit-tags mailed (2026)' },
    { when: 'Early June', what: 'Deer deadline (June 2 in 2026)', tone: 'blaze' },
    { when: 'By Jul 24', what: 'Deer permit-tags mailed (2026); leftovers from mid-July', tone: 'good' },
  ];
  return (
    <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {steps.map((s) => <div key={s.when} className="stat" style={s.tone === 'blaze' ? { borderColor: 'var(--blaze)', borderWidth: 2 } : s.tone === 'good' ? { borderColor: 'var(--sage)', borderWidth: 2 } : undefined}>
        <div className="k">{s.when}</div><div style={{ fontWeight: 600, lineHeight: 1.3 }}>{s.what}</div></div>)}
    </div>
  );
}

/** Statewide 2026 first-choice applicants by points, and permits drawn at each level (both choices), for a species. */
function statewide(rows: Row[], species: string, pool: AzPool) {
  const by = new Map<number, [number, number]>();
  for (const r of rows) {
    const po = r.pointOdds as AzPointOdds | null;
    if (!po || r.species !== species || po.restricted || r.youthOnly) continue;
    for (const [p, f1, , , drew] of po.pools?.[pool]?.levels ?? []) { const c = by.get(p) ?? [0, 0]; c[0] += f1; c[1] += drew; by.set(p, c); }
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]);
}

export async function AzGuide() {
  const rows = await db.huntSummary.findMany({ where: { state: 'AZ' } }) as unknown as Row[];
  const bands = (lv: [number, [number, number]][]) => {
    const B: [string, number, number][] = [['0', 0, 0], ['1–2', 0, 0], ['3–5', 0, 0], ['6–9', 0, 0], ['10–14', 0, 0], ['15+', 0, 0]];
    for (const [p, [a, d]] of lv) { const i = p === 0 ? 0 : p <= 2 ? 1 : p <= 5 ? 2 : p <= 9 ? 3 : p <= 14 ? 4 : 5; B[i][1] += a; B[i][2] += d; }
    return B;
  };
  const tables: [string, [string, number, number][]][] = [
    ['Deer · resident', bands(statewide(rows, 'DEER', 'res'))], ['Deer · nonresident', bands(statewide(rows, 'DEER', 'nr'))],
    ['Elk · resident', bands(statewide(rows, 'ELK', 'res'))], ['Elk · nonresident', bands(statewide(rows, 'ELK', 'nr'))],
  ];
  const bt = backtest as Record<string, Record<string, Record<string, { last: number; roll: number }>>>;
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>How Arizona&apos;s Draw Works</h1>
      <p className="muted">Every Arizona deer and elk hunt on this site is drawn. Elk is drawn in the winter (deadline early February), deer in the summer (deadline early June).</p>
      <Timeline />
      <h2>Three passes, bonus points in all of them</h2>
      <ol>
        <li><b>Bonus pass.</b> Up to 20% of each hunt&apos;s permits go to the applications with the most bonus points, looking at their 1st and 2nd choices. Zero points can&apos;t draw in this pass.</li>
        <li><b>1st and 2nd choice pass.</b> Everyone left gets a new random number, plus one more for every bonus point, and AZGFD keeps the lowest. Applications are read in that order, 1st choice then 2nd. So 0 points is 1 number, 4 points is 5, 9 points is 10.</li>
        <li><b>3rd to 5th choice pass.</b> The same again for whatever is left, on your 3rd, 4th and 5th choices.</li>
      </ol>
      <ul>
        <li>Points that count: your bonus points for the species, plus the loyalty point (applied or bought a point five years in a row) and the hunter education point (an AZGFD-approved course). A group&apos;s points are averaged, rounded half up.</li>
        <li>Nonresidents get at most 10% of a hunt&apos;s permits, and at most half of that in the bonus pass.</li>
        <li>You earn a point when you apply and don&apos;t draw, or buy one. Drawing the species resets its points to 0; loyalty and hunter education points stay.</li>
        <li>A 2nd choice can take a permit before a 1st choice with a worse number, so a hunt&apos;s odds depend on how many put it 2nd too. The odds here are for a 1st choice.</li>
      </ul>
      <p>We checked the &quot;points + 1 numbers&quot; rule against AZGFD&apos;s 2021–2026 Bonus Point Reports: it fits the permits issued at each point level better than points² + 1, (points + 1)² or no weighting.</p>
      <h2>What points bought in 2026</h2>
      <p className="small muted">First-choice applicants at each point level, and permits drawn at that level (bonus and 1st/2nd-choice passes, both choices), every deer or elk hunt added up (AZGFD 2026 Bonus Point Reports; youth and CHAMP hunts left out). A statewide rate hides big differences between hunts: check each hunt&apos;s own table.</p>
      <div className="grid2">
        {tables.map(([title, B]) => <div key={title} className="card"><h3 style={{ marginTop: 0 }}>{title}</h3>
          <table className="co-ladder"><thead><tr><th>Points</th><th className="num">First choices</th><th className="num">Permits drawn</th></tr></thead>
            <tbody>{B.map(([b, a, d]) => <tr key={b}><td>{b}</td><td className="num">{int(a)}</td><td className="num">{int(d)}</td></tr>)}</tbody></table></div>)}
      </div>
      <h2>Why the odds aren&apos;t projected</h2>
      <p>AZGFD publishes results by point level after each draw; the latest are the 2026 elk and deer draws. We tested rolling the last draw forward a year (everyone who missed comes back with a point, winners start over, the bonus pass and random pass keep last year&apos;s permits) against simply repeating the last draw, predicting each year from the year before. It lost almost every time, for residents and nonresidents:</p>
      <div className="htable-wrap"><table><thead><tr><th>Predicting</th><th className="num">Repeat last draw</th><th className="num">Roll forward</th></tr></thead>
        <tbody>{Object.entries(bt).flatMap(([sp, pools]) => Object.entries(pools).flatMap(([pool, ys]) => Object.entries(ys).map(([y, v]) => <tr key={sp + pool + y}><td>{sp === 'ELK' ? 'Elk' : 'Deer'} · {pool === 'nr' ? 'nonresident' : 'resident'} · {y}</td><td className="num">{v.last.toFixed(4)}</td><td className="num">{v.roll.toFixed(4)}</td></tr>)))}</tbody></table></div>
      <p className="small muted">Brier score over first-choice applicants (lower is better). So every Arizona page shows the 2026 draw, labelled. AZGFD also renumbers hunts every year; history on hunt pages follows each hunt across the renumbering.</p>
      <p className="small muted">Sources: <a href="https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/draw-process/">AZGFD draw process</a>, <a href="https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/bonus-point-process/">bonus point process and reports</a>, 2026-27 Arizona Hunting Regulations, 2026 Pronghorn and Elk Regulations. <Link href="/hunts?states=AZ">Find Arizona hunts</Link>.</p>
    </main>
  );
}

export async function AzChanges() {
  const rows = await db.huntSummary.findMany({ where: { state: 'AZ' }, orderBy: { tagCode: 'asc' } }) as unknown as Row[];
  const diff = rows.map((r) => {
    const po = r.pointOdds as AzPointOdds | null;
    const prev = po?.history?.['2025'];
    const now = r.tags ?? r.permitsLast ?? 0;
    return { r, now, had: prev ? prev.permits : null, prevHunt: prev?.hunt ?? null, d: prev ? now - prev.permits : null };
  });
  const fresh = diff.filter((x) => x.had === null);
  const moved = diff.filter((x) => x.d !== null && x.d !== 0).sort((a, b) => Math.abs(b.d!) - Math.abs(a.d!));
  const renumbered = diff.filter((x) => x.prevHunt !== null && String(x.prevHunt) !== x.r.tagCode).length;
  const sum = (sp: string, k: 'now' | 'had') => diff.filter((x) => x.r.species === sp && x.had !== null).reduce((a, x) => a + (x[k] ?? 0), 0);
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>What Changed In Arizona</h1>
      <p className="muted">2026 permits against the same hunts in 2025 (2026-27 regulations for deer, 2026 Pronghorn and Elk Regulations for elk). AZGFD renumbers hunts every year: {renumbered} of {diff.length} hunts here had a different number in 2025.</p>
      <div className="stats">
        <div className="stat"><div className="k">Deer permits</div><div className="v">{int(sum('DEER', 'now'))}</div><div className="small muted">{int(sum('DEER', 'had'))} on the same hunts in 2025</div></div>
        <div className="stat"><div className="k">Elk permits</div><div className="v">{int(sum('ELK', 'now'))}</div><div className="small muted">{int(sum('ELK', 'had'))} on the same hunts in 2025</div></div>
        <div className="stat"><div className="k">New or changed hunts</div><div className="v">{fresh.length}</div><div className="small muted">no 2025 hunt to compare</div></div>
      </div>
      <h2>Biggest permit changes</h2>
      <div className="htable-wrap"><table><thead><tr><th>Hunt</th><th className="num">2025</th><th className="num">2026</th><th className="num">Change</th></tr></thead>
        <tbody>{moved.slice(0, 40).map((x) => <tr key={x.r.id}><td><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link>{x.prevHunt !== null && String(x.prevHunt) !== x.r.tagCode ? <span className="small muted"> (was {x.prevHunt})</span> : null}</td><td className="num">{int(x.had)}</td><td className="num">{int(x.now)}</td><td className="num">{x.d! > 0 ? '+' : ''}{x.d}</td></tr>)}</tbody></table></div>
      {fresh.length > 0 && <><h2>New or changed for 2026</h2><ul>{fresh.map((x) => <li key={x.r.id}><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link> · {int(x.now)} permits</li>)}</ul></>}
      <p className="small muted">A hunt is matched to 2025 by its method, open area, legal animal and season order, from AZGFD&apos;s 2025 Draw Odds reports. The 2027 elk hunt list comes out in January, deer in the spring.</p>
    </main>
  );
}

export async function AzPlannerPage() {
  const { getPointsStore } = await import('@/lib/points');
  const { readAzPoints, azGroupPoints } = await import('@/lib/azPoints');
  const { azPersonal } = await import('@/lib/azHunt');
  const pts = readAzPoints((await getPointsStore()).store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const res = nr ? 'NONRESIDENT' : 'RESIDENT';
  const rows = await db.huntSummary.findMany({ where: { state: 'AZ' } }) as unknown as Row[];
  const apps = (['ELK', 'DEER'] as const).map((sp) => {
    const opts = rows.filter((r) => r.species === sp && !(r.pointOdds as AzPointOdds | null)?.restricted && !r.youthOnly).map((r) => ({ r, m: azPersonal({ ...r, type: 'CONTROLLED' }, pts, nr) }))
      .filter((x) => x.m.odds !== null).map((x) => ({ ...x, fill: x.r.success5 !== null && !x.r.smallSample ? x.m.odds! * x.r.success5 : null }));
    const best = [...opts].sort((a, b) => (b.fill ?? -1) - (a.fill ?? -1)).slice(0, 5);
    const surest = [...opts].sort((a, b) => b.m.odds! - a.m.odds!).slice(0, 5);
    return { sp, n: azGroupPoints(pts, sp), best, surest };
  });
  return (
    <main className="wrap" style={{ margin: '20px auto 48px' }}>
      <h1>Arizona Application Planner</h1>
      <p className="muted">One application per species, up to 5 hunt choices in order. Your 1st and 2nd choices get the bonus pass and the first random pass; choices 3–5 only get what&apos;s left. Odds: AZGFD&apos;s 2026 draw for a 1st choice at your saved Arizona points, {nr ? 'nonresident' : 'resident'}.{!pts.set && <> <Link href="/account#hunting-preferences">Set your Arizona points</Link> first.</>}</p>
      <Timeline />
      {apps.map((a) => <section key={a.sp} className="card" style={{ margin: '14px 0' }}>
        <h2 style={{ marginTop: 0 }}>{a.sp === 'ELK' ? 'Elk' : 'Deer'} · {a.n} group point{a.n === 1 ? '' : 's'}</h2>
        <div className="grid2">
          {[['Best draw and fill', a.best], ['Most likely to draw', a.surest]].map(([title, list]) => <div key={title as string}><h3>{title as string}</h3><ol>
            {(list as typeof a.best).map((x) => <li key={x.r.id}><Link href={`/hunts/${x.r.slug}`}>{x.r.name}</Link> · {pct(x.m.odds)} draw{x.fill !== null ? ` · ${pct(x.fill)} draw and fill` : ''}</li>)}
          </ol></div>)}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>What it costs ({nr ? 'nonresident' : 'resident'}): hunting license ${AZ_FEES.license[res]} (needed to apply; valid 365 days) + ${AZ_FEES.application[res]} application fee at application; if you draw, the {a.sp === 'ELK' ? 'elk' : 'deer'} permit-tag (${AZ_FEES.tag[a.sp][res]} including the application fee) is charged at the draw. Youth license ${AZ_FEES.license.youth}.</p>
      </section>)}
      <p className="small muted">Fees: AZGFD {AZ_FEES.source}, checked {AZ_FEES.checked} (AZGFD&apos;s fee table carries no season year). Dates are the 2026 draws; AZGFD had not posted 2027 dates on Nov 18, 2026.</p>
    </main>
  );
}
