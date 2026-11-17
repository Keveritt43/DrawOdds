import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {withIdahoVerifiedArea} from '../src/lib/idahoHuntCorrections';
import {scoreHunts} from '../src/lib/score';
import {trophyForHunt} from '../src/lib/trophyHunt';

const hunt={id:'id-1044',state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',
  huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24',units:['55','57'],
  publicPct:52,huntablePct:53,huntersSqMi:.1,privatePct:48,accessYesPct:1,accessYesCount:1,
  scoreQuality:87,scoreAccess:81,scoreCrowd:99,scoreOppRes:18,scoreOppNr:12,hunters5:127,harvest5:91};

test('verified Area 55 hunt removes Unit 57 without mutating stored data',()=>{
  const corrected=withIdahoVerifiedArea(hunt);
  assert.deepEqual(corrected.units,['55']);assert.deepEqual(hunt.units,['55','57']);
  assert.equal(corrected.publicPct,null);assert.equal(corrected.huntersSqMi,null);
  assert.equal(corrected.scoreQuality,null);assert.equal(trophyForHunt(corrected),65); // Idaho v2 tier table (Nov 17): 1044 ranks 65; the earlier early-Unit-55 exception (80) is superseded for 2026.
});

test('geographically invalid inputs do not produce a Quality or Opportunity score',()=>{
  const result=scoreHunts([hunt]).get(hunt.id)!;
  assert.equal(result.scoreTrophy,65);assert.equal(result.scoreQuality,null);
  assert.equal(result.scoreAccess,null);assert.equal(result.scoreCrowd,null);
  assert.equal(result.scoreOppRes,null);assert.equal(result.scoreOppNr,null);
});

test('the correction does not apply to another hunt or an unverified year',()=>{
  assert.equal(withIdahoVerifiedArea({...hunt,huntNumber:1045}).publicPct,52);
  assert.equal(withIdahoVerifiedArea({...hunt,oddsLastYear:2025}).publicPct,52);
});
