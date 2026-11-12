import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import { seasonsSummary } from '@/lib/tagSeasons';
import { utKind, type UtPointOdds } from '@/lib/utHunt';

const PILL = { le: 'Limited entry', oial: 'Once in a lifetime', cwmu: 'CWMU', general: 'General draw', otc: 'Over the counter' } as const;

/** Utah result card: Idaho's card structure, with Utah's three kinds of deer and elk hunt (bonus-point limited
 *  entry and CWMU, the general buck deer preference draw, over-the-counter general elk). */
export function UtHuntCard({ r, odds, points, nr, basis, saved, signedIn }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; basis: string; saved: boolean; signedIn: boolean;
}) {
  const po = r.pointOdds as unknown as UtPointOdds | null;
  const kind = utKind(r);
  const lic = kind === 'otc' ? 'otc' : r.type === 'GENERAL' ? 'general' : r.privateOnly ? 'cwmu' : r.species === 'BISON' ? 'oial' : 'le';
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const units = r.units.length > 3 ? `${r.units.length} hunt boundaries` : r.areaName;
  return (
    <article className="hrow co-row ut-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <span className={`pill ${kind === 'otc' || r.type === 'GENERAL' ? 'gen' : 'ctl'}`}>{PILL[lic]}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{kind === 'otc' ? 'Statewide cap' : r.tags === null ? '–' : `${int(r.tags)} permits`}</span>
      </div>
      <div className="dates">
        {[r.tagCode, units, seasonsSummary(r.tagSeasons) || dateRange(r.openDate, r.closeDate), r.privateOnly ? 'Private land only (CWMU)' : '', r.youthOnly ? 'Youth only' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{kind === 'otc' ? 'Permit · no draw' : `Draw odds · ${nr ? 'NR' : 'Resident'} · ${points ?? 0} ${kind === 'bonus' ? 'bonus' : 'pref.'} pts`}</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{odds === null ? (nr ? 'No NR permits' : 'No draw data') : CHANCE_LABEL[chance]}</span>
          <span className="sub">{kind === 'otc' ? 'Over the counter, statewide cap' : `${po?.year ?? 2026} draw · last draw`}</span>
        </div>
        <div>
          <span className="k">Success {years ? `${years} seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">{kind === 'otc' ? 'Statewide, this hunt' : 'This hunt'}{r.harvestLastYear ? ` · ${r.harvestLastYear}${r.harvestLastYear === 2025 ? ' (prelim.)' : ''}: ${pct(r.successLast)}` : ''}</span>
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
