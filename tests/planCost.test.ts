import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestPrereqs, type PlanPrereq } from '../src/lib/planCost';

// Washington nonresident prices (WDFW, checked Nov 12, 2026) plus youth, as the planner passes them
const WA: PlanPrereq[] = [
  { label: 'Deer', amount: 599.07, covers: ['DEER'] },
  { label: 'Elk', amount: 685.6, covers: ['ELK'] },
  { label: 'Deer + elk', amount: 1020.06, covers: ['DEER', 'ELK'] },
  { label: 'Youth deer', amount: 29.82, covers: ['DEER'], group: 'youth' },
];

test('one species buys that license only', () => {
  assert.deepEqual(cheapestPrereqs(WA, ['ELK', 'ELK'])?.map((p) => p.label), ['Elk']);
});
test('deer and elk together take the cheaper combined license', () => {
  assert.deepEqual(cheapestPrereqs(WA, ['DEER', 'ELK'])?.map((p) => p.label), ['Deer + elk']);
});
test('no needs, no licenses; youth uses its own prices; uncoverable is null', () => {
  assert.deepEqual(cheapestPrereqs(WA, []), []);
  assert.deepEqual(cheapestPrereqs(WA, ['DEER'], 'youth')?.map((p) => p.label), ['Youth deer']);
  assert.equal(cheapestPrereqs(WA, ['ELK'], 'youth'), null);
});
