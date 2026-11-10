import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPoints } from '@/lib/points';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct as pct0 } from '@/lib/format';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { unitKey } from '@/lib/states';
import { WyWildernessNote } from '@/components/WyWildernessNote';
import { wyAreaLabel, wyPool, wyTableOdds, WY_POOL_SHORT, WY_UNIT_SPECIES, type WyOddsTable } from '@/lib/wyHunt';

const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);
const OWNER: Record<string, string> = { BLM: 'BLM', USFS: 'Forest Service', STATE: 'State', WGFD: 'Game & Fish', NPS: 'National Park', FWS: 'Fish & Wildlife', BOR: 'Reclamation', DOD: 'Defense', GRASS: 'National Grassland', LOCAL: 'Local government', PRIVATE: 'Private', TRIBAL: 'Wind River Reservation', WATER: 'Water', OTHER: 'Other' };

/** A Wyoming hunt area for one species: its licenses with odds for your settings, land and size. */
export async function WyUnitPage({ name }: { name: string }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'WY', name } } });
  if (!unit) notFound();
  const species = WY_UNIT_SPECIES[name[0]] ?? 'DEER';
  const spLabel = species === 'PRONGHORN' ? 'antelope' : species.toLowerCase();
  const [pts, fav, hunts] = await Promise.all([
    getPoints('WY'),
    getFavorites(),
    db.huntSummary.findMany({ where: { state: 'WY', units: { has: name } }, orderBy: [{ tagCode: 'asc' }] }),
  ]);
  const nr = pts.res === 'NONRESIDENT';
  const pool = wyPool(nr, pts.wySpecial === true);
  const p = nr ? pts[species] : 0;
  const own = (unit.landOwnership ?? []) as { manager: string; pct: number }[];
  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href={`/hunts?states=WY&unit=WY:${name}&species=${species}`}>Find Wyoming {spLabel} hunts in this area →</Link></p>
      <h1 className="star-head">Wyoming {spLabel[0].toUpperCase() + spLabel.slice(1)} Hunt {wyAreaLabel(name)} <Star kind="unit" id={unitKey('WY', name)} saved={fav.units.has(unitKey('WY', name))} signedIn={fav.signedIn} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {unit.acres ? `${int(unit.acres / 640)} mi²` : 'Size not computed'}
        {unit.publicPct !== null ? ` · ${Math.round(unit.publicPct)}% public land` : ''}
        {unit.accessYesAcres ? ` · ${int(unit.accessYesAcres)} acres of Walk-In / Hunter Management Areas (${unit.accessYesCount ?? 0})` : ''}
        {' · '}WGFD {spLabel} hunt area. Deer, elk and antelope areas have different boundaries.
      </p>
      <WyWildernessNote units={[name]} nr={nr} />
      {own.length > 0 && (
        <p className="small">{own.filter((o) => o.pct >= 0.5).map((o) => `${OWNER[o.manager] ?? o.manager} ${Math.round(o.pct)}%`).join(' · ')}
          <span className="muted"> · BLM Wyoming surface management; public ownership is not permission to cross private land.</span></p>
      )}
      <h2>{hunts.length} {spLabel[0].toUpperCase() + spLabel.slice(1)} License{hunts.length === 1 ? '' : 's'}</h2>
      {!pts.set && nr && <p className="small"><Link href="/account#hunting-preferences">Set your Wyoming points</Link> for odds at your points.</p>}
      <div className="htable-wrap"><table><thead><tr><th aria-label="Save" /><th>License</th><th>Limitations</th><th className="num">Quota</th><th className="num">Your odds ({nr ? `${WY_POOL_SHORT[pool]}, ${p} pts` : 'resident'})</th><th className="num">Success 5-yr</th></tr></thead>
        <tbody>{hunts.map((h) => {
          const o = wyTableOdds(h.oddsByPts as unknown as WyOddsTable, 'proj', pool, p);
          return <tr key={h.id}><td><Star kind="hunt" id={h.huntId} saved={fav.hunts.has(h.huntId)} signedIn={fav.signedIn} /></td><td><Link href={`/hunts/${h.slug}`}>{h.name}</Link></td><td className="small">{h.takeMethod}</td><td className="num">{h.tags === null ? '–' : int(h.tags)}</td><td className="num">{pct(o)} <span className="small muted">{o === null ? '' : CHANCE_LABEL[chanceOf(o, 0, o)]}</span></td><td className="num">{pct0(h.success5)}</td></tr>;
        })}</tbody></table></div>
      <p className="small muted">Odds: next draw where a projection passed our backtest (antelope, deer), otherwise the last draw. Region general licenses for this area's nonresident region are listed with it. Source: WGFD draw reports, regulations and harvest surveys; confirm with WGFD before you apply.</p>
    </main>
  );
}
