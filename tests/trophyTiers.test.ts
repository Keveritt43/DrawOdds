import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyTrophy, trophyQualityBonus } from '../src/lib/trophyTiers';
import { trophyForUnit, trophyForHunt } from '../src/lib/trophyHunt';
import { trophyClasses } from '../src/lib/mapMetrics';
import { scoreHunts } from '../src/lib/score';

const elk = {species:'ELK',state:'AZ',units:['9'],antlerClass:'ANTLERED'};
test('unicorn only for matching season',()=>{
 assert.equal(classifyTrophy({...elk,season:'early archery'}).score,100);
 assert.equal(classifyTrophy({...elk,season:'early muzzleloader'}).score,80);
 assert.equal(classifyTrophy(elk).score,80);
});
test('antlerless excluded rather than assigned a zero or fifty',()=>{
 const r=classifyTrophy({...elk,antlerClass:'ANTLERLESS',season:'early rifle'});
 assert.equal(r.score,null); assert.equal(r.tier,null);
});
test('maximum-antler restriction is excluded and missing unit is unknown',()=>{
 assert.equal(classifyTrophy({...elk,antlerMaximum:true,season:'early archery'}).score,null);
 assert.equal(classifyTrophy({...elk,units:[]}).score,null);
});
test('supplied unit associations receive 65; units without a designation remain neutral',()=>{
 assert.equal(classifyTrophy({species:'DEER',state:'CO',units:['34'],antlerClass:'ANTLERED'}).score,65);
 assert.equal(classifyTrophy({species:'ELK',state:'CO',units:['34'],antlerClass:'ANTLERED'}).score,50);
 assert.equal(classifyTrophy({species:'ELK',state:'ID',units:['999'],antlerClass:'ANTLERED'}).score,50);
 assert.equal(classifyTrophy({species:'DEER',state:'WA',units:['250'],antlerClass:'ANTLERED',type:'CONTROLLED'}).score,65);
});
test('trophy only adds quality premium above neutral',()=>{
 assert.equal(trophyQualityBonus(null),0);
 assert.equal(trophyQualityBonus(50),0);
 assert.equal(trophyQualityBonus(65),1.5);
 assert.equal(trophyQualityBonus(80),3);
 assert.equal(trophyQualityBonus(100),5);
});
test('Utah uses hunt boundary identifiers; general hunts retain a lower recognized tier',()=>{
 const h={species:'DEER',state:'UT',units:['94'],antlerClass:'ANTLERED'};
 assert.equal(classifyTrophy({...h,type:'CONTROLLED'}).score,100);
 assert.equal(classifyTrophy({...h,type:'GENERAL'}).score,80);
 assert.equal(classifyTrophy({...h,units:['15'],type:'CONTROLLED'}).score,50);
});
test('map tiers use each unit and only eligible Colorado late rifle hunts',()=>{
 const h={state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',tagCode:'DM044O3R'};
 assert.equal(trophyForUnit(h,'44').score,100);
 assert.equal(trophyForUnit(h,'34').score,65);
 assert.equal(trophyForUnit({...h,tagCode:'DM044O1R'},'44').score,80);
 assert.equal(trophyForUnit({...h,antlerClass:'ANTLERLESS'},'44').score,null);
 assert.equal(trophyForUnit({...h,tagSeasons:{year:2026,seasons:[{weapon:'ANY',sex:'3 point deer or fewer',notes:'',dates:[]}]}},'44').score,null);
 assert.equal(trophyForUnit({...h,name:'White-tailed Buck'},'44').score,null);
 assert.deepEqual(trophyClasses([50,65,80,100]).counts,[1,1,1,1]);
});
test('reviewed demand upgrades controlled hunts while general hunts receive 65',()=>{
 const h={species:'DEER',state:'WA',units:['290'],antlerClass:'ANTLERED'};
 assert.equal(classifyTrophy({...h,type:'CONTROLLED'}).score,80);
 assert.equal(classifyTrophy({...h,type:'GENERAL'}).score,65);
 assert.equal(classifyTrophy({...h,type:'CONTROLLED',antlerClass:'ANTLERLESS'}).score,null);
 assert.equal(classifyTrophy({...h,units:['250'],type:'CONTROLLED'}).score,65);
});
test('multi-unit hunt score uses its best unit while map retains each unit tier',()=>{
 const h={id:'co-multi',state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',tagCode:'DM044O3R',units:['44','34'],hunters5:100,harvest5:60,publicPct:70,huntersSqMi:1};
 assert.equal(trophyForHunt(h),100);
 assert.equal(scoreHunts([h]).get(h.id)?.scoreTrophy,100);
 assert.equal(trophyForUnit(h,'44').score,100);
 assert.equal(trophyForUnit(h,'34').score,65);
});
