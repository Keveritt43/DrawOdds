import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HuntSummary } from '@prisma/client';
import { runSearch, evaluateHunt, type HunterSettings } from '../src/lib/multiStateSearch';
import { searchStates, searchBounds, wySpecialView, searchUnitKey } from '../src/lib/searchStates';
import { WY_RESTRICTIONS } from '../src/lib/searchStates';
import { wyHuntWilderness, wildernessPctLabel, wyWilderness } from '../src/lib/wyWilderness';
import { wyTableOdds, wyPool, wyNeed, wyAreaLabel, type WyOddsTable, type WyPointOdds } from '../src/lib/wyHunt';
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

test('the pool preview overrides the saved pool only when set, and never for residents', () => {
  assert.equal(wySpecialView('nrs', false), true);
  assert.equal(wySpecialView('nr', true), false);
  assert.equal(wySpecialView(undefined, true), true);
  assert.equal(wySpecialView('junk', false), false);
  assert.equal(wyPool(false, wySpecialView('nrs', false)), 'res');
});

test('points needed follows the pool shown, and "everyone drew" counts as 0', () => {
  // 2026 antelope 001-1: regular cutoff 3 points, special pool everyone at 0+ drew
  assert.equal(wyNeed(ant.pointOdds as unknown as WyPointOdds, 'nr'), 3);
  assert.equal(wyNeed(ant.pointOdds as unknown as WyPointOdds, 'nrs'), 0);
  const sp = { states: 'WY', antler: 'ALL', minScore: '0', wyMaxPts: '1' };
  assert.equal(runSearch([ant], sp, 'WY', wy({}), {}, {}).length, 0);
  assert.equal(runSearch([ant], sp, 'WY', wy({ wySpecial: true }), {}, {}).length, 1);
  const allDrew = asRow(byId.get('WY:antelope:091-2')!);
  assert.equal(allDrew.ptsNr, null);
  assert.equal(runSearch([allDrew], { ...sp, wyMaxPts: '0' }, 'WY', wy({}), {}, {}).length, 1);
  // residents have no points needed, so the nonresident cap never removes their results
  assert.equal(runSearch([ant], sp, 'WY', wy({ res: 'RESIDENT' }), {}, {}).length, 1);
});

test('the Wyoming wilderness filter splits hunt areas by whether they contain any, in both directions', () => {
  const wildRow = asRow(byId.get('WY:antelope:050-1')!);   // area A50, 4.5% wilderness
  const openRow = asRow(byId.get('WY:antelope:001-1')!);   // area A1, none
  const rows = [wildRow, openRow] as unknown as Parameters<typeof runSearch>[0];
  const ids = (wyWild?: string) => runSearch(rows, { states: 'WY', species: 'PRONGHORN', ...(wyWild ? { wyWild } : {}) },
    'WY', wy({})).map((x) => x.r.id);

  assert.deepEqual(ids().sort(), [wildRow.id, openRow.id].sort());   // unset shows both
  assert.deepEqual(ids('none'), [openRow.id]);
  assert.deepEqual(ids('has'), [wildRow.id]);
  // an unrecognised value must not silently drop results
  assert.deepEqual(ids('maybe').sort(), [wildRow.id, openRow.id].sort());
});

test('the wilderness filter is a Wyoming restriction, so it is dropped when Wyoming leaves the search', () => {
  assert.ok(WY_RESTRICTIONS.includes('wyWild'));
});

test('a 4.5% hunt area is reported as a share, never as "the hunt is wilderness"', () => {
  const hits = wyHuntWilderness(['A50']);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].area.pct < 5);
  assert.equal(wildernessPctLabel(hits[0].area.pct), '5%');
  // a real but tiny overlap still reads as a share rather than rounding to nothing
  assert.equal(wildernessPctLabel(0.4), '<1%');
  assert.deepEqual(wyHuntWilderness(['A1']), []);
});

test('the map reads wilderness by the same unit key the finder groups by', () => {
  // MultiStateFinder shades from key.slice(3) of a "WY:<area>" group key; if that convention moves, this breaks
  const key = searchUnitKey('WY', 'A50');
  assert.equal(key, 'WY:A50');
  assert.ok(key.startsWith('WY:'));
  assert.equal(wyWilderness(key.slice(3))?.pct, wyWilderness('A50')?.pct);
  // an area the build measured and found none in is a known zero, not missing data
  assert.equal(wyWilderness('A1'), null);
});

test('minimum points uses Wyoming pool cutoff and leaves other states and residents unchanged', () => {
  const sp = { states: 'WY', antler: 'ALL', minScore: '0', wyMinPts: '3' };
  assert.equal(runSearch([ant], sp, 'WY', wy({}), {}, {}).length, 1);
  assert.equal(runSearch([ant], { ...sp, wyMinPts: '4' }, 'WY', wy({}), {}, {}).length, 0);
  assert.equal(runSearch([ant], sp, 'WY', wy({ wySpecial: true }), {}, {}).length, 0);
  assert.equal(runSearch([ant], sp, 'WY', wy({ res: 'RESIDENT' }), {}, {}).length, 1);
  const unknown = { ...ant, pointOdds: null };
  assert.equal(runSearch([unknown], sp, 'WY', wy({}), {}, {}).length, 0);
  const id = { ...ant, id: 'ID:test', state: 'ID', type: 'CONTROLLED' };
  assert.equal(runSearch([id], { ...sp, states: 'ID,WY' }, 'ID', wy({}), {}, {}).length, 1);
});
