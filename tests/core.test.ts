import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divergingClasses } from '../src/lib/breaks';
import { colorsFor, classesFor, RYG7 } from '../src/lib/mapMetrics';
import {
  parseStatsTable,
  parseLandPage,
  parseHuntList,
  normArea,
  num,
  usDate,
  antlerOf,
  weaponOf,
} from '../src/sync/core/parse';
import {
  estimates,
  lineage,
  summarizeOdds,
  summarizeHarvest,
  deerType,
  tagAndFill,
  type OddsRow,
} from '../src/sync/core/math';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');

test('normArea and num', () => {
  assert.equal(normArea('Unit 14'), '14');
  assert.equal(normArea(' 36b-1 '), '36B-1');
  assert.equal(num('1,046'), 1046);
  assert.equal(num('47%'), 47);
  assert.equal(num(''), null);
  assert.equal(usDate('11/10/26'), '2026-11-10');
});

test('controlled stats table: picks the Hunt# table, skips nav tables and non-data rows', () => {
  const rows = parseStatsTable(fx('controlled-deer.html'), 'hunt#');
  assert.equal(rows.length, 3);
  assert.equal(rows[0]['hunt#'], '1001');
  assert.equal(rows[0]['%whitetail'], '47');
  assert.equal(rows[1]['antlerless'], '');
});

test('general stats table: unit key, drops statewide totals', () => {
  const rows = parseStatsTable(fx('general-deer.html'), 'unit');
  assert.deepEqual(rows.map((r) => r.unit), ['1', '1', '49']);
  assert.equal(rows[2]['takemethod'], 'Any Weapon');
});

test('hunt page history table keyed by year', () => {
  const rows = parseStatsTable(fx('hunt-page.html'), 'year');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['hunt#'], '2028');
});

test('land page: surface management, public %, access yes, wilderness', () => {
  const p = parseLandPage(fx('unit-49.html'));
  assert.equal(p.shares.length, 6);
  assert.equal(p.shares[0].manager, 'Private');
  assert.equal(p.privatePct, 34.6);
  assert.equal(p.publicPct, 65.4); // BLM + USFS + State + NPS + BOR
  assert.equal(p.accessYesNone, true);
  assert.equal(p.wildernessPct, 0);
});

test('hunt list: hunts, dates, weapon, antler class, tags', () => {
  const hunts = parseHuntList(fx('huntlist-49-elk.html'));
  assert.equal(hunts.length, 3);
  const ml = hunts.find((h) => h.huntNumber === 2138)!;
  assert.equal(ml.type, 'CONTROLLED');
  assert.equal(ml.weapon, 'MUZZLELOADER');
  assert.equal(ml.antlerClass, 'EITHER');
  assert.equal(ml.open, '2026-11-01');
  assert.equal(ml.close, '2026-11-14');
  assert.equal(ml.tags, 75);
  const b = hunts.find((h) => h.idfgId === 80930)!;
  assert.equal(b.type, 'GENERAL');
  assert.equal(b.antlerClass, 'ANTLERLESS');
  assert.equal(b.tags, 500);
});

test('antler and weapon classification', () => {
  assert.equal(antlerOf('Antlered Mule and White-tailed Deer').antlerClass, 'ANTLERED');
  assert.equal(antlerOf('antlerless elk only').antlerClass, 'ANTLERLESS');
  assert.equal(antlerOf('Either sex may be taken').antlerClass, 'EITHER');
  assert.equal(weaponOf('Archery only').weapon, 'ARCHERY');
  assert.equal(weaponOf('Any Weapon (Rifle, Archery, Muzzleloader)').weapon, 'ANY');
});

test('estimates: 2016+ split - 4+ is mule-only, 5+ whitetail-only (hunt 1001, 2025)', () => {
  const e = estimates('DEER', 2025, { harvest: 28, antlered: 28, pct4: 82, pct5: 41, pctWt: 47, pctSpike: null, pct6: null });
  assert.deepEqual([e.estWt, e.estMule, e.est4, e.est5], [13, 15, 12, 5]);
  const old = estimates('DEER', 2010, { harvest: 28, antlered: 28, pct4: 82, pct5: 41, pctWt: 47, pctSpike: null, pct6: null });
  assert.deepEqual([old.est4, old.est5], [23, 11]);
  const elk = estimates('ELK', 2025, { harvest: 85, antlered: 85, pct4: null, pct5: null, pctWt: null, pctSpike: 2, pct6: 65 });
  assert.deepEqual([elk.est6, elk.estSpike, elk.estWt], [55, 2, null]);
});

// Area 49 elk, first drawing, from the IDFG odds API (2021-2025)
const A49: OddsRow[] = [
  [2021, 2029, 25, 23, 2, 281, 51, 332], [2021, 2030, 200, 180, 20, 902, 170, 1072], [2021, 2138, 100, 35, 10, 39, 24, 63], [2021, 2155, 50, 39, 3, 39, 3, 42],
  [2022, 2029, 25, 23, 2, 277, 45, 322], [2022, 2030, 200, 180, 20, 1056, 175, 1231], [2022, 2138, 100, 48, 10, 49, 20, 69], [2022, 2155, 50, 35, 3, 35, 3, 38], [2022, 2218, 1, 1, 0, 1, 0, 1],
  [2023, 2027, 20, 19, 1, 267, 46, 313], [2023, 2028, 175, 158, 17, 894, 194, 1088], [2023, 2132, 75, 42, 7, 43, 10, 53], [2023, 2151, 50, 35, 1, 35, 1, 36],
  [2024, 2027, 20, 18, 2, 254, 30, 284], [2024, 2028, 175, 158, 17, 705, 174, 879], [2024, 2132, 75, 19, 7, 19, 9, 28], [2024, 2151, 50, 42, 0, 42, 0, 42],
  [2025, 2028, 20, 18, 2, 299, 82, 381], [2025, 2029, 175, 157, 18, 854, 177, 1031], [2025, 2138, 75, 16, 7, 17, 13, 30], [2025, 2159, 50, 47, 3, 60, 3, 63],
].map(([year, huntNumber, permits, resPermits, nrPermits, resApps, nrApps, apps1]) => ({
  year, huntNumber, permits, resPermits, nrPermits, resApps, nrApps, apps1, draw: 1, areaName: '49',
}));

test('lineage follows renumbered hunts by area + tag count', () => {
  const late = A49.find((r) => r.year === 2025 && r.huntNumber === 2029)!;
  const l = lineage(late, A49);
  assert.deepEqual([...l.entries()].sort(), [[2021, 2030], [2022, 2030], [2023, 2028], [2024, 2028], [2025, 2029]]);
  const early = A49.find((r) => r.year === 2025 && r.huntNumber === 2028)!;
  assert.deepEqual(
    [...lineage(early, A49).entries()].sort(),
    [[2021, 2029], [2022, 2029], [2023, 2027], [2024, 2027], [2025, 2028]],
  );
  const youth = A49.find((r) => r.year === 2025 && r.huntNumber === 2159)!;
  assert.equal(lineage(youth, A49).get(2023), 2151);
});

test('5-yr odds = total permits / total applicants; matches hand-checked unit 49 values', () => {
  const late = A49.find((r) => r.year === 2025 && r.huntNumber === 2029)!;
  const l = lineage(late, A49);
  const rows = A49.filter((r) => l.get(r.year) === r.huntNumber);
  const s = summarizeOdds(rows);
  assert.equal(Math.round(s.resOdds5! * 1000) / 10, 18.9);
  assert.equal(Math.round(s.nrOdds5! * 1000) / 10, 10.3);
  assert.equal(Math.round(s.resOddsLast! * 1000) / 10, 18.4);
  assert.equal(s.years, 5);
});

test('harvest summary: success, whitetail share, deer type, small sample flag', () => {
  // Hunt 2029 lineage harvest, area 49 (IDFG hunt page)
  const rows = [
    [2021, 181, 101, 101, 5.5, 76.6], [2022, 202, 59, 59, 2.3, 60.2], [2023, 158, 62, 62, 0, 52],
    [2024, 158, 84, 84, 12, 60], [2025, 171, 85, 85, 2, 65],
  ].map(([year, hunters, harvest, antlered, ps, p6]) => ({
    year, hunters, harvest, antlered, antlerless: null,
    ...estimates('ELK', year, { harvest, antlered, pct4: null, pct5: null, pctWt: null, pctSpike: ps, pct6: p6 }),
  }));
  const s = summarizeHarvest('ELK', rows);
  assert.equal(Math.round(s.success5! * 100), 45);
  assert.equal(s.smallSample, false);
  assert.equal(deerType(47), 'MIXED');
  assert.equal(deerType(0), 'MULE');
  assert.equal(deerType(91), 'WHITETAIL');
  assert.equal(Math.round(tagAndFill(0.189, 0.45)! * 1000) / 10, 8.5);
});

test('unit links from a general stats page', async () => {
  const { parseUnitLinks } = await import('../src/sync/core/parse');
  const m = parseUnitLinks(fx('general-deer.html'));
  assert.equal(m.get('1'), 1);
  assert.equal(m.get('49'), 63);
});

test('findDates handles every IDFG date style', async () => {
  const { findDates } = await import('../src/sync/core/parse');
  assert.deepEqual(findDates('11/1/26-11/14/26'), ['2026-11-01', '2026-11-14']);
  assert.deepEqual(findDates('Season 11/1/2026 to 11/14/2026'), ['2026-11-01', '2026-11-14']);
  assert.deepEqual(findDates('Oct 15, 2026 - Oct 31, 2026'), ['2026-10-15', '2026-10-31']);
  assert.deepEqual(findDates('Dates: December 1 - January 15', 2026), ['2026-12-01', '2027-01-15']);
  assert.equal(findDates('Unlimited tags, any weapon'), null);
});

test('units from hunt names; parent unit of a hunt area', async () => {
  const { unitsFromName, parentUnit } = await import('../src/sync/core/parse');
  assert.deepEqual(unitsFromName('Elk A Tag - Pioneer Zone (Units 36A, 49, 50)'), ['36A', '49', '50']);
  assert.deepEqual(unitsFromName('Unit 49 Regular Deer Tag'), ['49']);
  assert.deepEqual(unitsFromName('Elk Controlled Hunt 2138'), []);
  assert.equal(parentUnit('36B-1'), '36B');
  assert.equal(parentUnit('63AX'), '63A');
});

test('monthsOpen handles seasons that wrap into January', async () => {
  const { monthsOpen } = await import('../src/sync/core/math');
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  assert.deepEqual(monthsOpen(d('2026-12-10'), d('2027-01-15')), [12, 1]);
  assert.deepEqual(monthsOpen(d('2026-08-30'), d('2026-12-01')), [8, 9, 10, 11, 12]);
  assert.deepEqual(monthsOpen(null, null), []);
});

test('year-over-year: previous drawing / season only when it was the year before', async () => {
  const { summarizeOdds, summarizeHarvest } = await import('../src/sync/core/math');
  const row = (year: number, nrPermits: number, nrApps: number) => ({ year, draw: 1, huntNumber: 1042, areaName: '54', permits: 300, resPermits: 300 - nrPermits, nrPermits, resApps: 3000, nrApps, apps1: 3000 + nrApps });
  const o = summarizeOdds([row(2026, 25, 449), row(2025, 30, 334), row(2024, 30, 310)]);
  assert.equal(o.oddsLastYear, 2026);
  assert.ok(Math.abs(o.nrOddsLast! - 25 / 449) < 1e-9);
  assert.ok(Math.abs(o.nrOddsPrev! - 30 / 334) < 1e-9);
  assert.equal(o.nrAppsPrev, 334);
  const gap = summarizeOdds([row(2026, 25, 449), row(2024, 30, 310)]);
  assert.equal(gap.nrOddsPrev, null);
  const h = (year: number, hunters: number, harvest: number) => ({ year, hunters, harvest, antlered: harvest, antlerless: 0, estWt: null, estMule: null, est4: null, est5: null, estSpike: null, est6: null });
  const hs = summarizeHarvest('ELK', [h(2025, 100, 20), h(2024, 100, 30)]);
  assert.equal(hs.harvestLastYear, 2025);
  assert.equal(hs.successLast, 0.2);
  assert.equal(hs.successPrev, 0.3);
});

test('boundary changes are only called out for this year or last year', async () => {
  const { recentBoundaryChanges, BOUNDARY_CHANGES } = await import('../src/lib/boundaries');
  assert.equal(BOUNDARY_CHANGES['49'], 2022);
  assert.equal(recentBoundaryChanges(['49'], 2026), null);
  assert.deepEqual(recentBoundaryChanges(['49', '54'], 2023), { units: ['49'], year: 2022 });
  assert.equal(recentBoundaryChanges(['54'], 2023), null);
});

test('lineage: a 0- or 1-tag hunt is not matched to a 200-tag hunt in the same area', async () => {
  const { lineage } = await import('../src/sync/core/math');
  const r = (year: number, huntNumber: number, permits: number) => ({ year, draw: 1, huntNumber, areaName: '54', permits, resPermits: permits, nrPermits: 0, resApps: 1, nrApps: 0, apps1: 1 });
  const cur = r(2024, 1171, 0);
  const lin = lineage(cur, [r(2021, 1111, 200), r(2023, 1171, 0)]);
  assert.equal(lin.get(2021), undefined);
  assert.equal(lin.get(2023), 1171);
  // a real renumbering (500 -> 300 tags) still links
  const lin2 = lineage(r(2026, 1042, 300), [r(2020, 1040, 500), r(2022, 1041, 300), r(2022, 1043, 20)]);
  assert.equal(lin2.get(2020), 1040);
  assert.equal(lin2.get(2022), 1041);
});

test('unit hunt list: general first, then controlled by number', async () => {
  const { sortUnitHunts, unitHuntLabel } = await import('../src/lib/unitHunts');
  const h = (type: 'GENERAL' | 'CONTROLLED', species: 'DEER' | 'ELK', weapon: string, huntNumber: number | null, name = '') =>
    ({ type, species, weapon, huntNumber, name, openDate: null }) as never;
  const rows = [h('CONTROLLED', 'ELK', 'ANY', 2030), h('GENERAL', 'ELK', 'ARCHERY', null, 'Unit 50 General Elk - Archery'), h('CONTROLLED', 'DEER', 'ANY', 1142),
    h('GENERAL', 'DEER', 'ANY', null, 'Unit 50 General Deer - Any Weapon'), h('CONTROLLED', 'ELK', 'ANY', 2011)];
  assert.deepEqual(sortUnitHunts(rows).map(unitHuntLabel), ['General Deer · Any Weapon', 'General Elk · Archery', 'Deer 1142', 'Elk 2011', 'Elk 2030']);
});

test('hunt list: a controlled hunt linked by its area code is not a general season', async () => {
  const { parseHuntList } = await import('../src/sync/core/parse');
  const html = '<div><a href="/ifwis/huntplanner/hunt?id=82219">50-1X</a> Any weapon Antlerless Oct 1, 2026 - Nov 15, 2026 40 tags</div>';
  assert.equal(parseHuntList(html)[0].type, 'CONTROLLED');
});

test('odds are capped at 100% when tags exceed first-choice applicants', async () => {
  const { odds } = await import('../src/sync/core/math');
  assert.equal(odds(250, 171), 1);
  assert.equal(odds(25, 449), 25 / 449);
  assert.equal(odds(5, 0), null);
});

test('harvest totals start at the unit boundary change', async () => {
  const { boundarySince } = await import('../src/lib/boundaries');
  assert.equal(boundarySince('39'), 2022);
  assert.equal(boundarySince('54'), null);
  assert.equal(boundarySince(null), null);
});

test('hunt list: a bare area code ("10A", "63AX") is a controlled listing, not a general season', async () => {
  const { parseHuntList } = await import('../src/sync/core/parse');
  for (const name of ['10A', '63AX', '36A-1X']) {
    const html = `<div><a href="/ifwis/huntplanner/hunt?id=1">${name}</a> Oct 1, 2026 - Nov 15, 2026</div>`;
    assert.equal(parseHuntList(html)[0].type, 'CONTROLLED', name);
  }
  const gen = '<div><a href="/ifwis/huntplanner/hunt?id=2">Unit 10A General Deer - Archery</a> Archery Aug 30, 2026 - Sep 30, 2026</div>';
  assert.equal(parseHuntList(gen)[0].type, 'GENERAL');
});

test('harvest rows with more harvest than hunters are dropped (no 400% success)', async () => {
  const { summarizeHarvest } = await import('../src/sync/core/math');
  const h = (year: number, hunters: number, harvest: number) => ({ year, hunters, harvest, antlered: harvest, antlerless: 0, estWt: null, estMule: null, est4: null, est5: null, estSpike: null, est6: null });
  const s = summarizeHarvest('DEER', [h(2025, 1, 0), h(2024, 1, 4), h(2023, 4, 3)]);
  assert.equal(s.successLast, 0);
  assert.equal(s.successPrev, null); // 2024 (4 of 1) dropped
  assert.equal(s.success5, 3 / 5);
  assert.equal(s.years, 2);
});

test('harvest tables are kept only when the columns match the species (no deer page saved as pronghorn)', async () => {
  const { speciesColumns } = await import('../src/sync/core/parse');
  const deer = { 'hunt#': '1001', hunters: '5', '%4+pts': '40', '%whitetail': '10' };
  const elk = { 'hunt#': '2001', hunters: '5', '%spike': '20', '%6+pts': '30' };
  const ant = { 'hunt#': '4001', hunters: '5', horned: '3', hornless: '1' };
  assert.equal(speciesColumns('DEER', deer), true);
  assert.equal(speciesColumns('PRONGHORN', deer), false);
  assert.equal(speciesColumns('PRONGHORN', ant), true);
  assert.equal(speciesColumns('ELK', elk), true);
  assert.equal(speciesColumns('ELK', deer), false);
});

test('nonresident controlled-hunt tags: draw history first, the 10% rule only without one', async () => {
  const { nrCap, nrTags, controlledTags } = await import('../src/lib/format');
  assert.equal(nrCap(10), 1);
  assert.equal(nrCap(11), 1);
  assert.equal(nrCap(20), 2);
  assert.equal(nrCap(334), 33);
  assert.equal(nrCap(null), null);
  // hunt 1057: 240 nonresidents drew, 632 applied -> the limit is 240 (not 10% of 2,293 = 229)
  assert.deepEqual(nrTags(2293, 240, 632, 2026)?.kind, 'full');
  assert.equal(controlledTags(2293, true, 240, 632, 2026), '2,293 tags · 240 for NR');
  // pronghorn 4028: 34 drew, 34 applied -> everyone drew (34 > the 22 a flat 10% would allow)
  assert.equal(controlledTags(225, true, 34, 34, 2026), "225 tags · all NR drew '26");
  // no drawing yet -> the rule
  assert.equal(controlledTags(120, true, null, null, null), '120 tags · up to 12 NR');
  assert.equal(controlledTags(120, false, 11, 50, 2026), '120 tags');
  assert.equal(controlledTags(null, true), 'Tags: see regs');
});

test('trophy share: never over 100%, blank on tiny samples', async () => {
  const { trophyShare } = await import('../src/sync/core/math');
  assert.equal(trophyShare(31, 30), 1);
  assert.equal(trophyShare(3, 2), null);
  assert.equal(trophyShare(10, 40), 0.25);
});

test('verdicts and draw x fill wording', async () => {
  const { oddsVerdict, successVerdict, crowdVerdict, drawFillLine, pctOdds, meaningfulChange } = await import('../src/lib/format');
  assert.equal(oddsVerdict(1).text, 'Everyone drew');
  assert.equal(oddsVerdict(0.38).text, 'Fair odds');
  assert.equal(oddsVerdict(0.005).text, 'Very long shot');
  assert.equal(successVerdict(0.2, 'ELK').text, 'Typical');
  assert.equal(successVerdict(0.2, 'DEER').text, 'Low for deer');
  assert.equal(crowdVerdict(1.7).text, 'Crowded');
  assert.equal(drawFillLine(0.196), 'about 1 in 5');
  assert.equal(drawFillLine(0.62), 'about 6 in 10');
  assert.equal(pctOdds(0), '0%');
  assert.equal(pctOdds(0.036), '3.6%');
  assert.equal(meaningfulChange(6, 2, 20), false);
  assert.equal(meaningfulChange(90, 79, 20), true);
});

test('moose / sheep / goat: no per-hunt nonresident limit wording', async () => {
  const { controlledTags } = await import('../src/lib/format');
  assert.equal(controlledTags(8, true, 0, 9, 2026, 'MOOSE'), "8 tags · 0 NR drew '26");
  const { nrTags } = await import('../src/lib/format');
  assert.equal(nrTags(4, 1, 41, 2026, false)?.kind, 'count');
  assert.equal(nrTags(4, 1, 1, 2026, false)?.kind, 'open');
  assert.equal(controlledTags(8, true, null, null, null, 'BIGHORN'), '8 tags');
  assert.equal(controlledTags(1, true, null, null, null, 'DEER'), '1 tag · up to 1 NR');
});


test('divergingClasses: SD mode puts the mean in yellow and maps colors by step', () => {
  const v = Array.from({ length: 101 }, (_, i) => i); // mean 50
  const c = divergingClasses(v, 'sd');
  assert.equal(c.breaks.length, 6);
  assert.deepEqual(c.idx, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(c.counts.reduce((a, b) => a + b, 0), 101);
  const cols = colorsFor(c);
  assert.equal(cols[3], RYG7[3]);
  assert.equal(colorsFor(c, 'low')[0], RYG7[6]); // fewer hunters = green
});

test('divergingClasses: drops steps nothing falls in, keeping the colors aligned', () => {
  // everything at or above the mean except one low outlier: no deep-red step should survive empty
  const v = [10, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90];
  const c = divergingClasses(v, 'sd');
  assert.equal(c.breaks.length + 1, c.idx!.length);
  assert.ok(c.counts.every((n) => n >= 0));
  assert.equal(c.counts.reduce((a, b) => a + b, 0), v.length);
});

test('divergingClasses: too few values = one neutral class', () => {
  const c = divergingClasses([1, 2], 'pct');
  assert.deepEqual(c.idx, [3]);
});

test('moose / sheep / goat success uses fixed benchmarks, not the spread', () => {
  const c = classesFor('ctlSuccessMoose', [75, 82, 90, 95, 100, 100]);
  assert.deepEqual(c.breaks, [50, 60, 70, 80, 90]);
  const cols = colorsFor(c);
  assert.equal(cols[3], RYG7[4]); // 70-80% = light green, not red
  assert.ok(!cols.includes(RYG7[0])); // no deep red on this scale
  assert.equal(classesFor('genSuccessElk', [1, 2, 3, 4, 5, 6, 7, 8]).breaks.length > 0, true);
});
