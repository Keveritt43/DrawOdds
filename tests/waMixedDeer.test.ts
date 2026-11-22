import {test} from 'node:test';
import assert from 'node:assert/strict';
import wa from '../data/wa/hunts.json';
import {withWaMixedBuckPermit,isWaMixedBuckPermit} from '../src/lib/waMixedDeer';
import {seasonRules,seasonsClass,shortSex} from '../src/lib/tagSeasons';
import {matchesHuntSeason} from '../src/lib/huntSeasonFilter';
import {trophyForHunt,waLegalDeerType} from '../src/lib/trophyHunt';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
import type {HuntSummary} from '@prisma/client';
import {runSearch,type HunterSettings} from '../src/lib/multiStateSearch';
import type {CoScored} from '../src/lib/coScores';

test('the WDFW mixed permit supports both antler filters without claiming whitetail-only',()=>{
 const raw=wa.hunts.find(h=>h.id==='WA:1511')!;
 assert.ok(raw);
 const corrected=withWaMixedBuckPermit(raw);
 assert.equal(raw.antlerClass,'ANTLERLESS');
 assert.equal(corrected.antlerClass,'EITHER');
 assert.equal(seasonsClass(corrected.tagSeasons.seasons),'EITHER');
 assert.deepEqual(seasonRules(corrected.tagSeasons,'DEER'),[]);
 assert.equal(shortSex(corrected.takeMethod),'any buck or antlerless whitetail');
 assert.equal(waLegalDeerType(corrected.takeMethod),null);
 const r={...corrected,openDate:new Date(corrected.openDate!),closeDate:new Date(corrected.closeDate!)};
 const f={youth:'include' as const,antler:['ANTLERED'],weapon:[],months:[],dayFrom:null,dayTo:null,dayMode:'open' as const};
 assert.equal(matchesHuntSeason(r,f,true),true);
 assert.equal(matchesHuntSeason(r,{...f,antler:['ANTLERLESS']},true),true);
 assert.equal(trophyForHunt(corrected),null,'mixed legal bucks have no species-specific trophy rating');
 const prepared=withStateTrophyScores(r as unknown as HuntSummary);
 assert.equal(prepared.antlerClass,'EITHER');
 assert.equal(prepared.scoreTrophy,null);
 const settings={ID:'RESIDENT',CO:{res:'NONRESIDENT',DEER:0,ELK:0,PRONGHORN:0,youth:false,set:true}} as HunterSettings;
 for(const antler of ['ANTLERED','ANTLERLESS']){
  const results=runSearch([r as unknown as CoScored],{states:'WA',species:'DEER',youth:'include',antler},'WA',settings);
  assert.equal(results.length,1,`${antler} finder should include the permit`);
  assert.equal(results[0].r.antlerClass,'EITHER');
 }
});
test('correction is constrained to the published 2026 WA special permit wording',()=>{
 const raw=wa.hunts.find(h=>h.id==='WA:1511')!;
 assert.equal(isWaMixedBuckPermit('White-tailed, antlerless'),false);
 assert.equal(withWaMixedBuckPermit({...raw,state:'ID'}).antlerClass,'ANTLERLESS');
 assert.equal(withWaMixedBuckPermit({...raw,tagSeasons:{...raw.tagSeasons,year:2027}}).antlerClass,'ANTLERLESS');
 assert.equal(waLegalDeerType('White-tailed, Any Buck'),'WHITETAIL');
});
