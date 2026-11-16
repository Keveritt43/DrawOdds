import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trophyV2Shadow,type TrophyV2Input} from '../src/lib/trophyV2Shadow';
const base:TrophyV2Input={namedSources:2,independentNamedSources:2,verifiedAgencyAntlerOrAge:false,countyEvidenceKnown:true,countyTier:1,boundaryVerified:true,privateLandPenalty:0,rawDemandPercentile:1,peerCount:18,allWeaponPercentile:null,weaponOffset:null,timingPoints:15,harvestPoints:null};
test('applies the guide weights and shrinks small cohorts without a hard peer cliff',()=>{
 const x=trophyV2Shadow(base)!;
 assert.equal(x.parts.corroboration,40);assert.equal(x.parts.demand,35*(18/26+8/26*.5));
 assert.equal(x.parts.harvest,5);assert.equal(x.harvestNeutral,true);assert.equal(x.confidence,'Verified');
});
test('withholds missing timing and uncalibrated small-cohort offset',()=>{
 assert.equal(trophyV2Shadow({...base,timingPoints:null}),null);
 assert.equal(trophyV2Shadow({...base,countyEvidenceKnown:false}),null);
 assert.equal(trophyV2Shadow({...base,peerCount:9,allWeaponPercentile:.8}),null);
 assert.ok(trophyV2Shadow({...base,peerCount:9,allWeaponPercentile:.8,weaponOffset:0}));
});
test('county-only evidence cannot be Elite, and does not imply independently verified sources',()=>{
 const x=trophyV2Shadow({...base,namedSources:0,independentNamedSources:0,verifiedAgencyAntlerOrAge:false,boundaryVerified:false})!;
 assert.ok(x.score<=84);assert.equal(x.confidence,'Provisional');
});
