import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {HuntSummary} from '@prisma/client';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
import {trophyForUnit} from '../src/lib/trophyHunt';
import {runSearch, type HunterSettings} from '../src/lib/multiStateSearch';
import type {CoScored} from '../src/lib/coScores';
import {searchCsv} from '../src/lib/searchCsv';
const data=JSON.parse(readFileSync('data/wa/hunts.json','utf8'));
const row=(id:string)=>data.hunts.find((h:{id:string})=>h.id===id) as HuntSummary;
test('Washington quality elk peer threshold is reproduced from comparable 2025 hunts',()=>{
 const peers=data.hunts.filter((h:any)=>h.state==='WA'&&h.species==='ELK'&&h.type==='CONTROLLED'&&h.pointOdds?.category==='Quality Elk'&&!h.youthOnly&&!h.privateOnly&&h.antlerClass==='ANTLERED'&&h.oddsLastYear===2025&&h.appsLast>0).map((h:any)=>h.appsLast).sort((a:number,b:number)=>a-b);
 assert.equal(peers.length,93);assert.equal(peers[Math.ceil(.95*peers.length)-1],1242);
});
test('Colockum follows reviewed annual choices, repairs dates and earns Excellent from exceptional demand',()=>{
 const input=row('WA:2016'),before=JSON.stringify(input),h=withStateTrophyScores(input);
 assert.equal(h.openDate?.toISOString().slice(0,10),'2026-09-25');
 assert.equal(h.closeDate?.toISOString().slice(0,10),'2026-09-29');
 assert.equal(h.hunters5,5);assert.equal(h.harvest5,5);assert.equal(h.harvestYears,5);
 assert.equal(h.smallSample,true);assert.equal(h.scoreQuality,null);assert.equal(h.oddsByPts,null);
 assert.deepEqual((h.pointOdds as {harvest:{year:number}[]}).harvest.map(x=>x.year),[2021,2022,2023,2024,2025]);
 assert.equal(h.scoreTrophy,80);assert.equal(trophyForUnit(h,'328').score,80);
 assert.equal(JSON.stringify(input),before);
});
test('legacy unverified same-number histories still exclude the older late season',()=>{
 const source=row('WA:2016');const po=source.pointOdds as any;
 const input={...source,pointOdds:{...po,harvestIdentityBasis:undefined,harvest:po.harvestPriorToLineageAudit}};
 const h=withStateTrophyScores(input);
 assert.equal(h.hunters5,3);assert.equal(h.harvest5,3);assert.equal(h.harvestYears,3);
 assert.equal(h.oddsByPts,null);
});
test('high same-category demand promotes an early permit independently of the award rate',()=>{
 const input=withStateTrophyScores(row('WA:2016'));
 assert.equal(trophyForUnit({...input,appsLast:1200},'328').score,65);
 assert.equal(trophyForUnit({...input,resOddsLast:.04},'328').score,80);
 assert.equal(trophyForUnit({...input,resOddsLast:null},'328').score,80);
 assert.equal(trophyForUnit({...input,oddsLastYear:2024},'328').score,65);
 assert.equal(trophyForUnit({...input,antlerClass:'ANTLERLESS'},'328').score,null);
});
test('Teanaway single-unit demand is evaluated on that hunt, not the busiest hunt in the county',()=>{
 const colockum=withStateTrophyScores(row('WA:2016'));
 const teanaway=withStateTrophyScores(row('WA:2018'));
 assert.equal(colockum.scoreTrophy,80);
 assert.equal(teanaway.scoreTrophy,50);
 assert.ok((teanaway.appsLast??0)<(colockum.appsLast??0));
});
test('date corrections are limited to verified hunts and do not override existing dates',()=>{
 const h=withStateTrophyScores(row('WA:2019'));assert.equal(h.openDate?.toISOString().slice(0,10),'2026-09-25');
 const existing=new Date('2026-09-24T12:00:00Z');
 assert.equal(withStateTrophyScores({...row('WA:2016'),openDate:existing}).openDate,existing);
});
test('finder applies corrected dates and Excellent filter to the same hunt',()=>{
 const settings={ID:'RESIDENT',CO:{res:'NONRESIDENT',DEER:0,ELK:0,PRONGHORN:0,youth:false,set:true}} as HunterSettings;
 const results=runSearch([row('WA:2016') as CoScored],{states:'WA',species:'ELK',antler:'ALL',trophy:'80',from:'09-25',to:'09-29'},'WA',settings);
 assert.equal(results.length,1);assert.equal(results[0].r.id,'WA:2016');assert.equal(results[0].odds,null);
 const csv=searchCsv(results,'https://example.test');
 assert.match(csv,/Hunter-seasons,Harvest small sample/);
 assert.match(csv,/,100,5,Yes,/);
});
