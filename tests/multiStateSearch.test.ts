import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HuntSummary } from '@prisma/client';
import { searchStates, searchBounds, searchUnitKey } from '../src/lib/searchStates';
import { runSearch, personalize, evaluateHunt, compareSearch, type HunterSettings } from '../src/lib/multiStateSearch';
import { searchCsv } from '../src/lib/searchCsv';
import { matchesHuntSeason } from '../src/lib/huntSeasonFilter';
import { parseFilters } from '../src/lib/finder';

const settings: HunterSettings = { ID: 'RESIDENT', CO: { res: 'NONRESIDENT', DEER: 2, ELK: 0, PRONGHORN: 0, youth: false, set: true } };
const row = (patch: Partial<HuntSummary> = {}) => ({
  id: 'id:deer39', state: 'ID', slug: 'deer39', huntId: 1, species: 'DEER', type: 'CONTROLLED',
  name: 'Deer 39', huntNumber: 1001, tagCode: null, areaName: '39', unit: null, units: ['39'],
  weapon: 'ANY', antlerClass: 'ANTLERED', openDate: new Date('2027-10-10'), closeDate: new Date('2027-10-20'),
  youthOnly: false, nrTag: false, privateOnly: false, capped: false, tagSeasons: null,
  resOdds5: .8, nrOdds5: .1, resOddsLast: .7, nrOddsLast: .05, oddsLastYear: 2026,
  scoreQuality: 80, scoreOppRes: 1, scoreOppNr: 2, success5: .5, harvestLastYear: 2025,
  hunters5: 100, harvest5: 50, huntersSqMi: 1, publicPct: 60, bigPct5: null,
  accessYesPct: 2, huntablePct: 62, accessYesCount: 1, leftoverTags: 0,
  deerType: 'MULE', tags: 50, pointOdds: null, oddsByPts: null, ptsRes: null, ptsNr: null,
  ...patch,
} as HuntSummary);
const colorado = (patch: Partial<HuntSummary> = {}) => row({
  id: 'co:deer39', state: 'CO', slug: 'co-dm039o3r', huntId: 2, tagCode: 'DM039O3R',
  oddsByPts: { proj: { nr: [.1, .3, .6], res: [.5, .7, .9], ynr: [.7, .8, .9] }, last: { nr: [.2, .4, .8] } },
  ptsNr: 2, ptsRes: 1, ...patch,
});

test('Wyoming deer unknown hunter overlap cannot drive success filters, scores or exports', () => {
  const source = row({ id: 'wy:deer121', state: 'WY', species: 'DEER', scoreQuality: 80, success5: .62,
    hunters5: 1366, harvest5: 849, huntersSqMi: .6, oddsByPts: { proj: { nr: [.95] }, last: { nr: [.9] } } });
  const before = JSON.stringify(source);
  const result = evaluateHunt(source, settings, 'proj');
  assert.equal(result.odds, .95);
  assert.equal(result.r.success5, null);
  assert.equal(result.r.hunters5, null);
  assert.equal(result.r.huntersSqMi, null);
  assert.equal(result.r.scoreQuality, null);
  assert.equal(result.opportunity, null);
  assert.equal(JSON.stringify(source), before, 'stored source must remain unchanged');
  assert.equal(runSearch([source], { states: 'WY', minSuccess: '20' }, 'WY', settings).length, 0);
  assert.equal(evaluateHunt(row({ state: 'WY', species: 'ELK' }), settings, 'proj').r.success5, .5);
});

test('state selection validates, deduplicates and canonicalizes without losing header defaults', () => {
  assert.deepEqual(searchStates(undefined, 'CO'), ['CO']);
  assert.deepEqual(searchStates(['co,id', 'CO,XX'], 'ID'), ['CO', 'ID']);
  assert.deepEqual(searchStates('XX', 'CO'), ['CO']);
  assert.notEqual(searchUnitKey('ID', '39'), searchUnitKey('CO', '39'));
  assert.deepEqual(searchBounds(['ID', 'CO']), [[-117.3, 36.99], [-102.04, 49.05]]);
});

test('combined ranking uses separate state residency and points, never stored Opportunity', () => {
  const original = [row(), colorado()];
  const before = JSON.stringify(original);
  const results = runSearch(original, { states: 'ID,CO' }, 'ID', settings);
  assert.equal(results.length, 2);
  assert.equal(results.find(x => x.r.state === 'ID')!.odds, .8);
  assert.equal(results.find(x => x.r.state === 'CO')!.odds, .6);
  assert.equal(results[0].r.state, 'ID');
  assert.equal(results[0].nr, false);
  assert.equal(results[1].nr, true);
  assert.equal(JSON.stringify(original), before, 'public rows must never retain personalized values');
  const changed = runSearch(original, { states: 'ID,CO' }, 'CO', { ...settings, ID: 'NONRESIDENT' });
  assert.equal(changed[0].r.state, 'CO');
  assert.equal(changed.find(x => x.r.state === 'ID')!.odds, .1);
});

test('shared species, weapon and dates constrain both states', () => {
  const data = [row(), colorado(), colorado({ id: 'archery', tagCode: 'DM039O1A', weapon: 'ARCHERY' }), row({ id: 'elk', species: 'ELK' })];
  const results = runSearch(data, { states: 'ID,CO', species: 'DEER', weapon: 'ANY', from: '10-15', to: '10-16' }, 'ID', settings);
  assert.deepEqual(results.map(x => x.r.id).sort(), ['co:deer39', 'id:deer39']);
  assert.equal(runSearch(data, { states: 'ID,CO', from: '11-1', to: '11-3' }, 'ID', settings).length, 0);
});

test('accessible land minimum uses Idaho Access Yes and preserves unknowns', () => {
  const data = [row(), colorado(), row({ id: 'unknown', huntablePct: null })];
  assert.deepEqual(runSearch(data, { states: 'ID,CO', minAccessLand: '61' }, 'ID', settings).map(x => x.r.id), ['id:deer39']);
  assert.equal(runSearch(data, { states: 'ID,CO', minPublic: '61' }, 'ID', settings).length, 0);
});

test('qualified map clicks select only the correct state; bare unit search spans states', () => {
  const data = [row(), colorado()];
  assert.deepEqual(runSearch(data, { states: 'ID,CO', unit: 'CO:39' }, 'ID', settings).map(x => x.r.state), ['CO']);
  assert.equal(runSearch(data, { states: 'ID,CO', unit: '39' }, 'ID', settings).length, 2);
});

test('each season must satisfy sex, weapon, youth and dates together', () => {
  const tag = row({ type: 'GENERAL', antlerClass: 'EITHER', tagSeasons: { year: 2027, seasons: [
    { weapon: 'ARCHERY', sex: 'antlered', notes: '', dates: [{ open: '2027-09-01', close: '2027-09-30' }] },
    { weapon: 'ANY', sex: 'antlerless (youth hunt only)', notes: '', dates: [{ open: '2027-10-01', close: '2027-10-31' }] },
  ] } });
  assert.equal(matchesHuntSeason(tag, parseFilters({ weapon: 'ARCHERY', from: '10-1', to: '10-31', youth: 'include' }), true), false);
  assert.equal(matchesHuntSeason(tag, parseFilters({ weapon: 'ANY', from: '10-1', to: '10-31', youth: 'include' }), true), false);
  assert.equal(matchesHuntSeason(tag, parseFilters({ weapon: 'ANY', from: '10-1', to: '10-31', youth: 'include', antler: 'ANTLERLESS' }), true), true);
  assert.equal(matchesHuntSeason(tag, parseFilters({ weapon: 'ANY', from: '10-1', to: '10-31', antler: 'ANTLERLESS' }), true), false);
});

test('Idaho-only restrictions leave Colorado unchanged and keep migrations scoped', () => {
  const data = [row(), colorado()];
  assert.deepEqual(runSearch(data, { states: 'ID,CO', accessYes: '1' }, 'ID', settings).map(x => x.r.state).sort(), ['CO', 'ID']);
  assert.equal(runSearch(data, { states: 'ID,CO', migration: 'yes' }, 'ID', settings, { DEER: ['39'] }).length, 2);
  assert.equal(runSearch(data, { states: 'ID,CO', migration: 'yes' }, 'ID', settings, { ELK: ['39'] }).length, 1);
});

test('Colorado filters retain numbered seasons, point ranges, chance and private-land visibility', () => {
  const data = [row(), colorado(), colorado({ id: 'private', privateOnly: true })];
  assert.equal(runSearch(data, { states: 'ID,CO', season: '3', chance: 'likely', minPts: '2', maxPts: '2' }, 'ID', settings).length, 2);
  assert.equal(runSearch(data, { states: 'ID,CO', season: '2' }, 'ID', settings).length, 1);
  assert.equal(runSearch(data, { states: 'ID,CO', priv: '1' }, 'ID', settings).length, 3);
});

test('Colorado overlap choices exclude unknown dates and other CO species, leaving Idaho unchanged', () => {
  const data = [row(), colorado(), colorado({ id: 'unknown' }), colorado({ id: 'elk', species: 'ELK' })];
  assert.deepEqual(runSearch(data, { states: 'ID,CO', otcElk: '1' }, 'ID', settings, {}, { 'co:deer39': true, unknown: null, elk: true }).map(x => x.r.id).sort(), ['co:deer39', 'id:deer39']);
  assert.equal(runSearch(data, { states: 'ID,CO', otcElk: '0' }, 'ID', settings, {}, { 'co:deer39': true, unknown: null }).length, 1);
});

test('OTC eligibility respects Colorado residency; capped Idaho tags are not guaranteed', () => {
  const resOnly = colorado({ type: 'GENERAL', pointOdds: { general: { resident: true, nonresident: false } } });
  assert.equal(personalize(resOnly, settings, 'proj'), null);
  assert.equal(personalize(resOnly, { ...settings, CO: { ...settings.CO, res: 'RESIDENT' } }, 'proj')!.odds, 1);
  assert.equal(personalize(row({ type: 'GENERAL', capped: true }), settings, 'proj')!.odds, null);
});

test('deer type affects Idaho only; Colorado season affects Colorado only, including together', () => {
  const data = [row({ id: 'id-mule', deerType: 'MULE' }), row({ id: 'id-white', deerType: 'WHITETAIL' }),
    colorado({ id: 'co-second', tagCode: 'DM039O2R', deerType: null }), colorado({ id: 'co-third', deerType: null })];
  const ids = (sp: Record<string, string>) => runSearch(data, { states: 'ID,CO', species: 'DEER', ...sp }, 'ID', settings).map(x => x.r.id).sort();
  assert.deepEqual(ids({ deerType: 'MULE' }), ['co-second', 'co-third', 'id-mule']);
  assert.deepEqual(ids({ season: '2' }), ['co-second', 'id-mule', 'id-white']);
  assert.deepEqual(ids({ deerType: 'MULE', season: '2' }), ['co-second', 'id-mule']);
  assert.equal(runSearch([row({ species: 'ELK', deerType: null })], { states: 'ID,CO', species: 'ELK', deerType: 'MULE' }, 'ID', settings).length, 1, 'a hidden stale deer filter must not remove elk');
});

test('public land and harvest minimums still filter every selected state alongside local filters', () => {
  const data = [row(), colorado({ tagCode: 'DM039O2R' }), row({ id: 'id-low-land', publicPct: 10 }),
    colorado({ id: 'co-low-success', tagCode: 'DM039O2R', success5: .1 })];
  const results = runSearch(data, { states: 'ID,CO', species: 'DEER', deerType: 'MULE', season: '2', minPublic: '50', minSuccess: '40' }, 'ID', settings);
  assert.deepEqual(results.map(x => x.r.id).sort(), ['co:deer39', 'id:deer39']);
  assert.deepEqual(runSearch(data, { states: 'ID,CO', minBig: '25' }, 'ID', settings).map(x => x.r.state), ['CO', 'CO']);
});

test('historical, projected and youth pools remain independent and never leak between hunters', () => {
  assert.equal(personalize(colorado(), settings, 'last')!.odds, .8);
  assert.equal(personalize(colorado(), { ...settings, CO: { ...settings.CO, youth: true } }, 'proj')!.odds, .9);
  assert.equal(personalize(colorado(), settings, 'proj')!.odds, .6);
});

test('explicit comparisons share personal metrics and use pronghorn points rather than deer points', () => {
  const hunter = { ...settings, CO: { ...settings.CO, PRONGHORN: 1 } };
  const hunt = colorado({ species: 'PRONGHORN', tagCode: 'AM039O1R' });
  const compared = evaluateHunt(hunt, hunter, 'proj');
  assert.equal(compared.points, 1);
  assert.equal(compared.odds, .3);
  assert.deepEqual(compared, personalize(hunt, hunter, 'proj'));
  const general = row({ species: 'ELK', type: 'GENERAL' });
  assert.equal(personalize(general, settings, 'proj'), null, 'finder hides duplicate general elk options');
  assert.equal(evaluateHunt(general, settings, 'proj').odds, 1, 'explicit comparisons retain selected hunts');
});

test('unknown odds and scores remain visible but never pass minimum filters or outrank known values', () => {
  const data = [row({ id: 'unknown', scoreQuality: null, resOdds5: null, resOddsLast: null }), row({ id: 'zero', resOdds5: 0 }), row()];
  assert.deepEqual(runSearch(data, { states: 'ID' }, 'ID', settings).map(x => x.r.id), ['id:deer39', 'zero', 'unknown']);
  assert.equal(runSearch(data, { states: 'ID', minOdds: '1' }, 'ID', settings).length, 1);
  assert.equal(runSearch(data, { states: 'ID', minScore: '50' }, 'ID', settings).length, 2);
});

test('tie breaking and null ordering are deterministic in both sort directions', () => {
  const a = personalize(row({ id: 'a', huntersSqMi: null }), settings, 'proj')!;
  const b = personalize(row({ id: 'b', huntersSqMi: .2 }), settings, 'proj')!;
  assert.ok(compareSearch(a, b, 'densityLow') > 0);
  assert.ok(compareSearch(a, b, 'opp') < 0);
});

test('CSV preserves search order, personalized odds, provenance and safe spreadsheet strings', () => {
  const results = runSearch([row({ name: '=SUM(A1)' }), colorado()], { states: 'ID,CO' }, 'ID', settings);
  const csv = searchCsv(results, 'https://example.com');
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, results.length + 1);
  assert.match(lines[1], /ID,'=SUM\(A1\)/);
  assert.match(lines[2], /Nonresident,2,60,Projected/);
  assert.match(csv, /https:\/\/example.com\/hunts\/co-dm039o3r/);
});

test('a Montana or Wyoming header never lands in Idaho\'s finder', async () => {
  const { combinedFinderRedirect } = await import('../src/lib/searchStates');
  // the header's Find Hunts link on a fresh visit is a bare /hunts
  assert.equal(combinedFinderRedirect('MT', {}), '/hunts?antler=ANTLERED&sort=opp&states=MT');
  assert.equal(combinedFinderRedirect('WY', {}), '/hunts?antler=ANTLERED&sort=opp&states=WY');
  // what the URL asked for is kept
  assert.equal(combinedFinderRedirect('MT', { species: 'ELK', antler: 'ALL' }), '/hunts?antler=ALL&sort=opp&species=ELK&states=MT');
  // already in the combined finder, or a state with its own finder: no redirect
  assert.equal(combinedFinderRedirect('MT', { states: 'MT,ID' }), null);
  assert.equal(combinedFinderRedirect('ID', {}), null);
  assert.equal(combinedFinderRedirect('CO', {}), null);
});
