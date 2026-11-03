import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { seasonsSummary } from '@/lib/tagSeasons';
import { recentBoundaryChanges } from '@/lib/boundaries';
import {
  pct, pctOdds, int, range, WEAPON, antlerLabel, controlledTags, density, oddsVerdict, successVerdict, crowdVerdict,
  drawFillLine, meaningfulChange, SPECIES_LABEL, type Verdict,
} from '@/lib/format';
import { residencyFields } from '@/lib/finder';
import { Star } from './Star';
import { Term } from './Term';

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
  if (r.type === 'CONTROLLED') return { value: r[c.rf.oddsLast], label: `Draw odds${r.oddsLastYear ? ` ${r.oddsLastYear}` : ''}` };
  if (r.nrTag) return c.nr ? { value: r.nrOddsLast, label: `NR tag odds${(r.nrDraw as { year?: number } | null)?.year ? ` ${(r.nrDraw as { year: number }).year}` : ''}` } : { value: null, label: 'Tag', text: r.capped ? 'Capped' : 'Over the counter' };
  // general season: residents buy over the counter; nonresidents carry the unit's / zone's tag odds
  if (!c.nr) return { value: null, label: 'Tag', text: 'Over the counter' };
  return { value: r.nrOddsLast ?? r.nrOdds5, label: 'NR tag odds' };
}

function Stats({ r, c }: { r: HuntSummary; c: CardCtx }) {
  const o = oddsFor(r, c);
  const apps = r[c.rf.appsLast];
  const oddsSub = r.type === 'CONTROLLED' ? `5-yr ${pctOdds(r[c.rf.odds5])}` : r.nrTag && c.nr ? '1st choice' : c.nr && r.type === 'GENERAL' ? nrTagLine(r.nrTagOdds) : '';
  const crowd = crowdVerdict(r.huntersSqMi);
  return (
    <div className="hrow-stats three">
      <div>
        <Term k="odds">{o.label}</Term>
        <b>
          {o.text ?? (o.value === null && !(r.type === 'CONTROLLED') ? 'Tag draw' : pctOdds(o.value))}
          {r.type === 'CONTROLLED' && meaningfulChange(apps, r[c.rf.appsPrev], 20) && <Delta now={o.value} prev={r[c.rf.oddsPrev]} kind="pts" good="up" />}
        </b>
        {!o.text && <Chip v={oddsVerdict(o.value)} />}
        {oddsSub && <span className="sub">{oddsSub}</span>}
      </div>
      <div>
        <Term k="success">Success{r.harvestLastYear ? ` ${r.harvestLastYear}` : ''}</Term>
        <b className={r.smallSample ? 'faint' : ''}>{pct(r.successLast)}{!r.smallSample && <Delta now={r.successLast} prev={r.successPrev} kind="pts" good="up" />}</b>
        {r.smallSample ? <span className="verdict none">Small sample</span> : <Chip v={successVerdict(r.success5, r.species)} />}
        <span className="sub">
          {c.sort === 'harvest' ? `5-yr harvest ${int(r.harvest5)}` : c.sort === 'hunters' || c.sort === 'huntersLow' ? `5-yr hunters ${int(r.hunters5)}` : `${r.harvestYears > 0 && r.harvestYears < 5 ? `${r.harvestYears}-yr` : '5-yr'} ${pct(r.success5)}`}
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
      {r.youthOnly && <span className="pill">Youth</span>}
      {r.smallSample && <span className="pill warn" title="Fewer than 50 hunters over 5 years">Small Sample</span>}
      {recentBoundaryChanges(r.units) && <span className="pill warn" title="IDFG changed this unit's boundary recently; earlier years cover different ground">Boundary Changed {recentBoundaryChanges(r.units)!.year}</span>}
      {r.type === 'CONTROLLED' && r.oddsYears < 3 && <span className="pill warn">New / Short History</span>}
    </div>
  );
}

/** One hunt, general season or tag. `inUnit`: shown inside a unit card (the unit is implied). */
export function HuntCard({ r, c, inUnit = false }: { r: HuntSummary; c: CardCtx; inUnit?: boolean }) {
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
        : controlledTags(r.tags, c.nr, r.nrPermitsLast, r.nrAppsLast, r.oddsLastYear);
  const where = r.nrTag
    ? (r.species === 'ELK' ? `Units ${r.units.join(', ')}` : `Unit ${r.unit ?? r.units[0]}`)
    : r.type === 'CONTROLLED'
      ? `Area ${r.areaName}${r.units.length > 1 || !inUnit ? ` (unit${r.units.length > 1 ? 's' : ''} ${r.units.join(', ')})` : ''}`
      : (!/^Unit \S+ General/i.test(r.name) ? r.name : '');
  const when = r.nrTag || (r.type === 'GENERAL' && seasonsSummary(r.tagSeasons))
    ? seasonsSummary(r.tagSeasons) || 'Seasons: see the regulations'
    : r.openDate ? range(r.openDate, r.closeDate) : 'Dates: see regulations';
  return (
    <div className="hrow">
      <div className="hrow-top">
        <span className="star-head">
          <Star kind="hunt" id={r.huntId} saved={c.favHunts.has(r.huntId)} signedIn={c.signedIn} />
          <Link href={`/hunts/${encodeURIComponent(r.id)}`}>{title}</Link>
          <span className={`pill ${r.type === 'GENERAL' && !r.nrTag ? '' : 'ctl'}`}>{r.nrTag ? (c.nr ? 'NR Tag Draw' : 'Zone Tag') : r.type === 'GENERAL' ? 'General' : 'Controlled'}</span>
        </span>
        {tagsLine && <span className="small muted tags">{tagsLine}</span>}
      </div>
      <div className="dates">{[where, when, r.type === 'GENERAL' && !r.nrTag ? '' : r.nrTag ? '' : WEAPON[r.weapon]].filter(Boolean).join(' · ')}</div>
      <Stats r={r} c={c} />
      <Footer r={r} c={c} />
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
      <div className="ztags">
        {tags.map((r) => {
          const tag = (r.id.split(':')[3] ?? '').toUpperCase();
          const odds = c.nr ? r.nrOddsLast : null;
          return (
            <div key={r.id} className="ztag">
              <div className="star-head">
                <Star kind="hunt" id={r.huntId} saved={c.favHunts.has(r.huntId)} signedIn={c.signedIn} />
                <Link href={`/hunts/${encodeURIComponent(r.id)}`}><b>{tag} Tag</b></Link>
                {c.nr && r.tagCode && <span className="small muted">{r.tagCode}</span>}
              </div>
              <div className="ztag-seasons">{seasonsSummary(r.tagSeasons, 4) || 'Seasons: see the regulations'}</div>
              {c.nr ? (
                <div className="ztag-odds">
                  <b>{pctOdds(odds)}</b> <Chip v={oddsVerdict(odds)} />
                  <span className="sub">1st-choice odds{(r.nrDraw as { year?: number } | null)?.year ? ` ${(r.nrDraw as { year: number }).year}` : ''}{r.quota !== null ? ` · ${int(r.quota)} NR tags${r.quotaYear ? ` (${r.quotaYear})` : ''}` : ''}</span>
                </div>
              ) : (
                <div className="ztag-odds"><b>{residentTag(r)}</b></div>
              )}
            </div>
          );
        })}
      </div>
      <div className="zshared">
        <span><Term k="success">Zone success</Term> <b>{pct(any.success5)}</b> <Chip v={successVerdict(any.success5, 'ELK')} /> <span className="muted">5-yr, A and B hunters together</span></span>
        <span><Term k="crowd">Hunters/mi²</Term> <b>{density(any.huntersSqMi)}</b> <Chip v={crowdVerdict(any.huntersSqMi)} /></span>
      </div>
    </article>
  );
}

/** Three hunts worth a first look, with a one-line reason each. */
export function TopPicks({ rows, c }: { rows: HuntSummary[]; c: CardCtx }) {
  if (!rows.length) return null;
  return (
    <section className="picks" aria-label="Top picks">
      <h2>Start Here</h2>
      <p className="small muted" style={{ margin: '0 0 6px' }}>Best mix of {c.nr ? 'nonresident' : 'resident'} draw odds and hunter success in these results (small samples left out).</p>
      <ol>
        {rows.map((r) => {
          const o = r.type === 'CONTROLLED' ? r[c.rf.odds5] : r.nrOdds5;
          const df = drawFillLine(r[c.rf.tagAndFill]);
          return (
            <li key={r.id}>
              <Link href={`/hunts/${encodeURIComponent(r.id)}`}>
                {r.nrTag ? `${tagLabel(r)}` : `${SPECIES_LABEL[r.species]} hunt ${r.huntNumber} · ${antlerLabel(r.species, r.antlerClass)} · ${WEAPON[r.weapon]}`}
              </Link>
              <span className="small">
                {` ${pctOdds(o)} odds, ${pct(r.success5)} success`}{df ? ` → draw and fill ${df} a year` : ''}{r.units.length ? ` · unit${r.units.length > 1 ? 's' : ''} ${r.units.slice(0, 4).join(', ')}${r.units.length > 4 ? '…' : ''}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
