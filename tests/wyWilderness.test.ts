import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wyWilderness, wyHuntWilderness, wildernessPctLabel } from '../src/lib/wyWilderness';
import { albers, computeWilderness, toOutput, SLIVER_ACRES } from '../scripts/wy_build_wilderness.mjs';

const doc = JSON.parse(readFileSync(new URL('../data/wy/wilderness.json', import.meta.url), 'utf8'));
const units = JSON.parse(readFileSync(new URL('../data/wy/units.json', import.meta.url), 'utf8')).units as { name: string; acres: number }[];
const unitNames = new Set(units.map((u) => u.name));

test('wilderness boundaries integrate to their published acreage (Wyoming-only areas)', () => {
  assert.equal(doc.wilderness.length, 15);
  for (const w of doc.wilderness) {
    if (w.state !== 'WY') continue;
    assert.ok(Math.abs(w.acres - w.publishedAcres) / w.publishedAcres < 0.015, w.name);
  }
});

test('every listed hunt area exists, and its share matches its acres', () => {
  for (const [name, a] of Object.entries(doc.areas) as [string, { pct: number; wildAcres: number; acres: number; wilderness: { acres: number }[] }][]) {
    assert.ok(unitNames.has(name), name);
    assert.equal(a.wildAcres, a.wilderness.reduce((t, w) => t + w.acres, 0), name);
    assert.ok(a.wilderness.every((w) => w.acres >= SLIVER_ACRES), name);
    assert.ok(Math.abs(a.pct - (100 * a.wildAcres) / a.acres) <= 0.06, name);
    assert.ok(a.pct > 0 && a.pct <= 100, name);
  }
});

test('known areas: Teton and Washakie country is nearly all wilderness; plains areas have none', () => {
  assert.ok(wyWilderness('E60')!.pct > 95);
  assert.equal(wyWilderness('E60')!.wilderness[0].name, 'Teton Wilderness');
  assert.ok(wyWilderness('D114')!.pct > 95);
  assert.equal(wyWilderness('A1'), null);
  assert.equal(wyWilderness('E7'), null);
  // boundary slivers along a shared edge are not counted as wilderness inside the area
  assert.equal(wyWilderness('E79'), null);
  assert.ok(doc.slivers.E79);
});

test('a license lists only its areas that contain wilderness, largest share first', () => {
  const hits = wyHuntWilderness(['D113', 'D1', 'D114']);
  assert.deepEqual(hits.map((h) => h.unit), ['D114', 'D113']);
  assert.equal(wildernessPctLabel(0.87), '<1%');
  assert.equal(wildernessPctLabel(45), '45%');
});

test('the build integrates a square exactly and drops slivers', () => {
  // EPSG:5070 origin (23N, 96W) projects to (0, 0)
  const [x0, y0] = albers(-96, 23);
  assert.ok(Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6);
  const sq = (lon: number, lat: number, d: number) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
  const res = computeWilderness(
    [{ name: 'X1', geometry: sq(-108, 43, 0.2) }],
    [
      { properties: { NAME: 'Half Wilderness', STATE: 'WY', Acreage: 1 }, geometry: sq(-108, 43, 0.1) },
      { properties: { NAME: 'Edge Wilderness', STATE: 'WY', Acreage: 1 }, geometry: sq(-107.8005, 43, 0.1) },
    ],
  );
  const a = res.areas.X1;
  assert.ok(Math.abs(a.wilderness.find((w) => w.name === 'Half Wilderness')!.acres / a.acres - 0.25) < 0.01);
  const out = toOutput(res, '2026-11-10');
  assert.deepEqual(out.areas.X1.wilderness.map((w) => w.name), ['Half Wilderness']);
  assert.equal(out.slivers.X1[0].name, 'Edge Wilderness');
});
