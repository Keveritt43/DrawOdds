import { huntWeaponLabel } from '@/lib/huntWeaponLabel';
import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow, TrophyMark } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict, antlerLabel } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import { orIsGeneral, orPo, orUnitLabel, OR_WEAPON_LABEL } from '@/lib/orHunt';

/** Oregon result card: Idaho's card, with ODFW's two kinds of deer and elk hunt (general seasons over the counter,
 *  controlled hunts drawn 75% by preference points and 25% at random). */
export function OrHuntCard({ r, odds, points, nr, basis, mode = 'proj', saved, signedIn }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; basis: string; mode?: 'proj' | 'last'; saved: boolean; signedIn: boolean;
}) {
  const po = orPo(r);
  const gen = orIsGeneral(r);
  const pool = nr ? 'nr' : 'res';
  const projected = mode === 'proj' && !!po?.projected?.includes(pool);
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const where = r.units.length > 3 ? `${r.units.length} units` : r.areaName;
  return (
    <article className="hrow co-row or-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <TrophyMark score={r.scoreTrophy} hunt={r} />
          <span className={`pill ${gen ? 'gen' : 'ctl'}`}>{gen ? 'General season' : 'Controlled hunt'}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{gen ? 'No draw' : r.tags === null ? '–' : `${int(r.tags)} tags`}</span>
      </div>
      <div className="dates">
        {[huntWeaponLabel(r), antlerLabel(r.species, r.antlerClass), !gen && r.tagCode ? `Hunt ${r.tagCode}` : '', where, po?.dates || dateRange(r.openDate, r.closeDate),
          r.youthOnly ? 'Youth only' : '', po?.newHunt && !gen ? 'New hunt area for 2026' : '', po?.privateLimited ? 'Private lands limit access' : '', r.privateOnly ? 'Private land only' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{gen ? 'Tag · no draw' : `Draw odds · ${points ?? 0} pts`}</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{odds === null ? 'No draw data' : CHANCE_LABEL[chance]}</span>
          <span className="sub">{gen ? 'Over the counter' : projected ? `${po?.projYear ?? 2027} projected` : `${po?.year ?? 2026} draw`}</span>
        </div>
        <div>
          <span className="k">Success {years ? `${years} seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? (po?.newHunt ? 'New hunt area' : 'No harvest data') : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">{gen ? `${orUnitLabel(r.units[0])}, ${(OR_WEAPON_LABEL[r.weapon] ?? '').toLowerCase()}` : 'This hunt'}{r.harvestLastYear ? ` · ${r.harvestLastYear}: ${pct(r.successLast)}` : ''}</span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: {r.privateOnly ? '0% (private land only)' : r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%${po?.publicPctSource === 'odfw' ? ' (ODFW)' : ''}`}
        {basis ? ` · ${basis}` : ''}
      </div>
    </article>
  );
}
