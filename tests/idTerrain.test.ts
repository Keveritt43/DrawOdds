import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/id-terrain.json';
import { idTerrainBest, idTerrainUnit, matchesIdTerrain } from '../src/lib/idTerrain';

test('remote high-elevation acreage is the overlap and values preserve unknowns', () => {
  for (const [unit, value] of Object.entries(data.units)) {
    assert.ok(value.remoteHighAcres <= value.remoteAcres, unit);
    assert.ok(value.remoteHighAcres <= value.highAcres, unit);
    assert.ok(value.remoteAcres <= value.publicAcres, unit);
    assert.ok(value.highAcres <= value.publicAcres, unit);
    assert.ok(value.remoteHighAcres >= 0, unit);
  }
  assert.equal(idTerrainUnit('missing'), null);
  assert.equal(idTerrainBest(['missing'], true), null);
});

test('Idaho filter uses the same overlap, preserves other states and rejects unknown and private hunts', () => {
  const hunt = { state: 'ID', species: 'DEER', units: ['54'], privateOnly: false };
  const unit = idTerrainUnit('54')!;
  assert.ok(unit.remoteAcres > 0);
  assert.equal(matchesIdTerrain(hunt, String(unit.remoteAcres), ''), true);
  assert.equal(matchesIdTerrain(hunt, String(unit.remoteAcres + 1), ''), false);
  assert.equal(matchesIdTerrain(hunt, '1', '1'), unit.remoteHighAcres >= 1);
  assert.equal(matchesIdTerrain({ ...hunt, privateOnly: true }, '1', ''), false);
  assert.equal(matchesIdTerrain({ ...hunt, units: ['missing'] }, '1', ''), false);
  assert.equal(matchesIdTerrain({ ...hunt, state: 'CO' }, '1', '1'), true);
});

test('Idaho terrain settings survive saved multi-state searches', async () => {
  const { presetHref } = await import('../src/lib/filterPresets');
  const href = presetHref('/hunts?states=ID,CO&idRemote=3200&idHigh=1');
  assert.ok(href);
  const query = new URL(href, 'https://drawodds.local').searchParams;
  assert.equal(query.get('idRemote'), '3200');
  assert.equal(query.get('idHigh'), '1');
});
