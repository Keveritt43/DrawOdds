import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatsTable,
  parseLandPage,
  parseHuntList,
  normArea,
  num,
  usDate,
  antlerOf,
  weaponOf,
} from '../src/sync/core/parse';
import {
  estimates,
  lineage,
  summarizeOdds,
  summarizeHarvest,
  deerType,
  tagAndFill,
  type OddsRow,
} from '../src/sync/core/math';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');

test('normArea and num', () => {
  assert.equal(normArea('Unit 14'), '14');
  assert.equal(normArea(' 36b-1 '), '36B-1');
  assert.equal(num('1,046'), 1046);
  assert.equal(num('47%'), 47);
  assert.equal(num(''), null);
  assert.equal(usDate('11/10/26'), '2026-11-10');
});

test('controlled stats table: picks the Hunt# table, skips nav tables and non-data rows', () => {
  const rows = parseStatsTable(fx('controlled-deer.html'), 'hunt#');
  assert.equal(rows.length, 3);
  assert.equal(rows[0]['hunt#'], '1001');
  assert.equal(rows[0]['%whitetail'], '47');
  assert.equal(rows[1]['antlerless'], '');
});

test('general stats table: unit key, drops statewide totals', () => {
  const rows = parseStatsTable(fx('general-deer.html'), 'unit');
  assert.deepEqual(rows.map((r) => r.unit), ['1', '1', '49']);
  assert.equal(rows[2]['takemethod'], 'Any Weapon');
});

test('hunt page history table keyed by year', () => {
  const rows = parseStatsTable(fx('hunt-page.html'), 'year');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['hunt#'], '2028');
});

test('land page: surface management, public %, access yes, wilderness', () => {
  const p = parseLandPage(fx('unit-49.html'));
  assert.equal(p.shares.length, 6);
  assert.equal(p.shares[0].manager, 'Private');
  assert.equal(p.privatePct, 34.6);
  assert.equal(p.publicPct, 65.4); // BLM + USFS + State + NPS + BOR
  assert.equal(p.accessYesNone, true);
  assert.equal(p.wildernessPct, 0);
});

test('hunt list: hunts, dates, weapon, antler class, tags', () => {
  const hunts = parseHuntList(fx('huntlist-49-elk.html'));
  assert.equal(hunts.length, 3);
  const ml = hunts.find((h) => h.huntNumber === 2138)!;
  assert.equal(ml.type, 'CONTROLLED');
  assert.equal(ml.weapon, 'MUZZLELOADER');
  assert.equal(ml.antlerClass, 'EITHER');
  assert.equal(ml.open, '2026-11-01');
  assert.equal(ml.close, '2026-11-14');
  assert.equal(ml.tags, 75);
  const b = hunts.find((h) => h.idfgId === 80930)!;
  assert.equal(b.type, 'GENERAL');
  assert.equal(b.antlerClass, 'ANTLERLESS');
  assert.equal(b.tags, 500);
});

test('antler and weapon classification', () => {
  assert.equal(antlerOf('Antlered Mule and White-tailed Deer').antlerClass, 'ANTLERED');
  assert.equal(antlerOf('antlerless elk only').antlerClass, 'ANTLERLESS');
  assert.equal(antlerOf('Either sex may be taken').antlerClass, 'EITHER');
  assert.equal(weaponOf('Archery only').weapon, 'ARCHERY');
  assert.equal(weaponOf('Any Weapon (Rifle, Archery, Muzzleloader)').weapon, 'ANY');
});

test('estimates: 2016+ split - 4+ is mule-only, 5+ whitetail-only (hunt 1001, 2025)', () => {
  const e = estimates('DEER', 2025, { harvest: 28, antlered: 28, pct4: 82, pct5: 41, pctWt: 47, pctSpike: null, pct6: null });
  assert.deepEqual([e.estWt, e.estMule, e.est4, e.est5], [13, 15, 12, 5]);
  const old = estimates('DEER', 2010, { harvest: 28, antlered: 28, pct4: 82, pct5: 41, pctWt: 47, pctSpike: null, pct6: null });
  assert.deepEqual([old.est4, old.est5], [23, 11]);
  const elk = estimates('ELK', 2025, { harvest: 85, antlered: 85, pct4: null, pct5: null, pctWt: null, pctSpike: 2, pct6: 65 });
  assert.deepEqual([elk.est6, elk.estSpike, elk.estWt], [55, 2, null]);
});

// Area 49 elk, first drawing, from the IDFG odds API (2021-2025)
const A49: OddsRow[] = [
  [2021, 2029, 25, 23, 2, 281, 51, 332], [2021, 2030, 200, 180, 20, 902, 170, 1072], [2021, 2138, 100, 35, 10, 39, 24, 63], [2021, 2155, 50, 39, 3, 39, 3, 42],
  [2022, 2029, 25, 23, 2, 277, 45, 322], [2022, 2030, 200, 180, 20, 1056, 175, 1231], [2022, 2138, 100, 48, 10, 49, 20, 69], [2022, 2155, 50, 35, 3, 35, 3, 38], [2022, 2218, 1, 1, 0, 1, 0, 1],
  [2023, 2027, 20, 19, 1, 267, 46, 313], [2023, 2028, 175, 158, 17, 894, 194, 1088], [2023, 2132, 75, 42, 7, 43, 10, 53], [2023, 2151, 50, 35, 1, 35, 1, 36],
  [2024, 2027, 20, 18, 2, 254, 30, 284], [2024, 2028, 175, 158, 17, 705, 174, 879], [2024, 2132, 75, 19, 7, 19, 9, 28], [2024, 2151, 50, 42, 0, 42, 0, 42],
  [2025, 2028, 20, 18, 2, 299, 82, 381], [2025, 2029, 175, 157, 18, 854, 177, 1031], [2025, 2138, 75, 16, 7, 17, 13, 30], [2025, 2159, 50, 47, 3, 60, 3, 63],
].map(([year, huntNumber, permits, resPermits, nrPermits, resApps, nrApps, apps1]) => ({
  year, huntNumber, permits, resPermits, nrPermits, resApps, nrApps, apps1, draw: 1, areaName: '49',
}));

test('lineage follows renumbered hunts by area + tag count', () => {
  const late = A49.find((r) => r.year === 2025 && r.huntNumber === 2029)!;
  const l = lineage(late, A49);
  assert.deepEqual([...l.entries()].sort(), [[2021, 2030], [2022, 2030], [2023, 2028], [2024, 2028], [2025, 2029]]);
  const early = A49.find((r) => r.year === 2025 && r.huntNumber === 2028)!;
  assert.deepEqual(
    [...lineage(early, A49).entries()].sort(),
    [[2021, 2029], [2022, 2029], [2023, 2027], [2024, 2027], [2025, 2028]],
  );
  const youth = A49.find((r) => r.year === 2025 && r.huntNumber === 2159)!;
  assert.equal(lineage(youth, A49).get(2023), 2151);
});

test('5-yr odds = total permits / total applicants; matches hand-checked unit 49 values', () => {
  const late = A49.find((r) => r.year === 2025 && r.huntNumber === 2029)!;
  const l = lineage(late, A49);
  const rows = A49.filter((r) => l.get(r.year) === r.huntNumber);
  const s = summarizeOdds(rows);
  assert.equal(Math.round(s.resOdds5! * 1000) / 10, 18.9);
  assert.equal(Math.round(s.nrOdds5! * 1000) / 10, 10.3);
  assert.equal(Math.round(s.resOddsLast! * 1000) / 10, 18.4);
  assert.equal(s.years, 5);
});

test('harvest summary: success, whitetail share, deer type, small sample flag', () => {
  // Hunt 2029 lineage harvest, area 49 (IDFG hunt page)
  const rows = [
    [2021, 181, 101, 101, 5.5, 76.6], [2022, 202, 59, 59, 2.3, 60.2], [2023, 158, 62, 62, 0, 52],
    [2024, 158, 84, 84, 12, 60], [2025, 171, 85, 85, 2, 65],
  ].map(([year, hunters, harvest, antlered, ps, p6]) => ({
    year, hunters, harvest, antlered, antlerless: null,
    ...estimates('ELK', year, { harvest, antlered, pct4: null, pct5: null, pctWt: null, pctSpike: ps, pct6: p6 }),
  }));
  const s = summarizeHarvest('ELK', rows);
  assert.equal(Math.round(s.success5! * 100), 45);
  assert.equal(s.smallSample, false);
  assert.equal(deerType(47), 'MIXED');
  assert.equal(deerType(0), 'MULE');
  assert.equal(deerType(91), 'WHITETAIL');
  assert.equal(Math.round(tagAndFill(0.189, 0.45)! * 1000) / 10, 8.5);
});

test('unit links from a general stats page', async () => {
  const { parseUnitLinks } = await import('../src/sync/core/parse');
  const m = parseUnitLinks(fx('general-deer.html'));
  assert.equal(m.get('1'), 1);
  assert.equal(m.get('49'), 63);
});

test('findDates handles every IDFG date style', async () => {
  const { findDates } = await import('../src/sync/core/parse');
  assert.deepEqual(findDates('11/1/26-11/14/26'), ['2026-11-01', '2026-11-14']);
  assert.deepEqual(findDates('Season 11/1/2026 to 11/14/2026'), ['2026-11-01', '2026-11-14']);
  assert.deepEqual(findDates('Oct 15, 2026 - Oct 31, 2026'), ['2026-10-15', '2026-10-31']);
  assert.deepEqual(findDates('Dates: December 1 - January 15', 2026), ['2026-12-01', '2027-01-15']);
  assert.equal(findDates('Unlimited tags, any weapon'), null);
});

test('units from hunt names; parent unit of a hunt area', async () => {
  const { unitsFromName, parentUnit } = await import('../src/sync/core/parse');
  assert.deepEqual(unitsFromName('Elk A Tag - Pioneer Zone (Units 36A, 49, 50)'), ['36A', '49', '50']);
  assert.deepEqual(unitsFromName('Unit 49 Regular Deer Tag'), ['49']);
  assert.deepEqual(unitsFromName('Elk Controlled Hunt 2138'), []);
  assert.equal(parentUnit('36B-1'), '36B');
  assert.equal(parentUnit('63AX'), '63A');
});
