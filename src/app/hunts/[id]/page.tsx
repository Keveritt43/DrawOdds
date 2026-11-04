import { AddToPlan } from '@/components/Planner';
import { huntHref } from '@/lib/huntSlug';
import { CompareToggle } from '@/components/Compare';
import { huntName } from '@/components/HuntTable';
import Link from 'next/link';
import { SPECIES_LABEL } from '@/lib/format';
import { boundarySince } from '@/lib/boundaries';
import { sortedSeasons, seasonTitle, seasonDates, seasonsSummary } from '@/lib/tagSeasons';
import { recentBoundaryChanges } from '@/lib/boundaries';
import { notFound, permanentRedirect } from 'next/navigation';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getResidency } from '@/lib/residency';
import { residencyFields } from '@/lib/finder';
import { historyFor } from '@/lib/history';
import { pct, pct100, pctOdds, int, range, WEAPON, DEERTYPE, nrTags, antlerLabel, oddsVerdict, drawFillLine, TROPHY_LABEL } from '@/lib/format';
import { BackLink } from '@/components/BackLink';
import { SIZE_LABEL, drawOf, type SpeciesKey } from '@/lib/species';
import { ApplyChecklist } from '@/components/ApplyChecklist';
import { laterChoices, Rules, ScoreRow, ObjectivePills } from '@/components/HuntCards';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { OddsChart, ApplicantsChart, HarvestChart, SuccessChart, QualityChart, ChoiceChart } from '@/components/Charts';
import { SeasonStrip } from '@/components/SeasonStrip';
import { LandBar } from '@/components/LandBar';
import { Star } from '@/components/Star';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const key = decodeURIComponent((await params).id);
  const sel = { name: true, huntNumber: true, species: true, nrTag: true, type: true, unit: true, areaName: true } as const;
  const s = (await db.huntSummary.findUnique({ where: { slug: key }, select: sel })) ?? (await db.huntSummary.findUnique({ where: { id: key }, select: sel }));
  if (!s) return { title: 'Hunt not found' };
  const t = s.huntNumber ? `${SPECIES_LABEL[s.species]} Hunt ${s.huntNumber} (Area ${s.areaName})` : s.nrTag ? s.name : `${s.name}${s.unit ? ` · Unit ${s.unit}` : ''}`;
  return { title: t, description: `Draw odds, hunter success, crowding and land for Idaho ${t}.` };
}

export default async function HuntPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> }) {
  // readable slug ("deer-1016"); old id links ("c:-91071...") still work and move to the slug
  const key = decodeURIComponent((await params).id);
  const s = (await db.huntSummary.findUnique({ where: { slug: key }, include: { hunt: true } })) ?? (await db.huntSummary.findUnique({ where: { id: key }, include: { hunt: true } }));
  if (!s) notFound();
  if (s.slug && key !== s.slug) permanentRedirect(`/hunts/${encodeURIComponent(s.slug)}`);
  const { residency } = await getResidency((await searchParams).as);
  const session = await auth();
  const rf = residencyFields(residency);
  const nr = residency === 'NONRESIDENT';
  const [history, area, unitRows, saved] = await Promise.all([
    historyFor(s),
    s.areaId ? db.huntArea.findUnique({ where: { areaId: s.areaId } }) : null,
    db.unit.findMany({ where: { name: { in: s.units } } }),
    session?.user ? db.savedHunt.findUnique({ where: { userId_huntId: { userId: session.user.id, huntId: s.huntId } } }) : null,
  ]);

  // context for controlled hunts: general-season success in the main unit, same weapon
  let compare: { label: string; data: Awaited<ReturnType<typeof historyFor>> } | undefined;
  const mainUnit = ((area?.units as { unit: string; pct: number }[] | null) ?? [])[0]?.unit ?? s.units[0];
  if (s.type === 'CONTROLLED' && mainUnit) {
    const gen = await db.huntSummary.findFirst({ where: { type: 'GENERAL', species: s.species, unit: mainUnit, weapon: s.weapon } });
    if (gen) compare = { label: `General season, unit ${mainUnit}`, data: await historyFor(gen) };
  }
  // better-odds alternatives: same species, kind, sex and weapon, at least as good a hunt, easier to draw
  const ctl = s.type === 'CONTROLLED';
  const myOdds = ctl ? s[rf.odds5] : s.nrTag ? s.nrOdds5 : null;
  const alts = (ctl || (s.nrTag && nr)) && myOdds !== null && myOdds < 0.95
    ? await db.huntSummary.findMany({
        where: {
          id: { not: s.id }, species: s.species, smallSample: false, youthOnly: false,
          ...(ctl ? { type: 'CONTROLLED' as const, antlerClass: s.antlerClass, weapon: s.weapon, [rf.odds5]: { gte: myOdds + 0.05 } } : { nrTag: true, nrOdds5: { gte: myOdds + 0.05 } }),
          ...(s.success5 !== null ? { success5: { gte: s.success5 * 0.8 } } : {}),
        },
        orderBy: [{ [rf.tagAndFill]: { sort: 'desc', nulls: 'last' } } as Prisma.HuntSummaryOrderByWithRelationInput],
        take: 3,
      })
    : [];
  const land = (area?.landOwnership ?? (unitRows.length === 1 ? unitRows[0].landOwnership : mergeLand(unitRows))) as { manager: string; pct: number }[] | null;
  const title = s.huntNumber ? `${SPECIES_LABEL[s.species]} controlled hunt ${s.huntNumber}` : s.name;
  const rows = history.filter((h) => h.permits != null || h.resApps != null || h.hunters != null).sort((a, b) => b.year - a.year);
  const drawn = rows.filter((h) => h.permits != null || h.resApps != null);
  // general season in a redrawn unit: years before the change are shown but not counted (different ground)
  // (a deer tag covers one unit, so the same rule applies; multi-unit elk zone tags skip per unit in the totals)
  const since = ctl ? null : boundarySince(s.nrTag ? (s.units.length === 1 ? s.units[0] : null) : s.unit);
  const harvested = rows.filter((h) => h.hunters != null && (!since || h.year >= since));
  const nHarv = Math.min(5, harvested.length);
  const sum = (xs: typeof rows, f: (h: (typeof rows)[number]) => number | null | undefined) => xs.slice(0, 5).reduce((a, h) => a + (f(h) ?? 0), 0);
  const ratio = (d?: number | null, a?: number | null, cap = false) => (a ? `${(cap ? Math.min(100, (100 * (d ?? 0)) / a) : (100 * (d ?? 0)) / a).toFixed(1)}%` : '-');
  const n = (v?: number | null) => (v != null ? int(v) : '-');
  const renumbered = new Set(history.map((h) => h.huntNumber).filter(Boolean)).size > 1;
  const sex = antlerLabel(s.species, s.antlerClass);
  const isMsg = drawOf(s.species) === 'MSG';
  // the hunt's own latest first drawing (summary), not the area history's newest row: two hunts can share an area
  const nrInfo = ctl ? nrTags(s.tags, s.nrPermitsLast, s.nrAppsLast, s.oddsLastYear, !isMsg) : null;
  const yourOdds = ctl ? s[rf.oddsLast] : s.nrTag && nr ? s.nrOddsLast : null;
  const df = drawFillLine(s[rf.tagAndFill]);
  const tagSeasonText = seasonsSummary(s.tagSeasons, 6);
  const nrDrawYear = (s.nrDraw as { year?: number } | null)?.year;
  // one plain-English paragraph a beginner can act on; the tiles below carry the detail
  const summary = [
    s.nrTag
      ? `${s.species === 'ELK' ? 'Elk zone tag' : 'Deer tag'} for unit${s.units.length > 1 ? 's' : ''} ${s.units.join(', ')}${nr ? ` (apply with ${s.tagCode ?? 'its hunt code'})` : ''}. Seasons: ${tagSeasonText || 'see the regulations'}.`
      : ctl
        ? `${WEAPON[s.weapon]}, ${sex.toLowerCase()}, ${s.openDate ? range(s.openDate, s.closeDate) : 'dates in the regulations'}, hunt area ${s.areaName}${s.units.length > 1 ? ` (units ${s.units.join(', ')})` : ''}.`
        : `General ${SPECIES_LABEL[s.species].toLowerCase()} season, ${WEAPON[s.weapon].toLowerCase()}, unit ${s.unit}: ${tagSeasonText || (s.openDate ? range(s.openDate, s.closeDate) : 'dates in the regulations')}.`,
    ctl ? `${s.tags ? `${int(s.tags)} tags` : 'Tag count: see the regulations'}${nr && nrInfo ? `; ${nrInfo.kind === 'full' ? `${int(nrInfo.n)} went to nonresidents in ${nrInfo.year} (the limit)` : nrInfo.kind === 'open' ? `every nonresident who applied drew in ${nrInfo.year}` : nrInfo.kind === 'count' ? `${int(nrInfo.n)} went to nonresidents in ${nrInfo.year}` : `nonresidents can get up to ${int(nrInfo.n)}`}` : ''}.` : '',
    s.nrTag && nr && s.quota !== null ? `${int(s.quota)} nonresident tags for ${s.quotaYear ?? 'next season'}.` : '',
    s.nrTag && !nr ? `Residents: ${s.capped ? 'capped zone, limited resident tags' : 'bought over the counter, no draw'}.` : '',
    !ctl && !s.nrTag ? (nr ? 'Nonresidents need a general tag from the nonresident draw.' : 'Residents buy the tag over the counter.') : '',
    yourOdds !== null && yourOdds !== undefined ? `${oddsVerdict(yourOdds).text}: ${pctOdds(yourOdds)} of ${nr ? 'nonresident' : 'resident'} 1st-choice applicants drew in ${ctl ? s.oddsLastYear ?? '' : nrDrawYear ?? ''}.` : '',
    s.success5 !== null ? `${pct(s.success5)} of hunters took an animal over ${s.harvestYears > 0 && s.harvestYears < 5 ? s.harvestYears : 5} seasons${s.smallSample ? ' (small sample)' : ''}.` : '',
    ctl && df && !s.smallSample ? `Chance to draw and fill: ${df} per year.` : '',
  ].filter(Boolean).join(' ');

  return (
    <main className="wrap" style={{ margin: '20px auto 40px' }}>
      <p className="small"><BackLink /></p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>{title}</h1>
          <p className="lead-sum">{summary}</p>
          <Rules r={s} />
          <ObjectivePills units={s.units} species={s.species} />
          <ScoreRow r={s} nr={nr} open />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
          <span className="btn" style={{ padding: '4px 10px' }}><Star kind="hunt" id={s.huntId} saved={!!saved} signedIn={!!session?.user} label /></span>
          {(ctl || (s.nrTag && nr)) && <AddToPlan id={s.id} kind={ctl ? 'controlled' : 'tag'} species={s.species} />}
          <CompareToggle id={s.id} label={huntName(s)} />
          <a className="btn" target="_blank" rel="noreferrer"
            href={s.nrTag ? `https://idfg.idaho.gov/sites/default/files/nonresident-draw-data-and-descriptions_${(s.nrDraw as { year?: number } | null)?.year ?? s.hunt.year}-draw.pdf` : s.huntId > 0 ? `https://fishandgame.idaho.gov/ifwis/huntplanner/hunt?id=${s.huntId}` : `https://idfg.idaho.gov/sites/default/files/seasons-rules-big-game-${s.hunt.year}.pdf`}>
            {s.nrTag ? 'IDFG Draw Results' : s.huntId > 0 ? 'IDFG Page' : 'IDFG Regulations'}
          </a>
        </div>
      </div>

      {s.nrTag && <NrTagCard s={s} />}
      {!s.nrTag && s.type === 'GENERAL' && sortedSeasons(s.tagSeasons).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>{(s.tagSeasons as { year?: number }).year} General Seasons</h3>
          <SeasonStrip seasons={sortedSeasons(s.tagSeasons)} year={(s.tagSeasons as { year?: number }).year ?? new Date().getFullYear()} />
          <div className="uh-list">
            {sortedSeasons(s.tagSeasons).map((x, i) => (
              <div key={i} className="uh-row" style={{ gridTemplateColumns: '1fr' }}>
                <div className="uh-name">{seasonTitle(x)}</div>
                <div className="uh-meta"><b>{seasonDates(x)}</b>{x.notes ? ` · ${x.notes}` : ''}</div>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>From IDFG&apos;s Seasons &amp; Rules. {s.species === 'ELK' ? 'Elk seasons depend on the zone tag you hold (A or B).' : 'Regular Deer tag seasons; White-tailed Deer tag holders hunt the white-tailed seasons.'} Check the regulations for boundaries and notes.</p>
        </div>
      )}
      <div className="stats">
        {s.type === 'CONTROLLED' && (
          <>
            <div className="stat"><div className="k">{nr ? 'Nonresident' : 'Resident'} odds, 5-yr</div><div className="v">{pct(s[rf.odds5], 1)}</div></div>
            <div className="stat"><div className="k">{s.oddsLastYear ? `${s.oddsLastYear} draw` : 'Last draw'}</div><div className="v">{pct(s[rf.oddsLast], 1)}</div></div>
            <div className="stat"><div className="k">{nr ? 'Resident' : 'Nonresident'} odds, 5-yr</div><div className="v" style={{ color: 'var(--muted)' }}>{pct(nr ? s.resOdds5 : s.nrOdds5, 1)}</div></div>
            <div className="stat"><div className="k">Draw + fill, per year</div><div className="v">{pct(s[rf.tagAndFill], 1)}</div></div>
            {nr && nrInfo && (
              <div className="stat">
                <div className="k">{nrInfo.kind === 'full' ? `Nonresident tags (${nrInfo.year})` : nrInfo.kind === 'open' || nrInfo.kind === 'count' ? `Nonresidents drew (${nrInfo.year})` : 'Nonresident max (10% rule)'}</div>
                <div className="v">{int(nrInfo.n)}<span className="small muted"> of {int(s.tags)}</span></div>
                <div className="small muted">{nrInfo.kind === 'full' ? 'Limit reached' : nrInfo.kind === 'open' ? 'Everyone drew' : nrInfo.kind === 'count' ? `of ${int(s.nrAppsLast)} who applied` : 'A ceiling'}</div>
              </div>
            )}
          </>
        )}
        <div className="stat"><div className="k">{s.nrTag && s.species === 'ELK' ? 'Success, this tag\'s weapons, ' : 'Hunter success, '}{s.harvestYears > 0 && s.harvestYears < 5 ? `${s.harvestYears}-yr` : '5-yr'}</div><div className="v">{pct(s.success5)}</div></div>
        {s.daysPerHarvest5 !== null && <div className="stat"><div className="k">Hunter effort, 5-yr</div><div className="v">{Math.round(s.daysPerHarvest5)} days</div><div className="small muted">per animal taken · {s.daysPerHunter5 !== null ? `${s.daysPerHunter5.toFixed(1)} days per hunter` : ''}</div></div>}
        <div className="stat"><div className="k">Hunters per sq mi{s.hunters5 && s.harvestYears ? ` (${int(s.hunters5 / s.harvestYears)}/yr)` : ''}</div><div className="v">{s.huntersSqMi === null ? '-' : s.huntersSqMi < 10 ? s.huntersSqMi.toFixed(1) : Math.round(s.huntersSqMi)}</div></div>
        {TROPHY_LABEL[s.species] && <div className="stat"><div className="k">{TROPHY_LABEL[s.species]} share</div><div className="v">{pct(s.bigPct5)}</div></div>}
        {SIZE_LABEL[s.species as SpeciesKey] && <div className="stat"><div className="k">{SIZE_LABEL[s.species as SpeciesKey]}, 5-yr</div><div className="v">{s.avgSize5 !== null ? `${s.avgSize5.toFixed(1)}"` : '-'}</div></div>}
        {s.species === 'DEER' && <div className="stat"><div className="k">Deer</div><div className="v" style={{ fontSize: 18 }}>{s.deerType ? `${DEERTYPE[s.deerType]} (${pct100(s.whitetailPct5)} WT)` : '-'}</div></div>}
        <div className="stat"><div className="k">Public land</div><div className="v">{pct100(s.publicPct)}</div></div>
        <div className="stat"><div className="k">Access Yes!</div><div className="v">{s.accessYesPct !== null ? `${s.accessYesPct > 0 && s.accessYesPct < 1 ? '<1' : Math.round(s.accessYesPct)}%` : '-'}</div></div>
        <div className="stat"><div className="k">Huntable (public + AY!)</div><div className="v">{pct100(s.huntablePct)}</div></div>
      </div>

      {s.smallSample && <div className="note">Fewer than 50 hunters over 5 years. One or two animals swing the success rate a lot. Don&apos;t read much into a single year.</div>}
      {recentBoundaryChanges(s.units) && <div className="note">IDFG changed the boundary of unit {recentBoundaryChanges(s.units)!.units.join(', ')} in {recentBoundaryChanges(s.units)!.year}. Earlier years may cover different ground.</div>}
      {renumbered && <div className="note">IDFG renumbered this hunt over the years (hunt numbers: {[...new Set(history.map((h) => h.huntNumber).filter(Boolean))].join(', ')}). History is matched by hunt area and tag count; check the IDFG page if a year looks off.</div>}
      {nr && nrInfo && <p className="small muted" style={{ margin: '4px 0' }}>{nrInfo.long} {isMsg ? 'For moose, sheep and goat, Idaho limits nonresidents to 10% of each species\' tags statewide, not per hunt.' : <>Idaho limits nonresidents to 10% of a controlled hunt&apos;s tags (1 in hunts of 10 or fewer); IDFG sets a fixed number on some hunts, and leftover tags in the second drawing aren&apos;t limited.</>}</p>}
      {nr && isMsg && !nrInfo && <p className="small muted" style={{ margin: '4px 0' }}>For moose, sheep and goat, Idaho limits nonresidents to 10% of each species&apos; tags statewide, not per hunt.</p>}
      {nr && ctl && (s.nrAppsLast ?? 0) < 30 && (s.nrOddsLast ?? 0) < 0.995 && <div className="note">Very few nonresident applicants or tags here. Nonresident odds swing hard on 0-2 tags a year.</div>}

      <div className="grid2" style={{ marginTop: 12, marginBottom: 12 }}>
        {s.type === 'CONTROLLED' && <OddsChart data={history} nr={nr} />}
        {s.type === 'CONTROLLED' && <ApplicantsChart data={history} />}
        <SuccessChart data={history} compare={compare} />
        <HarvestChart data={history} />
        {(s.species === 'DEER' || s.species === 'ELK') && <QualityChart data={history} species={s.species} />}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Land and access</h3>
          <LandBar shares={land} />
          <p className="small">
            {(s.accessYesCount ?? 0) > 0 ? `${s.accessYesCount} Access Yes! properties, about ${int(s.accessYesAcres)} acres. Access Yes! is mostly private land leased for hunter access, so it is counted separately from public land.` : 'No Access Yes! properties.'}{' '}
            {area?.acres ? `Hunt area is about ${int(area.acres)} acres.` : ''}
          </p>
          <h3>Units</h3>
          <div>
            {(((area?.units as { unit: string; pct: number }[] | null) ?? s.units.map((u) => ({ unit: u, pct: 0 })))).map((u) => (
              <Link key={u.unit} href={`/units/${encodeURIComponent(u.unit)}`} className="pill" style={{ textDecoration: 'none' }}>
                Unit {u.unit}{u.pct ? ` · ${u.pct}%` : ''}
              </Link>
            ))}
          </div>
          {area?.description && <p className="small muted">{area.description.slice(0, 600)}</p>}
        </div>
      </div>

      <ApplyChecklist secondChoiceNote={ctl && (s.secondDrewLast ?? 0) > 0 ? (nr && nrInfo?.kind === 'full' ? `Tags reached 2nd choices in ${s.oddsLastYear ?? 'the last drawing'}, but the nonresident limit was already full, so this hunt is a poor 2nd choice for nonresidents.` : `${int(s.secondDrewLast)} tags went to 2nd-choice applicants in ${s.oddsLastYear ?? 'the last drawing'}: a realistic 2nd choice.`) : ctl ? 'Its tags all went to 1st choices last time, so it rarely works as a 2nd choice.' : undefined}
        kind={isMsg ? 'msg' : ctl ? 'controlled' : s.nrTag || nr ? 'nrGeneral' : 'otc'} code={ctl ? (s.huntNumber ? String(s.huntNumber) : null) : s.nrTag ? s.tagCode : ((s.nrTagOdds as { code: string }[] | null)?.[0]?.code ?? null)} nr={nr} species={s.species} />

      {alts.length > 0 && (
        <div className="card alts">
          <h3>Easier To Draw, Just As Good</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {ctl ? `Other ${SPECIES_LABEL[s.species].toLowerCase()} ${antlerLabel(s.species, s.antlerClass).toLowerCase()} ${WEAPON[s.weapon].toLowerCase()} hunts` : `Other ${SPECIES_LABEL[s.species].toLowerCase()} tags`} with better {nr ? 'nonresident' : 'resident'} 5-year odds and at least 80% of this hunt&apos;s success.
          </p>
          <ul>
            {alts.map((a) => (
              <li key={a.id}>
                <Link href={huntHref(a)}>{a.nrTag ? a.name : `Hunt ${a.huntNumber} · Area ${a.areaName}`}</Link>
                <span className="small"> {pctOdds(a.type === 'CONTROLLED' ? a[rf.odds5] : a.nrOdds5)} odds (vs {pctOdds(myOdds)}) · {pct(a.success5)} success (vs {pct(s.success5)}){a.openDate ? ` · ${range(a.openDate, a.closeDate)}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <h3>Year By Year</h3>
          <table className="results compact">
            <thead>
              <tr>
                <th>Year</th>
                {ctl && <><th>Hunt</th><th className="num">Tags</th><th className="num">Res Drew / Applied</th><th className="num">Res %</th><th className="num">NR Drew / Applied</th><th className="num">NR %</th></>}
                <th className="num">Hunters</th><th className="num">Harvest</th><th className="num">Success</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.year} className={since && h.year < since ? 'old' : undefined} title={since && h.year < since ? `Before the ${since} boundary change` : undefined}>
                  <td>{h.year}</td>
                  {ctl && <><td>{h.huntNumber ?? '-'}</td><td className="num">{n(h.permits)}</td>
                    <td className="num">{h.resApps ? `${n(h.resPermits)} / ${n(h.resApps)}` : '-'}</td><td className="num">{ratio(h.resPermits, h.resApps, true)}</td>
                    <td className="num">{h.nrApps ? `${n(h.nrPermits)} / ${n(h.nrApps)}` : '-'}</td><td className="num">{ratio(h.nrPermits, h.nrApps, true)}</td></>}
                  <td className="num">{n(h.hunters)}</td><td className="num">{n(h.harvest)}</td><td className="num">{ratio(h.harvest, h.hunters)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{ctl ? '5-yr' : `${nHarv}-yr`}</td>
                {ctl && <><td /><td className="num">{int(sum(drawn, (h) => h.permits))}</td>
                  <td className="num">{int(sum(drawn, (h) => h.resPermits))} / {int(sum(drawn, (h) => h.resApps))}</td><td className="num">{ratio(sum(drawn, (h) => h.resPermits), sum(drawn, (h) => h.resApps), true)}</td>
                  <td className="num">{int(sum(drawn, (h) => h.nrPermits))} / {int(sum(drawn, (h) => h.nrApps))}</td><td className="num">{ratio(sum(drawn, (h) => h.nrPermits), sum(drawn, (h) => h.nrApps), true)}</td></>}
                <td className="num">{int(sum(harvested, (h) => h.hunters))}</td><td className="num">{int(sum(harvested, (h) => h.harvest))}</td>
                <td className="num">{ratio(sum(harvested, (h) => h.harvest), sum(harvested, (h) => h.hunters))}</td>
              </tr>
            </tbody>
          </table>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {ctl ? 'Drawing = first choice. ' : ''}{ctl ? '5-yr = the last 5 drawings and the last 5 harvest years (harvest is reported a season after the draw)' : `${nHarv}-yr = the last ${nHarv} harvest years`}, totaled: {ctl ? 'drawn ÷ applied and harvest ÷ hunters' : 'harvest ÷ hunters'}, not an average of yearly percents.
            {s.nrTag ? ` Hunters and harvest are the general seasons in units ${s.units.join(', ')}${s.species === 'ELK' ? ' for the weapons this tag can hunt with' : ', all weapons'}, the same basis as the success figure above.` : ''}
            {since ? ` Unit ${s.unit ?? s.units[0]}'s boundary changed in ${since}: earlier years (shaded) cover different ground and aren't counted.` : ''}
          </p>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        Odds = permits / first-choice applicants. Success = harvest / hunters, from IDFG harvest reports (expanded estimates).
        Mule/whitetail and trophy counts are back-calculated from IDFG&apos;s rounded percentages: direction, not precision.
      </p>
    </main>
  );
}

type NrDrawJson = { year: number; tags: number; applied: number[]; drew: number[] };

/** Nonresident general tag: the draw by choice, quota, units, and how the draw works. */
function NrTagCard({ s }: { s: { nrDraw: unknown; tagSeasons: unknown; quota: number | null; quotaYear: number | null; capped: boolean; units: string[]; tagCode: string | null; species: string } }) {
  const d = s.nrDraw as NrDrawJson | null;
  const seasons = sortedSeasons(s.tagSeasons);
  const sy = (s.tagSeasons as { year?: number } | null)?.year;
  const ord = ['1st', '2nd', '3rd', '4th', '5th'];
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Nonresident General Tag Draw</h3>
      <div className="stats" style={{ marginTop: 0 }}>
        <div className="stat"><div className="k">{d ? `${d.year} 1st-choice odds` : '1st-choice odds'}</div><div className="v">{d?.applied[0] ? `${Math.min(100, (100 * d.drew[0]) / d.applied[0]).toFixed(1)}%` : '-'}</div></div>
        <div className="stat"><div className="k">{d ? `${d.year} tags` : 'Tags'}</div><div className="v">{d ? int(d.tags) : '-'}</div></div>
        <div className="stat"><div className="k">{s.quotaYear ? `${s.quotaYear} NR quota` : 'NR quota'}</div><div className="v">{s.quota !== null ? int(s.quota) : '-'}{s.capped ? <span className="small muted"> capped</span> : null}</div></div>
        <div className="stat"><div className="k">Apply with</div><div className="v" style={{ fontSize: 18 }}>{s.tagCode ?? '-'}</div></div>
      </div>
      {d && (
        <div className="tag-draw">
          <div style={{ overflowX: 'auto' }}>
          <table className="results compact">
            <thead><tr><th>Choice</th><th className="num">Applied</th><th className="num">Drew</th><th className="num">Odds</th></tr></thead>
            <tbody>
              {d.applied.map((a, i) => (
                <tr key={i}><td>{ord[i]}</td><td className="num">{int(a)}</td><td className="num">{int(d.drew[i] ?? 0)}</td><td className="num">{a ? `${Math.min(100, (100 * (d.drew[i] ?? 0)) / a).toFixed(1)}%` : '-'}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
          <ChoiceChart applied={d.applied} drew={d.drew} />
        </div>
      )}
      {d && laterChoices(d) && <p className="choice-tip"><b>Strategy:</b> {laterChoices(d)}.</p>}
      {seasons.length > 0 && (
        <>
          <h4 style={{ margin: '14px 0 6px' }}>{sy} Seasons For This Tag</h4>
          <SeasonStrip seasons={seasons} year={sy ?? new Date().getFullYear()} />
          <div className="uh-list">
            {seasons.map((x, i) => (
              <div key={i} className="uh-row" style={{ gridTemplateColumns: '1fr' }}>
                <div className="uh-name">{seasonTitle(x)}</div>
                <div className="uh-meta"><b>{seasonDates(x)}</b>{x.notes ? ` · ${x.notes}` : ''}</div>
              </div>
            ))}
          </div>
          <p className="small muted">From IDFG&apos;s {sy} Seasons &amp; Rules ({s.species === 'ELK' ? 'elk zone A/B tag tables' : 'general deer tag tables by unit'}). Restrictions are summarized; check the regulations for boundaries and notes.</p>
        </>
      )}
      <p className="small">
        Units:{' '}
        {s.units.map((u) => <Link key={u} href={`/units/${encodeURIComponent(u)}`} className="pill" style={{ textDecoration: 'none' }}>Unit {u}</Link>)}
      </p>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Since 2026 Idaho draws nonresident general deer and elk tags. You list up to five hunt codes; a tag that fills from
        1st-choice applicants never reaches later choices. Elk tags are per zone (an A or a B tag, each with its own seasons);
        deer tags are per unit (Regular Deer, or White-tailed Deer only). Leftovers go to a second application period, then a
        returned-tag sale. Check IDFG&apos;s nonresident general tag brochure for the current dates and rules.
      </p>
    </div>
  );
}

/** Land ownership across several units (a zone or a multi-unit tag): shares weighted by each unit's acres. */
function mergeLand(units: { acres: number | null; landOwnership: unknown }[]): { manager: string; pct: number }[] | null {
  const acc = new Map<string, number>();
  let total = 0;
  for (const u of units) {
    const l = u.landOwnership as { manager: string; pct: number }[] | null;
    if (!l?.length || !u.acres) continue;
    total += u.acres;
    for (const x of l) acc.set(x.manager, (acc.get(x.manager) ?? 0) + (x.pct * u.acres) / 100);
  }
  if (!total) return null;
  return [...acc.entries()].map(([manager, a]) => ({ manager, pct: Math.round((1000 * a) / total) / 10 })).sort((a, b) => b.pct - a.pct);
}
