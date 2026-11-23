import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { trophyQualityBonus } from '../src/lib/trophyTiers';
import { trophyForUnit, trophyForHunt } from '../src/lib/trophyHunt';
import { trophyClasses } from '../src/lib/mapMetrics';
import { scoreHunts } from '../src/lib/score';

test('trophy only adds quality premium above neutral',()=>{
 assert.equal(trophyQualityBonus(null),0);
 assert.equal(trophyQualityBonus(50),0);
 assert.equal(trophyQualityBonus(65),1.5);
 assert.equal(trophyQualityBonus(80),3);
 assert.equal(trophyQualityBonus(100),5);
});
test('map tiers use each unit and preserve missing-data and restriction handling',()=>{
 const h={state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',tagCode:'DM044O3R',oddsLastYear:2026,appsLast:791};
 assert.equal(trophyForUnit(h,'44').score,100);
 assert.equal(trophyForUnit(h,'34').score,50);
 assert.equal(trophyForUnit({...h,tagCode:'DM044O1R'},'44').score,65);
 assert.equal(trophyForUnit({...h,antlerClass:'ANTLERLESS'},'44').score,null);
 assert.equal(trophyForUnit({...h,tagSeasons:{year:2026,seasons:[{weapon:'ANY',sex:'3 point deer or fewer',notes:'',dates:[]}]}},'44').score,null);
 assert.notEqual(trophyForUnit({...h,name:'White-tailed Buck'},'44').score,100);
 assert.deepEqual(trophyClasses([50,65,80,100]).counts,[1,1,1,1]);
});
test('multi-unit hunt uses the conservative unit tier while map retains each unit tier',()=>{
 const h={id:'co-multi',state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',tagCode:'DM044O3R',oddsLastYear:2026,appsLast:791,units:['44','34'],hunters5:100,harvest5:60,publicPct:70,huntersSqMi:1};
 assert.equal(trophyForHunt(h),50);
 assert.equal(scoreHunts([h]).get(h.id)?.scoreTrophy,50);
 assert.equal(trophyForUnit(h,'44').score,100);
 assert.equal(trophyForUnit(h,'34').score,50);
});
test('Idaho legacy classifications do not gain a tier from low draw odds',()=>{
 const h={state:'ID',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',units:['54'],bigPct5:.85,resOdds5:.02,nrOdds5:.01,openDate:'2026-11-15',closeDate:'2026-11-30'};
 const tier=trophyForHunt(h);
 assert.equal(trophyForHunt({...h,resOdds5:.9,nrOdds5:.9}),tier);
 assert.equal(trophyForUnit(h,'54').score,tier);
 assert.equal(trophyForHunt({...h,antlerClass:'ANTLERLESS'}),null);
});
test('Colorado seasons use matching evidence rather than a blanket numbered-season score',()=>{
 const h={state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',units:['40'],oddsLastYear:2026};
 assert.equal(trophyForHunt({...h,tagCode:'DM040O2R',appsLast:388}),65);
 assert.equal(trophyForHunt({...h,tagCode:'DM040O3R',appsLast:450}),80);
 assert.equal(trophyForHunt({...h,tagCode:'DM040O4R',appsLast:173}),65);
 assert.equal(trophyForHunt({...h,tagCode:'DM040O4R',antlerClass:'ANTLERLESS'}),null);
});
test('Colorado trophy tiers do not change with draw cutoffs or the number awarded',()=>{
 const h={state:'CO',species:'DEER',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ANY',units:['70'],tagCode:'DM070O4R',oddsLastYear:2026};
 const cut=(points:number,drawnAtLevel:number)=>({pools:{nr:{cut:{points,drawnAtLevel}}}});
 assert.equal(trophyForHunt({...h,pointOdds:cut(14,2)}),65);
 assert.equal(trophyForHunt({...h,pointOdds:cut(20,2)}),65);
 assert.equal(trophyForHunt({...h,pointOdds:cut(20,0)}),65);
 assert.equal(trophyForHunt({...h,pointOdds:null}),65);
 const u40={...h,units:['40'],tagCode:'DM040O4R',appsLast:173};
 assert.equal(trophyForHunt({...u40,pointOdds:cut(28,1)}),65);
 assert.equal(trophyForHunt({...u40,pointOdds:cut(28,0)}),65);
});
test('Blue Mountains elk recognition follows actual early season windows',()=>{
 const h={state:'WA',species:'ELK',type:'CONTROLLED',antlerClass:'ANTLERED',weapon:'ARCHERY',units:['EA1008'],openDate:'2026-09-07',closeDate:'2026-09-24'};
 assert.equal(trophyForHunt(h),65);
 assert.equal(trophyForUnit(h,'EA1008').score,65);
 assert.equal(trophyForHunt({...h,antlerClass:'ANTLERLESS'}),null);
 assert.equal(trophyForHunt({...h,openDate:'2026-10-26',closeDate:'2026-11-08'}),50);
 assert.equal(trophyForHunt({...h,units:['172'],openDate:'2026-10-26',closeDate:'2026-11-08',hunters5:28,harvest5:21,resOddsLast:.009}),50);
 assert.equal(trophyForHunt({...h,units:['172'],openDate:'2026-10-26',closeDate:'2026-11-08',hunters5:3,harvest5:3,resOddsLast:.009}),50);
});
test('Idaho and Washington trophy tiers ignore draw-rate screens',()=>{
 const h={state:'ID',species:'DEER',type:'GENERAL',antlerClass:'ANTLERED',weapon:'ANY',units:['39'],openDate:'2026-11-01',closeDate:'2026-11-30',hunters5:1000,harvest5:190,harvestYears:5,nrOddsLast:.824,oddsLastYear:2026};
 const tier=trophyForHunt(h);
 assert.equal(trophyForHunt({...h,nrOddsLast:.1}),tier);
 assert.equal(trophyForHunt({...h,nrOddsLast:null}),tier);
 assert.equal(trophyForHunt({...h,harvest5:600}),tier);
 const wa={...h,state:'WA',type:'CONTROLLED',units:['247'],pointOdds:{kind:'squared',category:'Quality Deer'},oddsLastYear:2025,nrOddsLast:.05,hunters5:100,harvest5:49};
 assert.equal(trophyForHunt({...wa,nrOddsLast:.02}),trophyForHunt(wa));
});
test('reported Entiat and Swakane quality hunts retain their demand ordering', async()=>{
 const {readFile} = await import('node:fs/promises');
 const data=JSON.parse(await readFile('data/wa/hunts.json','utf8'));
 const entiat=data.hunts.find((h:any)=>h.id==='WA:1033');
 const swakane=data.hunts.find((h:any)=>h.id==='WA:1034');
 assert.ok(entiat && swakane);
 assert.ok(entiat.pointOdds.harvest.find((r:any)=>r.year===2025).apps > swakane.pointOdds.harvest.find((r:any)=>r.year===2025).apps);
 assert.equal(trophyForHunt(entiat),80);
 assert.equal(trophyForHunt(swakane),65);
});
test('Wyoming preference cutoffs and quotas do not change a trophy tier',async()=>{
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile('data/wy/hunts.json','utf8'));
 const hunt=data.hunts.find((h:any)=>h.id==='WY:antelope:038-2');assert.ok(hunt);
 const actual=trophyForHunt(hunt);
 assert.equal(actual,65);
 assert.equal(trophyForHunt({...hunt,pointOdds:{...hunt.pointOdds,pools:{}}}),actual);
 assert.equal(trophyForHunt({...hunt,nrOddsLast:.001,resOddsLast:.999}),actual);
});
test('Utah Zion general trophy tier is not capped by draw availability',async()=>{
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile('data/ut/hunts.json','utf8'));
 const hunt=data.hunts.find((h:any)=>h.id==='UT:DB1589');assert.ok(hunt);
 const actual=trophyForHunt(hunt);
 assert.equal(actual,65);
 assert.equal(trophyForHunt({...hunt,nrOddsLast:.001,resOddsLast:.001}),actual);
 assert.equal(trophyForHunt({...hunt,nrOddsLast:.999,resOddsLast:.999}),actual);
 const {runSearch}=await import('../src/lib/multiStateSearch');
 const settings={ID:'RESIDENT',CO:{res:'NONRESIDENT',DEER:0,ELK:0,PRONGHORN:0,youth:false,set:true}} as any;
 const result=runSearch([hunt],{states:'UT',species:'DEER',antler:'ANTLERED',trophy:'65'},'UT',settings);
 assert.equal(result.length,1);
 assert.equal(result[0].r.scoreTrophy,actual);
});
