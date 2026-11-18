import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAPS, onStyleReady } from '../src/lib/basemap';

function fakeMap(loaded = false) {
  const handlers: Record<string, (() => void)[]> = {};
  return {
    style: { _loaded: loaded },
    once(ev: string, fn: () => void) { (handlers[ev] ??= []).push(fn); return this; },
    fire(ev: string) { (handlers[ev] ?? []).forEach((f) => f()); },
  };
}

test('outlines draw on style.load without waiting for basemap tiles', () => {
  const m = fakeMap(); let n = 0;
  onStyleReady(m, () => { n++; });
  m.fire('style.load');
  assert.equal(n, 1);
  m.fire('load'); // load arriving later must not draw them twice
  assert.equal(n, 1);
});

test('runs at once when the style is already parsed, and still once only', () => {
  const m = fakeMap(true); let n = 0;
  onStyleReady(m, () => { n++; });
  m.fire('style.load'); m.fire('load');
  assert.equal(n, 1);
});

test('basemaps avoid the retired USGSImageryTopo service', () => {
  for (const url of Object.values(BASEMAPS)) assert.doesNotMatch(url, /USGSImageryTopo/);
});
