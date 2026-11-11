// Build data/mt/harvest.json from FWP's Harvest Estimates Search exports.
//
//   NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx \
//     scripts/mt_build_harvest.ts <elk.csv> <deer.csv> <antelope.csv>
//
// The exports are the three species reports, 2004-2025, one row per district / species / residency.
// Everything awkward about them is documented in docs/states/mt-onboarding.md §5. The three that change
// the numbers, and that this script enforces:
//
//   1. HARVEST is estimated per district every year, 2004-2025. HUNTERS and DAYS are not: FWP surveys
//      hunter participation in alternating years by species (deer in odd years, elk and antelope in even
//      years, since roughly 2013). In a non-survey year every district's Hunters and Days read 0 while
//      the harvest columns are populated. Those zeros mean "not estimated" and are stored as null, never
//      as zero hunters, and never interpolated. So the harvest trend is annual, while harvest success
//      and hunter density can only be computed for surveyed years.
//   2. The "Hunting District" column also carries rollup rows: `State`, `Reg_1`..`Reg_7`, `1XX`..`7XX`,
//      `XXX`, `Reg_X`. `State` is a word, so a numeric-only filter silently includes it and doubles the
//      state total. They are separated out here, not dropped, because the statewide row is the only
//      additive hunter figure.
//   3. Hunter counts are NOT additive across districts — a hunter is counted in every district they
//      hunted, so district sums run ~28% above the statewide estimate, while harvest is additive. Per
//      district rates are fine; summing district hunters is not. The build asserts both behaviours so a
//      future export that changes basis fails loudly.

import { readFileSync, writeFileSync } from 'node:fs';

const ROLLUP = /^(State|Reg_\w+|\d?X{2,}|X{3})$/i;

export interface DistrictYear {
  year: number;
  /** null in a year FWP did not survey hunter participation for this species. Never 0 for "unknown". */
  hunters: number | null;
  days: number | null;
  harvest: number;
  /** Bulls (elk) or bucks (deer, antelope). */
  antlered: number;
  antlerless: number;
  young: number;
  bow?: number;
  rifle?: number;
  /** 6+ point bulls, or 4+ point bucks. FWP does not publish this for antelope. */
  big?: number;
}

export interface SpeciesHarvest {
  species: string;
  /** Years FWP surveyed hunter participation, oldest first. Success and density exist only for these. */
  surveyedYears: number[];
  /** Years with district harvest estimates, oldest first. Annual. */
  harvestYears: number[];
  /** Statewide estimate per year — the only hunter figure that is additive. */
  statewide: Record<string, { hunters: number; harvest: number }>;
  districts: Record<string, DistrictYear[]>;
}

type Row = Record<string, string>;

function readCsv(path: string): Row[] {
  const [head, ...lines] = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = head.split(',').map((c) => c.trim());
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Row = {};
    cols.forEach((c, i) => { row[c] = (cells[i] ?? '').trim(); });
    return row;
  });
}

const int = (v: string | undefined) => {
  if (v === undefined || v === '') return 0;
  const n = Number(v.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`not a number: ${JSON.stringify(v)}`);
  return n;
};

function build(path: string, species: string, cols: { antlered: string; antlerless: string; young: string; big?: string; weapons?: boolean }, speciesFilter?: string): SpeciesHarvest {
  const rows = readCsv(path).filter((r) => r.Residency === 'SUM' && (!speciesFilter || r['Deer Species'] === speciesFilter));
  if (!rows.length) throw new Error(`${path}: no SUM rows${speciesFilter ? ` for ${speciesFilter}` : ''}`);
  // A column name that does not match reads as '' and then as 0, silently: until 2026-11-11 the deer
  // "4 or More Points" key carried a leading space and every deer trophy value was 0. Fail instead.
  for (const c of [cols.antlered, cols.antlerless, cols.young, cols.big, ...(cols.weapons ? ['Bow', 'Rifle'] : [])]) {
    if (c && !(c in rows[0])) throw new Error(`${path}: no column ${JSON.stringify(c)}; columns are ${Object.keys(rows[0]).join(', ')}`);
  }

  const districts: Record<string, DistrictYear[]> = {};
  const statewide: Record<string, { hunters: number; harvest: number }> = {};
  const districtTotals: Record<number, { hunters: number; harvest: number }> = {};

  // A year counts as surveyed for this species if any district reports hunters. Within such a year a
  // district's 0 is a real zero; outside one it means FWP did not survey, and is stored as null.
  const surveyed = new Set<number>();
  for (const r of rows) {
    if (ROLLUP.test(r['Hunting District'])) continue;
    if (int(r.Hunters) > 0) surveyed.add(int(r['License Year']));
  }

  for (const r of rows) {
    const district = r['Hunting District'];
    const year = int(r['License Year']);
    const harvest = int(r['Total Harvest']);
    const rawHunters = int(r.Hunters);

    if (ROLLUP.test(district)) {
      // `State` is the de-duplicated statewide estimate. The regional and unknown-district rollups are not
      // kept: they are only meaningful alongside the district rows, and nothing in the app uses them.
      if (/^State$/i.test(district)) statewide[String(year)] = { hunters: rawHunters, harvest };
      continue;
    }

    const isSurveyed = surveyed.has(year);
    const hunters = isSurveyed ? rawHunters : null;
    const days = isSurveyed ? int(r.Days) : null;
    if (!isSurveyed && rawHunters > 0) {
      throw new Error(`${species} ${district} ${year}: hunters reported in a year classed as unsurveyed`);
    }
    // Nothing estimated at all for this district-year.
    if (harvest === 0 && !rawHunters && !int(r.Days)) continue;

    const entry: DistrictYear = {
      year,
      hunters,
      days,
      harvest,
      antlered: int(r[cols.antlered]),
      antlerless: int(r[cols.antlerless]),
      young: int(r[cols.young]),
    };
    if (cols.weapons) { entry.bow = int(r.Bow); entry.rifle = int(r.Rifle); }
    if (cols.big) entry.big = int(r[cols.big]);

    // The sex/age classes are estimated and rounded independently of the total, so the split can land one
    // animal above it. Across 2004-2025 the overshoot is never more than 1, in any species — so 1 is the
    // tolerance, and 2 means something other than rounding.
    const split = entry.antlered + entry.antlerless + entry.young;
    if (split > harvest + 1) {
      throw new Error(`${species} ${district} ${year}: sex/age split ${split} exceeds harvest ${harvest} by more than rounding`);
    }

    (districts[district] ||= []).push(entry);
    const t = (districtTotals[year] ||= { hunters: 0, harvest: 0 });
    t.hunters += hunters ?? 0; t.harvest += harvest;
  }

  for (const list of Object.values(districts)) list.sort((a, b) => a.year - b.year);
  const all = Object.values(districts).flat();
  const harvestYears = [...new Set(all.map((d) => d.year))].sort((a, b) => a - b);
  const surveyedYears = [...surveyed].sort((a, b) => a - b);
  if (!harvestYears.length) throw new Error(`${species}: no district harvest years`);
  if (!surveyedYears.length) throw new Error(`${species}: no surveyed years`);

  // Guard the two basis facts. If a future export changes either, the numbers on the site would change
  // meaning silently, so fail here instead.
  for (const year of surveyedYears) {
    const state = statewide[String(year)];
    const totals = districtTotals[year];
    if (!state || !totals || !state.hunters) continue;
    // A hunter is counted in every district they hunted, so the district sum is at or above the
    // de-duplicated statewide estimate. How far above depends on how much hunters roam: elk runs ~1.3x,
    // pronghorn barely 1.01x because most pronghorn hunters stay in one district. Below 1 would mean the
    // export had switched to a single-district attribution, which would change what density means.
    const hunterRatio = totals.hunters / state.hunters;
    if (hunterRatio < 0.98) {
      throw new Error(`${species} ${year}: district hunters (${totals.hunters}) fall below the statewide estimate (${state.hunters}) — the export's basis may have changed`);
    }
    if (hunterRatio > 1.8) {
      throw new Error(`${species} ${year}: district hunters are ${hunterRatio.toFixed(2)}x the statewide estimate — too far above the overlap seen 2004-2025`);
    }
    const harvestRatio = totals.harvest / (state.harvest || 1);
    if (harvestRatio > 1.02) {
      throw new Error(`${species} ${year}: district harvest (${totals.harvest}) exceeds the statewide estimate (${state.harvest}); harvest should be additive`);
    }
  }

  return { species, surveyedYears, harvestYears, statewide, districts };
}

const [, , elkCsv, deerCsv, antelopeCsv] = process.argv;
if (!elkCsv || !deerCsv || !antelopeCsv) {
  console.error('usage: tsx scripts/mt_build_harvest.ts <elk.csv> <deer.csv> <antelope.csv>');
  process.exit(1);
}

const out = {
  source: {
    agency: 'Montana Fish, Wildlife & Parks',
    report: 'Harvest Estimates Search',
    url: 'https://myfwp.mt.gov/fwpPub/harvestReports',
    retrieved: '2026-11-10',
    note: 'Survey-based estimates, not counts. District harvest is annual; hunter and day estimates exist only in alternating years by species, and are null otherwise. Hunter counts are not additive across districts; harvest is. Residency splits (R/N) exist in the source and are not kept here.',
  },
  species: {
    ELK: build(elkCsv, 'ELK', { antlered: 'Bulls', antlerless: 'Cows', young: 'Calves', big: '6 or More Points', weapons: true }),
    DEER: build(deerCsv, 'DEER', { antlered: 'Bucks', antlerless: 'Does', young: 'Fawns', big: '4 or More Points', weapons: true }, 'all_deer'),
    DEER_MULE: build(deerCsv, 'DEER_MULE', { antlered: 'Bucks', antlerless: 'Does', young: 'Fawns', big: '4 or More Points', weapons: true }, 'md'),
    DEER_WHITETAIL: build(deerCsv, 'DEER_WHITETAIL', { antlered: 'Bucks', antlerless: 'Does', young: 'Fawns', big: '4 or More Points', weapons: true }, 'wt'),
    PRONGHORN: build(antelopeCsv, 'PRONGHORN', { antlered: 'Bucks', antlerless: 'Does', young: 'Fawns' }),
  },
};

writeFileSync('data/mt/harvest.json', `${JSON.stringify(out)}\n`);
for (const [k, v] of Object.entries(out.species)) {
  console.error(`${k}: ${Object.keys(v.districts).length} districts · harvest ${v.harvestYears[0]}-${v.harvestYears[v.harvestYears.length - 1]} (${v.harvestYears.length} yrs) · hunters surveyed ${v.surveyedYears.length} yrs, latest ${v.surveyedYears[v.surveyedYears.length - 1]}`);
}
