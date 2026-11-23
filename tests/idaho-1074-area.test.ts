import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idahoUnitCandidate, withIdahoVerifiedArea } from '../src/lib/idahoHuntCorrections';

test('2026 Idaho deer 1074 includes both units and suppresses wrong-area metrics', () => {
  const hunt = { state:'ID', species:'DEER', huntNumber:1074, areaName:'41-1', openDate:'2026-08-15', closeDate:'2026-09-30', units:['41'], publicPct:50, huntersSqMi:1, scoreQuality:70 };
  const corrected = withIdahoVerifiedArea(hunt);
  assert.deepEqual(corrected.units,['41','42']);
  assert.equal(corrected.publicPct,null);
  assert.equal(corrected.huntersSqMi,null);
  assert.equal(corrected.scoreQuality,null);
  assert.deepEqual(withIdahoVerifiedArea({...hunt,closeDate:'2027-09-30'}).units,['41']);
  assert.deepEqual(withIdahoVerifiedArea({...hunt,state:'WY'}).units,['41']);
  assert.ok('OR' in idahoUnitCandidate('42'));
  assert.deepEqual(idahoUnitCandidate('41'),{units:{has:'41'}});
});
