import assert from 'node:assert/strict';
import test from 'node:test';
import type { HuntSummary } from '@prisma/client';
import { withCoScores, withCoOpportunity } from '../src/lib/coScores';
import { withCoLand } from '../src/lib/coLand';
import { scoreHunts } from '../src/lib/score';
const row = (patch: Partial<HuntSummary> = {}) => ({id:'co-test', state:'CO', species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED', units:['70'], hunters5:1000,harvest5:500,harvestYears:5,success5:.5,huntablePct:null,bigPct5:null,privateOnly:false,...patch} as HuntSummary);
test('Colorado Quality matches Idaho fixed model for identical validated inputs',()=>{
 const r=row(),land=withCoLand(r),actual=withCoScores(r);
 const expected=scoreHunts([{...land,nrTag:false,resOdds5:null,nrOdds5:null}]).get(r.id)!;
 assert.equal(actual.scoreQuality,expected.scoreQuality);
 assert.equal(actual.scoreTrophy,null);
 assert.equal(actual.scoreOppNr,null);
 assert.ok(actual.scoreQuality!==null);
 assert.equal(withCoOpportunity(actual,.25,true).scoreOppNr,Math.round(actual.scoreQuality!*.5));
 assert.equal(withCoOpportunity(actual,null,true).scoreOppNr,null);
 assert.equal(withCoOpportunity(actual,1,false).scoreOppRes,actual.scoreQuality);
 assert.equal(r.publicPct,undefined,'no mutation of persisted input');
});
test('Colorado rejects impossible, mismatched, missing and small-sample inputs',()=>{
 for(const patch of [{harvest5:1001},{harvest5:-1},{hunters5:NaN},{success5:.9},{harvestYears:0},{hunters5:20,harvest5:10},{units:['missing']},{units:['70','missing']}]) assert.equal(withCoScores(row(patch)).scoreQuality,null,JSON.stringify(patch));
 assert.equal(withCoScores(row({privateOnly:true})).scoreAccess,0);
 const id=row({state:'ID'});assert.equal(withCoScores(id),id,'Idaho is untouched');
});

test('Colorado archery deer and pronghorn cannot inflate 38% harvest into elite Quality',()=>{
 for (const species of ['DEER','PRONGHORN'] as const) {
  const actual=withCoScores(row({species,weapon:'ARCHERY',harvest5:380,success5:.38}));
  const rifle=withCoScores(row({species,weapon:'ANY',harvest5:380,success5:.38}));
  assert.ok(actual.scoreQuality!==null && actual.scoreQuality<60);
  assert.ok(actual.scoreSuccess!==null && actual.scoreSuccess<40);
  assert.equal(actual.scoreQuality,rifle.scoreQuality);
 }
});
import { otcElkOverlap } from '../src/lib/overlappingSeasons';
import { dateRange } from '../src/lib/coDisplay';
test('OTC exclusion preserves unknown dates and rejects reversed spans',()=>{
 const target={id:'d',state:'CO',species:'DEER',units:['70'],openDate:new Date('2027-10-23'),closeDate:new Date('2027-10-31')};
 const elk={...target,id:'e',species:'ELK'};
 assert.equal(otcElkOverlap(target,[elk]),true);
 assert.equal(otcElkOverlap({...target,openDate:null},[elk]),null);
 assert.equal(otcElkOverlap(target,[{...elk,openDate:null}]),null);
 assert.equal(otcElkOverlap(target,[{...elk,openDate:new Date('2027-11-01'),closeDate:new Date('2027-11-15')}]),false);
 assert.equal(otcElkOverlap({...target,closeDate:new Date('2027-01-01')},[elk]),null);
 assert.equal(dateRange(new Date('2027-12-01'),new Date('2027-01-31')),'Dates need CPW verification');
 assert.match(dateRange(new Date('2026-12-01'),new Date('2027-01-31')),/2026.*2027/);
});
