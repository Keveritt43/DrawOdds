import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mtComboOdds,
  mtCutoff,
  mtDeadZone,
  mtDrawn,
  mtLatestYear,
  mtLevels,
  mtLicenses,
  mtOddsLabel,
  mtPointsToDraw,
  mtRandomShare,
  mtYears,
  MT_POINTS_CAP,
} from '../src/lib/mtOdds';
import { parseNrCombo } from '../scripts/mt_parse_nr_combo.mjs';

// Lines as pdf.js extracted them from FWP's "2026 NR Combination Preference Point Statistics"
// (objectID 116132), including the split digits it produces inside "9,721" and "8,146".
const REPORT_LINES = [
  'General Big Game/Elk Combo Primary Drawing Stats',
  '2026 Regular (Total apps 29,892)',
  '2.2 – 3 PP 100% Draw (5,377 apps)',
  '2 PP 75.77% Draw (9,609 apps, 7,281 successful)',
  '.2 – 1.8 PP 0% Draw (7,063 apps)',
  '0 PP 53.61% Draw (7,843 apps, 4,205 successful)',
  '2026 NR Landowner Priority Pool (133 apps)',
  '3 PP 0% Draw (0 apps)',
  '2 PP 100% Draw (20 apps)',
  '1 PP 100% Draw (69 apps)',
  '0 PP 100% Draw (44 apps)',
  '2025 Regular (Total apps 29,519)',
  '2.2 – 3 PP 100% Draw (4,522 apps)',
  '2 PP 83.80% Draw (9,7 21 apps, 8,1 46 successful)',
  '.2 – 1.8 PP 0% Draw (7,323 apps)',
  '0 PP 52.84% Draw (7,953 apps, 4,202 successful)',
  'General Deer Combo Primary Drawing Stats',
  '2026 (Total apps 13,213)',
  '1.2 – 3 PP 100% Draw (5,410 apps)',
  '1 PP 20.90% Draw (3,637 apps, 760 successful)',
  '.2 - .75 PP 0% Draw (137 apps)',
  '0 PP 51.03% Draw (4,029 apps, 2,056 successful)',
];

test('parser: reconciles every section against the printed total', () => {
  const sections = parseNrCombo(REPORT_LINES);
  assert.equal(sections.length, 4);
  const bg26 = sections.find((s) => s.licenseKey === 'biggame-elk' && s.year === 2026);
  assert.equal(bg26.totalApps, 29892);
  assert.equal(bg26.levels.reduce((a, l) => a + l.apps, 0), 29892);
});

test('parser: repairs digits pdf.js split inside a number', () => {
  const bg25 = parseNrCombo(REPORT_LINES).find((s) => s.licenseKey === 'biggame-elk' && s.year === 2025);
  const cutoff = bg25.levels.find((l) => l.label === '2');
  assert.equal(cutoff.apps, 9721); // printed as "9,7 21"
  assert.equal(cutoff.drawn, 8146); // printed as "8,1 46"
});

test('parser: 100% levels carry no success count, so drawn is derived', () => {
  const bg26 = parseNrCombo(REPORT_LINES).find((s) => s.licenseKey === 'biggame-elk' && s.year === 2026);
  const top = bg26.levels.find((l) => l.label === '2.2 – 3');
  assert.equal(top.drawn, 5377);
  assert.equal(top.drawnDerived, true);
});

test('parser: a level with no applicants has unknown odds, not 0%', () => {
  const lo = parseNrCombo(REPORT_LINES).find((s) => s.pool === 'landowner' && s.year === 2026);
  assert.equal(lo.levels.find((l) => l.label === '3').apps, 0);
  assert.equal(lo.levels.find((l) => l.label === '3').pct, null);
});

test('parser: rejects a section whose levels do not sum to its total', () => {
  const bad = REPORT_LINES.map((l) => (l.startsWith('2 PP 75.77%') ? '2 PP 75.77% Draw (9,600 apps, 7,281 successful)' : l));
  assert.throws(() => parseNrCombo(bad), /sum to 29883, report says 29892/);
});

test('parser: rejects a regular pool whose random share is not 25%', () => {
  const bad = REPORT_LINES.map((l) => (l.startsWith('0 PP 53.61%') ? '0 PP 25.50% Draw (7,843 apps, 2,000 successful)' : l));
  assert.throws(() => parseNrCombo(bad), /random share/);
});

test('parser: an unrecognised line is an error, never a skipped row', () => {
  assert.throws(() => parseNrCombo([...REPORT_LINES, '2027 Regular — see website']), /unrecognised line/);
});

test('the 75/25 split is exact in both licenses and both years', () => {
  for (const [key, year] of [['biggame-elk', 2026], ['biggame-elk', 2025], ['deer', 2026], ['deer', 2025]] as const) {
    const share = mtRandomShare(key, year);
    assert.ok(share != null && Math.abs(share - 0.25) < 0.005, `${key} ${year}: random share ${share}`);
  }
});

test('big game / elk 2026: the published ladder', () => {
  assert.equal(mtLatestYear('biggame-elk'), 2026);
  assert.deepEqual(mtYears('biggame-elk'), [2026, 2025]);
  assert.equal(mtDrawn('biggame-elk', 2026), 16863);

  const cut = mtCutoff('biggame-elk', 2026);
  assert.equal(cut?.min, 2);
  assert.equal(cut?.pct, 75.77);

  assert.equal(mtComboOdds('biggame-elk', 3, 2026)?.odds, 1);
  assert.equal(mtComboOdds('biggame-elk', 3, 2026)?.basis, 'above-cutoff');
  assert.ok(Math.abs((mtComboOdds('biggame-elk', 2, 2026)?.odds ?? 0) - 0.7577) < 1e-9);
  assert.equal(mtComboOdds('biggame-elk', 2, 2026)?.basis, 'at-cutoff');
  assert.equal(mtComboOdds('biggame-elk', 0, 2026)?.odds, 0.5361);
  assert.equal(mtComboOdds('biggame-elk', 0, 2026)?.basis, 'random-zero');
});

test('one point drew nothing while zero points drew better than half', () => {
  const one = mtComboOdds('biggame-elk', 1, 2026);
  const none = mtComboOdds('biggame-elk', 0, 2026);
  assert.equal(one?.odds, 0);
  assert.equal(one?.basis, 'dead-zone');
  assert.ok((none?.odds ?? 0) > 0.5);
  assert.equal(mtOddsLabel(one), 'No chance at this point level');
});

test('the dead zone runs from above zero up to the cutoff', () => {
  assert.deepEqual(mtDeadZone('biggame-elk', 2026), { min: 0, max: 2 });
  assert.deepEqual(mtDeadZone('deer', 2026), { min: 0, max: 1 });
  // deer 2025 had the same shape with a far kinder cutoff
  assert.equal(mtCutoff('deer', 2025)?.pct, 47.71);
});

test('a party point average between printed bands still resolves below the cutoff', () => {
  // 1.9 points: no applicants printed at that level in 2026, but it is under the cutoff of 2.
  const o = mtComboOdds('biggame-elk', 1.9, 2026);
  assert.equal(o?.odds, 0);
  assert.equal(o?.basis, 'dead-zone');
});

test('the landowner pool has no cutoff and so no dead zone', () => {
  assert.equal(mtCutoff('biggame-elk-landowner', 2026), null);
  assert.equal(mtDeadZone('biggame-elk-landowner', 2026), null);
  assert.equal(mtComboOdds('biggame-elk-landowner', 1, 2026)?.odds, 1);
  assert.equal(mtComboOdds('biggame-elk-landowner', 0, 2026)?.odds, 1);
  // nobody applied with 3 points, so that level is dropped rather than read as 0%
  assert.ok(!mtLevels('biggame-elk-landowner', 2026).some((l) => l.apps === 0));
});

test('points needed to draw in full', () => {
  assert.equal(mtPointsToDraw('biggame-elk', 2026), 2.2);
  assert.equal(mtPointsToDraw('deer', 2026), 1.2);
  assert.equal(mtPointsToDraw('biggame-elk-landowner', 2026), null);
});

test('deer 2026 lost licenses against 2025', () => {
  assert.equal(mtDrawn('deer', 2026), 8226);
  assert.equal(mtDrawn('deer', 2025), 10440);
});

test('points beyond the cap and bad input are rejected', () => {
  assert.throws(() => mtComboOdds('biggame-elk', MT_POINTS_CAP + 1), /cap at 3/);
  assert.throws(() => mtComboOdds('biggame-elk', -1), />= 0/);
  assert.equal(mtComboOdds('not-a-license', 0), null);
});

test('every license carries a source-backed report name and at least one year', () => {
  for (const lic of mtLicenses()) {
    assert.ok(lic.reportName.length > 0, lic.key);
    assert.ok(mtYears(lic.key).length >= 1, lic.key);
  }
});
