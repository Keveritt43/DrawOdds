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
import { mtBma, bmaPct } from '@/lib/mtBma';

/** Montana result card: Idaho's card structure, with Montana's two systems — general licences (residents over the
 *  counter, nonresidents through the combination draw) and bonus-point permits and B licences. */
export function MtHuntCard({ r, odds, parts, points, nr, basis, saved, signedIn }: {
  r: CoScored; odds: number | null; parts?: { combo: number | null; permit: number | null; comboName: string };
  points: number | null; nr: boolean; basis: string; saved: boolean; signedIn: boolean;
}) {
  const po = r.pointOdds as unknown as MtPointOdds | null;
  const general = po?.kind === 'general';
  // A nonresident permit shows the permit draw's own odds (as if the combination is drawn); the combination's odds sit
  // beneath it, and draw-and-fill multiplies both, so the overall chance is never hidden.
  const shown = parts ? parts.permit : odds;
  const chance = chanceOf(shown, 0, shown ?? 0);
  const years = r.harvestYears;
  const crowd = crowdVerdict(r.huntersSqMi), success = successVerdict(r.success5, r.species, r.weapon, r.type);
  const notBuying = !general && /not buying/.test(basis);
  const withCombo = nr && !general && po?.needsGeneral === true;
  const deer = r.species === 'DEER' && po?.deer?.length === 1 ? (po.deer[0] === 'MULE' ? 'Mule deer' : 'Whitetail') : null;
  // general licences for one deer species use that species' harvest; drawn licences keep the district's (see builder)
  const successSub = po?.mulePermit ? 'Mule bucks per permit' : deer && general ? `${deer} harvest per deer hunter` : 'District, all licenses';
  // short pills: Montana names ("HD 652 · General deer") are long, and on a phone a long pill squeezed the name to one word a line
  const kind = /Permit$/.test(po?.license ?? '') ? 'permits' : 'licenses';
  const bma = mtBma(r.units, r.species);
  const pill = general ? (nr ? 'General · NR combo draw' : 'General · Over the counter') : /Permit$/.test(po?.license ?? '') ? 'Permit · Bonus points' : po?.license === 'Antelope License' ? 'Antelope · Bonus points' : 'B License · Bonus points';
  return (
    <article className="hrow co-row mt-row">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={saved} signedIn={signedIn} />
          <HuntLink href={`/hunts/${r.slug}`}>{r.name}</HuntLink>
          <span className={`pill ${general ? 'gen' : 'ctl'}`}>{pill}</span>
        </span>
        <CompareToggle id={r.id} label={r.name} />
        <span className="small muted tags">{general ? (nr ? 'Statewide combination quota' : 'No quota') : r.tags === null ? 'Unlimited' : `${int(r.tags)} ${kind}`}</span>
      </div>
      <div className="dates">
        {[general ? r.areaName : mtDistricts(r.units), r.takeMethod, seasonsSummary(r.tagSeasons) || dateRange(r.openDate, r.closeDate), r.privateOnly ? 'Private land only' : '']
          .filter(Boolean).join(' · ')}
      </div>
      <ScoreRow r={r} nr={nr} />
      <div className="hrow-stats three">
        <div>
          <span className="k">{general && !nr ? 'License' : general ? `Combination draw · ${points ?? 0} pref. pts` : withCombo ? `Permit draw · NR · ${notBuying ? 'no point bought' : `${points ?? 0} bonus pts`}` : `Draw odds · ${nr ? 'NR' : 'Resident'} · ${notBuying ? 'no point bought' : `${points ?? 0} bonus pts`}`}</span>
          <b>{pctOdds(shown)}</b>
          <span className={`verdict ${shown === null ? 'none' : chance === 'sure' || chance === 'likely' ? 'good' : chance === 'possible' ? 'ok' : 'bad'}`}>{shown === null ? 'No draw data' : CHANCE_LABEL[chance]}</span>
          <span className="sub">{general && !nr ? 'Resident general license' : parts ? `${po?.year ?? 'Latest'} draw, if you draw the combination` : `${po?.combo?.year ?? po?.year ?? 'Latest'} draw · last draw, not a forecast`}</span>
          {parts && <span className="sub">Your {parts.comboName} draw: <b>{pctOdds(parts.combo)}</b></span>}
        </div>
        <div>
          <span className="k">Success {years ? `${years} surveyed seasons` : ''}</span>
          <b>{pct(r.success5)}</b>
          <span className={`verdict ${r.smallSample ? 'none' : success.tone}`}>{r.success5 === null ? 'No harvest data' : r.smallSample ? 'Small sample' : success.text}</span>
          <span className="sub">{successSub}{r.harvestLastYear ? ` · ${r.harvestLastYear}: ${pct(r.successLast)}` : ''}</span>
        </div>
        <div>
          <span className="k">Hunters/mi²</span>
          <b>{density(r.huntersSqMi)}</b>
          <span className={`verdict ${crowd.tone}`}>{crowd.text}</span>
          <span className="sub">{r.hunters5 !== null && years ? `${int(r.hunters5 / years)} hunters/surveyed yr` : 'No density data'}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Draw and fill{parts ? ' (both draws)' : ''}: {odds !== null && r.success5 !== null ? <b>{pct(odds * r.success5)}</b> : '—'} · Public land: {r.publicPct === null ? 'not reported' : `${Math.round(r.publicPct)}%`}
        {bma && (bma.n1 > 0 || bma.n2 > 0) ? <> · Block Mgmt: <b>Type 1 {bmaPct(bma.t1Pct)}</b>{bma.n2 > 0 ? ` · Type 2 ${bmaPct(bma.t2Pct)} (permission needed)` : ''}</> : bma ? ' · No Block Management' : ''}
        {r.privateOnly ? ' · This license is valid on private land only: landowner permission needed' : ''}
        {withCombo && parts ? ` · Chance to hold both: ${pctOdds(odds)}` : ''}
        {deer ? ` · ${deer} only` : ''}
        {notBuying ? <> · <Link href="/account#hunting-preferences">Your banked points only count if you buy a point</Link></> : null}
      </div>
    </article>
  );
}
