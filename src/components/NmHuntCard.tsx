import { huntWeaponLabel } from '@/lib/huntWeaponLabel';
import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow, TrophyMark } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import { nmLicense, nmPo, NM_BAG } from '@/lib/nmHunt';
import { NM_POOL_LABEL, type NmPool } from '@/lib/nmSettings';

const PILL = { draw: 'Draw', private: 'Private land draw', otc: 'Over the counter' } as const;

/** New Mexico result card: Idaho's card, for NMDOW's pure lottery (no points). The odds are the hunter's pool's
 *  first-choice odds: residents, nonresidents without an outfitter (6%) or the outfitter pool (10%). */
export function NmHuntCard({ r, odds, nr, basis, pool, mode = 'proj', saved, signedIn }: {
  r: CoScored; odds: number | null; nr: boolean; basis: string; pool?: NmPool; mode?: 'proj' | 'last'; saved: boolean; signedIn: boolean;
}) {
  const po = nmPo(r);
  const lic = nmLicense(r);
  const otc = lic === 'otc';
  const projected = mode === 'proj' && !!po?.projected;
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const where = r.units.length > 3 ? `${r.units.length} GMUs` : r.areaName;
  return (
    <article className="hrow co-row nm-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <TrophyMark score={r.scoreTrophy} hunt={r} />
          <span className={`pill ${otc ? 'gen' : 'ctl'}`}>{PILL[lic]}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{otc ? 'Unlimited' : r.tags === null ? '–' : `${int(r.tags)} licenses`}</span>
      </div>
      <div className="dates">
        {[huntWeaponLabel(r), NM_BAG[po?.bag ?? ''] ?? '', r.tagCode ? `Hunt ${r.tagCode}` : '', where, po?.dates || dateRange(r.openDate, r.closeDate),
          po?.feeType && po.feeType !== 'Standard' ? `${po.feeType} license` : '',
          r.youthOnly ? 'Youth only' : '', po?.mobility ? 'Mobility-impaired only' : '', po?.military ? 'Military only' : '', po?.residentOnly ? 'NM residents only' : '',
          po?.wmaOnly ? 'WMA only' : '', po?.publicOnly ? 'Public land only' : '', po?.onceInALifetime ? 'Once in a lifetime' : '',
          r.privateOnly ? (otc ? 'Private land only · landowner permission' : 'Private land only · landowner code') : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{otc ? 'License · no draw' : 'Draw odds · 1st choice'}</span>
          <b>{otc ? '—' : pctOdds(odds)}</b>
          <span className={`verdict ${otc ? 'good' : odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{otc ? 'Over the counter' : odds === null ? 'No applicants in your pool' : CHANCE_LABEL[chance]}</span>
          <span className="sub">{otc ? 'Private land, unlimited' : `${projected ? 'Next draw, estimated' : `${po?.year ?? 2026} draw`}${pool ? ` · ${NM_POOL_LABEL[pool].replace(/ \(.*\)$/, '').toLowerCase()}` : ''}`}</span>
        </div>
        <div>
          <span className="k">Success {years ? `${years} seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">This hunt{r.harvestLastYear ? ` · ${r.harvestLastYear}: ${pct(r.successLast)}` : ''}</span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill: {!otc && odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: {r.privateOnly ? '0% (private land only)' : r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {basis ? ` · ${basis}` : ''}
      </div>
    </article>
  );
}
