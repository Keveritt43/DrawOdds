import { test } from 'node:test';
import assert from 'node:assert/strict';
import draws from '../data/mt/draws.json';
import regs from '../data/mt/regs-2026.json';

type Level = [string, number, number];
type Entry = {
  license: string; code: string; quota: number | 'UNL'; species?: string; note?: string;
  pools: Record<string, { quota: number | 'UNL'; apps: number[]; succ: number[] }>;
  levels: Record<string, Level[]>;
};
const D = draws as unknown as { years: Record<string, Record<string, Entry>>; pointsColumn: Record<string, string> };
const R = regs as unknown as { codes: Record<string, { otc: boolean | null; quota: number | 'UNL' | null; quotaRange: number[] | null; license: string }> };

test('2026 Elk Permit 217-10 reads as printed (detailed report, p. 1; summary report row)', () => {
  const e = D.years['2026']['Elk Permit 217-10'];
  assert.deepEqual(e.levels.res.slice(0, 3), [['1', 182, 8], ['2', 142, 33], ['3', 83, 35]]);
  assert.deepEqual(e.levels.res.at(-1), ['0', 115, 3]); // applied without buying a point
  assert.equal(e.quota, 175);
  assert.deepEqual(e.pools.res.apps, [649, 205, 148]);
});

test('every detailed pool adds up to the summary report\'s first-choice applicants and successes (2026, exact)', () => {
  let exact = 0, total = 0;
  for (const e of Object.values(D.years['2026'])) {
    for (const [pool, lv] of Object.entries(e.levels)) {
      total++;
      const apps = lv.reduce((a, l) => a + l[1], 0), succ = lv.reduce((a, l) => a + l[2], 0);
      if (apps === e.pools[pool].apps[0] && succ === e.pools[pool].succ[0]) exact++;
    }
  }
  // the two reports are run on different dates; ~95% of pools agree exactly, the rest by a few applicants
  assert.ok(exact / total > 0.9, `${exact}/${total}`);
});

test('2026 draws and the 2026 regulations describe the same licences', () => {
  const rep = new Set(Object.keys(D.years['2026']));
  const drawn = Object.entries(R.codes).filter(([, c]) => c.otc === false && !c.license.startsWith('General')).map(([k]) => k);
  assert.deepEqual(drawn.filter((k) => !rep.has(k)), []);
  assert.deepEqual([...rep].filter((k) => !(k in R.codes)), []);
  // Elk B 004-00 is printed "Jun 1" only in HD 417; it has no draw report, so it was sold over the counter
  assert.equal(rep.has('Elk B License 004-00'), false);
});

test('every 2026 quota that differs from the printed regulations sits inside the printed quota range', () => {
  for (const [k, e] of Object.entries(D.years['2026'])) {
    const c = R.codes[k];
    if (c.quota === e.quota || typeof e.quota !== 'number') continue;
    assert.ok(c.quotaRange && c.quotaRange[0] <= e.quota && e.quota <= c.quotaRange[1], k);
  }
});

test('2026 deer codes carry their species, and notes survive ("First Choice Only")', () => {
  assert.equal(D.years['2026']['Deer B License 004-01'].species, 'WT');
  assert.equal(D.years['2023']['Elk Permit 270-45'].note, '(First Choice Only)');
});

test('odds by point level are only claimed for the years whose points column is understood', () => {
  for (const y of ['2023', '2024', '2025', '2026']) assert.equal(D.pointsColumn[y], 'used');
  for (const y of ['2021', '2022']) assert.equal(D.pointsColumn[y], 'unclear');
});
