import { huntWeaponLabel } from '@/lib/huntWeaponLabel';
import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow, TrophyMark } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import type { NvPointOdds } from '@/lib/nvHunt';

/** Nevada result card: Idaho's card structure, with NDOW's bonus-point draw (always the 2025 draw, labelled). */
export function NvHuntCard({ r, odds, points, nr, basis, saved, signedIn }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; basis: string; saved: boolean; signedIn: boolean;
}) {
  const po = r.pointOdds as unknown as NvPointOdds | null;
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const resOnly = po?.residentsOnly === true;
  return (
    <article className="hrow co-row nv-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <TrophyMark score={r.scoreTrophy} hunt={r} />
          <span className="pill ctl">{r.youthOnly ? 'Junior draw' : 'Bonus-point draw'}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{r.tags === null ? '–' : `${int(r.tags)} tags`}</span>
      </div>
      <div className="dates">
        {[huntWeaponLabel(r), `Hunt ${r.tagCode}`, dateRange(r.openDate, r.closeDate), resOnly ? 'Residents only' : '', r.youthOnly ? 'Junior (12–17) only' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">Draw odds · {nr ? 'NR' : 'Resident'} · {points ?? 0} bonus pts</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{odds === null ? (nr && resOnly ? 'Residents only' : 'No 2025 draw') : CHANCE_LABEL[chance]}</span>
          <span className="sub">{po?.year ?? 2025} draw · last draw NDOW has published by points</span>
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
        Draw and fill: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: {r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {basis ? ` · ${basis}` : ''}
      </div>
    </article>
  );
}
