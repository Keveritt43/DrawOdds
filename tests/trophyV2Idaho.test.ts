import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bcCountySignificance,bhAdjust,idScore,poissonUpper,rutCredit,rutDays,tierFor} from '../src/lib/trophyV2Idaho';

test('rut days count only days inside the species window, with full credit at ten',()=>{
 assert.equal(rutDays('DEER','MULE','2026-11-15','2026-11-30'),16);
 assert.equal(rutDays('DEER','MULE','2026-10-05','2026-10-31'),0);
 assert.equal(rutDays('DEER','WHITETAIL','2026-11-25','2026-12-05'),6);
 assert.equal(rutDays('ELK',null,'2026-08-30','2026-09-24'),17);
 assert.equal(rutDays('PRONGHORN',null,'2026-09-25','2026-10-24'),11);
 assert.equal(rutDays('DEER','MULE','2026-11-30','2026-11-01'),null);
 assert.equal(rutCredit(16),1);assert.equal(rutCredit(5),.5);assert.equal(rutCredit(0),0);
});
test('Unit 54: the 20-tag November hunt outranks the 300-tag October hunt',()=>{
 // 1043: 62 applicants per tag, 16 rut days, high 4-point share. 1042: 12.6 per tag, no rut days.
 const nov=idScore({demand:.86,animal:.924,evidence:.64,rut:rutCredit(16)!});
 const oct=idScore({demand:.463,animal:.182,evidence:.64,rut:rutCredit(0)!});
 assert.ok(tierFor(nov)>tierFor(oct));assert.equal(tierFor(nov),100);assert.equal(tierFor(oct),50);
});
test('Poisson tail and Benjamini–Hochberg behave at the edges',()=>{
 assert.equal(poissonUpper(0,3),1);
 assert.ok(Math.abs(poissonUpper(1,1)-(1-Math.exp(-1)))<1e-12);
 assert.deepEqual(bhAdjust([.01,.04,.03]),[.03,.04,.04]);
});
test('a county is significant only above the state rate and after correction',()=>{
 const harvest={a:500,b:500,c:500,d:500,e:500};
 const r=bcCountySignificance([{county:'Hot',entries10:8,units:['a']},{county:'Cold1',entries10:0,units:['b']},{county:'Cold2',entries10:0,units:['c']},{county:'Cold3',entries10:0,units:['d']},{county:'One',entries10:1,units:['e']},{county:'NoHarvest',entries10:3,units:['zz']}],harvest);
 assert.equal(r.length,5,'a county with no harvest is left out');
 assert.equal(r.find(x=>x.county==='Hot')!.significant,true);
 assert.equal(r.find(x=>x.county==='One')!.significant,false);
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
