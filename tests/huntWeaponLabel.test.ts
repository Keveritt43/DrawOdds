import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huntWeaponLabel } from '../src/lib/huntWeaponLabel';

test('Washington special permits use the required tag, including multiple and unknown weapons', () => {
  const base = { state: 'WA', weapon: 'ANY' };
  assert.equal(huntWeaponLabel({ ...base, pointOdds: { tag: 'Archery' } }), 'Archery');
  assert.equal(huntWeaponLabel({ ...base, pointOdds: { tag: 'EF, EM, EA' } }), 'Modern firearm / Archery / Muzzleloader');
  assert.equal(huntWeaponLabel({ ...base, pointOdds: { tag: 'Any' } }), 'Any eligible tag · see regulations');
  assert.equal(huntWeaponLabel({ ...base, pointOdds: { tag: 'Blue Creek' } }), 'Weapon: see regulations');
  assert.equal(huntWeaponLabel({ ...base, pointOdds: { multiSeason: true } }), 'Multiple weapons · general seasons');
});
test('Idaho zone tags and Wyoming seasons use actual season evidence', () => {
  assert.equal(huntWeaponLabel({ state: 'ID', nrTag: true, weapon: 'ANY', tagSeasons: { seasons: [{ weapon: 'ARCHERY' }, { weapon: 'ANY' }] } }), 'Archery / Any weapon');
  assert.equal(huntWeaponLabel({ state: 'ID', nrTag: true, weapon: 'ANY' }), 'Weapon: see tag seasons');
  assert.equal(huntWeaponLabel({ state: 'WY', weapon: 'ANY', pointOdds: { regs: { segments: [{ archery: ['date'], regular: ['date'] }] } } }), 'Archery / regular seasons · see restrictions');
  assert.equal(huntWeaponLabel({ state: 'ID', id: 'nr:ELK:Boise:A', species: 'ELK', nrTag: true, weapon: 'ANY', tagSeasons: { seasons: [{ weapon: 'ANY' }] } }), 'A tag · archery group · Any weapon');
  assert.equal(huntWeaponLabel({ state: 'ID', id: 'nr:ELK:Boise:B', species: 'ELK', nrTag: true, weapon: 'ANY', tagSeasons: { seasons: [{ weapon: 'ARCHERY' }] } }), 'B tag · rifle group · Archery');
  assert.equal(huntWeaponLabel({ state: 'WY', weapon: 'ANY' }), 'Weapon: see regulations');
});
