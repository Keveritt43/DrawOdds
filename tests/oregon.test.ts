import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOrForm, readOrPoints, orPointType } from '../src/lib/orPoints';
import { orPersonal, orPrefCutoff, orIsGeneral, type OrPointOdds } from '../src/lib/orHunt';
import { evaluateHunt, matchesSearch, searchFilters, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

type H = Record<string, unknown> & { id: string; tagCode: string; species: string; type: string; units: string[]; privateOnly: boolean; publicPct: number | null;
  success5: number | null; hunters5: number | null; harvest5: number | null;
  oddsByPts: { last: Record<string, number[]>; proj: Record<string, number[]> }; pointOdds: OrPointOdds };
const data = JSON.parse(readFileSync('data/or/hunts.json', 'utf8')) as { problems: string[]; hunts: H[] };
const units = new Set((JSON.parse(readFileSync('data/or/units.json', 'utf8')) as { units: { name: string }[] }).units.map((u) => u.name));
const bt = JSON.parse(readFileSync('data/or/backtest.json', 'utf8')) as { reproduce: Record<string, { resDrawn: number; resModel: number; nrDrawn: number; nrModel: number; p2Printed: number; p2Model: number }>; pick: Record<string, { ship: boolean; best: string }> };
const by = (id: string) => data.hunts.find((h) => h.id === id)!;
const row = (h: H) => ({ ...h, scoreQuality: 50 }) as unknown as CoScored;
const pts = (res: 'RESIDENT' | 'NONRESIDENT', BUCK = 0, ELK = 0, ANTLERLESS = 0) => readOrPoints({ OR: { res, orPoints: { BUCK, ELK, ANTLERLESS }, set: true } });

test('Oregon is registered, deer and elk, with a private-land-only rule', () => {
  assert.equal(STATES.OR.code, 'OR');
  assert.deepEqual(STATES.OR.species, ['DEER', 'ELK']);
  assert.ok(STATES.OR.privateLandOnly.length > 20);
});

test('Oregon hunts build cleanly: unique ids, known units, land, consistent success, monotone odds', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  for (const h of data.hunts) {
    assert.ok(h.units.length > 0 && h.units.every((u) => units.has(u)), h.id);
    assert.ok(typeof h.publicPct === 'number', `${h.id} public land`);
    if (h.success5 !== null) assert.ok(Math.abs(h.success5 - h.harvest5! / h.hunters5!) < 1e-9 && h.harvest5! <= h.hunters5!, h.id);
    for (const m of ['last', 'proj'] as const) for (const a of Object.values(h.oddsByPts[m])) {
      assert.ok(a.every((x) => x >= 0 && x <= 1), `${h.id} ${m}`);
      for (let i = 1; i < a.length; i++) assert.ok(a[i] + 1e-9 >= a[i - 1], `${h.id} ${m}`);
    }
  }
  // 534 controlled hunts: every 100, 200 and 600 series hunt in ODFW's 2026 draw reports
  assert.equal(data.hunts.filter((h) => h.type === 'CONTROLLED').length, 534);
});

test('the draw model gives back ODFW\'s drawn totals, and the one-random-number rule matches the random-phase points', () => {
  for (const y of ['2025', '2026']) for (const k of ['buck', 'elk']) {
    const r = bt.reproduce[`${y}:${k}`];
    assert.ok(Math.abs(r.resModel - r.resDrawn) / r.resDrawn < 0.01, `${y} ${k} residents`);
    // the random-phase winners' points ODFW prints: within 10% (a fresh lottery is ~45% high)
    assert.ok(Math.abs(r.p2Model - r.p2Printed) / r.p2Printed < 0.1, `${y} ${k} P2 ${r.p2Model} vs ${r.p2Printed}`);
  }
});

test('projection ships only where it beat the last draw (nonresident buck deer and elk)', () => {
  const shipped = Object.entries(bt.pick).filter(([, v]) => v.ship).map(([k]) => k).sort();
  assert.deepEqual(shipped, ['buck:nr', 'elk:nr']);
  for (const h of data.hunts.filter((x) => x.type === 'CONTROLLED')) {
    assert.ok(!h.oddsByPts.proj.res, `${h.id}: no resident projection`);
    assert.deepEqual(h.pointOdds.projected, h.pointOdds.series !== '600' && h.oddsByPts.last.nr ? ['nr'] : [], h.id);
  }
});

test('points: three series balances; the form validates', () => {
  assert.equal(orPointType('100'), 'BUCK');
  assert.equal(orPointType('200'), 'ELK');
  assert.equal(orPointType('600'), 'ANTLERLESS');
  const f = new Map<string, string>([['orResidency', 'RESIDENT'], ['orPts_BUCK', '7'], ['orPts_ELK', '0'], ['orPts_ANTLERLESS', '2']]);
  assert.deepEqual(parseOrForm((k) => f.get(k) ?? null, (k) => f.has(k)), { res: 'RESIDENT', orPoints: { BUCK: 7, ELK: 0, ANTLERLESS: 2 }, set: true });
  f.set('orPts_ELK', '99');
  assert.equal(typeof parseOrForm((k) => f.get(k) ?? null, (k) => f.has(k)), 'string');
  assert.equal(parseOrForm(() => null, () => false), null);
  assert.equal(readOrPoints(null).res, 'NONRESIDENT');
});

test('odds read the hunter\'s series, points and residency; Wilson buck (17 tags) has no nonresident tag', () => {
  const h = by('OR:112');
  const res0 = orPersonal(row(h), pts('RESIDENT', 0), false);
  const res12 = orPersonal(row(h), pts('RESIDENT', 12), false);
  assert.ok(res12.odds! > res0.odds! && res12.odds === 1, 'more points draw');
  assert.ok(res0.odds! > 0 && res0.odds! < 0.05, 'random share only at 0 points');
  // 5% of 17 tags rounds down to none: no nonresident drew, whatever the points
  const nr = orPersonal(row(h), pts('NONRESIDENT', 20), true);
  assert.equal(nr.odds, 0);
  assert.match(nr.basis, /no nonresident drew/);
  // elk points don't help a deer hunt
  assert.equal(orPersonal(row(h), pts('RESIDENT', 0, 25), false).odds, res0.odds);
});

test('at the cutoff the odds are the better of the two phases, not their sum', () => {
  const h = by('OR:112');
  const cut = orPrefCutoff(h.pointOdds, 'res')!;
  const at = h.oddsByPts.last.res[cut.points], below = h.oddsByPts.last.res[cut.points - 1];
  assert.ok(Math.abs(at - Math.max(cut.share, below)) < 1e-6);
});

test('general seasons are over the counter; search filters narrow Oregon only', () => {
  const g = data.hunts.find((h) => h.type === 'GENERAL')!;
  assert.ok(orIsGeneral(row(g)));
  assert.equal(orPersonal(row(g), pts('NONRESIDENT'), true).odds, 1);
  const settings = { ID: 'RESIDENT', CO: { res: 'RESIDENT' }, OR: pts('RESIDENT', 3, 3, 3) } as unknown as HunterSettings;
  const ctl = evaluateHunt(row(by('OR:112')), settings, 'proj');
  const gen = evaluateHunt(row(g), settings, 'proj');
  const sp = { states: 'OR', orLic: 'general' };
  assert.equal(matchesSearch(gen, searchFilters(sp), sp), true);
  assert.equal(matchesSearch(ctl, searchFilters(sp), sp), false);
  const sp2 = { states: 'OR', orSeries: '200' };
  assert.equal(matchesSearch(ctl, searchFilters(sp2), sp2), false);
});

test('private-land-only hunts are flagged from ODFW\'s boundary text', () => {
  assert.equal(by('OR:242').privateOnly, true); // "Hood Private - 0% public lands. PRIVATE LANDS ONLY in Unit 42."
  assert.equal(by('OR:112').privateOnly, false);
  for (const h of data.hunts.filter((x) => x.privateOnly)) assert.ok(h.type === 'CONTROLLED', h.id);
});

test('Eastern Oregon buck deer use the 2026 hunt areas and carry no old harvest', () => {
  const h = by('OR:DO101');
  assert.deepEqual(h.units, ['DO-01']);
  assert.equal(h.hunters5, null);
  assert.equal(h.pointOdds.newHunt, true);
});
