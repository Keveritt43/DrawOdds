import Link from 'next/link';
import { HuntLink } from '@/components/HuntNavigation';
import type { CoScored } from '@/lib/coScores';
import { CompareToggle } from './Compare';
import { Star } from './Star';
import { ScoreRow } from './HuntCards';
import { CHANCE_LABEL, chanceOf } from '@/lib/coOdds';
import { pct, pctOdds, int, density, crowdVerdict, successVerdict } from '@/lib/format';
import { dateRange } from '@/lib/coDisplay';
import { seasonsSummary } from '@/lib/tagSeasons';
import { mtDistricts, type MtPointOdds } from '@/lib/mtHunt';

/** Montana result card: Idaho's card structure, with Montana's two systems — general licences (residents over the
 *  counter, nonresidents through the combination draw) and bonus-point permits and B licences. */
export function MtHuntCard({ r, odds, points, nr, basis, saved, signedIn }: {
  r: CoScored; odds: number | null; points: number | null; nr: boolean; basis: string; saved: boolean; signedIn: boolean;
}) {
  const po = r.pointOdds as unknown as MtPointOdds | null;
  const general = po?.kind === 'general';
  const chance = chanceOf(odds, 0, odds ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const notBuying = !general && /not buying/.test(basis);
  const pill = general ? (nr ? 'General · Combination draw for nonresidents' : 'General · Over the counter') : /Permit$/.test(po?.license ?? '') ? 'Permit · Bonus-point draw' : 'B License · Bonus-point draw';
  return (
    <article className="hrow co-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <span className={`pill ${general ? 'gen' : 'ctl'}`}>{pill}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{general ? (nr ? 'Statewide combination quota' : 'No quota') : r.tags === null ? 'Unlimited' : `${int(r.tags)} ${/Permit$/.test(po?.license ?? '') ? 'permits' : 'licenses'} (${po?.year ?? 'latest'})`}</span>
      </div>
      <div className="dates">
        {[general ? r.areaName : mtDistricts(r.units), r.takeMethod, seasonsSummary(r.tagSeasons) || dateRange(r.openDate, r.closeDate), r.privateOnly ? 'Private land only' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{general && !nr ? 'License' : general ? `Combination draw · ${points ?? 0} pref. pts` : `Draw odds · ${nr ? 'NR' : 'Resident'} · ${notBuying ? 'no point bought' : `${points ?? 0} bonus pts`}`}</span>
          <b>{pctOdds(odds)}</b>
          <span className={`verdict ${odds === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{odds === null ? 'No draw data' : CHANCE_LABEL[chance]}</span>
          <span className="sub">{general && !nr ? 'Resident general license' : `${po?.combo?.year ?? po?.year ?? 'Latest'} draw · last draw, not a forecast`}</span>
        </div>
        <div>
          <span className="k">Success {years ? `${years} surveyed seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">District, all licenses{r.harvestLastYear ? ` · ${r.harvestLastYear}: ${pct(r.successLast)}` : ''}</span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/surveyed yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: not measured yet
        {r.privateOnly ? ' · Valid on private land only: landowner permission needed' : ''}
        {nr && po?.needsGeneral ? ' · Also needs a general license: for a nonresident, the combination draw' : ''}
        {notBuying ? <> · <Link href="/account#hunting-preferences">Your banked points only count if you buy a point</Link></> : null}
      </div>
    </article>
  );
}
