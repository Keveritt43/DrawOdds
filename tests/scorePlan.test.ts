import test from 'node:test';
import assert from 'node:assert/strict';
import {scorePlan,validateScorePlan,type ScoreSnapshot} from '../src/lib/scorePlan';
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
