import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classBreaks, countClasses, quantile } from '../src/lib/breaks';

// deterministic pseudo-random
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('quantile interpolates', () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test('mostly-public units: shades spent above 75%, not on empty 0-75 bands', () => {
  const r = rng(1);
  const v = [...Array.from({ length: 90 }, () => 75 + r() * 25), ...Array.from({ length: 10 }, () => r() * 75)];
  const { breaks, counts } = classBreaks(v);
  assert.equal(breaks.length, 5, `breaks ${breaks}`);
  assert.ok(breaks[0] >= 70, `first break ${breaks[0]} should lump the low units`);
  assert.ok(breaks.every((b) => b % 1 === 0), `nice numbers ${breaks}`);
  assert.ok(Math.min(...counts) >= 6, `every class used: ${counts}`);
});

test('long-tailed density (hunters per sq mi) gets fine low breaks', () => {
  const r = rng(7);
  const v = Array.from({ length: 120 }, () => Math.exp(r() * 3) / 4); // 0.25 .. 5
  const { breaks, counts } = classBreaks(v);
  assert.ok(breaks.length >= 4, `${breaks}`);
  assert.ok(breaks[0] < 1, `${breaks}`);
  assert.equal(counts.reduce((a, b) => a + b, 0), 120);
});

test('lump at zero (Access Yes!) collapses into one bottom class', () => {
  const r = rng(3);
  const v = [...Array(60).fill(0), ...Array.from({ length: 40 }, () => r() * 10)];
  const { breaks, counts } = classBreaks(v);
  assert.ok(breaks[0] > 0, `${breaks}`);
  assert.ok(counts[0] >= 60);
});

test('fractions (success 0-1) work the same as percents', () => {
  const r = rng(11);
  const v = Array.from({ length: 80 }, () => 0.05 + r() * 0.4);
  const { breaks } = classBreaks(v);
  assert.equal(breaks.length, 5);
  assert.ok(breaks.every((b) => b > 0 && b < 0.5), `${breaks}`);
});

test('degenerate input', () => {
  assert.deepEqual(classBreaks([]).breaks, []);
  assert.deepEqual(classBreaks([5, 5, 5, 5, 5]).breaks, []);
  assert.deepEqual(countClasses([1, 2, 3], [2]), [1, 2]);
});
