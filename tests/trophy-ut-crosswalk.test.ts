import test from 'node:test';
import assert from 'node:assert/strict';
import crosswalk from '../data/trophy-ut-wmu-crosswalk.json';

test('Utah association is species-scoped and does not equate unrelated boundary IDs', () => {
  assert.ok(crosswalk.links.length > 0);
  assert.ok(crosswalk.links.every(r => r.portion >= .9));
  assert.ok(crosswalk.links.some(r => r.species === 'DEER' && r.huntBoundary === '607' && r.managementUnit === '1'));
  assert.equal(crosswalk.links.some(r => r.species === 'DEER' && r.huntBoundary === '28'), false);
  assert.equal(crosswalk.links.some(r => r.species === 'DEER' && r.huntBoundary === '1' && r.managementUnit === '1'), false);
});
