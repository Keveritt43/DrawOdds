import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HuntSummary } from '@prisma/client';
import { runSearch, evaluateHunt, type HunterSettings } from '../src/lib/multiStateSearch';
import { searchStates, searchBounds } from '../src/lib/searchStates';
import { wyTableOdds, wyPool, wyAreaLabel, type WyOddsTable } from '../src/lib/wyHunt';
import { STATES, unitKey, parseUnitKey } from '../src/lib/states';

const data = JSON.parse(readFileSync(new URL('../data/wy/hunts.json', import.meta.url), 'utf8')) as { hunts: Record<string, unknown>[] };
const byId = new Map(data.hunts.map((h) => [h.id as string, h]));
const asRow = (h: Record<string, unknown>, patch: Partial<HuntSummary> = {}) => ({
  huntId: 1, unit: (h.units as string[])[0], huntNumber: null, areaName: null, nrTag: false, capped: false, tagSeasons: null,
  scoreQuality: 70, scoreOppRes: null, scoreOppNr: null, months: [], seasonDays: [], youthOnly: false, deerType: null, bigPct5: null,
  huntablePct: null, leftoverTags: null, resOdds5: null, nrOdds5: null, nrOddsLast: null, ptsRes: null,
  ...h, openDate: h.openDate ? new Date(`${h.openDate}T12:00:00Z`) : null, closeDate: h.closeDate ? new Date(`${h.closeDate}T12:00:00Z`) : null,
  ...patch,
} as unknown as HuntSummary);
const ant = asRow(byId.get('WY:antelope:001-1')!);
const base: HunterSettings = { ID: 'RESIDENT', CO: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 9, youth: false, set: true } };
const wy = (patch: Partial<NonNullable<HunterSettings['WY']>>): HunterSettings => ({ ...base, WY: { res: 'NONRESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0, youth: false, set: true, ...patch } });

test('Wyoming is registered for deer, elk and pronghorn only, with its own unit keys', () => {
  assert.deepEqual(STATES.WY.species, ['DEER', 'ELK', 'PRONGHORN']);
  assert.deepEqual(searchStates('wy,id', 'ID'), ['ID', 'WY']);
  assert.equal(unitKey('WY', 'A1'), 'wy-A1');
  assert.deepEqual(parseUnitKey('wy-A1'), { state: 'WY', name: 'A1' });
  assert.deepEqual(searchBounds(['WY']), STATES.WY.bounds);
  assert.equal(wyAreaLabel('E7'), 'Area 7');
  assert.equal(wyAreaLabel('DR-G'), 'Region G');
});

test('nonresident odds follow Wyoming points and pool; other states\' settings never leak in', () => {
  const t = ant.oddsByPts as unknown as WyOddsTable;
  const at3 = evaluateHunt(ant, wy({ PRONGHORN: 3 }), 'last');
  assert.equal(at3.nr, true);
  assert.equal(at3.points, 3);
  assert.equal(at3.odds, wyTableOdds(t, 'last', 'nr', 3));
  // Colorado's 9 pronghorn points must not be used for Wyoming
  assert.equal(evaluateHunt(ant, wy({ PRONGHORN: 0 }), 'last').odds, wyTableOdds(t, 'last', 'nr', 0));
  // special pool is a different table
  const special = evaluateHunt(ant, wy({ PRONGHORN: 0, wySpecial: true }), 'last');
  assert.equal(special.odds, wyTableOdds(t, 'last', 'nrs', 0));
  assert.notEqual(special.odds, at3.odds);
  // more points never lowers odds
  for (let p = 0; p < 12; p++) assert.ok((evaluateHunt(ant, wy({ PRONGHORN: p + 1 }), 'proj').odds ?? 0) >= (evaluateHunt(ant, wy({ PRONGHORN: p }), 'proj').odds ?? 0));
});

test('residents get the resident random-draw estimate, without points', () => {
  const r = evaluateHunt(ant, wy({ res: 'RESIDENT', PRONGHORN: 12 }), 'proj');
  assert.equal(r.nr, false);
  assert.equal(r.points, null);
  assert.equal(r.odds, wyTableOdds(ant.oddsByPts as unknown as WyOddsTable, 'proj', 'res', 0));
  assert.match(r.basis, /Resident random draw/);
  assert.equal(wyPool(false, true), 'res');
});

test('without saved Wyoming settings, hunters are treated as nonresidents with 0 points', () => {
  const r = evaluateHunt(ant, base, 'last');
  assert.equal(r.nr, true);
  assert.equal(r.points, 0);
});

test('elk has no projection: projected and last draw match, and the basis says so', () => {
  const elk = asRow(byId.get('WY:elk:007-1')!);
  const t = elk.oddsByPts as unknown as WyOddsTable;
  assert.deepEqual(t.proj.nr, t.last.nr);
  assert.match(evaluateHunt(elk, wy({ ELK: 4 }), 'proj').basis, /no validated projection/);
});

test('Wyoming filters narrow only Wyoming; private-land licenses are hidden unless included', () => {
  const priv = data.hunts.find((h) => h.privateOnly === true)!;
  const rows = [ant, asRow(priv)];
  const hidden = runSearch(rows, { states: 'WY', antler: 'ALL', minScore: '0' }, 'WY', wy({}), {}, {});
  assert.ok(!hidden.some((x) => x.r.id === priv.id));
  const shown = runSearch(rows, { states: 'WY', antler: 'ALL', minScore: '0', wyPriv: '1' }, 'WY', wy({}), {}, {});
  assert.ok(shown.some((x) => x.r.id === priv.id));
  const capped = runSearch([ant], { states: 'WY', antler: 'ALL', minScore: '0', wyMaxPts: '1' }, 'WY', wy({}), {}, {});
  assert.equal(capped.length, (ant.ptsNr ?? 0) <= 1 ? 1 : 0);
});

test('every shipped Wyoming hunt has odds tables in [0,1] that never fall with more points', () => {
  for (const h of data.hunts) {
    const t = h.oddsByPts as WyOddsTable;
    for (const m of ['proj', 'last'] as const) for (const arr of Object.values(t[m])) {
      assert.ok(arr && arr.length);
      arr.forEach((o, i) => { assert.ok(o >= 0 && o <= 1); if (i) assert.ok(o + 1e-9 >= arr[i - 1]); });
    }
  }
});
