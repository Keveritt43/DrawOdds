import { HuntLink } from '@/components/HuntNavigation';
import { CoPressureNote } from './CoPressureNote';
import type { CoScored } from '@/lib/coScores';
import Link from 'next/link';
import { huntHref } from '@/lib/huntSlug';
import { isPrivateOnly } from '@/lib/privateLand';
import type { HuntSummary } from '@prisma/client';
import { seasonsSummary, seasonRules, RULE_HELP } from '@/lib/tagSeasons';
import { recentBoundaryChanges } from '@/lib/boundaries';
import {
  pct, pctOdds, int, range, WEAPON, antlerLabel, controlledTags, density, oddsVerdict, successVerdict, crowdVerdict,
  drawFillLine, meaningfulChange, SPECIES_LABEL, TROPHY_LABEL, type Verdict,
} from '@/lib/format';
import { residencyFields } from '@/lib/finder';
import { Star } from './Star';
import { CompareToggle } from './Compare';
import { Term } from './Term';
import { SIZE_LABEL, type SpeciesKey } from '@/lib/species';
import { SCORE_PART_LABEL, type ScorePart } from '@/lib/score';
import { trophyPresentation } from '@/lib/trophyDisplay';
import { RYG7 } from '@/lib/mapMetrics';
import { objectiveSummary, OBJ_COLOR, type ObjStatus } from '@/lib/elkObjectives';

type RF = ReturnType<typeof residencyFields>;
export interface CardCtx { nr: boolean; rf: RF; favHunts: Set<number>; signedIn: boolean; sort: string }

/** Year-over-year change. kind "pts": percentage-point change of a 0-1 ratio; "pct": relative change of a count. */
export function Delta({ now, prev, kind, good }: { now: number | null | undefined; prev: number | null | undefined; kind: 'pts' | 'pct'; good: 'up' | 'down' }) {
  if (now == null || prev == null) return null;
  const d = kind === 'pts' ? (now - prev) * 100 : prev ? ((now - prev) / prev) * 100 : null;
  if (d === null || Math.abs(d) < (kind === 'pts' ? 0.5 : 3)) return null;
  const better = (d > 0) === (good === 'up');
  const v = Math.abs(d);
  return (
    <span className={`delta ${better ? 'up' : 'down'}`} title={kind === 'pts' ? 'Change from the year before, percentage points' : 'Change from the year before'}>
      {d > 0 ? '▲' : '▼'}{kind === 'pts' ? (v < 10 ? v.toFixed(1) : Math.round(v)) : Math.round(v)}{kind === 'pts' ? ' pts' : '%'}
    </span>
  );
}

const Chip = ({ v }: { v: Verdict }) => (v.tone === 'none' ? null : <span className={`verdict ${v.tone}`}>{v.text}</span>);

/** "A Tag" / "Regular Deer Tag" / "White-tailed Deer Tag" for a nonresident general tag row. */
export function tagLabel(r: HuntSummary): string {
  if (r.species === 'ELK') return `${r.id.split(':')[2] ?? ''} ${(r.id.split(':')[3] ?? '').toUpperCase()} Tag`;
  return r.tagCode?.startsWith('WD') ? 'White-tailed Deer Tag' : 'Regular Deer Tag';
}

/** Residents: zone A/B elk tags are over the counter; capped zones have a resident quota. */
export function residentTag(r: HuntSummary): string {
  const q = (r.tagSeasons as { residentQuota?: number | null } | null)?.residentQuota;
  return r.capped ? `Capped${q ? ` · ${int(q)} resident tags` : ''}` : 'Over the counter';
}

/** Under a general season's odds (nonresidents): which tag the odds are for. Two elk tags: both odds. */
function nrTagLine(v: unknown): string {
  const t = (v as { label: string; code: string; odds: number | null }[] | null) ?? [];
  if (!t.length) return 'No NR tag data';
  if (t.length > 1 && t[0].label.includes(' tag') && !t[0].code.startsWith('RD')) return t.map((x) => `${x.label.split(' ').slice(-2).join(' ')} ${pctOdds(x.odds)}`).join(' · ');
  return `${t[0].code} · 1st choice`;
}

/** The odds this card should lead with, or why there isn't one. */
function oddsFor(r: HuntSummary, c: CardCtx): { value: number | null; label: string; text?: string } {
  // 5-yr leads (same as success, the sort and the picks); the latest drawing sits underneath
  if (r.type === 'CONTROLLED') return { value: r[c.rf.odds5] ?? r[c.rf.oddsLast], label: `Draw odds ${r.oddsYears > 0 && r.oddsYears < 5 ? `${r.oddsYears}-yr` : '5-yr'}` };
  if (r.nrTag) return c.nr ? { value: r.nrOddsLast, label: `NR tag odds${(r.nrDraw as { year?: number } | null)?.year ? ` ${(r.nrDraw as { year: number }).year}` : ''}` } : { value: null, label: 'Tag', text: r.capped ? 'Capped' : 'Over the counter' };
  // general season: residents buy over the counter; nonresidents carry the unit's / zone's tag odds
  if (!c.nr) return { value: null, label: 'Tag', text: 'Over the counter' };
  return { value: r.nrOddsLast ?? r.nrOdds5, label: 'NR tag odds' };
}

/** "5-yr", or fewer when the hunt (or a redrawn unit) has fewer seasons of data. */
const yrs = (r: HuntSummary) => (r.harvestYears > 0 && r.harvestYears < 5 ? `${r.harvestYears}-yr` : '5-yr');

function Stats({ r, c }: { r: HuntSummary; c: CardCtx }) {
  const o = oddsFor(r, c);
  const apps = r[c.rf.appsLast];
  const oddsSub = r.type === 'CONTROLLED' ? null : r.nrTag && c.nr ? '1st choice' : c.nr && r.type === 'GENERAL' ? nrTagLine(r.nrTagOdds) : '';
  const crowd = crowdVerdict(r.huntersSqMi);
  return (
    <div className="hrow-stats three">
      <div>
        <Term k="odds">{o.label}</Term>
        <b>
          {o.text ?? (o.value === null && !(r.type === 'CONTROLLED') ? 'Tag draw' : pctOdds(o.value))}
        </b>
        {!o.text && <Chip v={oddsVerdict(o.value)} />}
        {r.type === 'CONTROLLED' ? (
          <span className="sub">{r.oddsLastYear ?? 'Latest'}: {pctOdds(r[c.rf.oddsLast])}{meaningfulChange(apps, r[c.rf.appsPrev], 20) && <Delta now={r[c.rf.oddsLast]} prev={r[c.rf.oddsPrev]} kind="pts" good="up" />}</span>
        ) : oddsSub && <span className="sub">{oddsSub}</span>}
      </div>
      <div>
        {/* the 5-year number leads: it's what the sort, the verdict and the picks use, and one season swings */}
        <Term k="success">Success {yrs(r)}</Term>
        <b className={r.smallSample ? 'faint' : ''}>{pct(r.success5)}</b>
        {r.smallSample ? <span className="verdict none">Small sample</span> : <Chip v={successVerdict(r.success5, r.species, r.weapon, r.nrTag ? 'GENERAL' : r.type)} />}
        <span className="sub">
          {c.sort === 'harvest' ? `5-yr harvest ${int(r.harvest5)}` : c.sort === 'hunters' || c.sort === 'huntersLow' ? `5-yr hunters ${int(r.hunters5)}` : r.harvestLastYear && r.successLast !== null ? <>{r.harvestLastYear}: {pct(r.successLast)}{!r.smallSample && (r.hunters5 ?? 0) / Math.max(1, r.harvestYears) >= 30 && <Delta now={r.successLast} prev={r.successPrev} kind="pts" good="up" />}</> : ''}
        </span>
      </div>
      <div>
        <Term k="crowd">Hunters/mi²</Term>
        <b>{density(r.huntersSqMi)}</b>
        <Chip v={crowd} />
        {r.hunters5 && r.harvestYears ? <span className="sub">{int(r.hunters5 / r.harvestYears)} hunters/yr</span> : null}
      </div>
    </div>
  );
}

function Footer({ r, c }: { r: HuntSummary; c: CardCtx }) {
  const df = drawFillLine(r[c.rf.tagAndFill]);
  const apps = r[c.rf.appsLast];
  const everyone = r.type === 'CONTROLLED' && (r[c.rf.oddsLast] ?? 0) >= 0.995;
  return (
    <div className="hrow-foot">
      {df && r.type === 'CONTROLLED' && !r.smallSample && <span><Term k="drawfill">Draw and fill</Term> <b>{df}</b> per year</span>}
      {r.type === 'CONTROLLED' && apps !== null && (
        <span className="muted">
          {everyone ? `Everyone who applied drew${r.oddsLastYear ? ` in ${r.oddsLastYear}` : ''}` : <>{int(apps)} {c.nr ? 'NR' : 'resident'} 1st-choice applicants{meaningfulChange(apps, r[c.rf.appsPrev], 20) && <Delta now={apps} prev={r[c.rf.appsPrev]} kind="pct" good="down" />}{r.appsLast !== null && r.appsLast !== apps ? ` (all ${int(r.appsLast)})` : ''}</>}
        </span>
      )}
      {r.type === 'CONTROLLED' && (r.secondDrewLast ?? 0) > 0 && !(c.nr && (r.nrAppsLast ?? 0) > (r.nrPermitsLast ?? 0)) && (
        <span className="pill good" title="Tags were left after every 1st-choice applicant drew, so 2nd-choice applicants got them. A realistic 2nd choice.">
          {int(r.secondDrewLast)} tag{r.secondDrewLast === 1 ? '' : 's'} went to 2nd choices{r.oddsLastYear ? ` in ${r.oddsLastYear}` : ''}
        </span>
      )}
      {r.daysPerHarvest5 !== null && !r.smallSample && <span title={r.daysPerHunter5 !== null ? `Hunters averaged ${r.daysPerHunter5.toFixed(1)} days afield` : undefined}><Term k="effort">Effort</Term> <b>{Math.round(r.daysPerHarvest5)} days</b> per animal</span>}
      {TROPHY_LABEL[r.species] && r.bigPct5 !== null && !r.smallSample && !seasonRules(r.tagSeasons, r.species).some((x) => x.startsWith('2-point')) && (
        <span><Term k="trophy">{TROPHY_LABEL[r.species]}</Term> <b>{pct(r.bigPct5)}</b> of {r.species === 'ELK' ? 'bulls' : 'bucks'} taken</span>
      )}
      {SIZE_LABEL[r.species as SpeciesKey] && r.avgSize5 !== null && <span><Term k="size">{SIZE_LABEL[r.species as SpeciesKey]}</Term> <b>{r.avgSize5.toFixed(1)}&quot;</b></span>}
      {r.type === 'CONTROLLED' && r.permitsLast !== null && r.permitsPrev !== null && Math.abs(r.permitsLast - r.permitsPrev) >= Math.max(3, r.permitsPrev * 0.1) && (
        <span className={`pill ${r.permitsLast > r.permitsPrev ? 'good' : 'warn'}`} title="Tags in the latest drawing vs the year before">Tags {int(r.permitsPrev)} → {int(r.permitsLast)}</span>
      )}
      {r.leftoverTags ? <span className="pill" title={`IDFG's second drawing (Aug) for leftover tags${r.leftoverApps ? `: ${int(r.leftoverApps)} applied, ${int(r.leftoverDrew)} drew` : ''}`}>{int(r.leftoverTags)} leftover tags in {r.leftoverYear}</span> : null}
      {isPrivateOnly(r) && <span className="pill warn" title="Valid only on private land: you need landowner permission before you hunt">Private land only</span>}
      {r.youthOnly && <span className="pill">Youth</span>}
      {r.smallSample && <span className="pill warn" title="Fewer than 50 hunters over 5 years">Small Sample</span>}
      {recentBoundaryChanges(r.units) && <span className="pill warn" title="IDFG changed this unit's boundary recently; earlier years cover different ground">Boundary Changed {recentBoundaryChanges(r.units)!.year}</span>}
      {r.type === 'CONTROLLED' && r.oddsYears < 3 && <span className="pill warn">New / Short History</span>}
    </div>
  );
}

/** One hunt, general season or tag. `inUnit`: shown inside a unit card (the unit is implied). */
export function HuntCard({ r, c, inUnit = false, also = [] }: { r: HuntSummary; c: CardCtx; inUnit?: boolean; also?: HuntSummary[] }) {
  const sex = antlerLabel(r.species, r.antlerClass);
  const title = r.nrTag
    ? `${tagLabel(r)}${c.nr && r.tagCode ? ` · ${r.tagCode}` : ''}`
    : r.type === 'CONTROLLED'
      ? `${inUnit ? '' : `${SPECIES_LABEL[r.species]} `}Hunt ${r.huntNumber ?? ''} · ${sex}`
      : `${inUnit ? '' : `Unit ${r.unit ?? r.units[0]} `}General ${SPECIES_LABEL[r.species].toLowerCase()} · ${WEAPON[r.weapon]}`;
  const tagsLine = r.nrTag && !c.nr
    ? residentTag(r)
    : r.nrTag
      ? (r.quota !== null ? `${int(r.quota)} NR tags${r.quotaYear ? ` (${r.quotaYear})` : ''}${r.capped ? ' · capped' : ''}` : '')
      : r.type === 'GENERAL'
        ? (r.tags ? `${int(r.tags)} tags` : c.nr ? (r.tagCode ? `NR tag ${r.tagCode}` : 'NR tag required') : 'Over the counter')
        : controlledTags(r.tags, c.nr, r.nrPermitsLast, r.nrAppsLast, r.oddsLastYear, r.species);
  const where = r.nrTag
    ? (r.species === 'ELK' ? `Units ${r.units.join(', ')}` : `Unit ${r.unit ?? r.units[0]}`)
    : r.type === 'CONTROLLED'
      ? `Area ${r.areaName}${r.units.length > 1 || !inUnit ? ` (unit${r.units.length > 1 ? 's' : ''} ${r.units.join(', ')})` : ''}`
      : (!/^Unit \S+ General/i.test(r.name) ? r.name : '');
  const when = r.nrTag || (r.type === 'GENERAL' && seasonsSummary(r.tagSeasons))
    ? seasonsSummary(r.tagSeasons) || 'Seasons: see the regulations'
    : r.openDate
      ? [r, ...also].filter((x) => x.openDate).sort((a, b) => +a.openDate! - +b.openDate!).map((x) => range(x.openDate, x.closeDate)).filter((v, i, a) => a.indexOf(v) === i).join(', ')
      : 'Dates: see regulations';
  return (
    <div className="hrow">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={c.favHunts.has(r.huntId)} signedIn={c.signedIn} />
          <HuntLink href={huntHref(r)}>{title}</HuntLink>
          <span className={`pill ${r.type === 'GENERAL' && !r.nrTag ? '' : 'ctl'}`}>{r.nrTag ? (c.nr ? 'NR Tag Draw' : 'Zone Tag') : r.type === 'GENERAL' ? 'General' : 'Controlled'}</span>
          <CompareToggle id={r.id} label={title} />
          <TrophyMark score={r.scoreTrophy} />
        </span>
        {tagsLine && <span className="small muted tags">{tagsLine}</span>}
      </div>
      <div className="dates">{[where, when, r.type === 'GENERAL' && !r.nrTag ? '' : r.nrTag ? '' : WEAPON[r.weapon]].filter(Boolean).join(' · ')}</div>
      <Rules r={r} />
      <ObjectivePills units={r.units} species={r.species} />
      <ScoreRow r={r} nr={c.nr} />
      <Stats r={r} c={c} />
      <Footer r={r} c={c} />
    </div>
  );
}

const OBJ_SHORT: Record<ObjStatus, string> = { BELOW: 'below', WITHIN: 'within', ABOVE: 'above' };
/** Elk: bulls and cows against IDFG's population objective for the hunt's elk zone(s). */
export function ObjectivePills({ units, species }: { units: string[]; species: string }) {
  if (species !== 'ELK') return null;
  const o = objectiveSummary(units);
  if (!o.bull.length && !o.cow.length) return null;
  const pill = (who: string, xs: ObjStatus[]) =>
    xs.length ? (
      <span className="pill obj" title={`${who} elk vs IDFG's population objective for ${o.zones.join(' / ')} zone (2026 Seasons & Rules p. 34). Above = more ${who.toLowerCase()} than the target.`}>
        {xs.map((x) => <i key={x} style={{ background: OBJ_COLOR[x] }} />)}
        {who} {xs.map((x) => OBJ_SHORT[x]).join(' / ')} objective
      </span>
    ) : null;
  return <div className="rules objs">{pill('Bulls', o.bull)}{pill('Cows', o.cow)}</div>;
}

/** Green-yellow-red for a 0-100 score (same 7 steps as the maps). */
export const scoreColor = (v: number) => RYG7[Math.min(6, Math.max(0, Math.floor((v / 100) * 7)))];
const scoreInk = (v: number) => (v < 100 / 7 * 1 || v >= 100 / 7 * 6 ? '#fff' : '#1d1d1d');

export function ScoreBadge({ v, label }: { v: number; label: string }) {
  return (
    <span className="sbadge">
      <b style={{ background: scoreColor(v), color: scoreInk(v) }}>{v}</b>
      <span>{label}</span>
    </span>
  );
}

/** Whether this hunt has a draw for this hunter (so Opportunity differs from Quality). */
const hasDraw = (r: HuntSummary, nr: boolean) => r.type === 'CONTROLLED' || (nr && (r.nrTag || r.type === 'GENERAL')) || (!nr && r.nrTag && r.capped);

/** DrawOdds Score: Quality (+ Opportunity when there's a draw); tap for the four parts. */
export function TrophyMark({ score, showNeutral = true }: { score: number | null; showNeutral?: boolean }) {
  const info = trophyPresentation(score);
  if (score === null || ![50,65,80,100].includes(score)) return null;
  if (score === 50 && !showNeutral) return null;
  return <span className="pill" title={info.description} style={{ color: info.color, borderColor: info.color, background: 'transparent' }}>{info.icon ? (score === 100 ? '🏆✨ ' : '🏆 ') : ''}{info.label} {score}</span>;
}

export function ScoreRow({ r, nr, open = false }: { r: CoScored; nr: boolean; open?: boolean }) {
  if (r.scoreQuality === null) return <div className="srow none small muted">DrawOdds Score: insufficient harvest, access or density data<CoPressureNote r={r}/></div>;
  const opp = nr ? r.scoreOppNr : r.scoreOppRes;
  const parts: [ScorePart, number | null][] = [['success', r.scoreSuccess], ['access', r.scoreAccess], ['crowd', r.scoreCrowd], ['trophy', r.scoreTrophy]];
  return (
    <details className="srow" open={open}>
      <summary>
        <ScoreBadge v={r.scoreQuality} label="Quality" />
        {hasDraw(r, nr) && opp !== null && <ScoreBadge v={opp} label="Opportunity" />}
        <span className="small muted s-why">why?</span>
      </summary>
      <div className="sbars">
        <CoPressureNote r={r}/>
        {parts.map(([k, v]) => (
          <div key={k} className="sbar">
            <span>{SCORE_PART_LABEL[k]}</span>
            <i><em style={{ width: `${v ?? 0}%`, background: v === null ? 'transparent' : scoreColor(v) }} /></i>
            <small>{k === 'trophy' && v === null ? 'N/A' : v ?? '—'}</small>
          </div>
        ))}
        <p className="small muted">Success drives 65% of Quality; access 20%, elbow room 15%. Quality is capped at Success + 20; trophy adds up to 5 points when recognized; unclassified is neutral and antlerless is excluded. {r.scoreTrophy === null ? 'Trophy has no adjustment here. ' : ''}{r.units.length > 1 && r.scoreTrophy !== null ? 'This hunt’s tier uses its best eligible unit; other units may differ. ' : ''}{hasDraw(r, nr) ? 'Opportunity = Quality × √(your draw odds), an absolute score. ' : ''}<Link href="/score">How we score</Link></p>
      </div>
    </details>
  );
}

/** Antler / animal rules from the season tables ("2-point bucks only"): easy to miss, and they change the hunt. */
export function Rules({ r }: { r: HuntSummary }) {
  const rules = seasonRules(r.tagSeasons, r.species);
  if (!rules.length) return null;
  return (
    <div className="rules" aria-label="Season rules">
      {rules.map((x) => <span key={x} className="pill rule" title={RULE_HELP[x.replace(' (some seasons)', '')] ?? 'From the IDFG season tables. Check the regulations before you hunt.'}>{x}</span>)}
    </div>
  );
}

/** An elk zone's A and B tags side by side: pick a zone, then pick the tag whose seasons fit you. */
export function ZoneCard({ zone, rows, c }: { zone: string; rows: HuntSummary[]; c: CardCtx }) {
  const tags = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  const units = [...new Set(tags.flatMap((t) => t.units))];
  const any = tags[0];
  return (
    <article className="ucard zcard">
      <h2>{zone} Zone · Elk</h2>
      <p className="desc">Units {units.join(', ')} · <Term k="tag">Choose the A or the B tag</Term></p>
      <ObjectivePills units={units} species="ELK" />
      <div className="ztags">
        {tags.map((r) => {
          const tag = (r.id.split(':')[3] ?? '').toUpperCase();
          const odds = c.nr ? r.nrOddsLast : null;
          return (
            <div key={r.id} className="ztag">
              <div className="star-head">
                <Star kind="hunt" id={r.huntId} saved={c.favHunts.has(r.huntId)} signedIn={c.signedIn} />
                <HuntLink href={huntHref(r)}><b>{tag} Tag</b></HuntLink>
                {c.nr && r.tagCode && <span className="small muted">{r.tagCode}</span>}
                <CompareToggle id={r.id} label={`${zone} ${tag} tag`} />
              </div>
              <div className="ztag-seasons">{seasonsSummary(r.tagSeasons, 4) || 'Seasons: see the regulations'}</div>
              <Rules r={r} />
              <ScoreRow r={r} nr={c.nr} />
              {c.nr ? (
                <div className="ztag-odds">
                  <b>{pctOdds(odds)}</b> <Chip v={oddsVerdict(odds)} />
                  <span className="sub">1st-choice odds{(r.nrDraw as { year?: number } | null)?.year ? ` ${(r.nrDraw as { year: number }).year}` : ''}{r.quota !== null ? ` · ${int(r.quota)} NR tags${r.quotaYear ? ` (${r.quotaYear})` : ''}` : ''}</span>
                  <span className="sub">{laterChoices(r.nrDraw)}</span>
                </div>
              ) : (
                <div className="ztag-odds"><b>{residentTag(r)}</b></div>
              )}
              <div className="ztag-more">
                <span><Term k="success">Success</Term> <b>{pct(r.success5)}</b> <Chip v={successVerdict(r.success5, 'ELK')} /></span>
                <span><Term k="crowd">Hunters/mi²</Term> <b>{density(r.huntersSqMi)}</b> <Chip v={crowdVerdict(r.huntersSqMi)} /></span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="zshared">
        {any.publicPct !== null && <span>Public land <b>{Math.round(any.publicPct)}%</b></span>}
        <span className="muted">Success and crowding: 5-yr general-season numbers for the weapons each tag can hunt in these units.</span>
      </div>
    </article>
  );
}

/** Whether a nonresident general tag reached choices after the 1st: tells you if it works as a backup pick. */
export function laterChoices(nrDraw: unknown): string {
  const d = nrDraw as { drew?: number[]; applied?: number[] } | null;
  if (!d?.drew?.length) return '';
  const later = d.drew.slice(1).reduce((a, b) => a + (b ?? 0), 0);
  return later > 0 ? `${int(later)} tags reached 2nd-5th choices: works as a backup pick` : 'Filled on 1st choices: only worth listing 1st';
}

export interface Pick { label: string; r: HuntSummary; why: string }

/** A few hunts worth a first look, each for a different reason (best chance, best odds, best success, least crowded). */
export function TopPicks({ picks, c }: { picks: Pick[]; c: CardCtx }) {
  if (!picks.length) return null;
  return (
    <details className="picks" aria-label="Recommended Tags">
      <summary>Recommended Tags</summary>
      <p className="small muted" style={{ margin: '0 0 6px' }}>The standouts in these results for {c.nr ? 'nonresidents' : 'residents'}, using 5-year numbers (small samples and antlerless hunts left out unless you asked for them).</p>
      <ol>
        {picks.map((p) => (
          <li key={p.label}>
            <span className="pick-label">{p.label}</span>
            <HuntLink href={huntHref(p.r)}>
              {p.r.nrTag ? p.r.name : p.r.type === 'GENERAL' ? `Unit ${p.r.unit ?? p.r.units[0]} general ${SPECIES_LABEL[p.r.species].toLowerCase()} · ${WEAPON[p.r.weapon]}` : `${SPECIES_LABEL[p.r.species]} hunt ${p.r.huntNumber} · ${antlerLabel(p.r.species, p.r.antlerClass)} · ${WEAPON[p.r.weapon]}`}
            </HuntLink>
            <span className="small"> {p.why}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Picks one hunt per reason from the candidates (no hunt twice). */
export function choosePicks(
  cands: HuntSummary[],
  c: CardCtx,
  otc: HuntSummary[] = [],
): Pick[] {
  const odds = (r: HuntSummary) => (r.type === 'CONTROLLED' ? r[c.rf.odds5] : r.nrOdds5) ?? null;
  const lo = (r: HuntSummary) => ({ ELK: 0.15, DEER: 0.35, PRONGHORN: 0.35, MOOSE: 0.55, BIGHORN: 0.6, GOAT: 0.55 } as Record<string, number>)[r.species] ?? 0.25;
  const used = new Set<string>();
  const where = (r: HuntSummary) => (r.units.length ? ` · unit${r.units.length > 1 ? 's' : ''} ${r.units.slice(0, 4).join(', ')}${r.units.length > 4 ? '…' : ''}` : '');
  const nums = (r: HuntSummary) => `${pctOdds(odds(r))} odds, ${pct(r.success5)} success`;
  const applicants = (r:HuntSummary) => r.appsLast ?? (r.resAppsLast !== null && r.nrAppsLast !== null ? r.resAppsLast + r.nrAppsLast : null);
  const take = (label: string, xs: HuntSummary[], why: (r: HuntSummary) => string): Pick | null => {
    const r = xs.find((x) => !used.has(x.id));
    if (!r) return null;
    used.add(r.id);
    return { label, r, why: why(r) + where(r) };
  };
  const by = (f: (r: HuntSummary) => number | null, dir: 1 | -1) => (a: HuntSummary, b: HuntSummary) => ((f(b) ?? -Infinity) - (f(a) ?? -Infinity)) * dir;
  const ok = cands.filter((r) => odds(r) !== null && r.success5 !== null);
  return [
    take(
      "Top trophy hunt",
      cands
        .filter(
          (r) =>
            r.type === "CONTROLLED" &&
            r.antlerClass !== "ANTLERLESS" &&
            r.scoreTrophy !== null && r.scoreTrophy > 50,
        )
        .sort(
          (a, b) =>
            (b.scoreTrophy ?? 0) - (a.scoreTrophy ?? 0) ||
            (applicants(b) ?? -1) - (applicants(a) ?? -1),
        ),
      (r) =>
        `Trophy score ${r.scoreTrophy}/100 · ${applicants(r) === null ? 'applicant count unavailable' : `${int(applicants(r))} applicants in the latest draw`}`,
    ),
    take('Best chance to fill', ok.slice().sort(by((r) => r[c.rf.tagAndFill], 1)), (r) => `${nums(r)} → draw and fill ${drawFillLine(r[c.rf.tagAndFill]) ?? '-'} a year`),
    take('Easiest draw that still fills', ok.filter((r) => (r.success5 ?? 0) >= lo(r)).sort(by(odds, 1)), (r) => `${nums(r)}`),
    take('Highest success you can draw', ok.filter((r) => (odds(r) ?? 0) >= 0.1).sort(by((r) => r.success5, 1)), (r) => `${nums(r)}`),
    take('Least crowded', ok.filter((r) => (odds(r) ?? 0) >= 0.1 && (r.success5 ?? 0) >= lo(r) && r.huntersSqMi !== null).sort(by((r) => r.huntersSqMi, -1)), (r) => `${nums(r)}, ${density(r.huntersSqMi)} hunters/mi²`),
    take('Best over the counter', otc.filter((r) => r.success5 !== null).sort(by((r) => r.success5, 1)), (r) => `no draw, ${pct(r.success5)} success, ${density(r.huntersSqMi)} hunters/mi²`),
  ].filter((p): p is Pick => !!p);
}
