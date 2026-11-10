import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prefOdds,
  randomOdds,
  nonresidentOdds,
  residentOdds,
  effectiveCutoff,
  pointsToGuarantee,
  cutoffHistory,
  type WyPref,
  type WyHuntYear,
} from '../src/lib/wyOdds';

// WGFD 2026 Nonresident Preference Point report, antelope hunt 001 type 1 (rows copied from the PDF)
const ant001: WyPref = {
  quota: 108,
  rows: [
    [108, 1, 'e', 7, 1, 100], [107, 3, 'p', 7, 3, 100], [104, 0, 'e', 6, 0, 100], [104, 4, 'p', 6, 4, 100],
    [100, 3, 'e', 5, 3, 100], [97, 5, 'p', 5, 5, 100], [92, 15, 'e', 4, 15, 100], [77, 66, 'p', 4, 66, 100],
    [11, 12, 'e', 3, 69, 15.94], [0, null, 'r', 2, 290, 0],
  ],
};

test('preference odds are the printed odds at the applicant\'s points', () => {
  assert.equal(prefOdds(ant001, 9), 1); // above everyone
  assert.equal(prefOdds(ant001, 4), 1);
  assert.equal(prefOdds(ant001, 3), 0.1594);
  assert.equal(prefOdds(ant001, 2), 0); // "< 3" closing bucket
  assert.equal(prefOdds(ant001, 0), 0);
  assert.throws(() => prefOdds(ant001, 2.5));
});

test('random odds: quota over first-choice applicants, capped; unlimited stays unknown', () => {
  assert.equal(randomOdds({ quota: 36, apps: [347, 83, 56] }), 36 / 347);
  assert.equal(randomOdds({ quota: 10, apps: [4, 0, 0] }), 1);
  assert.equal(randomOdds({ quota: 0, apps: [4, 0, 0] }), 0);
  assert.equal(randomOdds({ quota: 5, apps: [0, 0, 0] }), 1);
  assert.equal(randomOdds({ quota: null, apps: [2370, 2156, 1038] }), null);
  assert.equal(randomOdds(undefined), null);
});

test('nonresident total combines published preference and estimated random', () => {
  const o = nonresidentOdds({ pref: ant001, random: { quota: 36, apps: [347, 83, 56] } }, 3);
  assert.equal(o.pref, 0.1594);
  assert.ok(Math.abs(o.total! - (0.1594 + 0.8406 * (36 / 347))) < 1e-12);
  assert.equal(nonresidentOdds({ pref: ant001, random: { quota: 36, apps: [347, 83, 56] } }, 0).total, 36 / 347);
});

test('resident general licenses are unlimited, not 100% or 0%', () => {
  assert.deepEqual(residentOdds({ quota: null, apps: [1, 2, 3] }), { total: null, basis: 'unlimited' });
  assert.deepEqual(residentOdds({ quota: 320, apps: [111, 113, 50] }), { total: 1, basis: 'estimated-random' });
});

test('effective cutoff and points to guarantee', () => {
  assert.ok(Math.abs(effectiveCutoff(ant001)! - (3 + (1 - 0.1594))) < 1e-9);
  assert.equal(pointsToGuarantee(ant001), 4);
  // party row drawn out: midpoint of 5-6, 20% drawn
  const party: WyPref = { quota: 9, rows: [[9, 1, 'e', 8, 1, 100], [8, 2, 'p', 8, 2, 100], [6, 0, 'e', 7, 0, 100], [6, 0, 'p', 7, 0, 100], [6, 5, 'e', 6, 5, 100], [1, 3, 'p', 6, 5, 20], [0, null, 'r', 5, 72, 0]] };
  assert.ok(Math.abs(effectiveCutoff(party)! - 6.3) < 1e-9);
  assert.equal(pointsToGuarantee(party), 7);
  const under: WyPref = { quota: 10, rows: [[10, 2, 'e', 1, 2, 100], [8, 3, 'e', 0, 3, 100], [5, null, 'r', -1, 0, 0]] };
  assert.equal(effectiveCutoff({ quota: 10, rows: under.rows.slice(0, 2) }), null);
  assert.equal(pointsToGuarantee({ quota: 0, rows: [] }), null);
});

test('real data: shipped file reproduces the 2026 antelope 001-1 reports and is internally consistent', () => {
  const data = JSON.parse(readFileSync(new URL('../data/wy/draws.json', import.meta.url), 'utf8'));
  const y: WyHuntYear = data.hunts.antelope['001-1'].years['2026'];
  assert.deepEqual(y.regular!.pref, ant001);
  assert.deepEqual(y.regular!.random, { quota: 36, apps: [347, 83, 56] });
  assert.equal(y.special!.pref.quota, 73);
  assert.deepEqual(y.special!.random, { quota: 24, apps: [25, 10, 4] });
  assert.deepEqual(y.res, { quota: 320, apps: [111, 113, 50] });
  // 2023 cutoff 2 points at 46.34%; 2026 cutoff 3 points at 15.94%
  const hist = cutoffHistory(data.hunts.antelope['001-1'].years, 'regular');
  assert.ok(Math.abs(hist.find((h) => h.year === 2023)!.cutoff! - (2 + (1 - 0.4634))) < 1e-9);
  assert.equal(hist.length, 6);
  let pools = 0;
  for (const species of ['antelope', 'deer', 'elk']) {
    for (const hunt of Object.values<any>(data.hunts[species])) {
      for (const year of Object.values<WyHuntYear>(hunt.years)) {
        for (const pool of [year.regular, year.special]) {
          if (!pool) continue;
          pools++;
          const unsuccessful = pool.pref.rows.reduce((a, r) => a + r[4] - (r[1] ?? 0), 0);
          assert.equal(pool.random.apps[0], unsuccessful);
          for (const p of [0, 1, 3, 6, 12, 20]) {
            const o = nonresidentOdds(pool, p);
            assert.ok(o.pref >= 0 && o.pref <= 1 && o.total !== null && o.total >= o.pref && o.total <= 1);
          }
          // more points never lowers preference odds
          for (let p = 0; p < 25; p++) assert.ok(prefOdds(pool.pref, p + 1) >= prefOdds(pool.pref, p));
        }
      }
    }
  }
  assert.equal(pools, data.meta.checkedPools);
});
