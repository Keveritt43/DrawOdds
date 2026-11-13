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
  assert.equal(utPointType('PB5001', 'PRONGHORN', 'CONTROLLED'), 'LE_PRONGHORN');
  assert.equal(utPointType('BI6503', 'BISON', 'CONTROLLED'), 'BISON');
});

test('personal odds read the table at the hunter\'s points; over-the-counter elk needs no draw', () => {
  const pts = { ...readUtPoints(null), points: { LE_DEER: 10, LE_ELK: 0, GEN_DEER: 0, LE_PRONGHORN: 0, BISON: 0 } };
  const le = by('DB1001');
  assert.equal(utPersonal(le as never, pts, true, 'last').odds, le.oddsByPts.last.nr[Math.min(10, le.oddsByPts.last.nr.length - 1)]);
  // nonresident limited-entry deer passed the projection rule; resident limited-entry deer did not
  const proj = (le.oddsByPts as unknown as { proj: Record<string, number[]> }).proj.nr;
  assert.equal(utPersonal(le as never, pts, true).odds, proj[Math.min(10, proj.length - 1)]);
  assert.equal(utPersonal(le as never, pts, true).projected, true);
  const res = { ...pts, res: 'RESIDENT' as const };
  assert.equal(utPersonal(le as never, res, false).projected, false);
  assert.equal(utPersonal(le as never, res, false).odds, utPersonal(le as never, res, false, 'last').odds);
  assert.equal(utPersonal(le as never, pts, true, 'last').projected, false);
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

test('pronghorn and bison: cow bison are antlerless, Antelope Island is resident-only, bison are once in a lifetime', () => {
  const bison = data.hunts.filter((h) => h.species === 'BISON');
  assert.equal(bison.length, 16);
  assert.ok(bison.some((h) => (h as { antlerClass?: string }).antlerClass === 'ANTLERLESS'));
  assert.ok(!by('BI6500').pointOdds.pools.nr);
  assert.equal(utLicense(by('BI6503') as never), 'oial');
  assert.ok(data.hunts.filter((h) => h.species === 'PRONGHORN').length >= 80);
});

test('general elk: per-boundary harvest comes from the elk unit covering it; split boundaries get none', async () => {
  const { utGenElk } = await import('../src/lib/utGenElk');
  const manti = utGenElk('51');
  assert.ok(manti && manti.units.includes('16B') && manti.success > 0 && manti.success < 1);
  // 2026's Oquirrh lies 48% in Oquirrh-Stansbury and 52% in West Desert: the old units describe other ground
  assert.equal(utGenElk('947'), null);
  assert.equal(utGenElk('925'), null);
});
