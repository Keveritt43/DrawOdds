import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {HuntSummary} from '@prisma/client';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
import {runSearch,type HunterSettings} from '../src/lib/multiStateSearch';
import type {CoScored} from '../src/lib/coScores';
import {codeFromUnits,type UnitTables} from '../src/sync/co/harvest';
import {withCoHarvestCoverage} from '../src/lib/coHarvestCoverage';
import {mtHarvestProxy,mtProxyRate} from '../src/lib/mtHarvestProxy';
import {coBoundaryStart,coUnitBoundaryComparable} from '../src/lib/coBoundaryHistory';

const hunts=JSON.parse(readFileSync('data/wy/hunts.json','utf8')).hunts as HuntSummary[];
const find=(id:string)=>hunts.find(h=>h.id===id)!;
test('Wyoming region license uses WGFD valid areas and the direct nonresident survey',()=>{
  const raw=find('WY:elk:E'), before=JSON.stringify(raw), fixed=withStateTrophyScores(raw);
  assert.deepEqual(fixed.units,['E2','E3','E6','E116','E126','E129']);
  assert.equal(fixed.success5,719/962);assert.equal(fixed.harvestYears,1);
  assert.equal(fixed.huntersSqMi,null);assert.equal(fixed.scoreQuality,null);
  assert.equal((fixed.pointOdds as any).harvest[0].year,2025);
  assert.equal(JSON.stringify(raw),before);
  const settings={ID:'RESIDENT',CO:{res:'NONRESIDENT',DEER:0,ELK:0,PRONGHORN:0,youth:false,set:false}} as HunterSettings;
  const opts={states:'WY',species:'ELK',antler:'ALL',priv:'1'};
  assert.equal(runSearch([raw as CoScored],{...opts,unit:'WY:E117'},'WY',settings).length,0);
  assert.equal(runSearch([raw as CoScored],{...opts,unit:'WY:E126'},'WY',settings).length,1);
});
test('Colorado unit-based harvest requires all license units without duplicates',()=>{
  const table:UnitTables={split:{rifle2:[{unit:'1',mHarvest:10,mHunters:20},{unit:'2',mHarvest:5,mHunters:10}]},totals:{}};
  assert.deepEqual(codeFromUnits('DM001O2R',['1','2'],table),{harvest:15,hunters:30,days:null,basis:'split'});
  assert.equal(codeFromUnits('DM001O2R',['1','2','3'],table),null);
  assert.equal(codeFromUnits('DM001O2R',['1'],{...table,split:{rifle2:[table.split.rifle2![0],table.split.rifle2![0]]}}),null);
  assert.equal(codeFromUnits('DE001O2R',['1','2'],{split:{},totals:{rifle2:[{unit:'1',harvest:2,hunters:5}]}}),null);
  assert.equal(codeFromUnits('DM001O2R',['1'],{split:{},totals:{rifle2:[{unit:'1',male:4,harvest:6,hunters:10}]}}),null);
  assert.deepEqual(codeFromUnits('DE001O2R',['1'],{split:{},totals:{rifle2:[{unit:'1',harvest:6,hunters:10,days:25}]}}),{harvest:6,hunters:10,days:25,basis:'totals'});
});
test('Colorado sex-specific hunts do not use all-sex hunter counts',()=>{
  const row={id:'CO:DM001O1A',state:'CO',units:['1'],pointOdds:{harvest:[
    {year:2024,basis:'units-all',hunters:100,harvest:40},{year:2025,basis:'code',hunters:50,harvest:20}]}};
  const fixed=withCoHarvestCoverage(row) as typeof row & {success5:number;harvestYears:number};
  assert.equal(fixed.harvestYears,1);assert.equal(fixed.success5,.4);
  assert.deepEqual(fixed.pointOdds.harvest.map(h=>h.year),[2025]);
});
test('Colorado omits audited incomplete years without changing source data',()=>{
  const raw={id:'CO:DE043O1A',state:'CO',units:['43','47','431','471'],acres:6400,
    pointOdds:{regs:{partial:false},harvest:[{year:2021,basis:'units-all',hunters:209,harvest:40},{year:2025,basis:'code',hunters:100,harvest:50}]}};
  const before=JSON.stringify(raw),fixed=withCoHarvestCoverage(raw) as typeof raw & {success5:number;harvestYears:number;huntersSqMi:number};
  assert.equal(fixed.success5,.5);assert.equal(fixed.harvestYears,1);assert.equal(fixed.huntersSqMi,10);
  assert.deepEqual(fixed.pointOdds.harvest.map(h=>h.year),[2025]);assert.equal(JSON.stringify(raw),before);
  const changed={...raw,pointOdds:{regs:{partial:false},harvest:[{year:2021,basis:'units-all',hunters:210,harvest:40}]}};
  assert.equal(withCoHarvestCoverage(changed),changed,'changed source is not overwritten by a stale audit');
});
test('Montana issued-permit and all-deer denominators cannot become hunter success',()=>{
  const all=JSON.parse(readFileSync('data/mt/hunts.json','utf8')).hunts as HuntSummary[];
  for(const id of ['MT:deer-permit:202-50','MT:deer-general:202']) {
    const raw=all.find(h=>h.id===id)!;assert.ok(mtHarvestProxy(raw.pointOdds));assert.notEqual(mtProxyRate(raw.pointOdds),null);
    const corrected=withStateTrophyScores(raw);assert.equal(corrected.success5,null);assert.equal(corrected.scoreQuality,null);
    assert.equal(corrected.hunters5,null);assert.equal(corrected.huntersSqMi,raw.huntersSqMi);
  }
});
test('Montana district participation totals cannot masquerade as unique hunters',()=>{
  const all=JSON.parse(readFileSync('data/mt/hunts.json','utf8')).hunts as HuntSummary[];
  for(const id of ['MT:elk-b:210-03','MT:elk-general:391','MT:antelope:007-20']) {
    const raw=all.find(h=>h.id===id)!;assert.equal(mtHarvestProxy(raw.pointOdds),'district');
    const corrected=withStateTrophyScores(raw);assert.equal(corrected.success5,null);
    assert.equal(corrected.huntersSqMi,null);assert.equal(corrected.scoreQuality,null);
  }
});
test('Colorado changed boundaries exclude earlier observations while preserving unchanged unions',()=>{
  assert.equal(coBoundaryStart(['79']),2024);assert.equal(coBoundaryStart(['79','791']),0);
  assert.equal(coBoundaryStart(['79','791'],true),2024);
  assert.equal(coBoundaryStart(['43']),2024);assert.equal(coBoundaryStart(['43','431']),0);
  assert.equal(coBoundaryStart(['97']),2026);assert.equal(coBoundaryStart(['97','99']),0);
  assert.equal(coUnitBoundaryComparable('99',2025),false);assert.equal(coUnitBoundaryComparable('99',2026),true);
  const raw={id:'CO:DM079O1R',state:'CO',units:['79'],pointOdds:{harvest:[
    {year:2023,basis:'code',hunters:100,harvest:60},{year:2024,basis:'code',hunters:50,harvest:20}]}};
  const fixed=withCoHarvestCoverage(raw) as typeof raw & {success5:number;harvestYears:number};
  assert.equal(fixed.harvestYears,1);assert.equal(fixed.success5,.4);
  assert.deepEqual(fixed.pointOdds.harvest.map(h=>h.year),[2024]);
  const noCurrent=withCoHarvestCoverage({...raw,units:['97']}) as typeof fixed;
  assert.equal(noCurrent.harvestYears,0);assert.equal(noCurrent.success5,null);
  const unverifiedScope=withCoHarvestCoverage({...raw,units:['79','791']}) as typeof fixed;
  assert.equal(unverifiedScope.harvestYears,1,'unknown scope cannot claim the complete union');
  const completeRaw={...raw,units:['79','791'],pointOdds:{...raw.pointOdds,regs:{partial:false}}};
  assert.equal(withCoHarvestCoverage(completeRaw),completeRaw,'a verified full union remains unchanged');
});
