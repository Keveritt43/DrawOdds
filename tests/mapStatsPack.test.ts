import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packStats, unpackStats, MATCH_STAT_FIELDS } from '../src/lib/mapStatsPack';

const empty = Object.fromEntries(MATCH_STAT_FIELDS.map(f => [f, null])) as Record<(typeof MATCH_STAT_FIELDS)[number], number | null>;

test('packed map stats round-trip, keeping nulls distinct from zero', () => {
  const units = {
    'ID:60': { ...empty, trophy: 100, score: 100, odds: 1, fill: 0.6487894144144144, success: 0.20981812804968208, public: 79.6, crowd: 0.01370052402720482, huntable: 80.52429003693557 },
    'WY:E7': { ...empty, odds: 0, crowd: 0.000123456, wilderness: 0 },
    'NV:011': { ...empty },
  };
  const back = unpackStats(packStats(units));
  assert.deepEqual(Object.keys(back), Object.keys(units));
  assert.equal(back['ID:60'].fill, 0.6488);
  assert.equal(back['ID:60'].public, 79.6);
  assert.equal(back['ID:60'].objBull, null);
  assert.equal(back['WY:E7'].odds, 0);
  assert.equal(back['WY:E7'].wilderness, 0);
  assert.equal(back['WY:E7'].crowd, 0.0001235);
  assert.equal(back['WY:E7'].score, null);
  assert.deepEqual(back['NV:011'], empty);
});

test('packing is much smaller than the object form', () => {
  const units = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`ID:${i}`, { ...empty, score: 70, odds: 0.123456789, success: 0.2345678, public: 55.55555, crowd: 0.0123456 }]));
  assert.ok(JSON.stringify(packStats(units as never)).length < JSON.stringify(units).length / 2.5);
});
