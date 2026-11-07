import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePresets, presetHref, presetName, PRESET_LIMIT, readPresets } from '../src/lib/filterPresets';

test('a saved search reloads the states, scoped filters, sort, and view from page one', () => {
  assert.equal(presetHref('/hunts?states=ID,CO&deerType=MULE&season=2&minPublic=35&sort=opp&view=table&page=7&reset=1&as=nr'),
    '/hunts?states=CO%2CID&deerType=MULE&season=2&minPublic=35&sort=opp&view=table');
  assert.equal(presetHref('/hunts?state=ID&draw=msg&species=MOOSE&unknown=x'), '/hunts?state=ID&restore=1&draw=msg&species=MOOSE');
  for (const invalid of ['https://example.test/hunts?states=CO', '/hunts/1?states=CO', '/hunts?state=UNKNOWN', '/hunts']) {
    assert.equal(presetHref(invalid), null);
  }
});

test('named presets require an explicit replacement and can be deleted', () => {
  const href = '/hunts?states=ID';
  const current = [{ name: 'Fall deer', href }];
  assert.equal(presetName('  Fall  deer '), 'Fall deer');
  assert.equal(presetName('   '), null);
  assert.ok(changePresets(current, { name: 'fall deer', href }).error);
  assert.deepEqual(changePresets(current, { name: 'fall deer', href: '/hunts?states=CO', replace: true }).presets, [{ name: 'fall deer', href: '/hunts?states=CO' }]);
  assert.deepEqual(changePresets(current, { name: 'fall deer', href: null }).presets, []);
  const full = Array.from({ length: PRESET_LIMIT }, (_, i) => ({ name: String(i), href }));
  assert.ok(changePresets(full, { name: 'extra', href }).error);
});

test('preset reads ignore invalid account entries and other preferences', () => {
  assert.deepEqual(readPresets({ CO: { DEER: 5 }, _hunt_presets: [{ name: 'Fall', href: '/hunts?states=CO' }, { name: 'bad', href: '/account' }, null] }),
    [{ name: 'Fall', href: '/hunts?states=CO' }]);
});
