import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNvForm, readNvPoints, nvPointType } from '../src/lib/nvPoints';
import { nvPersonal } from '../src/lib/nvHunt';
import { evaluateHunt, matchesSearch, nvCategoryGroup, searchFilters, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

type H = Record<string, unknown> & { id: string; tagCode: string; species: string; units: string[]; youthOnly: boolean; privateOnly: boolean;
  oddsByPts: { last: Record<string, number[]> }; pointOdds: { category: string; residentsOnly: boolean; pools: Record<string, { quota: number; levels: [number, number, number][] | null }> } };
const data = JSON.parse(readFileSync('data/nv/hunts.json', 'utf8')) as { problems: string[]; unmatched: string[]; hunts: H[] };
const bt = JSON.parse(readFileSync('data/nv/backtest.json', 'utf8'));
const byId = (id: string) => data.hunts.find((h) => h.id === id)!;

test('Nevada is listed, with a private-land-only rule', () => {
  assert.equal(STATES.NV.code, 'NV');
  assert.equal(STATES.NV.points, 'bonus');
  assert.ok(STATES.NV.privateLandOnly.length > 20);
});

test('Nevada hunts build cleanly: unique ids, units, no private-only rows, only a handful without a 2025 table', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  assert.ok(data.hunts.length >= 340);
  for (const h of data.hunts) { assert.ok(h.units.length > 0 && h.units.every((u) => /^\d{3}$/.test(u)), h.id); assert.equal(h.privateOnly, false); }
  assert.ok(data.unmatched.length <= 8, data.unmatched.join('; '));
});

test('the draw rule: points² + 1 beats every other weighting on NDOW 2022-2025 tables', () => {
  const ll = bt.rule.logLik as Record<string, number>;
  const best = Object.entries(ll).sort((a, b) => b[1] - a[1])[0][0];
  assert.match(best, /^P\^2\+1/);
  const scan = bt.rule.exponentScan as Record<string, number>;
  assert.equal(Object.entries(scan).sort((a, b) => b[1] - a[1])[0][0], '2.0');
});

test('odds tables reproduce the 2025 first-choice draws and never fall with more points', () => {
  for (const h of data.hunts) for (const [pool, arr] of Object.entries(h.oddsByPts.last)) {
    for (let i = 1; i < arr.length; i++) assert.ok(arr[i] + 1e-9 >= arr[i - 1], `${h.id} ${pool}`);
    const lv = h.pointOdds.pools[pool].levels!;
    const expect = lv.reduce((a, [p, apps]) => a + apps * arr[Math.min(p, arr.length - 1)], 0);
    const drew = lv.reduce((a, l) => a + l[2], 0);
    assert.ok(Math.abs(expect - drew) <= 0.6, `${h.id} ${pool}: model ${expect.toFixed(1)} vs ${drew}`);
  }
});

test('units 011-013 antlered deer: resident and nonresident pools, NDOW 2025 table', () => {
  const h = byId('NV:1331-011-013');
  assert.equal(h.tagCode, '1331/1332');
  assert.deepEqual(h.units, ['011', '012', '013']);
  assert.deepEqual(h.pointOdds.pools.res.levels![0], [0, 155, 1]);
  assert.ok(h.pointOdds.pools.nr.levels);
});

test('junior and spike tags are residents only; a nonresident gets no odds', () => {
  const jr = data.hunts.find((h) => h.youthOnly)!;
  assert.equal(jr.pointOdds.residentsOnly, true);
  const nr = nvPersonal(jr as never, readNvPoints({ NV: { res: 'NONRESIDENT', nvPoints: { DEER_JR: 3 }, set: true } }), true);
  assert.equal(nr.odds, null);
  assert.equal(nr.basis, 'Residents only');
});

test('points: categories, parsing, and odds at saved points', () => {
  assert.equal(nvPointType('deer-arch'), 'DEER');
  assert.equal(nvPointType('deer-jr-alw'), 'DEER_JR');
  assert.equal(nvPointType('elk-spike'), 'ELK_SPIKE');
  assert.equal(nvPointType('elk-cow-muzz'), 'ELK_COW');
  const form = new Map(Object.entries({ nvResidency: 'RESIDENT', nvPts_DEER: '5', nvPts_DEER_JR: '0', nvPts_ELK_BULL: '12', nvPts_ELK_COW: '1', nvPts_ELK_SPIKE: '0' }));
  const parsed = parseNvForm((k) => form.get(k) ?? null, (k) => form.has(k));
  assert.ok(parsed && typeof parsed === 'object');
  const pts = readNvPoints({ NV: parsed });
  const h = byId('NV:1331-011-013');
  const five = nvPersonal(h as never, pts, false), zero = nvPersonal(h as never, readNvPoints(null), false);
  assert.ok(five.odds! > zero.odds!);
  assert.equal(five.points, 5);
  assert.match(five.basis, /^2025 draw at 5 bonus points/);
});

test('search: the Nevada hunt type filter narrows Nevada only', () => {
  const settings = { ID: 'NONRESIDENT', CO: { res: 'NONRESIDENT' }, NV: readNvPoints(null) } as unknown as HunterSettings;
  const bull = data.hunts.find((h) => h.pointOdds.category === 'elk-bull-alw')!;
  const x = evaluateHunt(bull as unknown as CoScored, settings, 'proj');
  assert.equal(nvCategoryGroup(bull.pointOdds.category), 'bull');
  const sp = { states: 'NV', nvCat: 'deer', antler: 'ALL' };
  assert.equal(matchesSearch(x, searchFilters(sp), sp), false);
  const sp2 = { states: 'NV', nvCat: 'bull', antler: 'ALL' };
  assert.equal(matchesSearch(x, searchFilters(sp2), sp2), true);
});
