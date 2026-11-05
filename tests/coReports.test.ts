import { test } from 'node:test';
import { secondaryDrawn } from '../src/lib/coReportDisplay';
import { readFileSync } from 'node:fs';
test('secondary total includes later choices and leaves incomplete extraction unknown', () => {
  const postTotals = [[21,12,1,0,0,0], [2,1,0,0,0,0], [0,0,0,0,0,0], [0,0,0,0,0,0]];
  assert.equal(secondaryDrawn({ drawnTotal: null, postTotals }), 37);
  assert.equal(secondaryDrawn({ drawnTotal: null, postTotals: postTotals.slice(0,1) }), null);
  assert.equal(secondaryDrawn({ drawnTotal: 40, postTotals }), 40);
});
import assert from 'node:assert/strict';
import { unitsIn, datesFor } from '../src/sync/co/regs';
import { tableKind, kindForCode, codeFromUnits, type UnitTables } from '../src/sync/co/harvest';

test('unit lists from W-2 cells skip elevations, dates and road numbers', () => {
  assert.deepEqual(unitsIn('3, 4, 5, 14, 214, 301, 441'), ['3', '4', '5', '14', '214', '301', '441']);
  assert.deepEqual(unitsIn('That portion of GMU 6 above 10,000 feet elevation and GMU 7 within the Rawah'), ['6', '7']);
  assert.deepEqual(unitsIn('56, 57 - Those portions of 56 and 57 bounded on the N and E by Colo 291; on the S by US 50'), ['56', '57']);
  assert.deepEqual(unitsIn('3, 301 11/18/2026 - 11/22/2026'), ['3', '301']);
});

test('season dates: the projected year from the section table, a row\'s own year otherwise', () => {
  const rifle3 = { row: null, table: { byYear: { 2027: { start: '2027-11-06', end: '2027-11-14' } } } };
  assert.deepEqual(datesFor({ dates: rifle3 }, 2027), { start: '2027-11-06', end: '2027-11-14', year: 2027 });
  const late = { row: { start: '2026-12-01', end: '2027-01-31', annual: false }, table: null };
  assert.equal(datesFor({ dates: late }, 2027)?.year, 2026); // the 2026 season, even though it ends in 2027
  const annual = { row: { start: '09-01', end: '11-30', annual: true }, table: null };
  assert.deepEqual(datesFor({ dates: annual }, 2027), { start: '2027-09-01', end: '2027-11-30', year: 2027 });
});

test('harvest tables: which season, and a code from its units', () => {
  assert.deepEqual(tableKind('2023 Deer Harvest, Hunters and Percent Success for 3rd Rifle Seasons'), { kind: 'rifle3', split: true });
  assert.equal(tableKind('2023 Deer Harvest, Hunters and Recreation Days for All Whitetail Only Rifle Seasons'), null);
  assert.equal(kindForCode('DM070O3R'), 'rifle3');
  assert.equal(kindForCode('DE003P2R'), null);
  const t: UnitTables = { totals: {}, split: { rifle3: [{ unit: '69', mHarvest: 100, mHunters: 200, fHarvest: 1, fHunters: 2 }, { unit: '84', mHarvest: 20, mHunters: 30 }] } };
  assert.deepEqual(codeFromUnits('DM069O3R', ['69', '84'], t), { harvest: 120, hunters: 230, days: null, basis: 'split' });
});

import { herdSeries } from '../src/lib/coHerds';
test('herd series: the herds covering a unit, every year by herd number', () => {
  const reports = [
    { year: 2019, herds: [{ dau: '24', name: null, units: ['70', '71', '711'], estimate: 14910, ratio: 23 }] },
    { year: 2021, herds: [{ dau: '24', name: 'Groundhog', units: ['70', '71', '711'], estimate: 14949, ratio: 21 }] },
    { year: 2025, herds: [{ dau: '24', name: null, units: ['70', '71', '711'], estimate: 21760, ratio: 32 }, { dau: '20', name: null, units: ['53', '63'], estimate: 8430, ratio: 38 }] },
  ];
  const s = herdSeries(reports, ['70']);
  assert.equal(s.length, 1);
  assert.equal(s[0].name, 'Groundhog');
  assert.deepEqual(s[0].series.map((x) => x.year), [2019, 2021, 2025]);
  assert.equal(herdSeries(reports, ['70', '53']).length, 2);
});

import { parseRecap } from '../src/sync/co/recap';
import { parsePopulation } from '../src/sync/co/population';
import { harvestYear } from '../src/sync/co/harvest';
test('shared elk draw pools retain every code without inventing individual applicant counts or quotas', () => {
  const pages = JSON.parse(readFileSync('tests/fixtures/co-elk-recap-multiple-codes.json', 'utf8'));
  const parsed = parseRecap(pages);
  assert.deepEqual(parsed.hunts.map(h => h.code), ['EF003O2R', 'EF003O3R']);
  for (const h of parsed.hunts) {
    assert.deepEqual(h.sharedCodes, ['EF003O2R', 'EF003O3R']);
    assert.equal(h.quota, 800);
    assert.equal(h.pre.res[0], 289);
    assert.equal(h.post.res[0], 289);
    assert.deepEqual(h.problems, []);
  }
  assert.deepEqual(parsed.hunts.map(h => h.codeDrawn), [279, 521]);
});
test('historical elk population headers tolerate CPW UNITES spelling', () => {
  const pages = JSON.parse(readFileSync('tests/fixtures/co-elk-population-2024.json', 'utf8'));
  const p = parsePopulation(pages);
  assert.equal(p.year, 2024);
  assert.equal(p.species, 'ELK');
  assert.equal(p.herds.length, 42);
  assert.deepEqual(p.herds[0], { dau: '1', name: 'Cold Springs', units: ['2', '201'], estimate: 1600, ratio: 95 });
});
test('harvest title can split its year between PDF text items', () => {
  assert.equal(harvestYear([[{ s: '20', x: 0, y: 0 },{ s: '20', x: 20, y: 0 },{ s: 'Colorado Elk Harvest Estimates', x: 40, y: 0 }]]), 2020);
});

import { matchesCoSeason } from '../src/lib/coHunt';
test('numbered Colorado rifle filters include limited and OTC licenses for the same season', () => {
  assert.equal(matchesCoSeason('DM070O2R', ['2']), true);
  assert.equal(matchesCoSeason('EM000U2R', ['2']), true);
  assert.equal(matchesCoSeason('EM000U3R', ['2']), false);
  assert.equal(matchesCoSeason('EE000U1A', ['1']), false);
  assert.equal(matchesCoSeason('EM070L1R', ['L']), true);
});
