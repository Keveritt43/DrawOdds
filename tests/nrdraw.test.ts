import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDrawLines, parseQuotaLines, deerUnit, firstChoiceOdds } from '../src/sync/core/nrdraw';

const ZONES = ['McCall', 'Smoky-Bennett', 'Bear River', 'Panhandle'];

test('deer draw rows (RD / WD) with all five choices', () => {
  const rows = parseDrawLines([
    'RD01 671 853 671 78.66% 272 0 0.00% 216 0 0.00% 158 0 0% 164 0 0%',
    'RD04A 37 37 37 100.00% 69 0 0.00% 41 0 0.00% 32 0 0% 32 0 0%',
    'WD10A 685 1,204 685 56.89 % 300 0 0.00% 1 0 0% 0 0 0% 0 0 0%',
    'GMU # of Tags Applied Drew % Success', // header
  ], ZONES);
  assert.equal(rows.length, 3);
  const rd01 = rows.find((r) => r.code === 'RD01')!;
  assert.deepEqual([rd01.kind, rd01.unit, rd01.tags], ['RD', '1', 671]);
  assert.deepEqual(rd01.applied, [853, 272, 216, 158, 164]);
  assert.deepEqual(rd01.drew, [671, 0, 0, 0, 0]);
  assert.equal(rows.find((r) => r.code === 'WD10A')!.applied[0], 1204);
  assert.equal(deerUnit('RD04A'), '4A');
  assert.ok(Math.abs(firstChoiceOdds(rd01)! - 671 / 853) < 1e-9);
});

test('elk zone rows: zone names with spaces / hyphens, A and B tags', () => {
  const rows = parseDrawLines([
    'Bear River B 55 120 55 45.83% 30 0 0.00% 10 0 0% 5 0 0% 2 0 0%',
    'Smoky-Bennett A 184 400 184 46.00% 50 0 0% 20 0 0% 10 0 0% 5 0 0%',
    'McCall A 304 250 250 100.00% 90 40 44.44% 30 14 46.67% 10 0 0% 5 0 0%',
  ], ZONES);
  assert.deepEqual(rows.map((r) => r.code), ['ELK:Bear River:B', 'ELK:Smoky-Bennett:A', 'ELK:McCall:A']);
  const mc = rows[2];
  assert.equal(firstChoiceOdds(mc), 1);
  assert.deepEqual(mc.drew, [250, 40, 14, 0, 0]);
});

test('quota lines: codes beside quotas, capped flag, first occurrence wins', () => {
  const q = parseQuotaLines([
    'Bannock 70, 71, 72, 73, 73A, 74 ELK1 193 None',
    'Bear River 75, 77, 78 ELK2 93 ELK3 55 c',
    'RD39 1,093 RD01 656',
    'RD39 2,000', // outfitter table later in the PDF
  ]);
  assert.deepEqual(q.get('ELK1'), { quota: 193, capped: false });
  assert.deepEqual(q.get('ELK3'), { quota: 55, capped: true });
  assert.equal(q.get('RD39')!.quota, 1093);
  assert.equal(q.get('RD01')!.quota, 656);
});
