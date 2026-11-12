import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mtApplicationCost, mtComboCost, MT_DRAW_PRICE, MT_PREREQ } from '../src/lib/mtFees';

test('Montana fees as the 2026 regulations print them', () => {
  // drawing prices are the over-the-counter price + the $5 application fee where both exist
  assert.equal(MT_DRAW_PRICE.DEER_B.res, 10 + 5);
  assert.equal(MT_DRAW_PRICE.DEER_B.nr, 75 + 5);
  assert.equal(MT_DRAW_PRICE.ELK_B.nr, 270 + 5);
  assert.equal(MT_DRAW_PRICE.ANTELOPE_B.nr, null); // not printed for nonresidents
  assert.deepEqual(MT_PREREQ.nr.map((x) => x.amount), [10, 50, 7.5]);
});

test('an application is itemised, never a single hunt total', () => {
  const c = mtApplicationCost('ELK_PERMIT', true, true);
  assert.deepEqual(c.apply.map((x) => x.amount), [9, 20]);
  assert.match(c.ifNot, /Nothing comes back/);
  const b = mtApplicationCost('DEER_B', false, false);
  assert.deepEqual(b.apply.map((x) => x.amount), [15]);
  assert.match(b.ifNot, /end of August/);
  const k = mtComboCost('BIG_GAME', true);
  assert.deepEqual(k.apply.map((x) => x.amount), [1312, 100]);
  assert.match(k.ifNot, /early May/);
});
