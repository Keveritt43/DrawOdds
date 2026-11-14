import test from 'node:test';
import assert from 'node:assert/strict';
import {unlistedExceptionalHunt} from '../src/lib/trophyHuntDemandCandidate';

test('multi-unit hunt demand is usable only for an established unlisted hunt and matching observation', () => {
  const h = {state:'MT',species:'PRONGHORN',code:'007-20',year:2026,applications:10151,
    units:['A702','A704','A705','A701S','A703S'],sourceCoverage:'absent' as const};
  assert.equal(unlistedExceptionalHunt(h),true);
  assert.equal(unlistedExceptionalHunt({...h,sourceCoverage:'unknown'}),false);
  assert.equal(unlistedExceptionalHunt({...h,sourceCoverage:'present'}),false);
  assert.equal(unlistedExceptionalHunt({...h,units:['A702']}),false);
  assert.equal(unlistedExceptionalHunt({...h,applications:10150}),false);
});
