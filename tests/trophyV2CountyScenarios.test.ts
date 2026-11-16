import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countyScenarios} from '../src/lib/trophyV2CountyScenarios';
import type {TrophyV2Input} from '../src/lib/trophyV2Shadow';
const input:Omit<TrophyV2Input,'countyTier'>={namedSources:4,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,boundaryVerified:false,rawDemandPercentile:.8,peerCount:20,allWeaponPercentile:null,timingPoints:15,harvestPoints:null};
test('county scenarios retain both bases when their numeric scores differ',()=>{
 const result=countyScenarios(input,[2,3],0)!;
 assert.equal(result.scenarios.length,2);assert.equal(result.scoreStable,false);
});
test('an identical result can be identified without choosing a county basis',()=>{
 const result=countyScenarios(input,[1,2],0)!;
 assert.equal(result.scoreStable,true);assert.equal(result.tierStable,true);
 assert.equal(countyScenarios(input,[],0),null);
});
