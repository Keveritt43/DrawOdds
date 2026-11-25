import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {withIdahoVerifiedArea} from '../src/lib/idahoHuntCorrections';
import {scoreHunts} from '../src/lib/score';
import {trophyForHunt} from '../src/lib/trophyHunt';

const hunt={id:'id-1044',state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',
  huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24',units:['55','57'],
  publicPct:52,huntablePct:53,huntersSqMi:.1,privatePct:48,accessYesPct:1,accessYesCount:1,acres:900000,
  scoreQuality:87,scoreAccess:81,scoreCrowd:99,scoreOppRes:18,scoreOppNr:12,hunters5:127,harvest5:91,harvestYears:5,resOdds5:.04,nrOdds5:.02};

test('verified Area 55 hunt removes Unit 57 without mutating stored data',()=>{
  const corrected=withIdahoVerifiedArea(hunt);
  assert.deepEqual(corrected.units,['55']);assert.deepEqual(hunt.units,['55','57']);
  assert.equal(corrected.publicPct,52.4);assert.equal(corrected.acres,648520);
  assert.ok(Math.abs(corrected.huntersSqMi!-127/5/(648520/640))<1e-12);
  assert.equal(trophyForHunt(corrected),80);
});

test('verified unit inputs produce a Quality and Opportunity score',()=>{
  const result=scoreHunts([hunt]).get(hunt.id)!;
  assert.equal(result.scoreTrophy,80);assert.notEqual(result.scoreQuality,null);
  assert.notEqual(result.scoreAccess,null);assert.notEqual(result.scoreCrowd,null);
  assert.notEqual(result.scoreOppRes,null);assert.notEqual(result.scoreOppNr,null);
  assert.equal(scoreHunts([{...hunt,harvestYears:null}]).get(hunt.id)!.scoreQuality,null);
});

test('the correction does not apply to another hunt or an unverified year',()=>{
  assert.equal(withIdahoVerifiedArea({...hunt,huntNumber:1045}).publicPct,52); // wrong dates for 1045
  assert.equal(withIdahoVerifiedArea({...hunt,oddsLastYear:2025}).publicPct,52);
});

test('other confirmed full-unit deer and moose hunts also exclude Unit 57',()=>{
  const others=[
    {species:'DEER',huntNumber:1045,openDate:'2026-10-05',closeDate:'2026-10-31'},
    {species:'DEER',huntNumber:1062,openDate:'2026-11-01',closeDate:'2026-11-14'},
    {species:'MOOSE',huntNumber:3057,openDate:'2026-08-30',closeDate:'2026-11-23'},
  ];
  for(const id of others)assert.deepEqual(withIdahoVerifiedArea({...hunt,...id}).units,['55']);
});
