import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {wyTagType, matchesWyTagType} from '../src/lib/wyTagType';
import {trophyForHunt, trophyForUnit} from '../src/lib/trophyHunt';
import {presetHref} from '../src/lib/filterPresets';

test('Wyoming numbered and general types filter independently and persist',()=>{
 const one={type:'CONTROLLED',tagCode:'D87-1'}, two={type:'CONTROLLED',tagCode:'D87-2'};
 assert.equal(wyTagType(one),'1'); assert.equal(wyTagType({type:'GENERAL',tagCode:'E98-gen'}),'general');
 assert.equal(wyTagType({type:'CONTROLLED',tagCode:'DR-A'}),'general');
 assert.equal(wyTagType({type:'CONTROLLED',tagCode:null}),null);
 assert.equal(matchesWyTagType(one,['1']),true); assert.equal(matchesWyTagType(two,['1']),false);
 assert.equal(matchesWyTagType(two,['1','2']),true); assert.equal(matchesWyTagType({type:'CONTROLLED',tagCode:null},['1']),false);
 assert.match(presetHref('/hunts?states=ID,WY&wyType=1%2C2')!,/wyType=1%2C2/);
});
test('Wyoming trophy considers eligibility and actual antler limits',()=>{
 const h={state:'WY',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',units:['D87'],tagCode:'D87-1',takeMethod:'Any deer'};
 assert.notEqual(trophyForHunt(h),null);
 assert.equal(trophyForHunt({...h,antlerClass:'ANTLERLESS'}),null);
 const restricted={...h,tagCode:'D87-2',takeMethod:'Antlered mule deer three (3) points or less on either antler or any white-tailed deer'};
 assert.equal(trophyForHunt(restricted),null); assert.equal(trophyForUnit(restricted,'D87').score,null);
 assert.notEqual(trophyForHunt({...h,takeMethod:'Antlered mule deer four (4) points or more on either antler'}),null);
 const id={...h,state:'ID',type:'GENERAL',units:['40'],tagCode:null,tagSeasons:{seasons:[{weapon:'ANY',sex:'antlered (2-point deer only)',notes:'',dates:[]}]}};
 assert.equal(trophyForHunt(id),null);
});
