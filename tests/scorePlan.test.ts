import test from 'node:test';
import assert from 'node:assert/strict';
import {scorePlan,validateScorePlan,type ScoreSnapshot} from '../src/lib/scorePlan';
import {idahoScoreSelect} from '../src/lib/idahoScoreSelect';
const rows:ScoreSnapshot=[{input:{id:'c:1',species:'ELK',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERLESS',hunters5:517,harvest5:97,huntablePct:73.8,huntersSqMi:.12,resOdds5:1,nrOdds5:1},before:{scoreQuality:87,scoreSuccess:80,scoreAccess:90,scoreCrowd:93,scoreTrophy:null,scoreOppRes:100,scoreOppNr:99}}];
test('score plans retain rollback values and reject stale or altered updates',()=>{
 const saved=scorePlan(rows);assert.equal(saved.rows[0].before.scoreQuality,87);assert.equal(saved.rows[0].after.scoreQuality,48);
 assert.deepEqual(validateScorePlan(saved,rows),saved);
 const stale=structuredClone(rows);stale[0].input.harvest5=100;assert.throws(()=>validateScorePlan(saved,stale));
 const scoresChanged=structuredClone(rows);scoresChanged[0].before.scoreQuality=86;assert.throws(()=>validateScorePlan(saved,scoresChanged));
 const tampered=structuredClone(saved);tampered.rows[0].after.scoreQuality=99;assert.throws(()=>validateScorePlan(tampered,rows));
 const oldModel=structuredClone(saved);oldModel.version='idaho-v2';assert.throws(()=>validateScorePlan(oldModel,rows));
 assert.throws(()=>validateScorePlan(saved,[]));
});
test('plan validation is independent of database collation order',()=>{
 const second=structuredClone(rows[0]);second.input.id='c:-2';
 const first=scorePlan([rows[0],second]);
 assert.deepEqual(validateScorePlan(first,[second,rows[0]]),first);
});
test('score snapshots include live identity, legal-animal and draw evidence, and reject changes',()=>{
 for(const field of ['tagCode','huntNumber','name','takeMethod','pointOdds','resOddsLast','nrOddsLast','tagSeasons'] as const)
  assert.equal(idahoScoreSelect[field],true,field);
 const row:ScoreSnapshot=[{input:{...rows[0].input,state:'ID',units:['54'],species:'DEER',antlerClass:'ANTLERED',huntNumber:1043,tagCode:null,oddsLastYear:2026,name:'Unit 54',takeMethod:'Any weapon',pointOdds:null,resOddsLast:.1},before:rows[0].before}];
 const plan=scorePlan(row);
 const changed=structuredClone(row);changed[0].input.takeMethod='2-point bucks only';
 assert.throws(()=>validateScorePlan(plan,changed));
 const changedCode=structuredClone(row);changedCode[0].input.tagCode='different';
 assert.throws(()=>validateScorePlan(plan,changedCode));
});
