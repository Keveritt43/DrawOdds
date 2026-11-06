import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsClasses, colorsFor, RYG7 } from '../src/lib/mapMetrics';
import { matchesCoMapFilters } from '../src/lib/coMapFilters';

test('eight points uses seven fixed relative bands including five and eleven', () => {
  const cls = pointsClasses([0, 5, 6, 7, 8, 9, 10, 11, 40], 8);
  assert.deepEqual(cls.breaks, [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(cls.labels, ['5 or lower', '6', '7', '8', '9', '10', '11+']);
  assert.deepEqual(cls.counts, [2, 1, 1, 1, 1, 1, 2]);
  assert.equal(colorsFor(cls, 'low')[3], RYG7[3]);
});
test('zero through three points omit impossible negative bands and keep the center yellow', () => {
  for (const points of [0, 1, 2, 3]) {
    const cls = pointsClasses([points], points);
    assert.ok(cls.breaks.every(v => v > 0));
    assert.equal(colorsFor(cls, 'low')[cls.counts.indexOf(1)], RYG7[3]);
  }
  assert.equal(pointsClasses([], 40).labels?.at(-1), '43+');
});
test('weapons intersect multiple selected seasons, including general rifle codes', () => {
  assert.equal(matchesCoMapFilters('DM070O2R', ['R'], ['1', '2']), true);
  assert.equal(matchesCoMapFilters('EM070U3R', ['R'], ['2', '3']), true);
  assert.equal(matchesCoMapFilters('DM070O2R', ['A'], ['2']), false);
  assert.equal(matchesCoMapFilters('DM070O4R', ['R'], ['1', '2']), false);
  assert.equal(matchesCoMapFilters('DM070O2R', [], []), true);
  assert.equal(matchesCoMapFilters(null, ['R'], []), false);
});
