import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAzForm, readAzPoints, azGroupPoints } from '../src/lib/azPoints';
import { azPersonal } from '../src/lib/azHunt';
import { evaluateHunt, matchesSearch, searchFilters, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

type H = Record<string, unknown> & { id: string; tagCode: string; species: string; units: string[]; youthOnly: boolean; privateOnly: boolean; deerType: string | null;
  oddsByPts: { last: Record<string, number[]> }; pointOdds: { license: string; restricted: boolean; nrCap: number | null; history: Record<string, { hunt: number }> } };
const data = JSON.parse(readFileSync('data/az/hunts.json', 'utf8')) as { problems: string[]; hunts: H[] };
const units = new Set((JSON.parse(readFileSync('data/az/units.json', 'utf8')) as { units: { name: string }[] }).units.map((u) => u.name));
const bt = JSON.parse(readFileSync('data/az/backtest.json', 'utf8')) as Record<string, Record<string, Record<string, { last: number; roll: number }>>>;
const byId = (id: string) => data.hunts.find((h) => h.id === id)!;
const settings = (az: unknown) => ({ ID: 'NONRESIDENT', CO: { res: 'NONRESIDENT' }, AZ: readAzPoints({ AZ: az }) } as unknown as HunterSettings);

test('Arizona is registered as a bonus-point state with a private-land-only rule', () => {
  assert.equal(STATES.AZ.points, 'bonus');
  assert.ok(STATES.AZ.privateLandOnly.length > 20);
  assert.deepEqual(STATES.AZ.species, ['DEER', 'ELK']);
});

test('Arizona hunts build cleanly: unique ids, GMUs that exist, no private-only rows', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  assert.ok(data.hunts.length >= 390);
  for (const h of data.hunts) {
    assert.ok(h.units.length > 0 && h.units.every((u) => units.has(u)), h.id);
    assert.equal(h.privateOnly, false);
  }
});

test('odds tables are probabilities and never fall with more points', () => {
  for (const h of data.hunts) for (const [pool, arr] of Object.entries(h.oddsByPts.last)) {
    assert.equal(arr.length, 31, `${h.id} ${pool}`);
    for (let i = 0; i < arr.length; i++) {
      assert.ok(arr[i] >= 0 && arr[i] <= 1, `${h.id} ${pool}`);
      if (i) assert.ok(arr[i] + 1e-9 >= arr[i - 1], `${h.id} ${pool}`);
    }
  }
});

test('no projection ships: the roll-forward lost to the last draw on the 2026 holdout for every species and pool', () => {
  for (const sp of ['DEER', 'ELK']) for (const pool of ['res', 'nr']) assert.ok(bt[sp][pool]['2026'].roll > bt[sp][pool]['2026'].last, `${sp} ${pool}`);
  for (const h of data.hunts) assert.deepEqual((h.oddsByPts as unknown as { proj: object }).proj, {});
});

test('AZGFD renumbers hunts: 5A/5B general deer is 1006 in 2026 and was 1007 in 2025', () => {
  const h = byId('AZ:1006');
  assert.deepEqual(h.units, ['5A', '5B']);
  assert.equal(h.pointOdds.history['2025'].hunt, 1007);
});

test('points: species points plus loyalty and hunter education; more points, better odds', () => {
  const form = new Map(Object.entries({ azResidency: 'NONRESIDENT', azPts_DEER: '4', azPts_ELK: '12', azLoyalty: 'on' }));
  const parsed = parseAzForm((k) => form.get(k) ?? null, (k) => form.has(k));
  assert.ok(parsed && typeof parsed === 'object');
  const pts = readAzPoints({ AZ: parsed });
  assert.equal(azGroupPoints(pts, 'ELK'), 13);
  assert.equal(azGroupPoints(pts, 'DEER'), 5);
  assert.equal(parseAzForm((k) => (k === 'azResidency' ? 'RESIDENT' : k === 'azPts_DEER' ? 'x' : '0'), () => true), 'Enter whole Arizona deer bonus points from 0 to 40.');
  const h = byId('AZ:3012');
  const mine = azPersonal(h as never, pts, true), zero = azPersonal(h as never, readAzPoints(null), true);
  assert.ok(mine.odds! > zero.odds!);
  assert.match(mine.basis, /^2026 draw at 13 group bonus points/);
});

test('search: CHAMP hunts only when picked; the deer filter narrows Arizona deer', () => {
  const s = settings({ res: 'NONRESIDENT', azPoints: { DEER: 0, ELK: 0 }, set: true });
  const champ = data.hunts.find((h) => h.pointOdds.restricted)!;
  const xc = evaluateHunt(champ as unknown as CoScored, s, 'last');
  const all = { states: 'AZ', antler: 'ALL' };
  assert.equal(matchesSearch(xc, searchFilters(all), all), false);
  const pick = { states: 'AZ', antler: 'ALL', azLic: 'champ' };
  assert.equal(matchesSearch(xc, searchFilters(pick), pick), true);
  const wt = data.hunts.find((h) => h.deerType === 'WHITETAIL' && !h.pointOdds.restricted && !h.youthOnly)!;
  const xw = evaluateHunt(wt as unknown as CoScored, s, 'last');
  const mule = { states: 'AZ', antler: 'ALL', azDeer: 'MULE' };
  assert.equal(matchesSearch(xw, searchFilters(mule), mule), false);
  const coues = { states: 'AZ', antler: 'ALL', azDeer: 'WHITETAIL' };
  assert.equal(matchesSearch(xw, searchFilters(coues), coues), true);
});
