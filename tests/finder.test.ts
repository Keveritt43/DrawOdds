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
  // best bet: small samples last, then draw x fill for the user's residency
  assert.deepEqual(buildOrder(parseFilters({}), 'RESIDENT').map((o) => Object.keys(o)[0]).slice(0, 2), ['smallSample', 'resTagAndFill']);
  assert.deepEqual(buildOrder(parseFilters({ sort: 'success' }), 'RESIDENT').map((o) => Object.keys(o)[0]).slice(0, 2), ['smallSample', 'success5']);
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

test('hunters per sq mi: maximum filter, chip query round-trip', () => {
  const f = parseFilters({ maxDensity: '0.5' });
  assert.equal(f.maxDensity, 0.5);
  const w = JSON.stringify(buildWhere(f, 'RESIDENT'));
  assert.ok(w.includes('"huntersSqMi":{"lte":0.5}'), w);
  assert.ok(toQuery(f).includes('maxDensity=0.5'));
  assert.equal(parseFilters({}).maxDensity, null);
  assert.equal(parseFilters({ maxDensity: 'abc' }).maxDensity, null);
  assert.ok(parseFilters({ sort: 'densityLow' }).sort === 'densityLow');
});

test('elk zone filter: zone name -> its units', () => {
  const f = parseFilters({ zone: 'pioneer' });
  assert.deepEqual(f.zones, ['Pioneer']);
  const two = parseFilters({ zone: 'Pioneer,lolo,Nowhere' });
  assert.deepEqual(two.zones, ['Pioneer', 'Lolo']);
  assert.ok(JSON.stringify(buildWhere(two, 'RESIDENT')).includes('"units":{"hasSome":["36A","49","50","10","12"]}'));
  assert.ok(toQuery(two).includes('zone=Pioneer%2CLolo'));
  assert.ok(JSON.stringify(buildWhere(f, 'RESIDENT')).includes('"units":{"hasSome":["36A","49","50"]}'));
  assert.ok(toQuery(f).includes('zone=Pioneer'));
  assert.deepEqual(parseFilters({ zone: 'Nowhere' }).zones, []);
});
