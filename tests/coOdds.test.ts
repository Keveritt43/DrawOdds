import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effective, cutFromEff, oddsAt, exactAt, trendNext, project, projectedOdds, drawsToDraw, chanceOf, hybridRate, calibrate, DEFAULT_CALIBRATION, type PoolYear } from '../src/lib/coOdds';
import { parseCutoffText, decodeHuntCode } from '../src/sync/co/recap';

// CPW Draw Recap, DM070O3R (unit 70, 3rd rifle, buck deer): adult nonresidents and residents
const cut = (points: number, drawn: number, apps: number) => ({ text: `${points} Pref Points`, points, choice: null, leftover: false, drawnAtLevel: drawn, appsAtLevel: apps });
const NR25: PoolYear = {
  year: 2025,
  pre: { 24: 1, 23: 1, 14: 1, 13: 1, 12: 1, 11: 2, 10: 1, 9: 5, 8: 8, 7: 11, 6: 33, 5: 81, 4: 86, 3: 73, 2: 81, 1: 69, 0: 74 },
  post: { 24: 1, 23: 1, 14: 1, 12: 1, 11: 2, 9: 5, 8: 8, 7: 10, 6: 29, 5: 26 },
  cut: cut(5, 26, 81),
};
const NR26: PoolYear = {
  year: 2026,
  pre: { 14: 4, 12: 4, 11: 4, 10: 3, 9: 7, 8: 13, 7: 28, 6: 55, 5: 80, 4: 80, 3: 87, 2: 59, 1: 69, 0: 63 },
  post: { 14: 4, 12: 4, 11: 4, 10: 3, 9: 5, 8: 11, 7: 25, 6: 33 },
  cut: cut(6, 33, 55),
};
const RES26: PoolYear = { year: 2026, pre: { 6: 1, 5: 1, 4: 6, 3: 11, 2: 53, 1: 181, 0: 228 }, post: { 6: 1, 5: 1, 4: 6, 3: 11, 2: 51, 1: 165 }, cut: cut(1, 165, 181) };
const nrHist = (effs: number[]) => effs.map((e, i) => ({ year: 2021 + i, eff: e }));

test('effective points put the cutoff on one scale', () => {
  assert.equal(effective(NR26), 6.4);
  assert.equal(effective(RES26), 1.09);
  assert.equal(effective({ ...RES26, cut: { text: 'Choice 2', points: null, choice: 2, leftover: false, drawnAtLevel: 3, appsAtLevel: 10 } }), 0);
  assert.equal(effective({ ...RES26, cut: { text: 'No Apps', points: null, choice: null, leftover: false, drawnAtLevel: null, appsAtLevel: null } }), null);
  assert.deepEqual(cutFromEff(6.4), { pts: 6, pct: 0.6 });
  assert.deepEqual(cutFromEff(7), { pts: 7, pct: 1 });
});

test('odds at a point level', () => {
  assert.equal(oddsAt(7, 6.4), 1);
  assert.equal(oddsAt(6, 6.4), 0.6);
  assert.equal(oddsAt(5, 6.4), 0);
  assert.equal(oddsAt(5, 6.4, 0.04), 0.04); // hybrid draw: 5+ points below the cutoff
  assert.equal(oddsAt(4, 6.4, 0.04), 0);
  const e = exactAt(NR26, 9);
  assert.deepEqual([e.apps, e.drawn], [7, 5]); // CPW: 2 of 7 above the cutoff didn't draw; show what happened
});

test('hybrid rate is 0 without draws below the cutoff', () => {
  assert.equal(hybridRate(NR26), 0);
  assert.equal(hybridRate({ ...RES26, cut: cut(15, 20, 22), pre: { 15: 22, 8: 75, 6: 42, 3: 10 }, post: { 15: 20, 8: 5, 6: 0 } }), 5 / 117);
});

test('trend (point creep)', () => {
  const t = trendNext(nrHist([3.84, 3.98, 4.67, 5.41, 5.68]))!;
  assert.equal(t.slope, 0.51);
  assert.equal(t.next, 6.19);
  assert.equal(trendNext(nrHist([3, 4])), null);
});

test('projection: last draw plus how far cutoffs at that level moved', () => {
  const p = project([NR25, NR26], DEFAULT_CALIBRATION.nr)!;
  assert.equal(p.year, 2027);
  assert.equal(p.base, 6.4);
  // 6-10 point nonresident band, deciles -2.33 .. +2.75
  assert.deepEqual(p.qs, [4.07, 4.9, 5.9, 6.38, 6.56, 6.9, 7.3, 7.61, 9.15]);
  assert.equal(p.eff, 6.56);
  const at = (n: number, rate = 1) => projectedOdds(n, p, 0, rate);
  assert.equal(at(6).odds, 0.46); // (1 + 1 + 1 + .62 + .44 + .1 + 0 + 0 + 0) / 9 (2026 actual: 33 of 55)
  assert.equal(at(6).chance, 'possible');
  assert.equal(at(10).odds, 1);
  assert.equal(at(10, 0.935).chance, 'sure');
  assert.equal(at(10, 0.935).odds, 0.94);
  assert.equal(at(3).chance, 'none');
  assert.equal(at(4).chance, 'longshot');
});

test('calibration from backtest pairs, banded by level', () => {
  const c = calibrate([{ last: 0.5, next: 1 }, { last: 0.2, next: 0.2 }, { last: 7, next: 9 }], [1, 3, 6, 10], [0, 1]);
  assert.deepEqual(c.q, [[0, 0.5], [0, 0], [0, 0], [2, 2], [0, 0]]);
  assert.deepEqual(c.n, [2, 0, 0, 1, 0]);
});

test('chance labels and draws to draw', () => {
  assert.equal(chanceOf(0.95, 0.9, 1), 'sure');
  assert.equal(chanceOf(0.7, 0.3, 1), 'likely');
  assert.equal(chanceOf(0.4, 0, 1), 'possible');
  assert.equal(chanceOf(0.1, 0, 0.5), 'longshot');
  assert.equal(chanceOf(0, 0, 0), 'none');
  assert.equal(drawsToDraw(7, { eff: 6.95, slope: 0.55 }), 0);
  assert.equal(drawsToDraw(3, { eff: 6.95, slope: 0.55 }), 8); // 11 points vs a cutoff of 11.35: 65%
  assert.equal(drawsToDraw(0, { eff: 6.95, slope: 1.2 }), null); // creep faster than a point a year
});

test('CPW cutoff text and hunt codes', () => {
  assert.deepEqual(parseCutoffText('1 8 Pref Points'), { points: 18, choice: null, leftover: false });
  assert.deepEqual(parseCutoffText('Leftover Choice 2'), { points: null, choice: 2, leftover: true });
  assert.deepEqual(parseCutoffText('None Drawn'), { points: null, choice: null, leftover: false });
  assert.deepEqual(decodeHuntCode('DM070O3R'), { species: 'DEER', sex: 'M', unit: '70', seasonType: 'O', seasonNo: 3, method: 'R' });
  assert.equal(decodeHuntCode('DP99999P')?.sex, 'P');
});
