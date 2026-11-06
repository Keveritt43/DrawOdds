import { getCoScoringContext } from '@/lib/coScoringContext';
import type { CoScored } from '@/lib/coScores';
import { withCoScores, withCoOpportunity } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import Link from 'next/link';
import type { PointOdds } from '@/lib/coHunt';
import type { HuntSummary } from '@prisma/client';
import { Star } from './Star';
import { ScoreRow } from './HuntCards';
import { CHANCE_LABEL, type Chance } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange, fmtNeed, fmtCreep } from '@/lib/coDisplay';
/** Colorado uses Idaho's card structure while keeping personalized point-draw odds explicit. */
export async function CoHuntCard({
  r,
  hasOtcElk = false,
  odds,
  chance,
  points,
  nr,
  mode,
  saved,
  signedIn,
}: {
  r: CoScored;
  hasOtcElk?: boolean;
  odds: number | null;
  chance: Chance;
  points: number;
  nr: boolean;
  mode: 'last' | 'proj';
  saved: boolean;
  signedIn: boolean;
}) {
  r = withCoOpportunity(withCoScores(r,await getCoScoringContext()), odds, nr);
  const general = (r.pointOdds as unknown as PointOdds)?.general;
  const years = Math.min(5, r.harvestYears),
    crowd = crowdVerdict(r.huntersSqMi),
    success = successVerdict(r.success5, r.species, r.weapon, r.type);
  return (
    <article className="hrow co-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <Link href={`/hunts/${r.slug}`}>{r.name}</Link>
          <span className="pill">
            {r.type === "GENERAL" ? "General / OTC" : "Controlled Draw"}
          </span>
        </span>
        <CompareToggle id={r.id} label={r.name}/><span className="small muted tags">
          {r.tags === null ? (general ? 'Unlimited / see CPW' : 'Shared quota / see details') : `${int(r.tags)} licenses`}
          {r.permitsPrev !== null && r.tags !== null && r.permitsPrev !== r.tags
            ? ` (${r.tags > r.permitsPrev ? '+' : ''}${r.tags - r.permitsPrev})`
            : ''}
        </span>
      </div>
      {hasOtcElk && <span className="pill">Overlapping OTC elk season</span>}
      <div className="dates">
        {[
          r.tagCode,
          r.units.length > 1 ? `Units ${r.units.join(', ')}` : '',
          dateRange(r.openDate, r.closeDate),
          r.privateOnly ? 'Private land only' : '',
          general && !general.nonresident ? 'Residents only' : general && !general.resident ? 'Nonresidents only' : '',
          r.youthOnly ? 'Youth only' : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="small" style={{ margin: '8px 0' }}>
        <span className="k">Points needed ({r.oddsLastYear ?? 'latest draw'})</span>{' '}
        <span className="res">Res {fmtNeed(r.ptsRes, r.ptsResPct)}</span> ·{' '}
        <span className="nr">Nonres {fmtNeed(r.ptsNr, r.ptsNrPct)}</span> · Creep {fmtCreep(nr ? r.creepNr : r.creepRes)}
      </div>
      <div className="hrow-stats three">
        <div>
          <span className="k">Draw odds · {points} points</span>
          <b>{pctOdds(odds)}</b>
          <span
            className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}
          >
            {r.type === 'GENERAL'
              ? odds === null
                ? 'Not eligible'
                : 'OTC eligible'
              : odds === null
                ? 'No draw data'
                : CHANCE_LABEL[chance]}
          </span>
          <span className="sub">
            {mode === 'proj' ? (r.oddsLastYear ?? 2026) + 1 : r.oddsLastYear} · {mode === 'proj' ? 'projected' : 'actual'} ·{' '}
            {nr ? 'NR' : 'resident'}
          </span>
        </div>
        <div>
          <span className="k">Success {years ? `${years}-yr` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">
            {r.harvestLastYear ?? 'Latest'}: {pct(r.successLast)}
          </span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.coPressure?.status==='complete' ? `${int(r.coPressure.totalHuntersPerYear)} deer + elk/yr` : r.coPressure?.status==='missing' ? 'Elk pressure unknown' : r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill:{" "}
        {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'}{" "}
        · Public land:{" "}
        {r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {r.privatePct !== null
          ? ` · Private land: ${Math.round(r.privatePct)}%`
          : ""}
        {r.secondChoice ? " · Reached 2nd choice" : ""}
        {r.hybrid ? " · Hybrid draw" : ""}
      </div>
    </article>
  );
}
