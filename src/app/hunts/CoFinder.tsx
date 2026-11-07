import { FilterPresets } from '@/components/FilterPresets';
import { getCoScoringContext } from '@/lib/coScoringContext';
import { withCoScores, withCoOpportunity } from '@/lib/coScores';
import { otcElkOverlap } from '@/lib/overlappingSeasons';
import { CoRecommendations } from "@/components/CoRecommendations";
import { RememberQuery } from "@/components/BackLink";
import { parseFilters } from "@/lib/finder";
import { matchesHuntSeason } from "@/lib/huntSeasonFilter";
import { matchesCoSeason } from '@/lib/coHunt';
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

import { pointRange } from '@/lib/pointRange';
import { CoHuntCard } from '@/components/CoHuntCard';
import { SearchStates } from '@/components/SearchStates';

const PER_PAGE = 40;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean);
const pct = (o: number | null) => (o === null ? '–' : o >= 0.995 ? '100%' : o > 0 && o < 0.01 ? '<1%' : `${Math.round(o * 100)}%`);

/** Find A Hunt for Colorado: limited licenses with odds at the hunter's own preference points. */
export async function CoFinder({ sp }: { sp: SP }) {
  const species = one(sp.species) === 'PRONGHORN' ? 'PRONGHORN' : one(sp.species) === 'ELK' ? 'ELK' : 'DEER';
  const mode = one(sp.odds) === "last" ? "last" : "proj";
  const pts = await getPoints("CO");
  const nr = pts.res === "NONRESIDENT";
  const pool = poolFor(nr, pts.youth);
  const myPts = pts[species];
  const methods = many(sp.method).filter((m) => ['R', 'A', 'M'].includes(m));
  const common = parseFilters(sp);
  const sexes = common.antler;
  const seasons = many(sp.season);
  const chances = many(sp.chance) as Chance[];
  const range = pointRange(one(sp.minPts), one(sp.maxPts));
  const unit = one(sp.unit).replace(/\D/g, "");
  const sort = ['pts', 'tags', 'unit', 'creep', 'success', 'score', 'opp'].includes(one(sp.sort)) ? one(sp.sort) : 'odds';
  const minSucc = Number(one(sp.minSucc)) || 0;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const ptsField = nr ? "ptsNr" : "ptsRes";
  const where: Prisma.HuntSummaryWhereInput = {
    state: "CO",
    species,
    ...(['GENERAL', 'CONTROLLED'].includes(one(sp.type)) ? { type: one(sp.type) as 'GENERAL' | 'CONTROLLED' } : {}),
    ...(one(sp.priv) === "1" ? {} : { privateOnly: false }),
    ...(one(sp.second) === "1" ? { secondChoice: true } : {}),
    ...(one(sp.hybrid) === "1" ? { hybrid: true } : {}),
    ...(unit ? { units: { has: unit } } : {}),
    ...(range.min !== null || range.max !== null
      ? { [ptsField]: { ...(range.min !== null ? { gte: range.min } : {}), ...(range.max !== null ? { lte: range.max } : {}) } }
      : {}),
    ...(one(sp.youth) === "only"
      ? { youthOnly: true }
      : one(sp.youth) === "include"
        ? {}
        : { youthOnly: false }),
    ...(minSucc ? { success5: { gte: minSucc / 100 } } : {}),
  };
  const [rows, fav, context] = await Promise.all([
    db.huntSummary.findMany({
      where,
    }),
    getFavorites(),
    getCoScoringContext(),
  ]);
  const year = rows[0]?.oddsLastYear ?? (await db.drawRecap.aggregate({ where: { state: 'CO', species }, _max: { year: true } }))._max.year;
  const decorated = rows
    .map(r=>withCoScores(r,context))
    .filter(
      (r) =>
        !Number(one(sp.minPublic)) ||
        (r.publicPct !== null && r.publicPct >= Number(one(sp.minPublic))),
    )
    .map((r) => {
      const d = decodeCode(r.tagCode ?? '');
      const t = r.oddsByPts as unknown as OddsTable | null;
      const odds = tableOdds(t, mode, pool, myPts);
      const ch: Chance = chanceOf(odds, odds !== null && odds >= 0.995 ? 1 : 0, odds !== null && odds > 0 ? 1 : 0);
      const otcOverlap = species === 'DEER' ? otcElkOverlap(r,context.generalElk) : null;
      return { r: withCoOpportunity(r, odds, nr), d, odds, ch, otcOverlap, hasOtcElk: otcOverlap === true };
    })
    .filter(
      ({ d }) =>
        !!d &&
        (!methods.length || methods.includes(d.method)) &&
        (!sexes.length ||
          d.sex === "E" ||
          sexes.includes(d.sex === "M" ? "ANTLERED" : "ANTLERLESS")),
    )
    .filter(({ r }) => matchesCoSeason(r.tagCode ?? "", seasons))
    .filter(({ r }) => matchesHuntSeason(r, { ...common, weapon: [] }))
    .filter(({ ch }) => !chances.length || chances.includes(ch))
    .filter(({otcOverlap}) => species !== 'DEER' || (one(sp.otcElk) === '1' ? otcOverlap === true : one(sp.otcElk) === '0' ? otcOverlap === false : true));
  // a 100% from 3 hunters shouldn't top the list: pull small samples toward the middle (30 hunters' worth at 50%)
  const succKey = (r: (typeof rows)[number]) =>
    r.success5 === null ? -1 : (r.success5 * (r.hunters5 ?? 0) + 15) / ((r.hunters5 ?? 0) + 30);
  const need = (r: (typeof rows)[number]) => (nr ? r.ptsNr : r.ptsRes) ?? 99;
  const creep = (r: (typeof rows)[number]) => (nr ? r.creepNr : r.creepRes) ?? 0;
  decorated.sort((a, b) =>
    sort === 'score' ? (b.r.scoreQuality ?? -1) - (a.r.scoreQuality ?? -1) : sort === 'opp' ? ((nr ? b.r.scoreOppNr : b.r.scoreOppRes) ?? -1) - ((nr ? a.r.scoreOppNr : a.r.scoreOppRes) ?? -1) : sort === 'pts'
      ? need(a.r) - need(b.r) || (b.odds ?? 0) - (a.odds ?? 0)
      : sort === 'tags'
        ? (b.r.tags ?? 0) - (a.r.tags ?? 0)
        : sort === 'unit'
          ? Number(a.d!.unit) - Number(b.d!.unit) || (a.r.tagCode ?? '').localeCompare(b.r.tagCode ?? '')
          : sort === 'creep'
            ? creep(a.r) - creep(b.r)
            : sort === 'success'
              ? succKey(b.r) - succKey(a.r)
              : (b.odds ?? -1) - (a.odds ?? -1) || need(a.r) - need(b.r) || (b.r.tags ?? 0) - (a.r.tags ?? 0),
  );
  const shown = decorated.slice(0, PER_PAGE * page);
  const matched = [...new Set(decorated.flatMap((x) => x.r.units))];
  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) p.set(k, v);
    p.delete('reset');
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    return `/hunts${p.size ? `?${p}` : ''}`;
  };
  const chips = [
    ...(['0','1'].includes(one(sp.otcElk)) ? [{label:one(sp.otcElk)==='1'?'Has OTC elk':'No OTC elk',href:q({otcElk:null,page:null})}] : []),
    ...chances.map((c) => ({ label: CHANCE_LABEL[c], href: q({ chance: chances.filter((x) => x !== c).join(',') || null, page: null }) })),
    ...(range.min !== null || range.max !== null
      ? [{ label: `${range.min ?? 0}–${range.max ?? 40} pts needed`, href: q({ minPts: null, maxPts: null, page: null }) }]
      : []),
    ...(unit ? [{ label: `Unit ${unit}`, href: q({ unit: null, page: null }) }] : []),
    ...(one(sp.second) === '1' ? [{ label: '2nd choice', href: q({ second: null, page: null }) }] : []),
    ...(minSucc ? [{ label: `Success ${minSucc}%+`, href: q({ minSucc: null, page: null }) }] : []),
  ];
  const projYear = (year ?? 0) + 1;
  const spLabel = species === 'DEER' ? 'deer' : species === 'ELK' ? 'elk' : 'pronghorn';

  return (
    <main className="filtering">
      <RememberQuery state="CO" owner={fav.userId}/>
      <section className="f-map" aria-label="Map of matching units">
        <HuntMap
          stats={{
            units: Object.fromEntries(
              matched.map((unit) => {
                const hs = decorated.filter((x) => x.r.units.includes(unit));
                const land = hs[0]?.r;
                return [
                  unit,
                  {
                    score: hs.reduce<number | null>((best,x) => x.r.scoreQuality === null ? best : Math.max(best ?? 0,x.r.scoreQuality),null),
                    odds: Math.max(...hs.map((x) => (x.odds ?? 0) * 100)),
                    fill: Math.max(
                      ...hs.map(
                        (x) => (x.odds ?? 0) * (x.r.success5 ?? 0) * 100,
                      ),
                    ),
                    success: Math.max(
                      ...hs.map((x) => (x.r.success5 ?? 0) * 100),
                    ),
                    crowd: Math.min(
                      ...hs.map((x) => x.r.huntersSqMi ?? Infinity),
                    ),
                    public: land?.publicPct ?? null,
                    huntable: null,
                    objBull: null,
                    objCow: null,
                  },
                ];
              }),
            ),
            areas: {},
          }}
          matched={matched}
          selected={unit}
          chips={chips}
          species={species}
        />
      </section>
      <section className="f-list" aria-label="Results">
        <div className="f-head">
          <div className="f-title">
            <h1>
              Find A Hunt{' '}
              <span className="muted" style={{ fontSize: '.55em' }}>
                Colorado
              </span>
            </h1>
          </div>
          <div className="f-sub">
            <SearchStates />
            <span>
              <b>{decorated.length}</b> {spLabel} hunts · sort by
            </span>
            <span className="seg light" role="group" aria-label="Sort">
              {(
                [
                  ['odds', 'My odds'],
                  ['success', 'Success'],
                  ['score', 'Quality'],
                  ['opp', 'Opportunity'],
                  ['pts', 'Points needed'],
                  ['tags', 'Licenses'],
                  ['creep', 'Point creep'],
                  ['unit', 'Unit'],
                ] as const
              ).map(([k, l]) => (
                <Link
                  key={k}
                  className="seg-link"
                  href={q({ sort: k === 'odds' ? null : k, page: null })}
                  aria-pressed={sort === k}
                  scroll={false}
                >
                  {l}
                </Link>
              ))}
            </span>
          </div>
          <div className="co-oddsbar">
            <span>
              Odds at{' '}
              <b>
                {myPts} {spLabel} point{myPts === 1 ? '' : 's'}
              </b>{' '}
              · {POOL_LABEL[pool]}
              {!pts.set && <> (<Link href="/account#hunting-preferences">set your points in Account</Link>)</>}
            </span>
            <span className="seg light" role="group" aria-label="Which draw">
              <Link className="seg-link" href={q({ odds: null, page: null })} aria-pressed={mode === 'proj'} scroll={false}>
                {projYear} projected
              </Link>
              <Link className="seg-link" href={q({ odds: 'last', page: null })} aria-pressed={mode === 'last'} scroll={false}>
                {year} actual
              </Link>
            </span>
          </div>
          {projYear >= RULE_CHANGE_YEAR - 1 && (
            <p className="f-years">
              {mode === 'proj'
                ? `${projYear} planning odds assume unsuccessful ${year} applicants return with one extra point, unchanged supply and no declining cutoff.`
                : `What happened in the ${year} primary draw (CPW Draw Recap).`}{' '}
              The {RULE_CHANGE_YEAR} draw switches to half preference, half bonus points.
            </p>
          )}
        </div>
        {!decorated.length && (
          <div className="ucard">
            <h2>No Hunts Match</h2>
            <p className="muted">
              Loosen a filter or remove a chip on the map. <Link href="/hunts?reset=1">Clear all filters</Link>.
            </p>
          </div>
        )}
        {!rows.length && <p className="muted">No hunts match these filters.</p>}
        <CoRecommendations rows={decorated} />
        {shown.map(({ r, odds, ch, hasOtcElk }) => (
          <CoHuntCard
            key={r.id}
            r={r}
            hasOtcElk={hasOtcElk}
            odds={odds}
            chance={ch}
            points={myPts}
            nr={nr}
            mode={mode}
            saved={fav.hunts.has(r.huntId)}
            signedIn={fav.signedIn}
          />
        ))}
        {shown.length < decorated.length && (
          <p style={{ textAlign: 'center' }}>
            <Link className="btn" href={q({ page: String(page + 1) })} scroll={false}>
              Show more ({decorated.length - shown.length} left)
            </Link>
          </p>
        )}
        <p className="small muted">
          Source: Colorado Parks and Wildlife Draw Recap reports{year ? ` 2021–${year}` : ''}, harvest estimates and Chapter W-2 regulations
          (units and dates). First-choice adult applicants unless you set youth. Not affiliated with CPW; confirm hunt codes and dates in
          the current big game brochure.
        </p>
      </section>
      <CoFilters nr={nr} points={myPts} speciesLabel={spLabel} presets={<FilterPresets key={fav.userId} owner={fav.userId} state="CO" />} />
    </main>
  );
}

export { dateRange, fmtNeed, fmtCreep } from '@/lib/coDisplay';
