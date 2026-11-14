import test from 'node:test';
import assert from 'node:assert/strict';
import { wyDeerSeries, wyDeerMix } from '../src/lib/wyDeerMetrics';
import harvest from '../data/wy/harvest.json';

test('WGFD 2025 Area 1 general species values match report tables 7 and 8', () => {
  const po = { harvest: harvest.species.deer['1-gen'] };
  assert.deepEqual(wyDeerSeries(po, 'MULE').find(r => r.year === 2025), {year: 2025, hunters: 774, harvest: 323, success: 323 / 774});
  assert.deepEqual(wyDeerSeries(po, 'WHITETAIL').find(r => r.year === 2025), {year: 2025, hunters: 934, harvest: 347, success: 347 / 934});
  assert.equal(wyDeerMix(po), 'MIXED');
});
test('missing or invalid species is unknown, and region aggregates are not attributed', () => {
  const r = { year: 2025, basis: 'mule+whitetail', huntersMule: 20, mule: 10, huntersWhitetail: null, whitetail: 0 };
  assert.equal(wyDeerSeries({harvest: [r]}, 'MULE').length, 1);
  assert.equal(wyDeerMix({harvest: [r]}), null);
  assert.equal(wyDeerSeries({harvest: [{...r, mule: 21}]}, 'MULE').length, 0);
  assert.equal(wyDeerSeries({harvest: [r], harvestBasis: 'region'}, 'MULE').length, 0);
});
test('mix thresholds match Idaho categories', () => {
  const po = (mule: number, whitetail: number) => ({harvest: [{year:2025, basis:'mule+whitetail', huntersMule:100, huntersWhitetail:100, mule, whitetail}]});
  assert.equal(wyDeerMix(po(60,40)), 'MULE');
  assert.equal(wyDeerMix(po(40,60)), 'WHITETAIL');
  assert.equal(wyDeerMix(po(50,50)), 'MIXED');
});
