import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange, fmtNeed, fmtCreep } from '@/lib/coDisplay';
import { wyAreaLabel, WY_POOL_SHORT, wyPool, type WyPointOdds } from '@/lib/wyHunt';

/** Wyoming result card: Idaho's card structure, with Wyoming's pools (resident random; nonresident regular or
 *  special preference + random) and points needed for nonresidents. */
export function WyHuntCard({ r, odds, points, nr, special, mode, saved, signedIn }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; special: boolean; mode: 'last' | 'proj'; saved: boolean; signedIn: boolean;
}) {
  const po = r.pointOdds as unknown as WyPointOdds | null;
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = Math.min(5, r.harvestYears),
    crowd = crowdVerdict(r.huntersSqMi),
    success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const pool = wyPool(nr, special);
  const projected = mode === 'proj' && !!po?.projected && nr;
  const special_ = po?.pools.special;
  return (
    <article className="hrow co-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <span className={`pill ${r.type === 'GENERAL' ? 'gen' : 'ctl'}`}>{r.type === 'GENERAL' ? (nr ? `General · NR Region ${po?.nrRegion ?? '?'} license` : 'General · Over the counter') : r.tagCode?.includes('R-') ? 'Nonresident Region Draw' : 'Limited Quota Draw'}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{r.type === 'GENERAL' ? (nr ? 'Region license quota' : 'No quota') : r.tags === null ? (r.tagCode?.includes('R-') ? 'Region quota: see details' : 'Quota: see WGFD') : `${int(r.tags)} licenses`}</span>
      </div>
      <div className="dates">
        {[r.takeMethod, r.units.length > 1 ? r.units.map(wyAreaLabel).join(', ') : '', dateRange(r.openDate, r.closeDate), r.privateOnly ? 'Private land' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      {nr && (
        <div className="small" style={{ margin: '8px 0' }}>
          <span className="k">Points needed ({r.oddsLastYear ?? 'latest draw'})</span>{' '}
          <span className="nr">Regular {po?.pools.regular ? r.effNr === null ? 'everyone drew' : fmtNeed(r.ptsNr, 1 - (r.effNr - Math.floor(r.effNr + 1e-9))) : '–'}</span>
          {special_ ? <> · <span className="nr">Special {special_.eff === null ? 'everyone drew' : fmtNeed(Math.floor(special_.eff + 1e-9), 1 - (special_.eff - Math.floor(special_.eff + 1e-9)))}</span></> : null}
          {' '}· Creep {fmtCreep(r.creepNr)}
          {po?.pools.regular && r.effNr !== null && (r.oddsByPts as unknown as { last?: { nr?: number[] } } | null)?.last?.nr?.[0] === 1 ? <span className="muted"> · random draw covered the rest: everyone drew</span> : null}
        </div>
      )}
      <div className="hrow-stats three">
        <div>
          <span className="k">{r.type === 'GENERAL' && !nr ? 'License' : `Draw odds · ${nr ? `${r.type === 'GENERAL' ? `Region ${po?.nrRegion ?? ''} · ` : ''}${WY_POOL_SHORT[pool]} · ${points ?? 0} pts` : 'Resident'}`}</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>
            {odds === null ? (nr && special && !special_ ? 'No special pool' : 'No draw data') : CHANCE_LABEL[chance]}
          </span>
          <span className="sub">
            {r.type === 'GENERAL' && !nr ? 'General license, over the counter' : <>{projected ? `${po!.projYear} projected` : `${r.oddsLastYear ?? 'Latest'} draw`} · {nr ? 'NR' : 'resident, estimated'}</>}
          </span>
        </div>
        <div>
          <span className="k">Success {years ? `${years}-yr` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">{po?.harvestBasis ? 'Region general seasons' : r.harvestLastYear ? `${r.harvestLastYear}: ${pct(r.successLast)}` : 'WGFD harvest survey'}</span>
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
        {r.accessYesPct !== null ? ` · Walk-In / HMA: ${Math.round(r.accessYesPct)}%` : ''}
        {r.privateOnly ? ' · Valid on private land: landowner permission needed' : ''}
      </div>
    </article>
  );
}
