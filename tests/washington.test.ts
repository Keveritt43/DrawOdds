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
  assert.deepEqual(STATES.WA.species, ['DEER', 'ELK', 'MOOSE', 'BIGHORN', 'GOAT']);
  assert.deepEqual(STATES.WA.draws.map((d) => d.key), ['DEP', 'MSG']);
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

test('Washington youth permits: own category, own points, hidden unless asked for', async () => {
  const { waPointType } = await import('../src/lib/waPoints');
  const youth = data.hunts.filter((h) => h.youthOnly && (h.species === 'DEER' || h.species === 'ELK'));
  assert.ok(youth.length >= 100, `youth hunts ${youth.length}`);
  for (const h of youth) {
    assert.equal(h.type, 'CONTROLLED');
    assert.match(String(h.name), /Youth (Deer|Elk)$/);
    const cat = (h.pointOdds as { category: string }).category;
    assert.equal(waPointType(cat), h.species === 'DEER' ? 'YOUTH_DEER' : 'YOUTH_ELK');
  }
  // no adult hunt is flagged youth
  assert.ok(data.hunts.filter((h) => !h.youthOnly && /Youth/.test(String((h.pointOdds as { category?: string }).category))).length === 0);
  assert.equal(waPointType('Moose - Youth'), 'MOOSE_YOUTH');
});

test('Washington youth general days count only when the Youth Hunts filter lets them', async () => {
  const { matchesHuntSeason } = await import('../src/lib/huntSeasonFilter');
  const h = by('WA:GD-127-ANY');
  const r = { ...h, openDate: new Date(String(h.openDate)), closeDate: new Date(String(h.closeDate)) } as never;
  const f = (youth: 'exclude' | 'include' | 'only', antler: string[]) => ({ youth, antler, weapon: [], months: [], dayFrom: null, dayTo: null, dayMode: 'open' as const });
  assert.equal(h.antlerClass, 'ANTLERED');                         // adults: bucks only
  assert.match(String(h.takeMethod), /Youth only, white-tailed deer: Buck, 3 pt\. min\. or antlerless \(Oct 24–27\)/);
  assert.equal(matchesHuntSeason(r, f('exclude', ['ANTLERLESS']), true), false); // youth hidden: no antlerless day
  assert.equal(matchesHuntSeason(r, f('include', ['ANTLERLESS']), true), true);  // youth included: the youth day counts
  assert.equal(matchesHuntSeason(r, f('only', []), true), true);                // youth only: it has a youth season
  assert.equal(matchesHuntSeason(r, f('exclude', ['ANTLERED']), true), true);
  // a youth special permit is hidden by default and shown with include/only
  const y = data.hunts.find((x) => x.youthOnly)!;
  const yr = { ...y, openDate: y.openDate ? new Date(String(y.openDate)) : null, closeDate: y.closeDate ? new Date(String(y.closeDate)) : null } as never;
  assert.equal(matchesHuntSeason(yr, f('exclude', []), true), false);
  assert.equal(matchesHuntSeason(yr, f('include', []), true), true);
  assert.equal(matchesHuntSeason(yr, f('only', []), true), true);
});

test('Washington 65+, hunters with disabilities and Master Hunter permits', async () => {
  const { waPointType } = await import('../src/lib/waPoints');
  const { waPersonal } = await import('../src/lib/waHunt');
  const lim = data.hunts.filter((h) => (h.pointOdds as { restricted?: boolean }).restricted && (h.species === 'DEER' || h.species === 'ELK'));
  assert.ok(lim.length >= 140, `restricted hunts ${lim.length}`);
  for (const h of lim) {
    const po = h.pointOdds as { category: string; noPointData?: boolean; newHunt?: boolean };
    assert.ok(waPointType(po.category), po.category);
    assert.ok(!h.youthOnly);
    // 65+ has no point tables anywhere, so no odds; the others do
    const t = h.oddsByPts as { proj: { res?: number[] } };
    if (po.newHunt) { assert.ok(!t.proj.res, h.id); }
    else if (/65/.test(po.category)) { assert.ok(po.noPointData && !t.proj.res, h.id); }
    else assert.ok((t.proj.res ?? []).length > 0, h.id);
  }
  const senior = lim.find((h) => /65/.test((h.pointOdds as { category: string }).category))!;
  const p = waPersonal(senior as never, { res: 'RESIDENT', points: {} as never, deerTag: null, elkTag: null, set: false });
  assert.equal(p.odds, null);
  assert.match(p.basis, /never published 65\+ results/);
  // Master Hunter region hunts stand in with the region's GMUs (1xx = Region 1)
  assert.ok(by('WA:1800').units.every((u: string) => u.startsWith('1')));
});

test('Washington permits new for 2026 are listed without odds', async () => {
  const { waNoteFlags } = await import('../src/lib/waHunt');
  const fresh = data.hunts.filter((h) => (h.pointOdds as { newHunt?: boolean }).newHunt);
  assert.ok(fresh.length >= 25, `new hunts ${fresh.length}`);
  for (const h of fresh) {
    assert.ok(h.units.length > 0, h.id);
    assert.ok(h.openDate && h.closeDate, `${h.id} dates`);
    assert.deepEqual(h.oddsByPts, { proj: {}, last: {} }, h.id);
    assert.equal(h.appsLast, null, h.id);
    const p = waPersonal(row(h), readWaPoints({}));
    assert.equal(p.odds, null, h.id);
    assert.match(p.basis, /New for 2026/);
  }
  // youth and antlerless are among them
  assert.ok(fresh.some((h) => h.youthOnly && h.antlerClass === 'ANTLERLESS'));
  // a split GMU number in the PDF text ("GMU 37 1") still finds Alkali, 371
  assert.deepEqual(by('WA:2304').units, ['371']);
  // dates carrying a printed year land in that year, including a season that runs into 2027
  assert.equal(by('WA:2271').openDate, '2026-12-30');
  assert.equal(by('WA:2271').closeDate, '2027-01-19');
  assert.equal(by('WA:2272').openDate, '2027-01-23');
  assert.equal(by('WA:2238').openDate, '2027-01-01');
  // Alkali is on the Yakima Training Center (WDFW hunt note B)
  assert.deepEqual(waNoteFlags(String(by('WA:2298').notes)), ['Military installation: access may be extremely limited']);
  assert.deepEqual(waNoteFlags('C, D'), []);
});

test('Washington moose, sheep and goat: categories, once-in-a-lifetime, odds and units', async () => {
  const msg = data.hunts.filter((h) => ['MOOSE', 'BIGHORN', 'GOAT'].includes(h.species));
  // 2026 pamphlet pp. 62-66: 28 moose, 14 sheep, 5 goat permit hunts
  assert.deepEqual(['MOOSE', 'BIGHORN', 'GOAT'].map((s) => msg.filter((h) => h.species === s).length), [28, 14, 5]);
  for (const h of msg) {
    const po = h.pointOdds as unknown as { category: string; onceInALifetime: boolean; oddsUnavailableReason?: string; kind: string };
    assert.equal(po.kind, 'squared', h.id);
    assert.ok(waPointType(po.category), po.category);
    assert.equal(po.onceInALifetime, ['Any Antlered Bull Moose', 'Mountain Goat', 'Bighorn Sheep - Any Ram'].includes(po.category), h.id);
    const t = h.oddsByPts.proj.res ?? [];
    assert.ok(t.length > 0 || po.oddsUnavailableReason, h.id);
    assert.equal(h.weapon, 'ANY');
  }
  // renumbered across years: 2026 sheep 5001 Cleman Mountain chains back to its 2020 table (5007 "Cleman Mountain A")
  const cleman = by('WA:5001');
  assert.equal((cleman.pointOdds as unknown as { seedYear: number }).seedYear, 2020);
  assert.deepEqual(cleman.units, ['SH7']);
  // the pamphlet puts 8027 Mt Spokane South D in Moose Area 1 (the Regulation service says 2)
  assert.deepEqual(by('WA:8027').units, ['MA1']);
  // new in 2026: no applications yet, so no odds
  assert.match(String((by('WA:5000').pointOdds as unknown as { oddsUnavailableReason: string }).oddsUnavailableReason), /New hunt/);
  // personal odds read the category's own points
  const pts = readWaPoints({ WA: { res: 'NONRESIDENT', set: true, waPoints: { MOOSE_BULL: 20 } } });
  const bull = by('WA:8005');
  const p = waPersonal(row(bull), pts);
  assert.equal(p.type, 'MOOSE_BULL');
  assert.equal(p.odds, bull.oddsByPts.proj.res[20]);
  assert.ok(p.odds! > 0 && p.odds! < 0.05);
  // sheep and goat units carry the GMUs they lie in (Unit Map shading)
  const land = JSON.parse(readFileSync('data/wa/land.json', 'utf8')) as { units: Record<string, { gmus?: string[] }> };
  assert.deepEqual(land.units.SH14.gmus, ['250']);
  for (const u of ['MA1', 'MA2']) assert.deepEqual(land.units[u].gmus, ['124']);
});

test('Washington account form accepts saves from before the moose/sheep/goat fields existed', () => {
  const f = new Map<string, string>([['waResidency', 'RESIDENT'], ...WA_POINT_TYPES.filter((t) => t.species === 'DEER' || t.species === 'ELK').map((t) => ['waPts_' + t.key, '2'] as [string, string])]);
  const out = parseWaForm((k) => f.get(k) ?? null, (k) => f.has(k));
  assert.ok(out && typeof out === 'object');
  assert.equal((out as { waPoints: Record<string, number> }).waPoints.MOOSE_BULL, 0);
  assert.equal((out as { waPoints: Record<string, number> }).waPoints.QUALITY_DEER, 2);
});
