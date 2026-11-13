import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict, antlerLabel } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import { waLicense, waPo, WA_WEAPON_LABEL, WA_WHO } from '@/lib/waHunt';

const PILL = { general: 'General season', special: 'Special permit', multi: 'Multi-season' } as const;

/** Washington result card: Idaho's card, with WDFW's three kinds of deer and elk hunt (general season over the
 *  counter, special permits and the multi-season tag drawing, both estimated from the weighted-point drawing). */
export function WaHuntCard({ r, odds, points, nr, basis, mode = 'proj', saved, signedIn, tagOk }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; basis: string; mode?: 'proj' | 'last'; saved: boolean; signedIn: boolean; tagOk?: boolean | null;
}) {
  const po = waPo(r);
  const lic = waLicense(r);
  const gen = lic === 'general';
  const projected = mode === 'proj' && !!po?.projected;
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const where = r.units.length > 3 ? (lic === 'multi' ? 'Statewide' : `${r.units.length} GMUs`) : r.areaName;
  const side = po?.side ? (po.side === 'EAST' ? 'Eastern elk tag' : 'Western elk tag') : '';
  return (
    <article className="hrow co-row wa-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <span className={`pill ${gen ? 'gen' : 'ctl'}`}>{PILL[lic]}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{gen ? 'No draw' : r.tags === null ? '–' : `${int(r.tags)} ${lic === 'multi' ? 'tags' : 'permits'}`}</span>
      </div>
      <div className="dates">
        {[gen ? WA_WEAPON_LABEL[r.weapon] : po?.category, antlerLabel(r.species, r.antlerClass), r.tagCode && !gen ? `Hunt ${r.tagCode}` : '', where, side, po?.dates || dateRange(r.openDate, r.closeDate),
          r.youthOnly ? 'Youth only (under 16)' : '', po?.restricted ? (WA_WHO[po.category ?? ''] ?? 'Limited eligibility') : '', po?.noPointData ? 'No point-level data (65+)' : '', r.privateOnly ? 'Private land only' : '', tagOk === false ? 'Your saved tag can\'t apply' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{gen ? 'Tag · no draw' : `Draw odds · ${points ?? 0} pts`}</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{odds === null ? 'No draw data' : CHANCE_LABEL[chance]}</span>
          <span className="sub">{gen ? 'Over the counter' : `${projected ? `${po?.projYear ?? 2027} projected` : `${po?.year ?? 2025} drawing`} · estimated`}</span>
        </div>
        <div>
          <span className="k">Success {years ? `${years} seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">{gen ? `GMU ${r.units[0]}, ${(WA_WEAPON_LABEL[r.weapon] ?? '').toLowerCase()}` : 'This hunt'}{r.harvestLastYear ? ` · ${r.harvestLastYear}: ${pct(r.successLast)}` : ''}</span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: {r.privateOnly ? '0% (private land only)' : r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {basis ? ` · ${basis}` : ''}
      </div>
    </article>
  );
}
