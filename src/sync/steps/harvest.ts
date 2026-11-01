import { db, STATS_BASE, SPECIES, FIRST_HARVEST_YEAR, yearsToFetch, type StepOptions, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseStatsTable, normArea, num, type Row } from '../core/parse';
import { estimates, type SpeciesName } from '../core/math';

const MIN_LAST_UNIT = 70; // general pages should reach the high-70s units; stopping earlier = cut off

function fields(species: SpeciesName, year: number, h: Row) {
  const base = {
    hunters: num(h['hunters']),
    harvest: num(h['harvest']),
    successPct: num(h['success%']),
    days: num(h['days']),
    antlered: num(h['antlered']),
    antlerless: num(h['antlerless']),
    pct4: num(h['%4+pts']),
    pct5: num(h['%5+pts']),
    pctWt: num(h['%whitetail']),
    pctSpike: num(h['%spike']),
    pct6: num(h['%6+pts']),
  };
  return { ...base, ...estimates(species, year, base) };
}

/**
 * Fetches one stats page per species/year. A page that fails the completeness check is retried once;
 * still short -> loaded but reported as CHECK. A page that errors -> existing rows for that year are kept.
 */
async function fetchSeason(
  season: 'controlled' | 'general',
  opts: StepOptions,
  check: (species: SpeciesName, year: number, rows: Row[]) => Promise<string>,
  save: (species: SpeciesName, year: number, rows: Row[]) => Promise<number>,
  haveYears: (species: SpeciesName) => Promise<Set<number>>,
): Promise<StepResult> {
  const details: string[] = [];
  let rows = 0;
  for (const { species, game } of SPECIES) {
    for (const year of yearsToFetch(FIRST_HARVEST_YEAR, await haveYears(species), opts.full)) {
      const url = `${STATS_BASE}?season=${season}&game=${game}&yr=${year}`;
      let parsed: Row[];
      try {
        parsed = parseStatsTable(await get(url), season === 'controlled' ? 'hunt#' : 'unit');
        let problem = parsed.length ? await check(species, year, parsed) : '';
        if (problem) {
          const retry = parseStatsTable(await get(url), season === 'controlled' ? 'hunt#' : 'unit');
          if (retry.length > parsed.length) parsed = retry;
          problem = await check(species, year, parsed);
          if (problem) details.push(`${species} ${year}: POSSIBLY INCOMPLETE (${problem})`);
        }
      } catch (e) {
        details.push(`${species} ${year}: ${(e as Error).message} - kept existing rows`);
        continue;
      }
      if (!parsed.length) {
        if (year < new Date().getFullYear()) details.push(`${species} ${year}: no table found`);
        continue; // the current season's harvest isn't published until next year
      }
      rows += await save(species, year, parsed);
    }
  }
  if (!rows && details.length) return { rows, status: 'ERROR', details };
  return { rows, details };
}

export async function syncControlledHarvest(opts: StepOptions): Promise<StepResult> {
  return fetchSeason(
    'controlled',
    opts,
    async (species, year, rows) => {
      const expected = await db.drawOdds.count({ where: { species, year, draw: 1 } });
      return expected >= 20 && rows.length < expected * 0.7 ? `${rows.length} of ~${expected} hunts` : '';
    },
    async (species, year, rows) => {
      const data = rows
        .map((h) => {
          const yr = num(h['year']) ?? year;
          const huntNumber = num(h['hunt#'])!;
          return {
            id: `${species}|${yr}|${huntNumber}`,
            species,
            year: yr,
            huntNumber,
            areaName: normArea(h['area']),
            takeMethod: h['takemethod'] || null,
            ...fields(species, yr, h),
          };
        })
        .filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);
      await db.$transaction([db.controlledHarvest.deleteMany({ where: { species, year } }), db.controlledHarvest.createMany({ data })]);
      return data.length;
    },
    async (species) =>
      new Set((await db.controlledHarvest.findMany({ where: { species }, select: { year: true }, distinct: ['year'] })).map((r) => r.year)),
  );
}

export async function syncGeneralHarvest(opts: StepOptions): Promise<StepResult> {
  return fetchSeason(
    'general',
    opts,
    async (_s, _y, rows) => {
      const maxUnit = Math.max(0, ...rows.map((h) => parseInt(normArea(h['unit']), 10) || 0));
      return maxUnit < MIN_LAST_UNIT ? `stops at unit ${maxUnit}` : '';
    },
    async (species, year, rows) => {
      const data = rows
        .map((h) => {
          const yr = num(h['year']) ?? year;
          const unit = normArea(h['unit']);
          const takeMethod = h['takemethod'] || 'Unknown';
          return { id: `${species}|${yr}|${unit}|${takeMethod}`, species, year: yr, unit, takeMethod, ...fields(species, yr, h) };
        })
        .filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);
      await db.$transaction([db.generalHarvest.deleteMany({ where: { species, year } }), db.generalHarvest.createMany({ data })]);
      return data.length;
    },
    async (species) =>
      new Set((await db.generalHarvest.findMany({ where: { species }, select: { year: true }, distinct: ['year'] })).map((r) => r.year)),
  );
}
