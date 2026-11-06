import assert from 'node:assert/strict';
import test from 'node:test';
import type { HuntSummary } from '@prisma/client';
import { coDeerPressure, type CoPressureContext, type PressureElk } from '../src/lib/coPressure';
import { withCoScores } from '../src/lib/coScores';
import { withCoLand } from '../src/lib/coLand';
const hunt=(patch:Partial<HuntSummary>={})=>({id:'d',state:'CO',species:'DEER',type:'CONTROLLED',units:['70'],weapon:'ANY',antlerClass:'ANTLERED',privateOnly:false,hunters5:1000,harvest5:600,harvestYears:5,success5:.6,openDate:new Date('2027-10-23'),closeDate:new Date('2027-10-31'),...patch} as HuntSummary);
const elk=(patch:Partial<PressureElk>={}):PressureElk=>({id:'e',state:'CO',species:'ELK',type:'GENERAL',tagCode:'EM000U2R',units:['70'],openDate:new Date('2027-10-23'),closeDate:new Date('2027-10-31'),...patch});
const context=():CoPressureContext=>({generalElk:[elk()],reports:[2020,2021,2022,2023,2024].map(year=>({year,source:'https://cpw.test/'+year,data:{totals:{rifle2:[{unit:'70',hunters:500,harvest:100}]},split:{}}}))});
test('overlapping general elk increases density, decreases Elbow room and reduces Quality at least 25%',()=>{
 const r=hunt(),before=withCoScores(r),after=withCoScores(r,context());
 assert.equal(after.coPressure?.elkHuntersPerYear,500);
 assert.equal(after.coPressure?.totalHuntersPerYear,700);
 assert.ok(after.huntersSqMi!>before.huntersSqMi!);
 assert.ok(after.scoreCrowd!<before.scoreCrowd!);
 assert.ok(after.scoreQuality!<=Math.floor(before.scoreQuality!*.75));
 assert.equal(after.success5,before.success5,'elk pressure must not change deer harvest success');
 assert.deepEqual(withCoScores(after,context()),after,'read-time recalculation must not compound pressure or penalty');
 assert.equal(r.huntersSqMi,undefined,'stored source must remain untouched');
});
test('overlap requires general elk, same state, shared unit and an actual open day',()=>{
 for(const patch of [{type:'CONTROLLED'},{state:'ID'},{units:['71']},{openDate:new Date('2027-11-01'),closeDate:new Date('2027-11-15')}]) {
   const c=context();c.generalElk=[elk(patch)]; const r=hunt();
   assert.equal(withCoScores(r,c).scoreQuality,withCoScores(r).scoreQuality,JSON.stringify(patch));
 }
 const id=hunt({state:'ID'});assert.equal(withCoScores(id,context()),id);
 assert.equal(withCoScores(hunt({species:'ELK'}),context()).scoreQuality,withCoScores(hunt({species:'ELK'})).scoreQuality);
});
test('duplicate overlapping codes and duplicate report rows cannot multiply elk pressure',()=>{
 const c=context(); c.generalElk.push(elk({id:'duplicate',tagCode:'EE000U2R'}));
 for(const r of c.reports) (r.data as any).totals.rifle2.push({unit:'70',hunters:500,harvest:100});
 assert.equal(withCoScores(hunt(),c).coPressure?.elkHuntersPerYear,500);
 assert.equal(withCoScores(hunt(),c).coPressure?.evidence.length,1);
});
test('missing, negative, conflicting or ambiguous counts leave pressure and Quality unknown',()=>{
 for(const type of ['missing','negative','conflict','ambiguous']) {
   const c=context(); for(const rep of c.reports) {
     const t=rep.data as any;
     if(type==='missing')t.totals={};
     if(type==='negative')t.totals.rifle2[0].hunters=-1;
     if(type==='conflict')t.totals.rifle2.push({unit:'70',hunters:800});
     if(type==='ambiguous')t.ambiguous=[{unit:'70',kind:'rifle2',split:false,rows:[]}];
   }
   const r=withCoScores(hunt(),c);
   assert.equal(r.coPressure?.status,'missing',type);assert.equal(r.huntersSqMi,null,type);assert.equal(r.scoreQuality,null,type);
 }
});
test('multi-unit pressure counts only shared units and requires complete coverage',()=>{
 const c=context(); c.generalElk=[elk({units:['70','71','72']})];
 const r=hunt({units:['70','71']});
 assert.equal(withCoScores(r,c).scoreQuality,null,'a missing affected unit cannot be silently omitted');
 for(const rep of c.reports) (rep.data as any).totals.rifle2.push({unit:'71',hunters:300},{unit:'72',hunters:9000});
 const p=withCoScores(r,c).coPressure!;
 assert.equal(p.elkHuntersPerYear,800);assert.equal(p.evidence.length,2);
});
test('only five latest survey years are used; unknown dates never create an overlap penalty',()=>{
 const c=context();c.reports.push({year:2019,source:'old',data:{totals:{rifle2:[{unit:'70',hunters:100000}]}}});
 assert.equal(withCoScores(hunt(),c).coPressure?.elkHuntersPerYear,500);
 const p=coDeerPressure(withCoLand(hunt({openDate:null})),c);assert.equal(p.status,'unknown');
});
