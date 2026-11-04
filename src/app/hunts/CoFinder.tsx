import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getPoints } from '@/lib/points';
import { getFavorites } from '@/lib/favorites';
import { CoFilters } from '@/components/CoFilters';
import { HuntMap } from '@/components/HuntMap';
import { Star } from '@/components/Star';
import { decodeCode, poolFor, tableOdds, POOL_LABEL, type OddsTable } from '@/lib/coHunt';
import { chanceOf, CHANCE_LABEL, RULE_CHANGE_YEAR, type Chance } from '@/lib/coOdds';
import { int } from '@/lib/format';

const PER_PAGE = 40;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean);
const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** Find A Hunt for Colorado: limited licenses with odds at the hunter's own preference points. */
export async function CoFinder({ sp }: { sp: SP }) {
  const species = one(sp.species) === 'ELK' ? 'ELK' : 'DEER';
  const mode = one(sp.odds) === 'last' ? 'last' : 'proj';
  const pts = await getPoints('CO');
  const nr = pts.res === 'NONRESIDENT';
  const pool = poolFor(nr, pts.youth);
  const myPts = pts[species];
  const methods = many(sp.method).filter((m) => ['R', 'A', 'M'].includes(m));
  const sexes = many(sp.sex).filter((m) => ['M', 'F', 'E'].includes(m));
  const seasons = many(sp.season);
  const chances = many(sp.chance) as Chance[];
  const maxPts = one(sp.maxPts) === '' ? null : Number(one(sp.maxPts));
  const unit = one(sp.unit).replace(/\D/g, '');
  const sort = ['pts', 'tags', 'unit', 'creep', 'success'].includes(one(sp.sort)) ? one(sp.sort) : 'odds';
  const minSucc = Number(one(sp.minSucc)) || 0;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const ptsField = nr ? 'ptsNr' : 'ptsRes';
  const where: Prisma.HuntSummaryWhereInput = {
    state: 'CO', species,
    ...(one(sp.priv) === '1' ? {} : { privateOnly: false }),
    ...(one(sp.second) === '1' ? { secondChoice: true } : {}),
    ...(one(sp.hybrid) === '1' ? { hybrid: true } : {}),
    ...(unit ? { units: { has: unit } } : {}),
    ...(maxPts !== null && Number.isFinite(maxPts) ? { [ptsField]: { lte: maxPts } } : {}),
    ...(minSucc ? { success5: { gte: minSucc / 100 } } : {}),
  };
  const [rows, fav] = await Promise.all([
    db.huntSummary.findMany({
      where,
      select: { id: true, slug: true, huntId: true, name: true, tagCode: true, unit: true, units: true, tags: true, permitsPrev: true, oddsLastYear: true,
        ptsRes: true, ptsNr: true, ptsResPct: true, ptsNrPct: true, creepRes: true, creepNr: true, secondChoice: true, hybrid: true, privateOnly: true, oddsByPts: true,
        openDate: true, closeDate: true, success5: true, successLast: true, hunters5: true, harvestLastYear: true, harvestYears: true, smallSample: true },
    }),
    getFavorites(),
  ]);
  const year = rows[0]?.oddsLastYear ?? null;
  const decorated = rows
    .map((r) => {
      const d = decodeCode(r.tagCode ?? '');
      const t = r.oddsByPts as unknown as OddsTable | null;
      const odds = tableOdds(t, mode, pool, myPts);
      const ch: Chance = odds === null ? 'none' : chanceOf(odds, odds >= 0.995 ? 1 : 0, odds > 0 ? 1 : 0);
      return { r, d, odds, ch };
    })
    .filter(({ d }) => !!d && (!methods.length || methods.includes(d.method)) && (!sexes.length || sexes.includes(d.sex)))
    .filter(({ d }) => !seasons.length || seasons.some((s) => (/^\d$/.test(s) ? d!.type === 'O' && d!.method === 'R' && String(d!.no) === s : d!.type === s)))
    .filter(({ ch }) => !chances.length || chances.includes(ch));
  const need = (r: (typeof rows)[number]) => (nr ? r.ptsNr : r.ptsRes) ?? 99;
  const creep = (r: (typeof rows)[number]) => (nr ? r.creepNr : r.creepRes) ?? 0;
  decorated.sort((a, b) =>
    sort === 'pts' ? need(a.r) - need(b.r) || (b.odds ?? 0) - (a.odds ?? 0)
    : sort === 'tags' ? (b.r.tags ?? 0) - (a.r.tags ?? 0)
    : sort === 'unit' ? Number(a.d!.unit) - Number(b.d!.unit) || (a.r.tagCode ?? '').localeCompare(b.r.tagCode ?? '')
    : sort === 'creep' ? creep(a.r) - creep(b.r)
    : sort === 'success' ? (b.r.success5 ?? -1) - (a.r.success5 ?? -1)
    : (b.odds ?? -1) - (a.odds ?? -1) || need(a.r) - need(b.r) || (b.r.tags ?? 0) - (a.r.tags ?? 0));
  const shown = decorated.slice(0, PER_PAGE * page);
  const matched = [...new Set(decorated.flatMap((x) => x.r.units))];
  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
    return `/hunts${p.size ? `?${p}` : ''}`;
  };
  const chips = [
    ...chances.map((c) => ({ label: CHANCE_LABEL[c], href: q({ chance: chances.filter((x) => x !== c).join(',') || null, page: null }) })),
    ...(maxPts !== null ? [{ label: `≤ ${maxPts} pts needed`, href: q({ maxPts: null, page: null }) }] : []),
    ...(unit ? [{ label: `Unit ${unit}`, href: q({ unit: null, page: null }) }] : []),
    ...(one(sp.second) === '1' ? [{ label: '2nd choice', href: q({ second: null, page: null }) }] : []),
    ...(minSucc ? [{ label: `Success ${minSucc}%+`, href: q({ minSucc: null, page: null }) }] : []),
  ];
  const projYear = (year ?? 0) + 1;
  const spLabel = species === 'DEER' ? 'deer' : 'elk';

  return (
    <main className="filtering">
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap matched={matched} selected={unit} chips={chips} species={species} />
      </section>
      <section className="f-list" aria-label="Results">
        <div className="f-head">
          <div className="f-title"><h1>Find A Hunt <span className="muted" style={{ fontSize: '.55em' }}>Colorado</span></h1></div>
          <div className="f-sub">
            <span><b>{decorated.length}</b> limited {spLabel} licenses · sort by</span>
            <span className="seg light" role="group" aria-label="Sort">
              {([['odds', 'My odds'], ['success', 'Success'], ['pts', 'Points needed'], ['tags', 'Licenses'], ['creep', 'Point creep'], ['unit', 'Unit']] as const).map(([k, l]) => (
                <Link key={k} className="seg-link" href={q({ sort: k === 'odds' ? null : k, page: null })} aria-pressed={sort === k} scroll={false}>{l}</Link>
              ))}
            </span>
          </div>
          <div className="co-oddsbar">
            <span>Odds at <b>{myPts} {spLabel} point{myPts === 1 ? '' : 's'}</b> · {POOL_LABEL[pool]}{pts.set ? '' : ' (set your points in the header)'}</span>
            <span className="seg light" role="group" aria-label="Which draw">
              <Link className="seg-link" href={q({ odds: null, page: null })} aria-pressed={mode === 'proj'} scroll={false}>{projYear} projected</Link>
              <Link className="seg-link" href={q({ odds: 'last', page: null })} aria-pressed={mode === 'last'} scroll={false}>{year} actual</Link>
            </span>
          </div>
          {projYear >= RULE_CHANGE_YEAR - 1 && (
            <p className="f-years">{mode === 'proj' ? `${projYear} odds are projected from the ${year} draw and how far cutoffs moved year to year since 2021.` : `What happened in the ${year} primary draw (CPW Draw Recap).`} The {RULE_CHANGE_YEAR} draw switches to half preference, half bonus points.</p>
          )}
        </div>
        {!decorated.length && (
          <div className="ucard"><h2>No Hunts Match</h2><p className="muted">Loosen a filter or remove a chip on the map. <Link href="/hunts?reset=1">Clear all filters</Link>.</p></div>
        )}
        {species === 'ELK' && !rows.length && (
          <div className="ucard"><h2>Colorado Elk Is Next</h2><p className="muted">Deer draw data is loaded first. Elk (with its hybrid draw and the 2025 nonresident archery changes) follows.</p></div>
        )}
        {shown.map(({ r, d, odds, ch }) => (
          <div className="hrow co-row" key={r.id}>
            <div className="hrow-top">
              <span className="star-head">
                <Star kind="hunt" id={r.huntId} saved={fav.hunts.has(r.huntId)} signedIn={fav.signedIn} />
                <Link href={`/hunts/${r.slug}`}>{r.name}</Link>
                <span className={`pill ch-${ch}`}>{CHANCE_LABEL[ch]}</span>
              </span>
              <span className="small muted tags">{r.tags !== null ? `${int(r.tags)} licenses` : ''}{r.permitsPrev !== null && r.tags !== null && r.permitsPrev !== r.tags ? ` (${r.tags > r.permitsPrev ? '+' : ''}${r.tags - r.permitsPrev})` : ''}</span>
            </div>
            <div className="dates">{[r.tagCode, r.units.length > 1 ? `Units ${r.units.join(', ')}` : '', dateRange(r.openDate, r.closeDate), r.privateOnly ? 'Private land only' : '', d!.type === 'K' ? 'Youth only' : ''].filter(Boolean).join(' · ')}</div>
            <div className="co-stats">
              <span className="co-my"><span className="k">My odds at {myPts}</span><b>{pct(odds)}</b></span>
              <span><span className="k">Points needed ({year})</span><span className="res">Res {fmtNeed(r.ptsRes, r.ptsResPct)}</span> · <span className="nr">Nonres {fmtNeed(r.ptsNr, r.ptsNrPct)}</span></span>
              <span><span className="k">Success{r.harvestYears > 1 ? ` (${Math.min(5, r.harvestYears)}-yr)` : ''}</span>{r.success5 === null ? '–' : `${Math.round(r.success5 * 100)}%`}{r.successLast !== null && r.harvestLastYear ? <span className="small muted"> · {r.harvestLastYear}: {Math.round(r.successLast * 100)}%</span> : null}{r.smallSample ? <span className="small muted"> · few hunters</span> : null}</span>
              <span><span className="k">Creep</span>{fmtCreep(nr ? r.creepNr : r.creepRes)}</span>
              {r.secondChoice && <span className="pill">Drew as 2nd choice</span>}
              {r.hybrid && <span className="pill">Hybrid draw</span>}
            </div>
          </div>
        ))}
        {shown.length < decorated.length && (
          <p style={{ textAlign: 'center' }}><Link className="btn" href={q({ page: String(page + 1) })} scroll={false}>Show more ({decorated.length - shown.length} left)</Link></p>
        )}
        <p className="small muted">Source: Colorado Parks and Wildlife Draw Recap reports{year ? ` 2021–${year}` : ''}, harvest estimates and Chapter W-2 regulations (units and dates). First-choice adult applicants unless you set youth. Not affiliated with CPW; confirm hunt codes and dates in the current big game brochure.</p>
      </section>
      <CoFilters nr={nr} points={myPts} speciesLabel={spLabel} />
    </main>
  );
}

/** "Nov 6 – Nov 14, 2027" */
export function dateRange(a: Date | null, b: Date | null): string {
  if (!a || !b) return '';
  const f = (d: Date, y = false) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return `${f(a)} – ${f(b, true)}`;
}

/** "6 (60%)": the level licenses ran out at and the share drawn there. */
export function fmtNeed(pts: number | null, share: number | null): string {
  if (pts === null) return '–';
  if (share === null || share >= 0.995) return String(pts);
  return `${pts} (${Math.round(share * 100)}%)`;
}
export function fmtCreep(c: number | null): string {
  if (c === null) return '–';
  if (Math.abs(c) < 0.1) return 'flat';
  return `${c > 0 ? '+' : ''}${c.toFixed(1)}/yr`;
}
