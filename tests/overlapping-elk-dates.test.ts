import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {overlappingElkDates,overlapsElk} from '../src/lib/overlappingSeasons';

const target={id:'deer',state:'ID',species:'DEER',units:['54'],openDate:new Date('2026-10-05'),closeDate:new Date('2026-10-31')};
const elk={id:'elk',state:'ID',species:'ELK',units:['54'],openDate:new Date('2026-10-25'),closeDate:new Date('2026-11-15')};
const asDays=(spans:[Date,Date][])=>spans.map(([a,b])=>[a.toISOString().slice(0,10),b.toISOString().slice(0,10)]);
test('shows only the days both hunts are open',()=>{
  assert.deepEqual(asDays(overlappingElkDates(target,elk)),[['2026-10-25','2026-10-31']]);
  assert.equal(overlapsElk(target,elk),true);
  assert.deepEqual(overlappingElkDates(target,{...elk,units:['55']}),[]);
});
test('keeps closed gaps and merges duplicate season segments',()=>{
  const tagSeasons={seasons:[{dates:[{open:'2026-10-06',close:'2026-10-09'},{open:'2026-10-06',close:'2026-10-09'},{open:'2026-10-21',close:'2026-11-04'}]}]};
  assert.deepEqual(asDays(overlappingElkDates(target,{...elk,tagSeasons})),[['2026-10-06','2026-10-09'],['2026-10-21','2026-10-31']]);
  assert.deepEqual(overlappingElkDates(target,{...elk,tagSeasons:{seasons:[{uncertain:true,dates:[{open:'2026-10-06',close:'2026-10-09'}]}]}}),[]);
});
