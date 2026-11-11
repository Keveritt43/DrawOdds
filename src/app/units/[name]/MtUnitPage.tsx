import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { int, pct as pct0 } from '@/lib/format';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { unitKey } from '@/lib/states';
import { mtPersonal, type MtPointOdds } from '@/lib/mtHunt';

const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** A Montana deer/elk hunting district: its general licences, permits and B licences with odds for your settings. */
export async function MtUnitPage({ name }: { name: string }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'MT', name } } });
  if (!unit) notFound();
  const [store, fav, hunts] = await Promise.all([
    getPointsStore(), getFavorites(),
    db.huntSummary.findMany({ where: { state: 'MT', units: { has: name } }, orderBy: [{ species: 'asc' }, { type: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const pts = readMtPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const key = unitKey('MT', name);
  const general = hunts.filter((h) => h.type === 'GENERAL');
  const draws = hunts.filter((h) => h.type !== 'GENERAL');
  const row = (h: (typeof hunts)[number]) => {
    const m = mtPersonal(h, pts, nr);
    const po = h.pointOdds as unknown as MtPointOdds | null;
    return <tr key={h.id}><td><Star kind="hunt" id={h.huntId} saved={fav.hunts.has(h.huntId)} signedIn={fav.signedIn} /></td>
      <td><Link href={`/hunts/${h.slug}`}>{h.name}</Link>{h.units.length > 1 ? <span className="small muted"> · {h.units.length} districts</span> : null}</td>
      <td className="small">{h.takeMethod}{h.privateOnly ? <b> · Private land</b> : ''}</td>
      <td className="num">{po?.kind === 'general' ? '–' : h.tags === null ? 'Unlimited' : int(h.tags)}</td>
      <td className="num">{pct(m.odds)} <span className="small muted">{m.odds === null ? '' : CHANCE_LABEL[chanceOf(m.odds, 0, m.odds)]}</span></td>
      <td className="num">{pct0(h.success5)}</td></tr>;
  };
  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href={`/hunts?states=MT&unit=MT:${name}`}>Find Montana hunts in this district →</Link></p>
      <h1 className="star-head">Montana Hunting District {name}{hunts[0]?.areaName && hunts[0].type === 'GENERAL' ? ` · ${hunts[0].areaName}` : ''} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {unit.acres ? `${int(unit.acres / 640)} mi²` : 'Size not computed'} · FWP deer and elk hunting district (antelope districts have different boundaries) · public land not measured yet
      </p>
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Montana points</Link> for odds at your points.</p>}
      <h2>General Licenses</h2>
      {general.length ? <div className="htable-wrap"><table><thead><tr><th aria-label="Save" /><th>License</th><th>Opportunities</th><th className="num">Quota</th><th className="num">Your odds ({nr ? `combination draw, ${pts.combo} pts` : 'resident'})</th><th className="num">Success</th></tr></thead><tbody>{general.map(row)}</tbody></table></div>
        : <p className="muted">No general license is valid here: hunting is by drawing only.</p>}
      <h2>{draws.length} Permit{draws.length === 1 ? '' : 's'} And B License{draws.length === 1 ? '' : 's'}</h2>
      {draws.length ? <div className="htable-wrap"><table><thead><tr><th aria-label="Save" /><th>License</th><th>Opportunity</th><th className="num">Quota</th><th className="num">Your odds</th><th className="num">Success</th></tr></thead><tbody>{draws.map(row)}</tbody></table></div>
        : <p className="muted">No drawn permits or B licenses in this district.</p>}
      <p className="small muted">Odds: the last draw, not a forecast. Permits and B licenses at your saved bonus points for that license type, if you buy a point this year. Success is FWP&apos;s district estimate for all hunters of that species, surveyed seasons only. Over-the-counter B licenses are not listed yet. Source: FWP regulations, drawing statistics and harvest estimates; confirm with FWP before you apply.</p>
    </main>
  );
}
