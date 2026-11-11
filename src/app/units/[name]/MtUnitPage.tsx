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
import { mtPersonal, mtIsAntelopeUnit, mtUnitLabel, MT_OWNER, type MtPointOdds } from '@/lib/mtHunt';
import { MtBmaDistrict } from '@/components/MtBma';

const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** A Montana hunting district with its licences and odds for your settings: a deer/elk district ("261": general
 *  licences, permits and B licences) or an antelope district ("A320", or a Region 7 portion "A701N": drawn antelope
 *  licences and Antelope B licences). Deer/elk and antelope districts are different ground. */
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
  const own = (unit.landOwnership ?? []) as { manager: string; pct: number }[];
  const antelope = mtIsAntelopeUnit(name);
  const portion = /[NS]$/.test(name);
  const local = hunts.find((h) => h.units.length === 1)?.areaName?.replace(/^HD \d+ · /, '');
  const title = antelope
    ? `Montana Antelope ${portion ? `${mtUnitLabel(name).replace(/^HD/, 'District')} of the Yellowstone` : `District ${name.slice(1)}`}${local && !portion ? ` · ${local}` : ''}`
    : `Montana Hunting District ${name}${hunts[0]?.areaName && hunts[0].type === 'GENERAL' ? ` · ${hunts[0].areaName}` : ''}`;
  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><Link href={`/hunts?states=MT&unit=MT:${name}${antelope ? '&species=PRONGHORN' : ''}`}>Find Montana {antelope ? 'antelope ' : ''}hunts in this district →</Link></p>
      <h1 className="star-head">{title} <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label /></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {unit.acres ? `${int(unit.acres / 640)} mi²` : 'Size not computed'}{unit.publicPct !== null ? ` · ${Math.round(unit.publicPct)}% public land` : ''} · {antelope
          ? `FWP antelope hunting district${portion ? ' portion (FWP sets Region 7 antelope licenses north and south of the Yellowstone River)' : ''}; deer and elk districts have different boundaries`
          : 'FWP deer and elk hunting district (antelope districts have different boundaries)'}
      </p>
      {own.length > 0 && (
        <p className="small">{own.filter((o) => o.pct >= 0.5).map((o) => `${MT_OWNER[o.manager] ?? o.manager} ${Math.round(o.pct)}%`).join(' · ')}
          <span className="muted"> · BLM surface management; public ownership is not permission to cross private land, and state trust land has its own access rules.</span></p>
      )}
      <MtBmaDistrict unit={name} publicPct={unit.publicPct} />
      {!pts.set && <p className="small"><Link href="/account#hunting-preferences">Set your Montana points</Link> for odds at your points.</p>}
      {antelope ? <p className="small">Montana sells no general antelope license: every antelope license is drawn, with bonus points. {nr ? 'As a nonresident you apply without a combination license.' : ''}</p> : <>
      <h2>General Licenses</h2>
      {general.length ? <div className="htable-wrap"><table><thead><tr><th aria-label="Save" /><th>License</th><th>Opportunities</th><th className="num">Quota</th><th className="num">Your odds ({nr ? `combination draw, ${pts.combo} pts` : 'resident'})</th><th className="num">Success</th></tr></thead><tbody>{general.map(row)}</tbody></table></div>
        : <p className="muted">No general license is valid here: hunting is by drawing only.</p>}
      </>}
      <h2>{antelope ? `${draws.length} Antelope License${draws.length === 1 ? '' : 's'} And B License${draws.length === 1 ? '' : 's'}` : `${draws.length} Permit${draws.length === 1 ? '' : 's'} And B License${draws.length === 1 ? '' : 's'}`}</h2>
      {draws.length ? <div className="htable-wrap"><table><thead><tr><th aria-label="Save" /><th>License</th><th>Opportunity</th><th className="num">Quota</th><th className="num">Your odds</th><th className="num">Success</th></tr></thead><tbody>{draws.map(row)}</tbody></table></div>
        : <p className="muted">No drawn {antelope ? 'antelope licenses' : 'permits or B licenses'} in this district.</p>}
      <p className="small muted">Odds: the last draw, not a forecast. {antelope ? 'Antelope licenses' : 'Permits'} and B licenses at your saved bonus points for that license type, if you buy a point this year. Success is FWP&apos;s district estimate for all hunters of that species, surveyed seasons only. Over-the-counter B licenses are not listed yet. Source: FWP regulations, drawing statistics and harvest estimates; confirm with FWP before you apply.</p>
    </main>
  );
}
