import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreEvidence} from '../src/lib/scoreEvidence';

const base={state:'WY',species:'ELK',pointOdds:null,tagSeasons:null,scoreQuality:null};
test('explanations distinguish summed region rows from license rows and verified region data',()=>{
  assert.equal(scoreEvidence(base),null);
  assert.equal(scoreEvidence({...base,pointOdds:{harvestBasis:'summed'}})?.label,'Summed hunt areas');
  assert.equal(scoreEvidence({...base,pointOdds:{harvestBasis:'summed',verifiedRegionHarvest:true}}),null);
  assert.equal(scoreEvidence({...base,species:'DEER'})?.label,'Mixed deer harvest');
  assert.equal(scoreEvidence({...base,scoreQuality:75}),null);
});
test('uncertain Utah dates and Montana participation have distinct explanations',()=>{
  assert.equal(scoreEvidence({...base,state:'UT',tagSeasons:{seasons:[{uncertain:true}]}})?.label,'Dates vary');
  assert.equal(scoreEvidence({...base,state:'MT',pointOdds:{harvestBasis:'summed across districts'}})?.label,'District participation');
  assert.equal(scoreEvidence({...base,state:'MT',species:'DEER',pointOdds:{mulePermit:true}})?.label,'Permit context');
});
