import { test } from 'node:test';
import assert from 'node:assert/strict';
import hunts from '../data/mt/hunts.json';
import draws from '../data/mt/draws.json';
import { mtChanges, mtLatestDraw, mtAppOf, MT_APPS, type MtChangeRow } from '../src/lib/mtPlan';
import type { MtPointOdds } from '../src/lib/mtHunt';

const H = (hunts as unknown as { hunts: MtChangeRow[] }).hunts;

test('the latest drawing is 2026, and every drawn hunt maps to one application', () => {
  assert.equal(mtLatestDraw(H), 2026);
  for (const h of H) {
    const po = h.pointOdds as MtPointOdds;
    if (po.kind === 'bonus') assert.ok(mtAppOf(po), h.id);
    else assert.equal(mtAppOf(po), null, h.id); // general and over-the-counter licences are not drawn choices
  }
  assert.deepEqual(MT_APPS.map((a) => a.deadline), ['2026-04-01', '2026-04-01', '2026-04-01', '2026-06-01', '2026-06-01', '2026-06-01', '2026-06-01']);
});

test('quota changes come from the draw history and match FWP\'s printed quotas', () => {
  const c = mtChanges(H, 2026);
  assert.ok(c.quota.length > 0);
  const Y = (draws as unknown as { years: Record<string, Record<string, { license: string; code: string; quota: number | string }>> }).years;
  for (const q of c.quota.slice(0, 25)) {
    const po = q.row.pointOdds as MtPointOdds;
    const code = (q.row as unknown as { tagCode: string }).tagCode;
    assert.equal(Y['2026'][`${po.license} ${code}`].quota, q.last, q.row.id);
    assert.equal(Y['2025'][`${po.license} ${code}`].quota, q.prev, q.row.id);
  }
  // biggest first
  for (let i = 1; i < c.quota.length; i++) assert.ok(Math.abs(c.quota[i - 1].last - c.quota[i - 1].prev) >= Math.abs(c.quota[i].last - c.quota[i].prev));
});

test('new codes are the ones with no draw before 2026, and match draws.json', () => {
  const c = mtChanges(H, 2026);
  const Y = (draws as unknown as { years: Record<string, Record<string, unknown>> }).years;
  const before = new Set(['2021', '2022', '2023', '2024', '2025'].flatMap((y) => Object.keys(Y[y] ?? {})));
  for (const f of c.fresh) {
    const po = f.row.pointOdds as MtPointOdds;
    assert.ok(!before.has(`${po.license} ${(f.row as unknown as { tagCode: string }).tagCode}`), f.row.id);
  }
  assert.ok(c.fresh.length > 0);
});
