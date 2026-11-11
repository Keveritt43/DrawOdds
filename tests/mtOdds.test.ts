import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  mtCutoffHistory,
  MT_POINTS_CAP,
} from '../src/lib/mtOdds';
import { parseNrCombo, type ParsedSection } from '../scripts/mt_parse_nr_combo';

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

/** Fail the test where a lookup misses, instead of asserting against undefined. */
function must<T>(x: T | undefined, what: string): T {
  if (x === undefined) throw new Error(`missing ${what}`);
  return x;
}
const section = (key: string, year: number) =>
  must(parseNrCombo(REPORT_LINES).find((s) => s.licenseKey === key && s.year === year), `${key} ${year}`);
const level = (s: ParsedSection, label: string) => must(s.levels.find((l) => l.label === label), `level ${label}`);

test('parser: reconciles every section against the printed total', () => {
  assert.equal(parseNrCombo(REPORT_LINES).length, 4);
  const bg26 = section('biggame-elk', 2026);
  assert.equal(bg26.totalApps, 29892);
  assert.equal(bg26.levels.reduce((a, l) => a + l.apps, 0), 29892);
});

test('parser: repairs digits pdf.js split inside a number', () => {
  const cutoff = level(section('biggame-elk', 2025), '2');
  assert.equal(cutoff.apps, 9721); // printed as "9,7 21"
  assert.equal(cutoff.drawn, 8146); // printed as "8,1 46"
});

test('parser: 100% levels carry no success count, so drawn is derived', () => {
  const top = level(section('biggame-elk', 2026), '2.2 – 3');
  assert.equal(top.drawn, 5377);
  assert.equal(top.drawnDerived, true);
});

test('parser: a level with no applicants has unknown odds, not 0%', () => {
  const three = level(section('biggame-elk-landowner', 2026), '3');
  assert.equal(three.apps, 0);
  assert.equal(three.pct, null);
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

// --- the full 2021-2026 series, parsed from the report text committed in data/mt/nr-combo-text/ ---

const TEXT_DIR = 'data/mt/nr-combo-text';
const reportFiles = () => readdirSync(TEXT_DIR).filter((f) => f.endsWith('.txt')).sort();
const parseFile = (f: string) => parseNrCombo(readFileSync(`${TEXT_DIR}/${f}`, 'utf8').split('\n'));

test('gate 1: every published report parses and every check passes', () => {
  const files = reportFiles();
  assert.ok(files.length >= 6, `expected the 2022-2026 reports, found ${files.length}`);
  let sections = 0;
  for (const f of files) sections += parseFile(f).length;
  assert.ok(sections >= 25, `expected at least 25 sections across the reports, got ${sections}`);
});

test('gate 1: the 75/25 split holds in every regular draw, 2021-2026', () => {
  for (const f of reportFiles()) {
    for (const s of parseFile(f)) {
      if (s.pool !== 'regular') continue;
      const drawn = s.levels.reduce((a, l) => a + l.drawn, 0);
      const zero = must(s.levels.find((l) => l.min === 0 && l.max === 0), `zero level in ${s.licenseKey} ${s.year}`);
      const share = zero.drawn / drawn;
      assert.ok(Math.abs(share - 0.25) < 0.005, `${s.licenseKey} ${s.year} (${f}): random share ${(share * 100).toFixed(2)}%`);
    }
  }
});

test('gate 1: where two reports restate the same draw, they agree exactly', () => {
  const sig = (s: ParsedSection) => JSON.stringify({ t: s.totalApps, l: s.levels.map((l) => [l.min, l.max, l.apps, l.drawn]).sort() });
  const seen = new Map<string, { sig: string; file: string }>();
  let overlaps = 0;
  for (const f of reportFiles()) {
    for (const s of parseFile(f)) {
      const key = `${s.licenseKey}:${s.year}`;
      const prior = seen.get(key);
      if (!prior) { seen.set(key, { sig: sig(s), file: f }); continue; }
      overlaps++;
      assert.equal(sig(s), prior.sig, `${key} differs between ${prior.file} and ${f}`);
    }
  }
  assert.ok(overlaps >= 8, `expected the reports to overlap, found ${overlaps} restatements`);
});

test('parser: whole-number percentages in the 2022-era reports are accepted', () => {
  // "1 PP 17% Draw (5,963 apps/1,041 available)" — 1041/5963 is 17.46%, printed as 17%.
  const cut = level(must(parseFile('2022-deer.txt').find((s) => s.year === 2022), 'deer 2022'), '1');
  assert.equal(cut.apps, 5963);
  assert.equal(cut.drawn, 1041);
  assert.equal(cut.pct, 17);
});

test('parser: a two-decimal percentage is still held to two decimals', () => {
  // The tolerance follows the printed precision, so 2026's 75.77% cannot drift the way 17% may.
  const bad = ['Big Game/Elk Combo Drawing Stats', '2026 (Total apps 100)', '2 PP 75.77% Draw (100 apps, 60 successful)'];
  assert.throws(() => parseNrCombo(bad), /is not 75.77%/);
});

test('parser: a band FWP omitted entirely is reconstructed from the printed total', () => {
  // 2022 big game prints no 0% band; 30,947 total less the three printed bands leaves 12,188 applicants.
  const bg22 = must(parseFile('2022-biggame.txt').find((s) => s.year === 2022), 'big game 2022');
  const dead = must(bg22.levels.find((l) => l.inferred), 'inferred band');
  assert.equal(dead.apps, 12188);
  assert.equal(dead.drawn, 0);
  assert.equal(bg22.levels.reduce((a, l) => a + l.apps, 0), bg22.totalApps);
});

test("parser: FWP's own totals that do not close are recorded, not swallowed", () => {
  const bg23 = must(parseFile('2023.txt').find((s) => s.licenseKey === 'biggame-elk' && s.year === 2023), 'big game 2023');
  assert.equal(bg23.totalMismatch, 90); // printed total 30,985; the bands sum to 30,895
});

test('parser: a mismatch big enough to mean a missed row still fails', () => {
  const bad = ['Deer Combo Drawing Stats', '2024 (Total apps 20,000)', '1 PP 50% Draw (100 apps, 50 successful)', '0 PP 50% Draw (100 apps, 50 successful)'];
  assert.throws(() => parseNrCombo(bad), /sum to 200, report says 20000/);
});

test('parser: the reconstructed band cannot swallow an implausible gap', () => {
  // Same shape as 2022 big game (no 0% band, so the gap would be reconstructed), but the gap is almost
  // the whole report — that is a lost row, not an omitted band.
  const bad = ['Big Game/Elk Combo Drawing Stats', '2022 (Total apps 20,000)', '2 PP 50% Draw (100 apps, 50 successful)', '0 PP 50% Draw (100 apps, 50 successful)'];
  assert.throws(() => parseNrCombo(bad), /sum to 200, report says 20000/);
});

test('six draws of history for both licenses', () => {
  assert.deepEqual(mtYears('biggame-elk'), [2026, 2025, 2024, 2023, 2022, 2021]);
  assert.deepEqual(mtYears('deer'), [2026, 2025, 2024, 2023, 2022, 2021]);
});

test('2021 had no dead zone: the cutoff sat at the 1-point level', () => {
  // The preference phase reached down into the 1-point level, so there was nothing between it and zero.
  assert.equal(mtCutoff('biggame-elk', 2021)?.min, 1);
  assert.equal(mtDeadZone('biggame-elk', 2021)?.max, 1);
  assert.equal(mtComboOdds('biggame-elk', 1, 2021)?.basis, 'at-cutoff');
  assert.ok((mtComboOdds('biggame-elk', 1, 2021)?.odds ?? 0) > 0.3);
});

test('the dead zone opened when the cutoff moved to 2 points', () => {
  const dead = (y: number) => mtComboOdds('biggame-elk', 1, y)?.basis === 'dead-zone';
  assert.equal(dead(2021), false);
  for (const y of [2022, 2023, 2024, 2025, 2026]) assert.equal(dead(y), true, `${y}`);
});

test('cutoff history runs oldest first and keeps the zero-point line', () => {
  const h = mtCutoffHistory('biggame-elk');
  assert.equal(h.length, 6);
  assert.equal(h[0].year, 2021);
  assert.equal(h[h.length - 1].year, 2026);
  for (const y of h) assert.ok(y.zeroPct != null && y.zeroPct > 0, `${y.year} zero-point chance`);
  // Drawn licenses hold near the 17,000 quota every year.
  for (const y of h) assert.ok(y.drawn > 16000 && y.drawn <= 17000, `${y.year} drawn ${y.drawn}`);
});

test('holding one point beat holding none only in 2021', () => {
  for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
    const one = mtComboOdds('biggame-elk', 1, y)?.odds ?? 0;
    const none = mtComboOdds('biggame-elk', 0, y)?.odds ?? 0;
    if (y === 2021) assert.ok(one < none, `${y}: 1pt ${one} vs 0pt ${none}`); // 34.71% vs 70.94% — still worse
    else assert.equal(one, 0, `${y}`);
  }
});
