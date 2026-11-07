import { coSpecial, specialOdds } from '@/lib/coSpecial';
import { CoLand } from "@/components/CoLand";
import { CoUnitSeasonHunters } from "@/components/CoUnitSeasonHunters";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPoints } from '@/lib/points';
import { getFavorites } from '@/lib/favorites';
import { Star } from '@/components/Star';
import { CoUnitReports } from '@/components/CoUnitReports';
import { CoHerds } from '@/components/CoHerds';
import { herdSeries } from '@/lib/coHerds';
import { int } from '@/lib/format';
import { unitKey } from '@/lib/states';
import { poolFor, tableOdds, decodeCode, type OddsTable } from '@/lib/coHunt';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { fmtNeed } from '@/app/hunts/CoFinder';

const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** A Colorado game management unit: its limited deer and elk licenses with odds at your points. */
export async function CoUnitPage({ name }: { name: string }) {
  const unit = await db.unit.findUnique({ where: { state_name: { state: 'CO', name } } });
  if (!unit) notFound();
  const [pts, fav, hunts] = await Promise.all([
    getPoints('CO'),
    getFavorites(),
    db.huntSummary.findMany({ where: { state: 'CO', units: { has: name } }, orderBy: [{ species: 'asc' }, { tagCode: 'asc' }] }),
  ]);
  const nr = pts.res === "NONRESIDENT";
  const pool = poolFor(nr, pts.youth);
  const herds = (unit.herds ?? {}) as Record<string, string | null>;
  const key = unitKey("CO", name);
  return (
    <main className="wrap" style={{ margin: "20px auto 40px" }}>
      <p className="small">
        <Link href={`/hunts?states=CO&unit=CO:${name}${/^[SG]/.test(name) ? '&draw=msg' : ''}`}>Find hunts in this unit →</Link>
        {!/^[SG]/.test(name) && hunts.some(h => h.species === 'MOOSE') && <> · <Link href={`/hunts?states=CO&draw=msg&species=MOOSE&unit=CO:${name}`}>Moose hunts in this unit</Link></>}
      </p>
      <h1 className="star-head">
        Unit {name}{' '}
        <span className="muted" style={{ fontSize: '.5em' }}>
          Colorado
        </span>{' '}
        <Star kind="unit" id={key} saved={fav.units.has(key)} signedIn={fav.signedIn} label />
      </h1>
      <p className="muted">
        {unit.acres ? `${int(unit.acres)} acres` : ''}
        {herds.DEER ? ` · Deer herd ${herds.DEER}` : ''}
        {herds.ELK ? ` · Elk herd ${herds.ELK}` : ''}
      </p>
      <CoLand units={[name]} />
      <CoUnitReports units={[name]} hunts={hunts} points={pts} />
      {!/^[SG]/.test(name) && <CoUnitSeasonHunters units={[name]} />}
      <h2>Hunt Licenses</h2>
      {!hunts.length && <p className="muted">No hunt licenses are loaded for this unit.</p>}
      {hunts.length > 0 && (
        <div className="htable-wrap">
          <table>
            <thead>
              <tr>
                <th>Hunt</th>
                <th>Code</th>
                <th className="num">Licenses</th>
                <th className="num">Success</th>
                <th>Res needs</th>
                <th>Nonres needs</th>
                <th>Draw odds</th>
              </tr>
            </thead>
            <tbody>
              {hunts.map((h) => {
                const p = pts[h.species === 'PRONGHORN' ? 'PRONGHORN' : h.species === 'ELK' ? 'ELK' : 'DEER'];
                const special = coSpecial(h);
                const o = special ? specialOdds(special, nr, pts.youth) : tableOdds(h.oddsByPts as unknown as OddsTable, 'proj', pool, p);
                const ch = o === null ? 'none' : chanceOf(o, o >= 0.995 ? 1 : 0, o > 0 ? 1 : 0);
                const d = decodeCode(h.tagCode ?? '');
                return (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/hunts/${h.slug}`}>{h.unit === name ? h.name.replace(/^Unit \d+ · /, '') : h.name}</Link>
                      {h.units.length > 1 ? <span className="small muted"> (multiple units)</span> : null}
                      {h.privateOnly ? <span className="pill">Private land</span> : null}
                      {d?.type === 'K' ? <span className="pill">Youth</span> : null}
                    </td>
                    <td>{h.tagCode}</td>
                    <td className="num">{h.tags ?? (h.type === 'GENERAL' ? 'General / OTC' : 'Shared / see details')}</td>
                    <td className="num">{h.success5 === null ? '–' : `${Math.round(h.success5 * 100)}%`}</td>
                    <td>{fmtNeed(h.ptsRes, h.ptsResPct)}</td>
                    <td>{fmtNeed(h.ptsNr, h.ptsNrPct)}</td>
                    <td>
                      {pct(o)} {special ? <span className="small muted">{special.draws[0].year} actual{special.draws[0].shared ? ' (shared pool)' : ''}</span> : <span className={`pill ch-${ch}`}>{CHANCE_LABEL[ch]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">
        Odds are historical for moose, sheep and goat and projected for the other species; first choice, {nr ? 'nonresident' : 'resident'}
        {pts.youth ? ' youth' : ''}. Shows hunt codes that include this unit under the CPW regulations. Success: up to 5 seasons of
        CPW harvest estimates.
      </p>
    </main>
  );
}
