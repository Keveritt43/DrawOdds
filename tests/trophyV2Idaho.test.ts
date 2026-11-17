import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bcCountyRates,idScore,rutCredit,rutDays,WEIGHTS} from '../src/lib/trophyV2Idaho';

test('rut days count only days inside the species window, with full credit at ten',()=>{
 assert.equal(rutDays('DEER','MULE','2026-11-15','2026-11-30'),16);
 assert.equal(rutDays('DEER','MULE','2026-10-05','2026-10-31'),0);
 assert.equal(rutDays('DEER','WHITETAIL','2026-11-25','2026-12-05'),6);
 assert.equal(rutDays('ELK',null,'2026-08-30','2026-09-24'),17);
 assert.equal(rutDays('PRONGHORN',null,'2026-09-25','2026-10-24'),11);
 assert.equal(rutDays('DEER','MULE','2026-11-30','2026-11-01'),null);
 assert.equal(rutCredit(16),1);assert.equal(rutCredit(5),.5);assert.equal(rutCredit(0),0);
});
test('weights add to 100, with B&C held to 5',()=>{
 assert.equal(Object.values(WEIGHTS).reduce((a,b)=>a+b,0),100);assert.equal(WEIGHTS.bc,5);
});
test('Unit 54: the 20-tag November hunt outscores the 300-tag October hunt on the same herd',()=>{
 // Same unit, so the same herd and evidence; 1043 has 62 applicants per tag and 16 rut days, 1042 12.6 and none.
 const same={animal:.85,publications:1,bc:.86};
 assert.ok(idScore({...same,demand:.86,rut:rutCredit(16)!})>idScore({...same,demand:.463,rut:rutCredit(0)!})+20);
});
test('B&C credit is a shrunk rate: the state rate earns nothing, small counts are pulled in',()=>{
 const r=bcCountyRates([{county:'Hot',entries:6,units:['a']},{county:'Avg',entries:2,units:['b']},{county:'One',entries:1,units:['c']},{county:'None',entries:0,units:['d']},{county:'NoHarvest',entries:3,units:['zz']}],{a:100,b:100,c:20,d:180});
 const by=Object.fromEntries(r.map(x=>[x.county,x]));
 assert.equal(r.length,4,'a county with no harvest is left out');
 assert.ok(Math.abs(by.Hot.credit-(8/4.25-1))<1e-12,'6 entries vs 2.25 expected shrinks to 0.88');assert.equal(by.None.credit,0);assert.equal(by.Avg.credit,0,'below the state rate earns nothing');
 assert.ok(by.One.credit<1&&by.One.credit>0,'one entry on a small harvest is shrunk, not full credit');
 assert.ok(Math.abs(by.Avg.shrunkRatio-(2+2)/(9*100/400+2))<1e-12);
});
import {rankTiers} from '../src/lib/trophyV2Idaho';
test('rank tiers: top 2% → 100, to 10% → 80, to 40% → 65; ties never split',()=>{
 const scores=Array.from({length:100},(_,i)=>100-i);
 const t=rankTiers(scores);
 assert.deepEqual([t[0],t[1],t[2],t[9],t[10],t[39],t[40],t[99]],[100,100,80,80,65,65,50,50]);
 assert.deepEqual(rankTiers([70,70,10,10,10]),[100,100,50,50,50],'tied hunts share the higher tier');
 assert.deepEqual(rankTiers([9,8,8,8,8,8,1,1,1,1]),[100,65,65,65,65,65,50,50,50,50],'five tied hunts straddling the 65 line (4 slots) all go up together');
 assert.deepEqual(rankTiers([5]),[100]);assert.deepEqual(rankTiers([]),[]);
});
