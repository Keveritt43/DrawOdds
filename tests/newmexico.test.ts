import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNmForm, readNmSettings, nmPool } from '../src/lib/nmSettings';
import { nmPersonal, nmEligible, nmLicense, nmLicenseFee, nmRestricted } from '../src/lib/nmHunt';
import { evaluateHunt, matchesSearch, personalize, searchFilters, type HunterSettings } from '../src/lib/multiStateSearch';
import { huntWeaponLabel } from '../src/lib/huntWeaponLabel';
import type { CoScored } from '../src/lib/coScores';
import { STATES } from '../src/lib/states';

type H = Record<string, unknown> & { id: string; tagCode: string; species: string; type: string; units: string[]; privateOnly: boolean; weapon: string;
  oddsByPts: { last: Record<string, number[]>; proj: Record<string, number[]> }; pointOdds: Record<string, unknown> & { nrEligible: boolean; kind: string } };
const data = JSON.parse(readFileSync('data/nm/hunts.json', 'utf8')) as { problems: string[]; omitted: { code: string }[]; hunts: H[] };
const units = new Set((JSON.parse(readFileSync('data/nm/units.json', 'utf8')) as { units: { name: string }[] }).units.map((u) => u.name));
const by = (id: string) => data.hunts.find((h) => h.id === id)!;
const row = (h: H) => ({ ...h, state: 'NM', scoreQuality: 50, success5: (h.success5 as number | null) ?? null }) as unknown as CoScored;
const settings = (res: 'RESIDENT' | 'NONRESIDENT', outfitter = false) => ({ ID: res, CO: { res }, NM: { res, outfitter, set: true } }) as unknown as HunterSettings;

test('New Mexico is listed, with a private-land-only rule and no points', () => {
  assert.equal(STATES.NM.code, 'NM');
  assert.equal(STATES.NM.points, 'none');
  assert.ok(STATES.NM.privateLandOnly.includes('Units 2A, 2B, 2C, 4 and 5A'));
  assert.deepEqual(STATES.NM.species, ['DEER', 'ELK']);
});

test('New Mexico hunts build cleanly: no problems, unique ids, known GMUs, one odds value per pool', () => {
  assert.deepEqual(data.problems, []);
  assert.equal(new Set(data.hunts.map((h) => h.id)).size, data.hunts.length);
  for (const h of data.hunts) {
    for (const u of h.units) assert.ok(units.has(u), `${h.id}: ${u}`);
    for (const m of ['last', 'proj'] as const) for (const [p, a] of Object.entries(h.oddsByPts[m])) {
      assert.ok(['res', 'nr', 'out'].includes(p));
      assert.equal(a.length, 1);
      assert.ok(a[0] >= 0 && a[0] <= 1);
    }
  }
  // Youth Encouragement elk licenses are sold first come, not drawn: left out
  assert.ok(data.omitted.length > 0 && data.omitted.every((o) => o.code.startsWith('ELK-')));
});

test('first-choice odds per pool match NMDOW 2026 (ELK-1-132, Unit 2 bull, any legal weapon)', () => {
  const h = by('NM:ELK-1-132');
  // 2026 Complete Report: residents 63 of 1,152 first choices drew, nonresidents 4 of 153, outfitter pool 7 of 80
  const last = (res: 'RESIDENT' | 'NONRESIDENT', out = false) => nmPersonal(row(h), { res, outfitter: out, set: true }, 'last').odds!;
  assert.ok(Math.abs(last('RESIDENT') - 63 / 1152) < 1e-6);
  assert.ok(Math.abs(last('NONRESIDENT') - 4 / 153) < 1e-6);
  assert.ok(Math.abs(last('NONRESIDENT', true) - 7 / 80) < 1e-6);
  // a resident with an outfitter is in the outfitter pool
  assert.equal(nmPool({ res: 'RESIDENT', outfitter: true }), 'out');
  assert.equal(nmPersonal(row(h), { res: 'NONRESIDENT', outfitter: false, set: true }).projected, true);
});

test('nonresidents can\'t apply for antlerless elk or WMA hunts; military-only hunts stay open to them', () => {
  const cow = by('NM:ELK-1-133');
  assert.equal(cow.pointOdds.bag, 'A');
  assert.equal(nmEligible(row(cow), { res: 'NONRESIDENT' }), false);
  assert.equal(personalize(row(cow), settings('NONRESIDENT'), 'proj'), null);
  assert.ok(personalize(row(cow), settings('RESIDENT'), 'proj'));
  const wma = data.hunts.find((h) => h.pointOdds.wmaOnly)!;
  assert.equal(nmEligible(row(wma), { res: 'NONRESIDENT' }), false);
  // McGregor Range: nonresident service members apply every year (42 nonresident first choices in 2026)
  const mil = by('NM:ELK-1-396');
  assert.equal(mil.pointOdds.military, true);
  assert.equal(nmEligible(row(mil), { res: 'NONRESIDENT' }), true);
  assert.equal(nmRestricted(row(mil)), true);
});

test('restricted hunts show only when asked for; private-land deer kinds filter', () => {
  const mil = row(by('NM:ELK-1-396'));
  const x = evaluateHunt(mil, settings('RESIDENT'), 'proj');
  assert.equal(matchesSearch(x, searchFilters({ states: 'NM' }), { states: 'NM' }), false);
  assert.equal(matchesSearch(x, searchFilters({ states: 'NM', nmWho: 'military' }), { states: 'NM', nmWho: 'military' }), true);
  const priv = by('NM:DER-1-102'), otc = by('NM:DER-2-501');
  assert.equal(nmLicense(row(priv)), 'private');
  assert.equal(nmLicense(row(otc)), 'otc');
  assert.equal(priv.privateOnly && otc.privateOnly, true);
  assert.equal(nmPersonal(row(otc), readNmSettings(null)).odds, 1);
});

test('fees: nonresident quality elk $998, standard deer $398, antlerless elk not issued', () => {
  const q = data.hunts.find((h) => h.species === 'ELK' && h.pointOdds.fee === 'Q' && h.pointOdds.bag !== 'A')!;
  assert.equal(nmLicenseFee(row(q), true), 998);
  assert.equal(nmLicenseFee(row(by('NM:DER-1-101')), true), by('NM:DER-1-101').pointOdds.fee === 'S' ? 398 : 623);
  assert.equal(nmLicenseFee(row(by('NM:ELK-1-133')), true), null);
});

test('weapon digit: 2 = bow only, 3 = muzzleloader, crossbow or bow', () => {
  const bow = data.hunts.find((h) => h.tagCode.startsWith('DER-2-'))!, mz = data.hunts.find((h) => h.tagCode.startsWith('DER-3-'))!;
  assert.equal(huntWeaponLabel(row(bow) as never), 'Bow only');
  assert.equal(huntWeaponLabel(row(mz) as never), 'Muzzleloader, crossbow or bow');
});

test('account form: residency and pool, no points', () => {
  const f = (o: Record<string, string>) => parseNmForm((k) => o[k] ?? null, (k) => k in o);
  assert.equal(f({}), null);
  assert.deepEqual(f({ nmResidency: 'NONRESIDENT', nmPool: 'outfitter' }), { res: 'NONRESIDENT', outfitter: true, set: true });
  assert.deepEqual(f({ nmResidency: 'RESIDENT', nmPool: 'none' }), { res: 'RESIDENT', outfitter: false, set: true });
  assert.equal(typeof f({ nmResidency: 'X' }), 'string');
  assert.deepEqual(readNmSettings({ NM: { res: 'RESIDENT', outfitter: true, set: true } }), { res: 'RESIDENT', outfitter: true, set: true });
});
