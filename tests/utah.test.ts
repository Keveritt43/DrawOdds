import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUtForm, readUtPoints, utPointType, UT_POINT_TYPES } from '../src/lib/utPoints';
import { utPersonal, utKind } from '../src/lib/utHunt';
import { evaluateHunt, matchesSearch, searchFilters, utLicense, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

const data = JSON.parse(readFileSync('data/ut/hunts.json', 'utf8')) as { problems: string[]; hunts: (Record<string, unknown> & { id: string; tagCode: string; species: string; type: string; units: string[]; oddsByPts: { last: Record<string, number[]> }; pointOdds: { kind: string; pools: Record<string, { levels: [number, number, number][] }> }; privateOnly: boolean })[] };
const by = (code: string) => data.hunts.find((h) => h.tagCode === code)!;

test('Utah is listed, with a private-land-only rule', () => {
  assert.equal(STATES.UT.enabled, true);
  assert.ok(STATES.UT.privateLandOnly.includes('CWMU'));
});

test('Utah hunts build cleanly: unique ids, every hunt has a boundary, CWMU hunts are private-land-only', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  for (const h of data.hunts) assert.ok(h.units.length > 0, h.id);
  const cwmu = data.hunts.filter((h) => (h as { huntCategory?: string }).huntCategory === 'CWMU');
  assert.ok(cwmu.length > 100);
  assert.ok(cwmu.every((h) => h.privateOnly && !h.pointOdds.pools.nr));
});

test('odds tables never fall as points rise, and the bonus model reproduces DWR\'s draw', () => {
  let expected = 0, drew = 0;
  for (const h of data.hunts) {
    for (const [pool, arr] of Object.entries(h.oddsByPts.last)) {
      for (let i = 1; i < arr.length; i++) assert.ok(arr[i] >= arr[i - 1] - 1e-9, `${h.id} ${pool} ${i}`);
      if (h.pointOdds.kind !== 'bonus') continue;
      for (const [p, apps, d] of h.pointOdds.pools[pool].levels) { expected += apps * arr[Math.min(p, arr.length - 1)]; drew += d; }
    }
  }
  assert.ok(Math.abs(expected - drew) / drew < 0.01, `${expected} vs ${drew}`);
});

test('points map to the right balance', () => {
  assert.equal(utPointType('DB1001', 'DEER', 'CONTROLLED'), 'LE_DEER');
  assert.equal(utPointType('EB3000', 'ELK', 'CONTROLLED'), 'LE_ELK');
  assert.equal(utPointType('DB1502', 'DEER', 'GENERAL'), 'GEN_DEER');
  assert.equal(utPointType('EB1001', 'ELK', 'GENERAL'), null);
  assert.equal(utPointType('EB1007', 'ELK', 'CONTROLLED'), null); // youth general elk draw
});

test('personal odds read the table at the hunter\'s points; over-the-counter elk needs no draw', () => {
  const pts = { ...readUtPoints(null), points: { LE_DEER: 10, LE_ELK: 0, GEN_DEER: 0 } };
  const le = by('DB1001');
  assert.equal(utPersonal(le as never, pts, true).odds, le.oddsByPts.last.nr[Math.min(10, le.oddsByPts.last.nr.length - 1)]);
  assert.equal(utPersonal(le as never, pts, true).points, 10);
  const otc = by('EB1001');
  assert.equal(utKind(otc as never), 'otc');
  assert.equal(utPersonal(otc as never, pts, true).odds, 1);
  const cwmu = data.hunts.find((h) => h.privateOnly)!;
  assert.equal(utPersonal(cwmu as never, pts, true).odds, null);
});

test('the finder personalises Utah rows and the Utah: Hunt Type filter narrows them', () => {
  const settings = { ID: 'NONRESIDENT', CO: { res: 'NONRESIDENT' }, UT: readUtPoints(null) } as unknown as HunterSettings;
  const x = evaluateHunt(by('EB3000') as unknown as CoScored, settings, 'last');
  assert.equal(x.nr, true);
  assert.equal(utLicense(x.r), 'le');
  const sp = { states: 'UT', utLic: 'otc' };
  assert.equal(matchesSearch(x, searchFilters(sp), sp), false);
  const y = evaluateHunt(by('EB1001') as unknown as CoScored, settings, 'last');
  assert.equal(matchesSearch(y, searchFilters(sp), sp), true);
});

test('Utah points form', () => {
  const f = new FormData();
  f.set('utResidency', 'RESIDENT');
  for (const t of UT_POINT_TYPES) f.set('utPts_' + t.key, '3');
  const v = parseUtForm((n) => f.get(n), (n) => f.has(n));
  assert.ok(v && typeof v !== 'string' && v.res === 'RESIDENT' && v.utPoints.LE_ELK === 3);
  f.set('utPts_LE_ELK', '99');
  assert.equal(typeof parseUtForm((n) => f.get(n), (n) => f.has(n)), 'string');
  assert.equal(parseUtForm(() => null, () => false), null);
  assert.equal(readUtPoints({ UT: { res: 'RESIDENT', utPoints: { LE_DEER: 5 }, set: true } }).points.LE_DEER, 5);
});
