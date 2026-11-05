import Link from 'next/link';
import type { PointOdds } from '@/lib/coHunt';
import type { HuntSummary } from '@prisma/client';
import { Star } from './Star';
import { ScoreBadge } from './HuntCards';
import { CHANCE_LABEL, type Chance } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange, fmtNeed, fmtCreep } from '@/lib/coDisplay';
/** Colorado uses Idaho's card structure while keeping personalized point-draw odds explicit. */
export function CoHuntCard({
  r,
  odds,
  chance,
  points,
  nr,
  mode,
  saved,
  signedIn,
}: {
  r: HuntSummary;
  odds: number | null;
  chance: Chance;
  points: number;
  nr: boolean;
  mode: 'last' | 'proj';
  saved: boolean;
  signedIn: boolean;
}) {
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
          <span className="pill">{r.type === 'GENERAL' ? 'General / OTC' : 'Limited'}</span>
        </span>
        <span className="small muted tags">
          {r.tags === null ? 'Unlimited / see CPW' : `${int(r.tags)} licenses`}
          {r.permitsPrev !== null && r.tags !== null && r.permitsPrev !== r.tags
            ? ` (${r.tags > r.permitsPrev ? '+' : ''}${r.tags - r.permitsPrev})`
            : ''}
        </span>
      </div>
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
      {r.scoreQuality !== null ? (
        <div className="srow">
          <ScoreBadge v={r.scoreQuality} label="Quality" />
        </div>
      ) : (
        <p className="small muted" style={{ margin: '6px 0' }}>
          Quality: access data needed
        </p>
      )}
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
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land:{' '}
        {r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {r.secondChoice ? ' · Reached 2nd choice' : ''}
        {r.hybrid ? ' · Hybrid draw' : ''}
      </div>
    </article>
  );
}
