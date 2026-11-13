import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWaForm, readWaPoints, waPointType, waTagAllows, WA_POINT_TYPES } from '../src/lib/waPoints';
import { waPersonal, waLicense } from '../src/lib/waHunt';
import { evaluateHunt, matchesSearch, searchFilters, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

type H = Record<string, unknown> & { id: string; tagCode: string; species: string; type: string; units: string[]; privateOnly: boolean;
  oddsByPts: { last: Record<string, number[]>; proj: Record<string, number[]> }; pointOdds: { kind: string; category: string; tag?: string; multiSeason?: boolean; seed?: string } };
const data = JSON.parse(readFileSync('data/wa/hunts.json', 'utf8')) as { problems: string[]; hunts: H[] };
const units = new Set((JSON.parse(readFileSync('data/wa/units.json', 'utf8')) as { units: { name: string }[] }).units.map((u) => u.name));
const by = (id: string) => data.hunts.find((h) => h.id === id)!;
const row = (h: H) => ({ ...h, scoreQuality: 50, success5: (h.success5 as number | null) ?? null }) as unknown as CoScored;

test('Washington is listed, with a private-land-only rule', () => {
  assert.equal(STATES.WA.enabled, true);
  assert.equal(STATES.WA.code, 'WA');
  assert.ok(STATES.WA.privateLandOnly.includes('Private Lands Only'));
  assert.deepEqual(STATES.WA.species, ['DEER', 'ELK']);
});

test('Washington hunts build cleanly: unique ids, known units, monotone odds', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  for (const h of data.hunts) {
    assert.ok(h.units.length > 0 && h.units.every((u) => units.has(u)), h.id);
    for (const m of ['last', 'proj'] as const) for (const a of Object.values(h.oddsByPts[m])) for (let i = 1; i < a.length; i++) assert.ok(a[i] + 1e-9 >= a[i - 1], `${h.id} ${m}`);
  }
  // residents and nonresidents are one drawing
  for (const h of data.hunts.filter((x) => x.type === 'CONTROLLED')) assert.deepEqual(h.oddsByPts.last.res, h.oddsByPts.last.nr, h.id);
});

test('odds follow (points + 1)² entries: a cutoff u gives 1 - (1 - u)^((N + 1)²)', () => {
  const h = by('WA:1000');
  const u = (h.pointOdds as unknown as { cutoff: { last: number } }).cutoff.last;
  for (const n of [0, 3, 8]) assert.ok(Math.abs(h.oddsByPts.last.res[n] - (1 - (1 - u) ** ((n + 1) ** 2))) < 1e-4);
});

test('private-land-only permits: note J or "Private Lands Only" in the area', () => {
  assert.equal(by('WA:2014').privateOnly, true); // Couse: "GMU 181; Private Lands Only"
  assert.ok(data.hunts.filter((h) => h.privateOnly).length >= 5);
});

test('point types, tags and the preferences form', () => {
  assert.equal(waPointType('Quality Elk'), 'QUALITY_ELK');
  assert.equal(waPointType('General'), null);
  assert.equal(waTagAllows('Any', 'DEER', { deerTag: 'ARCHERY', elkTag: null }), true);
  assert.equal(waTagAllows('Modern', 'DEER', { deerTag: 'ARCHERY', elkTag: null }), false);
  assert.equal(waTagAllows('EF, EM', 'ELK', { deerTag: null, elkTag: 'WF' }), false);
  assert.equal(waTagAllows('EF, EM', 'ELK', { deerTag: null, elkTag: 'EM' }), true);
  assert.equal(waTagAllows('EF', 'ELK', { deerTag: null, elkTag: 'MULTI' }), true);
  assert.equal(waTagAllows('Modern', 'DEER', { deerTag: null, elkTag: null }), null);
  const f = new Map<string, string>([['waResidency', 'RESIDENT'], ['waDeerTag', 'MODERN'], ['waElkTag', 'EA'], ...WA_POINT_TYPES.map((t) => ['waPts_' + t.key, '3'] as [string, string])]);
  const parsed = parseWaForm((k) => f.get(k) ?? null, (k) => f.has(k));
  assert.ok(parsed && typeof parsed === 'object');
  const back = readWaPoints({ WA: parsed });
  assert.equal(back.points.QUALITY_ELK, 3);
  assert.equal(back.elkTag, 'EA');
  f.set('waPts_BULL_ELK', '99');
  assert.equal(typeof parseWaForm((k) => f.get(k) ?? null, (k) => f.has(k)), 'string');
});

test('personal odds use the category balance; general seasons are over the counter', () => {
  const pts = readWaPoints({ WA: { res: 'NONRESIDENT', waPoints: { QUALITY_DEER: 10 }, set: true } });
  const q = by('WA:1000');
  const p = waPersonal(q, pts);
  assert.equal(p.points, 10);
  assert.equal(p.odds, q.oddsByPts.proj.res[10]);
  assert.ok(p.projected);
  assert.equal(waPersonal(q, pts, 'last').odds, q.oddsByPts.last.res[10]);
  const g = data.hunts.find((h) => h.type === 'GENERAL')!;
  assert.equal(waPersonal(g, pts).odds, 1);
  assert.equal(waLicense(g), 'general');
  assert.equal(waLicense(by('WA:MS-ELK')), 'multi');
});

test('Washington filters narrow only Washington rows', () => {
  const settings = { ID: 'NONRESIDENT', CO: { res: 'NONRESIDENT' }, WA: readWaPoints(null) } as unknown as HunterSettings;
  const sp = { states: 'WA', waLic: 'general' };
  const f = searchFilters(sp);
  const gen = evaluateHunt(row(data.hunts.find((h) => h.type === 'GENERAL')!), settings, 'proj');
  const spec = evaluateHunt(row(by('WA:1000')), settings, 'proj');
  assert.equal(matchesSearch(gen, f, sp), true);
  assert.equal(matchesSearch(spec, f, sp), false);
  const elkW = data.hunts.find((h) => h.type === 'GENERAL' && h.species === 'ELK' && (h.pointOdds as unknown as { side: string }).side === 'WEST')!;
  assert.equal(matchesSearch(evaluateHunt(row(elkW), settings, 'proj'), searchFilters({ waSide: 'EAST' }), { waSide: 'EAST' }), false);
});

test('Washington general hunts follow the 2026 season tables, not the harvest report', () => {
  const ids = new Set(data.hunts.map((h) => h.id));
  // permit only (653 White River elk) and Master-Hunter-only (371 Alkali modern elk) GMUs have no general hunt
  for (const id of ['WA:GE-653-ANY', 'WA:GE-653-ARCHERY', 'WA:GE-371-ANY']) assert.ok(!ids.has(id), id);
  const e101 = by('WA:GE-101-ANY');
  assert.equal(e101.antlerClass, 'ANTLERED');
  assert.equal(e101.openDate, '2026-10-31');
  assert.equal(e101.closeDate, '2026-11-08');
  assert.match(String(e101.takeMethod), /Any bull/);
  // GMU 101 modern deer: white-tailed any buck, mule deer 3 pt. min.
  assert.match(String(by('WA:GD-101-ANY').takeMethod), /White-tailed deer: Any buck.*Mule deer: Buck, 3 pt\. min\./);
  assert.equal(by('WA:GE-334-ARCHERY').antlerClass, 'EITHER');   // spike bull or antlerless
  for (const h of data.hunts.filter((x) => x.type === 'GENERAL')) {
    const ts = h.tagSeasons as { seasons: { dates: { open: string; close: string }[] }[] };
    assert.ok(ts.seasons.length > 0 && h.openDate && h.closeDate, h.id);
  }
});
