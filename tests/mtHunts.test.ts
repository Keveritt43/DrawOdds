import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/mt/hunts.json';
import { mtPersonal, mtKind, type MtPointOdds } from '../src/lib/mtHunt';
import { readMtPoints } from '../src/lib/mtPoints';
import { matchesSearch, searchFilters, evaluateHunt, type HunterSettings } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';

type H = Record<string, unknown> & { id: string; type: string; species: string; units: string[]; privateOnly: boolean; oddsByPts: { last: Record<string, number[]>; noBuy?: Record<string, number | null> }; pointOdds: MtPointOdds };
const D = data as unknown as { problems: string[]; hunts: H[] };
const by = (id: string) => D.hunts.find((h) => h.id === id)!;
const pts = (o: Record<string, unknown>) => readMtPoints({ MT: { res: 'RESIDENT', mtCombo: 0, mtBonus: {}, mtBuying: {}, set: true, ...o } });

test('the build reports no problems and covers every district', () => {
  assert.deepEqual(D.problems, []);
  const gen = (sp: string) => D.hunts.filter((h) => h.type === 'GENERAL' && h.species === sp).length;
  assert.equal(gen('DEER'), 139);
  assert.equal(gen('ELK'), 130); // 139 less the nine drawing-only districts
  const elkGen = new Set(D.hunts.filter((h) => h.type === 'GENERAL' && h.species === 'ELK').map((h) => h.units[0]));
  for (const hd of ['250', '410', '455', '555', '620', '621', '622', '630', '700']) assert.equal(elkGen.has(hd), false, hd);
});

test('Elk Permit 217-10: odds indexed by banked points read FWP\'s N+1 row (2026 report, checked by hand)', () => {
  const h = by('MT:elk-permit:217-10');
  assert.deepEqual(h.oddsByPts.last.res.slice(0, 3), [0.044, 0.2324, 0.4217]); // 8/182, 33/142, 35/83
  assert.equal(h.oddsByPts.noBuy!.res, 0.0261); // 3/115
  for (let i = 1; i < h.oddsByPts.last.res.length; i++) assert.ok(h.oddsByPts.last.res[i] >= h.oddsByPts.last.res[i - 1]);
});

test('general elk keeps Montana\'s dead zone for nonresidents exactly as drawn', () => {
  assert.deepEqual(by('MT:elk-general:261').oddsByPts.last.nr, [0.5361, 0, 0.7577, 1]);
});

test('mtPersonal: buying uses the N row, not buying uses the no-purchase row, residents buy general over the counter', () => {
  const h = by('MT:elk-permit:217-10');
  assert.equal(mtPersonal(h as never, pts({ mtBonus: { ELK_PERMIT: 1 } }), false).odds, 0.2324);
  const nb = mtPersonal(h as never, pts({ mtBonus: { ELK_PERMIT: 5 }, mtBuying: { ELK_PERMIT: false } }), false);
  assert.equal(nb.odds, 0.0261);
  assert.match(nb.basis, /not buying a point/);
  // past the last printed level: the top value, never undefined
  const top = h.oddsByPts.last.res.at(-1);
  assert.equal(mtPersonal(h as never, pts({ mtBonus: { ELK_PERMIT: 39 } }), false).odds, top);
  const g = by('MT:elk-general:261');
  assert.equal(mtPersonal(g as never, pts({}), false).odds, 1);
  assert.equal(mtPersonal(g as never, pts({ res: 'NONRESIDENT', mtCombo: 1 }), true).odds, 0);
});

test('search: Montana licence-type filter and private-land-only hidden by default', () => {
  const settings: HunterSettings = { ID: 'RESIDENT', CO: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0 } as never, MT: pts({}) };
  const row = (h: H) => ({ ...h, openDate: h.openDate ? new Date(String(h.openDate)) : null, closeDate: h.closeDate ? new Date(String(h.closeDate)) : null, huntNumber: null, scoreQuality: 50 }) as unknown as CoScored;
  const permit = evaluateHunt(row(by('MT:elk-permit:217-10')), settings, 'proj');
  const general = evaluateHunt(row(by('MT:elk-general:261')), settings, 'proj');
  const f = (sp: Record<string, string>) => searchFilters({ antler: 'ALL', ...sp });
  assert.equal(matchesSearch(permit, f({ mtLic: 'permit' }), { mtLic: 'permit' }), true);
  assert.equal(matchesSearch(general, f({ mtLic: 'permit' }), { mtLic: 'permit' }), false);
  assert.equal(mtKind(by('MT:elk-b:215-01').pointOdds), 'b');
  const priv = D.hunts.find((h) => h.privateOnly)!;
  const x = evaluateHunt(row(priv), settings, 'proj');
  assert.equal(matchesSearch(x, f({}), {}), false);
  assert.equal(matchesSearch(x, f({ priv: '1' }), { priv: '1' }), true);
});

test('antelope: drawn by bonus points at the antelope balance, its own filter kind, no combination licence', () => {
  const h = by('MT:antelope:546-20');
  assert.equal(mtKind(h.pointOdds), 'antelope');
  assert.equal(mtKind(by('MT:antelope-b:546-30').pointOdds), 'b');
  const nr = mtPersonal(h as never, pts({ res: 'NONRESIDENT', mtBonus: { ANTELOPE: 2 } }), true);
  assert.equal(nr.odds, h.oddsByPts.last.nr[2]);
  // the deer permit balance does not leak into antelope
  assert.equal(mtPersonal(h as never, pts({ mtBonus: { DEER_PERMIT: 9 } }), false).odds, h.oddsByPts.last.res[0]);
  assert.deepEqual(by('MT:antelope:007-21').units, ['A700', 'A701N', 'A703N']);
});
