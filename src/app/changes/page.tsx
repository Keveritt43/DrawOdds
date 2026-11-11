import { MtElsewhere } from "@/components/MtHome";
import { CoChanges } from "@/components/CoPages";
import { getState } from "@/lib/residency";
import Link from 'next/link';
import { huntHref } from '@/lib/huntSlug';
import { db } from '@/lib/db';
import { getDraw } from '@/lib/residency';
import { DRAW_SPECIES } from '@/lib/species';
import { int, pctOdds, SPECIES_LABEL, WEAPON, antlerLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'What Changed', description: 'Idaho controlled hunts with more or fewer tags than last year, new and dropped hunts, and leftover tags from the second drawing.' };

export default async function ChangesPage() {
  if ((await getState()).code === "CO") return <CoChanges />;
  if ((await getState()).code === "MT") return <main className="wrap" style={{ maxWidth: 860, margin: '24px auto 48px' }}><h1>What Changed</h1><MtElsewhere what="This change log" /></main>;
  const draw = await getDraw();
  const species = DRAW_SPECIES[draw];
  const rows = await db.huntSummary.findMany({ where: { state: 'ID', type: 'CONTROLLED', species: { in: species } } });
  const label = (r: (typeof rows)[number]) => `${SPECIES_LABEL[r.species]} ${r.huntNumber} · ${antlerLabel(r.species, r.antlerClass)} · ${WEAPON[r.weapon]} · area ${r.areaName}`;
  const year = Math.max(...rows.map((r) => r.oddsLastYear ?? 0));

  const changed = rows
    .filter((r) => r.permitsLast !== null && r.permitsPrev !== null && r.permitsLast !== r.permitsPrev)
    .sort((a, b) => Math.abs(b.permitsLast! - b.permitsPrev!) - Math.abs(a.permitsLast! - a.permitsPrev!));
  const newHunts = rows.filter((r) => r.oddsYears <= 1);

  // dropped: in last year's drawing but not this year's (by species + hunt area)
  const draws = await db.drawOdds.findMany({ where: { draw: 1, species: { in: species }, year: { in: [year, year - 1] } }, select: { species: true, year: true, areaName: true, huntNumber: true, permits: true } });
  const now = new Set(draws.filter((d) => d.year === year).map((d) => `${d.species}|${d.areaName}`));
  const dropped = draws.filter((d) => d.year === year - 1 && !now.has(`${d.species}|${d.areaName}`));

  const leftovers = rows.filter((r) => (r.leftoverTags ?? 0) > 0).sort((a, b) => (b.leftoverYear ?? 0) - (a.leftoverYear ?? 0) || (b.leftoverTags ?? 0) - (a.leftoverTags ?? 0));
  const link = (r: (typeof rows)[number]) => <Link href={huntHref(r)}>{label(r)}</Link>;

  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>What Changed</h1>
      <p className="muted">{draw === 'MSG' ? 'Moose, bighorn sheep and mountain goat' : 'Deer, elk and pronghorn'} controlled hunts, {year} drawing vs {year - 1}. <a href="#tags">Tag changes ({changed.length})</a> · <a href="#new">New ({newHunts.length})</a> · <a href="#dropped">Dropped ({dropped.length})</a> · <a href="#leftovers">Leftover tags ({leftovers.length})</a></p>

      <h2 id="tags">More Or Fewer Tags</h2>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>Hunt</th><th>{year - 1}</th><th>{year}</th><th>Change</th><th>Odds {year}</th></tr></thead>
        <tbody>{changed.slice(0, 80).map((r) => (
          <tr key={r.id}><td>{link(r)}</td><td>{int(r.permitsPrev)}</td><td>{int(r.permitsLast)}</td>
            <td className={r.permitsLast! > r.permitsPrev! ? 'best' : ''}>{r.permitsLast! > r.permitsPrev! ? '+' : ''}{int(r.permitsLast! - r.permitsPrev!)} ({Math.round(((r.permitsLast! - r.permitsPrev!) / Math.max(1, r.permitsPrev!)) * 100)}%)</td>
            <td>{pctOdds(r.resOddsLast)} res · {pctOdds(r.nrOddsLast)} NR</td></tr>
        ))}</tbody>
      </table></div>
      {changed.length > 80 && <p className="small muted">Showing the 80 biggest changes of {changed.length}.</p>}

      <h2 id="new">New Or Renumbered With No History</h2>
      {newHunts.length ? <ul>{newHunts.map((r) => <li key={r.id}>{link(r)} · {int(r.tags)} tags</li>)}</ul> : <p className="muted">None.</p>}

      <h2 id="dropped">In {year - 1}, Gone In {year}</h2>
      {dropped.length ? <ul>{dropped.map((d) => <li key={`${d.species}${d.huntNumber}`}>{SPECIES_LABEL[d.species]} {d.huntNumber}, area {d.areaName} ({int(d.permits)} tags in {year - 1})</li>)}</ul> : <p className="muted">None.</p>}

      <h2 id="leftovers">Leftover Tags (Second Drawing)</h2>
      <p className="small muted">Tags left after the main drawing go to IDFG&apos;s second drawing (deer, elk, pronghorn: Aug 5-15). Nonresident limits don&apos;t apply. Last year&apos;s leftovers are the best guide to this year&apos;s.</p>
      <div className="cmp-wrap"><table className="cmp-table">
        <thead><tr><th>Hunt</th><th>Year</th><th>Leftover tags</th><th>Applied / drew</th></tr></thead>
        <tbody>{leftovers.map((r) => (
          <tr key={r.id}><td>{link(r)}</td><td>{r.leftoverYear}</td><td>{int(r.leftoverTags)}</td><td>{r.leftoverApps !== null ? `${int(r.leftoverApps)} / ${int(r.leftoverDrew)}` : '-'}</td></tr>
        ))}</tbody>
      </table></div>
      <p><Link href="/hunts?leftover=1&type=CONTROLLED&sort=leftover">Filter Find A Hunt to hunts with leftovers →</Link></p>
    </main>
  );
}
