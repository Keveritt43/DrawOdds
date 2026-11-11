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

test('antelope B licences ("Doe/Fawn") are antlerless in search; antelope districts read as plain numbers', async () => {
  const { seasonsClass } = await import('../src/lib/tagSeasons');
  const { searchUnitLabel } = await import('../src/lib/searchStates');
  assert.equal(seasonsClass([{ sex: 'Doe/Fawn' }]), 'ANTLERLESS');
  assert.equal(seasonsClass([{ sex: 'Either-sex' }]), 'EITHER');
  assert.equal(searchUnitLabel('MT:A320'), '320');
  assert.equal(searchUnitLabel('MT:A701N'), '701N');
  assert.equal(searchUnitLabel('WY:A23'), 'A23'); // Wyoming keeps its species letter
  const settings: HunterSettings = { ID: 'RESIDENT', CO: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0 } as never, MT: pts({}) };
  const row = (h: H) => ({ ...h, openDate: h.openDate ? new Date(String(h.openDate)) : null, closeDate: h.closeDate ? new Date(String(h.closeDate)) : null, huntNumber: null, scoreQuality: 50 }) as unknown as CoScored;
  const sp = { antler: 'ANTLERED' };
  assert.equal(matchesSearch(evaluateHunt(row(by('MT:antelope-b:546-30')), settings, 'proj'), searchFilters(sp), sp), false);
  assert.equal(matchesSearch(evaluateHunt(row(by('MT:antelope:546-20')), settings, 'proj'), searchFilters(sp), sp), true);
});

test('nonresident permits: the combination draw is part of the odds, for the combination the hunter applies for', () => {
  const nrPts = (o: Record<string, unknown>) => pts({ res: 'NONRESIDENT', ...o });
  // a deer permit every nonresident drew at 0 points is exactly as likely as the combination draw at 0 points
  const sure = D.hunts.find((h) => h.id.startsWith('MT:deer-permit:') && h.oddsByPts.last.nr[0] === 1)!;
  const combo = (sure.pointOdds as unknown as { combo: { odds: Record<string, number[]> } }).combo.odds;
  assert.equal(mtPersonal(sure as never, nrPts({}), true).odds, combo['biggame-elk'][0]);           // Big Game (default)
  assert.equal(mtPersonal(sure as never, nrPts({ mtComboType: 'DEER' }), true).odds, combo.deer[0]);
  assert.equal(mtPersonal(sure as never, nrPts({ mtComboType: 'ELK' }), true).odds, 0);              // Elk combo: no deer
  assert.match(mtPersonal(sure as never, nrPts({ mtComboType: 'ELK' }), true).basis, /doesn't include deer/);
  // Montana's dead zone carries through: 1 combination point drew nothing
  assert.equal(mtPersonal(sure as never, nrPts({ mtCombo: 1 }), true).odds, combo['biggame-elk'][1]);
  // residents and B licences are unaffected
  const e = by('MT:elk-permit:217-10');
  assert.equal(mtPersonal(e as never, pts({ mtBonus: { ELK_PERMIT: 1 } }), false).odds, 0.2324);
  assert.equal(mtPersonal(by('MT:elk-b:215-01') as never, nrPts({ mtComboType: 'DEER' }), true).parts, undefined);
  const both = mtPersonal(e as never, nrPts({ mtBonus: { ELK_PERMIT: 1 } }), true);
  assert.ok(Math.abs(both.odds! - e.oddsByPts.last.nr[1] * combo['biggame-elk'][0]) < 1e-12);
});

test('mule deer vs whitetail: licence rows decide; mule-buck permits where only a permit allows a mule buck', () => {
  const g270 = by('MT:deer-general:270') as H & { deerType: string };
  assert.equal(g270.deerType, 'WHITETAIL');
  assert.deepEqual(g270.pointOdds.deer, ['WHITETAIL']);
  const p261 = by('MT:deer-permit:261-50') as H & { success5: number; deerType: string };
  assert.equal(p261.pointOdds.mulePermit, true);
  assert.equal(p261.deerType, 'MULE');
  assert.equal(p261.success5, (8 + 8 + 9) / (15 + 15 + 10)); // FWP mule bucks 2021/23/25 over permits issued
  // HD 270: FWP's mule buck estimate exceeds the 60 permits every season, so it is not attributed to them
  assert.match(String(by('MT:deer-permit:270-50').pointOdds.mulePermitNote), /70 mule bucks estimated, 60 permits/);
  const settings: HunterSettings = { ID: 'RESIDENT', CO: { res: 'RESIDENT', DEER: 0, ELK: 0, PRONGHORN: 0 } as never, MT: pts({}) };
  const row = (h: H) => ({ ...h, openDate: h.openDate ? new Date(String(h.openDate)) : null, closeDate: h.closeDate ? new Date(String(h.closeDate)) : null, huntNumber: null, scoreQuality: 50 }) as unknown as CoScored;
  const f = (x: Record<string, string>) => searchFilters({ antler: 'ALL', ...x });
  const m = (h: H, x: Record<string, string>) => matchesSearch(evaluateHunt(row(h), settings, 'proj'), f(x), x);
  assert.equal(m(g270, { mtDeer: 'MULE' }), false);
  assert.equal(m(g270, { mtDeer: 'WHITETAIL' }), true);
  assert.equal(m(p261, { mtDeer: 'MULE' }), true);
  assert.equal(m(by('MT:elk-general:261'), { mtDeer: 'MULE' }), false);
});

test('a nonresident permit shows the permit draw alone; the combination and both together ride along', () => {
  const sure = D.hunts.find((h) => h.id.startsWith('MT:deer-permit:') && h.oddsByPts.last.nr[0] === 1)!;
  const m = mtPersonal(sure as never, pts({ res: 'NONRESIDENT' }), true);
  assert.equal(m.parts!.permit, 1);
  assert.equal(m.odds, m.parts!.combo); // 100% permit x combination
});
