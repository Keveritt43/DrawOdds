import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costLines, FEES, money } from '../src/lib/applyInfo';

const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);

test('a nonresident controlled hunt separates what you pay to apply from what you pay only if you draw', () => {
  const c = costLines('controlled', 'NONRESIDENT', 'DEER');
  assert.equal(sum(c.upFront), 185 + 10 + 18);
  assert.deepEqual(c.ifYouDraw, [{ label: 'Deer tag', amount: 351.75 }]);
  assert.equal(c.complete, true);
  // the tag must never sit in the up-front group: it is only owed if the draw goes your way
  assert.ok(!c.upFront.some((i) => /tag/i.test(i.label)));
});

test('residents get resident fees, and their general tags are over the counter rather than drawn', () => {
  const c = costLines('controlled', 'RESIDENT', 'ELK');
  assert.equal(sum(c.upFront), 15.75 + 5 + 6.25);
  assert.deepEqual(c.ifYouDraw, [{ label: 'Elk tag', amount: 36.75 }]);
  // a resident on a general deer/elk hunt buys the tag; only nonresidents draw for those
  const gen = costLines('nrGeneral', 'RESIDENT', 'DEER');
  assert.deepEqual(gen.ifYouDraw, []);
  assert.ok(gen.upFront.some((i) => i.label.includes('over the counter') && i.amount === 24.75));
  assert.ok(gen.notes.some((n) => n.includes('No draw')));
});

test('moose, sheep and goat take the whole tag fee at application, refundable', () => {
  const c = costLines('msg', 'NONRESIDENT', 'MOOSE');
  assert.equal(sum(c.upFront), 185 + 10 + 45.75 + 2626.75);
  assert.deepEqual(c.ifYouDraw, []);
  assert.ok(c.notes.some((n) => n.includes('refunded if you do not draw')));
  // matches the figure the moose/sheep/goat checklist already quotes
  assert.equal(money(FEES.NONRESIDENT.msgApp + FEES.NONRESIDENT.tag.MOOSE), '$2,672.50');
});

test('an unknown tag price is reported as unknown rather than priced at zero', () => {
  const c = costLines('controlled', 'NONRESIDENT', 'WOLVERINE');
  assert.equal(c.complete, false);
  assert.deepEqual(c.ifYouDraw, []);
  assert.ok(c.notes.some((n) => n.includes('do not have')));
  assert.ok(!c.upFront.some((i) => i.amount === 0));
});

test('every breakdown carries the date its figures were read and the schedule they came from', () => {
  for (const kind of ['controlled', 'nrGeneral', 'otc', 'msg'] as const)
    for (const res of ['RESIDENT', 'NONRESIDENT'] as const) {
      const c = costLines(kind, res, 'DEER');
      assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(c.source.startsWith('https://idfg.idaho.gov/licenses/fees-'));
      assert.ok(c.notes.length > 0);
    }
});
