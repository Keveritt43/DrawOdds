import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, buildWhere, buildOrder, toQuery } from '../src/lib/finder';

test('parseFilters sanitizes input', () => {
  const f = parseFilters({ species: 'elk', weapon: 'archery,bogus', month: '9,13', minOdds: '250', unit: '49; drop table', sort: 'nope' });
  assert.equal(f.species, 'ELK');
  assert.deepEqual(f.weapon, ['ARCHERY']);
  assert.deepEqual(f.months, [9]);
  assert.equal(f.minOdds, 100);
  assert.equal(f.unit, '49; DR');
  assert.equal(f.sort, 'best');
  assert.equal(f.youth, 'exclude');
});

test('residency decides which odds column filters and sorts use', () => {
  const f = parseFilters({ minOdds: '10', sort: 'odds' });
  const res = JSON.stringify(buildWhere(f, 'RESIDENT'));
  const nr = JSON.stringify(buildWhere(f, 'NONRESIDENT'));
  assert.match(res, /"resOdds5":\{"gte":0.1\}/);
  assert.match(nr, /"nrOdds5":\{"gte":0.1\}/);
  assert.deepEqual(Object.keys(buildOrder(f, 'NONRESIDENT')[0]), ['nrOdds5']);
  assert.deepEqual(Object.keys(buildOrder(parseFilters({}), 'RESIDENT')[0]), ['resTagAndFill']);
});

test('season months mean "open during that month"', () => {
  const w = JSON.stringify(buildWhere(parseFilters({ month: '10' }), 'RESIDENT'));
  assert.match(w, /"months":\{"hasSome":\[10\]\}/);
});

test('toQuery round-trips', () => {
  const f = parseFilters({ species: 'DEER', antler: 'ANTLERED', minSuccess: '30', accessYes: '1' });
  assert.equal(toQuery(f), '?species=DEER&antler=ANTLERED&minSuccess=30&accessYes=1');
  assert.deepEqual(parseFilters(Object.fromEntries(new URLSearchParams(toQuery(f)))), f);
});
