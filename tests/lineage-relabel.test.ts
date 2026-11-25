import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineage, lineageHarvest, parentArea, type OddsRow } from '../src/sync/core/math';

// Production DrawOdds rows, Nov 25, 2026 (scripts/id-audit-read.ts).
const r = (year: number, huntNumber: number, areaName: string, permits: number): OddsRow =>
  ({ year, draw: 1, huntNumber, areaName, permits, resPermits: null, nrPermits: null, resApps: null, nrApps: null, apps1: null });
const deer = [
  r(2019, 1074, '21-1', 10), r(2020, 1074, '21-1', 10), r(2021, 1074, '39-2', 60), r(2022, 1074, '39-2', 60), r(2023, 1074, '39-2', 60), r(2024, 1074, '39-2', 60),
  r(2025, 1074, '41-2', 25), r(2026, 1074, '41-2', 25),
  r(2019, 1076, '39-2', 50), r(2020, 1076, '39-2', 50), r(2021, 1076, '41-1', 25), r(2022, 1076, '41-1', 25), r(2023, 1076, '41-1', 25), r(2024, 1076, '41-1', 25),
  r(2025, 1076, '44', 50), r(2026, 1076, '44', 50),
  r(2019, 1078, '41-1', 25), r(2020, 1078, '41-1', 25), r(2021, 1078, '44', 50), r(2022, 1078, '44', 50), r(2023, 1078, '44', 50), r(2024, 1078, '44', 50),
  r(2025, 1078, '52', 10), r(2026, 1078, '52', 10),
];

test('parent unit of an Idaho hunt area', () => {
  assert.equal(parentArea('41-1'), '41'); assert.equal(parentArea('41X'), '41'); assert.equal(parentArea('36A-3'), '36A'); assert.equal(parentArea('36A'), '36A');
});

test('1074 follows IDFG relabelling 41-1 to 41-2: the hunt planner lineage 1074 / 1076 / 1078', () => {
  const cur = deer.find((x) => x.year === 2026 && x.huntNumber === 1074)!;
  assert.deepEqual([...lineage(cur, deer).entries()].sort(), [[2025, 1074], [2026, 1074]], 'without relabels the history stops at the area name');
  assert.deepEqual([...lineage(cur, deer, { relabels: true }).entries()].sort(),
    [[2019, 1078], [2020, 1078], [2021, 1076], [2022, 1076], [2023, 1076], [2024, 1076], [2025, 1074], [2026, 1074]]);
});

test('today’s 1076 (Area 44) keeps its own history and never takes the old Area 41-1 rows', () => {
  const cur = deer.find((x) => x.year === 2026 && x.huntNumber === 1076)!;
  const lin = lineage(cur, deer, { relabels: true });
  assert.deepEqual([...lin.entries()].sort(), [[2021, 1078], [2022, 1078], [2023, 1078], [2024, 1078], [2025, 1076], [2026, 1076]]);
});

test('same number and tags across a relabel (elk 2133: 2025 "36A" -> 2026 "36A-3"), and no further back into other units', () => {
  const elk = [r(2023, 2133, '50-1', 50), r(2024, 2133, '50-1', 50), r(2025, 2133, '36A', 250), r(2026, 2133, '36A-3', 250)];
  assert.deepEqual([...lineage(elk[3], elk, { relabels: true }).entries()].sort(), [[2025, 2133], [2026, 2133]]);
});

test('a sibling area that still exists the next year is a different hunt, not a relabel', () => {
  const rows = [r(2025, 2001, '41-1', 100), r(2026, 2001, '41-1', 100), r(2026, 2281, '41X', 100)];
  assert.deepEqual([...lineage(rows[2], rows, { relabels: true }).entries()], [[2026, 2281]]);
});

test('tags must be within 10% to cross an area relabel', () => {
  const rows = [r(2025, 3050, '29', 8), r(2026, 3050, '29-1', 12)];
  assert.deepEqual([...lineage(rows[1], rows, { relabels: true }).entries()], [[2026, 3050]]);
});

test('winter hunts: a 2024 draw for a January 2025 hunt takes the 2025 harvest row, once', () => {
  const lin = new Map([[2026, 2281], [2024, 2281]]);
  const areas = new Map([[2026, '41X'], [2024, '41X']]);
  const h = (year: number, huntNumber: number, areaName: string) => ({ year, huntNumber, areaName, hunters: 1 });
  const drawn = new Set(['ELK|2024|2281', 'ELK|2026|2281']);
  assert.deepEqual(lineageHarvest(lin, areas, [h(2025, 2281, '41X')], drawn, 'ELK', { nextYear: true }).map((x) => x.year), [2025]);
  assert.deepEqual(lineageHarvest(lin, areas, [h(2025, 2281, '41X')], drawn, 'ELK'), [], 'off unless asked for');
  assert.deepEqual(lineageHarvest(lin, areas, [h(2025, 2281, '66X')], drawn, 'ELK', { nextYear: true }), [], 'other unit');
  assert.deepEqual(lineageHarvest(lin, areas, [h(2025, 2281, '41X')], new Set([...drawn, 'ELK|2025|2281']), 'ELK', { nextYear: true }), [], 'the number drew its own hunt that year');
  assert.deepEqual(lineageHarvest(lin, areas, [h(2024, 2281, '41X'), h(2025, 2281, '41X')], drawn, 'ELK', { nextYear: true }).map((x) => x.year), [2024], 'own year first');
  // production, Nov 25: odd years draw 41X's winter hunt as 2252, which the lineage already holds
  const lin2 = new Map([[2026, 2281], [2025, 2252], [2024, 2281], [2023, 2252]]);
  const areas2 = new Map([[2026, '41X'], [2025, '41X'], [2024, '41X'], [2023, '41X']]);
  const drawn2 = new Set(['ELK|2026|2281', 'ELK|2025|2252', 'ELK|2024|2281', 'ELK|2023|2252']);
  assert.deepEqual(lineageHarvest(lin2, areas2, [h(2025, 2281, '41X')], drawn2, 'ELK', { nextYear: true }).map((x) => [x.year, x.huntNumber]), [[2025, 2281]]);
});
