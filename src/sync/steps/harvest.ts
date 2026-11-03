import { db, STATS_BASE, SPECIES, FIRST_HARVEST_YEAR, yearsToFetch, type StepOptions, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseStatsTable, normArea, num, speciesColumns, type Row } from '../core/parse';
import { estimates, type SpeciesName } from '../core/math';

const MIN_LAST_UNIT = 70; // general pages should reach the high-70s units; stopping earlier = cut off

function fields(species: SpeciesName, year: number, h: Row) {
  const base = {
    hunters: num(h['hunters']),
    harvest: num(h['harvest']),
    successPct: num(h['success%']),
    days: num(h['days']),
    // pronghorn: horned / hornless; moose: bulls / cows; sheep: rams / ewes; goat: billies / nannies
    antlered: num(h['antlered'] ?? h['horned'] ?? h['bulls'] ?? h['rams'] ?? h['billies']),
    antlerless: num(h['antlerless'] ?? h['hornless'] ?? h['cows'] ?? h['ewes'] ?? h['nannies']),
    pct4: num(h['%4+pts']),
    pct5: num(h['%5+pts']),
    pctWt: num(h['%whitetail']),
    pctSpike: num(h['%spike']),
    pct6: num(h['%6+pts']),
  };
  const size = { avgSize: num(h['avg.antlerspread(in.)'] ?? h['avg.hornlength(in.)']), avgCircum: num(h['avg.horncircum.(in.)']) };
  return { ...base, ...estimates(species, year, base), ...size };
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
  for (const { species, game, title, general } of SPECIES) {
    if (season === 'general' && !general) continue; // pronghorn, moose, sheep, goat: controlled hunts only
    for (const year of yearsToFetch(FIRST_HARVEST_YEAR, await haveYears(species), opts.full)) {
      // a species can span several pages (California + Rocky Mountain bighorns): one year's rows are all of them
      let parsed: Row[] = [];
      let failed = false;
      for (const g of game) {
        const url = `${STATS_BASE}?season=${season}&game=${encodeURIComponent(g)}&yr=${year}`;
        try {
          let page = parseStatsTable(await get(url), season === 'controlled' ? 'hunt#' : 'unit');
          // IDFG answers an unknown game name with the deer page: only keep a table with this species' columns
          if (page.length && !speciesColumns(species, page[0])) {
            details.push(`${species} ${year} (${g}): table columns aren't ${title} columns - skipped`);
            continue;
          }
          let problem = page.length && game.length === 1 ? await check(species, year, page) : '';
          if (problem) {
            const retry = parseStatsTable(await get(url), season === 'controlled' ? 'hunt#' : 'unit');
            if (retry.length > page.length) page = retry;
            problem = await check(species, year, page);
            if (problem) details.push(`${species} ${year}: POSSIBLY INCOMPLETE (${problem})`);
          }
          parsed = parsed.concat(page);
        } catch (e) {
          details.push(`${species} ${year} (${g}): ${(e as Error).message} - kept existing rows`);
          failed = true;
        }
      }
      if (failed) continue; // never replace a year with only part of its pages
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
