import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecap } from '../src/sync/co/recap';
import { parseDrawnOut, parseOtcSales } from '../src/sync/co/supplemental';
import { parseHarvestByCode } from '../src/sync/co/harvest';
import { parseRegs, datesFor } from '../src/sync/co/regs';
import { returningCohort, project, DEFAULT_CALIBRATION } from '../src/lib/coOdds';
import { pointRange } from '../src/lib/pointRange';
import { overlapsElk, type SeasonContext } from '../src/lib/overlappingSeasons';
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
test('real elk secondary draw stays separate and balances all first-choice pools', () => {
  const p = parseRecap(fixture('co-elk-secondary'));
  assert.equal(p.year, 2026);
  assert.equal(p.species, 'ELK');
  assert.equal(p.hunts.length, 2);
  assert.ok(p.hunts.every((h) => !h.problems.length));
  const h = p.hunts[0];
  assert.equal(h.code, 'EE003O1M');
  assert.equal(h.quota, 6);
  assert.equal(h.pre.res[0], 7);
  assert.equal(h.post.res[0], 3);
  assert.equal(h.post.yres[0], 2);
});
test('real elk drawn-out columns retain adult/youth pool boundaries', () => {
  const r = parseDrawnOut(fixture('co-elk-drawn-out'))[0];
  assert.equal(r.code, 'EE001E1R');
  assert.equal(r.cutoff.res?.points, 20);
  assert.equal(r.cutoff.res?.drawnAtLevel, 2);
  assert.equal(r.cutoff.res?.appsAtLevel, 6);
  assert.equal(r.cutoff.nr?.points, 32);
  assert.equal(r.cutoff.lppu?.points, 4);
});
test('elk harvest and OTC sales parse independently', () => {
  const harvest = parseHarvestByCode(fixture('co-elk-harvest'));
  assert.ok(harvest.length > 10);
  assert.equal(harvest[0].code, 'EM000U2R');
  assert.equal(harvest[0].harvest, 4558);
  assert.equal(harvest[0].hunters, 23668);
  const sales = parseOtcSales(fixture('co-elk-otc-sales'));
  assert.equal(sales.length, 6);
  assert.equal(sales[0].total, 25637);
});
test('OTC units span shared rows and page continuations; dates match the actual regulation table', () => {
  const r = parseRegs(fixture('co-otc-regs')).codes;
  assert.equal(r.EM000U2R.units.length, 90);
  assert.deepEqual(r.EM000U2R.units, r.EM000U3R.units);
  for (const u of ['6', '70', '161', '441', '861']) assert.ok(r.EM000U2R.units.includes(u));
  for (const u of ['3', '79', '82', '861', '951']) assert.ok(r.EE000U1A.units.includes(u));
  for (const u of ['134', '147', '951']) assert.ok(r.EE087U1A.units.includes(u));
  assert.deepEqual(r.EF133U1A.units, ['133', '134', '141', '142']);
  assert.deepEqual(datesFor(r.EM000U2R, 2027), { start: '2027-10-23', end: '2027-10-31', year: 2027 });
});
test('returning cohorts move non-winners exactly one point and remove all winners', () => {
  const pool = {
    year: 2026,
    pre: { 0: 10, 8: 100, 9: 10 },
    post: { 0: 2, 9: 10 },
    cut: { text: '9 Pref Points', points: 9, choice: null, leftover: false, drawnAtLevel: 10, appsAtLevel: 10 },
  };
  assert.deepEqual(returningCohort(pool).pre, { 1: 8, 9: 100 });
  const pr = project([pool], DEFAULT_CALIBRATION.nr)!;
  assert.ok(pr.lo >= 9);
  assert.ok(pr.qs.every((q) => q >= pr.base));
});
test('point range supports minimum, maximum, exact and reversed bounds', () => {
  assert.deepEqual(pointRange('5', '10'), { min: 5, max: 10 });
  assert.deepEqual(pointRange('8', '8'), { min: 8, max: 8 });
  assert.deepEqual(pointRange('10', '5'), { min: 5, max: 10 });
  assert.deepEqual(pointRange('8', ''), { min: 8, max: null });
  assert.deepEqual(pointRange('NaN', '99'), { min: null, max: 40 });
});
const h = (x: Partial<SeasonContext> = {}): SeasonContext => ({
  id: 'one',
  state: 'CO',
  species: 'DEER',
  units: ['70'],
  openDate: new Date('2027-10-23T12:00Z'),
  closeDate: new Date('2027-10-31T12:00Z'),
  ...x,
});
test('related elk requires same state, unit and an actual overlapping calendar day', () => {
  assert.ok(overlapsElk(h(), h({ id: 'two', species: 'ELK', openDate: new Date('2027-10-31T00:00Z') })));
  for (const extra of [
    { state: 'ID' },
    { units: ['71'] },
    { species: 'DEER' },
    { openDate: new Date('2027-11-01') },
    { openDate: null, closeDate: null },
  ])
    assert.equal(overlapsElk(h(), h({ id: 'two', species: 'ELK', ...extra })), false);
  assert.equal(
    overlapsElk(
      h(),
      h({
        id: 'two',
        species: 'ELK',
        tagSeasons: {
          seasons: [
            {
              dates: [
                { open: '2027-10-01', close: '2027-10-10' },
                { open: '2027-11-01', close: '2027-11-10' },
              ],
            },
          ],
        },
      }),
    ),
    false,
  );
});
import population2022 from '../data/co-population-2022.json';
test('2022 population transcription preserves CPW rows and reported totals without forcing reconciliation', () => {
  assert.equal(population2022.DEER.herds.length, 54);
  assert.equal(
    population2022.DEER.herds.reduce((a, h) => a + h.estimate, 0),
    391921,
  );
  assert.equal(population2022.ELK.herds.length, 42);
  assert.equal(
    population2022.ELK.herds.reduce((a, h) => a + h.estimate, 0),
    303185,
  );
  assert.equal(population2022.ELK.total, 303190);
  assert.deepEqual(population2022.DEER.herds.find((h) => h.dau === '24')?.units, ['70', '71', '711']);
});
import { parseHarvestByUnit, codeFromUnits } from '../src/sync/co/harvest';
import { returningCohort as cohort } from '../src/lib/coOdds';
test('legacy harvest handles spelled-out seasons and changes of table on the same page', () => {
  const title = (s: string, y: number) => ({ s, x: 50, y });
  const row = (unit: string, n: number, y: number) => [
    { s: unit, x: 93, y },
    ...[n, 0, 0, n, 10, n * 10, 50].map((v, i) => ({ s: String(v), x: 150 + i * 50, y })),
  ];
  const tables = parseHarvestByUnit([
    [
      title('2020 Elk Harvest, Hunters and Recreation Days for First Rifle Seasons', 20),
      ...row('1', 2, 40),
      title('2020 Elk Harvest, Hunters and Recreation Days for Second Rifle Seasons', 60),
      ...row('1', 4, 80),
    ],
  ]);
  assert.equal(tables.totals.rifle1?.[0].harvest, 2);
  assert.equal(tables.totals.rifle2?.[0].harvest, 4);
  assert.equal(tables.totals.rifle1?.length, 1);
  assert.equal(tables.totals.rifle2?.length, 1);
});
test('conflicting harvest observations are retained and excluded from aggregate scores', () => {
  const row = (n: number, y: number) => [
    { s: '1', x: 80, y },
    ...[n, 0, 0, n, 10, n * 10, 50].map((v, i) => ({ s: String(v), x: 140 + i * 45, y })),
  ];
  const tables = parseHarvestByUnit([
    [{ s: '2020 Elk Harvest, Hunters and Recreation Days for First Rifle Seasons', x: 50, y: 20 }, ...row(2, 40), ...row(4, 60)],
  ]);
  assert.equal(tables.ambiguous?.length, 1);
  assert.equal(tables.ambiguous?.[0].rows.length, 2);
  assert.equal(codeFromUnits('EM001O1R', ['1'], tables), null);
});
test('returning cohorts reserve hybrid licenses instead of allocating them twice', () => {
  const result = cohort({
    year: 2026,
    pre: { 15: 22, 8: 75, 6: 42 },
    post: { 15: 20, 8: 5 },
    cut: { text: '15 Pref Points', points: 15, choice: null, leftover: false, drawnAtLevel: 20, appsAtLevel: 22 },
  });
  assert.equal(result.capacity, 20);
  assert.equal(result.pre[9], 70);
  assert.equal(result.pre[16], 2);
});
