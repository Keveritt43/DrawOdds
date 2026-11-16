import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type {HuntSummary} from '@prisma/client';
import {withWyElkBoundaryHistory} from '../src/lib/wyElkBoundaryHistory';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
const data=JSON.parse(readFileSync('data/wy/hunts.json','utf8')).hunts as HuntSummary[];
const row=(id:string)=>data.find(h=>h.id===id)!;
test('2025 boundary change limits 117 and 123 history without altering raw records',()=>{
 const raw=row('WY:elk:117-1'), before=JSON.stringify(raw), fixed=withWyElkBoundaryHistory(raw);
 assert.equal(fixed.harvestYears,1);assert.equal(fixed.harvestLastYear,2025);assert.equal(fixed.hunters5,454);assert.equal(fixed.harvest5,277);assert.equal(fixed.success5,277/454);
 assert.equal((fixed.pointOdds as any).harvestPriorBoundaryAudit.length,5);assert.equal(JSON.stringify(raw),before);
 const other=withWyElkBoundaryHistory(row('WY:elk:123-4'));assert.equal(other.hunters5,83);assert.equal(other.harvest5,38);
 assert.equal(withStateTrophyScores(raw).success5,null);
});
test('2024 boundary change limits 54 and affected region aggregates',()=>{
 const fixed=withWyElkBoundaryHistory(row('WY:elk:054-1'));assert.equal(fixed.harvestYears,2);assert.equal(fixed.hunters5,112);assert.equal(fixed.harvest5,68);
 assert.deepEqual((withWyElkBoundaryHistory(row('WY:elk:W')).pointOdds as any).harvest.map((h:any)=>h.year),[2024,2025]);
 assert.deepEqual((withWyElkBoundaryHistory(row('WY:elk:E')).pointOdds as any).harvest.map((h:any)=>h.year),[2025]);
});
test('unaffected hunts are unchanged and absent usable history stays unknown',()=>{
 const raw=row('WY:elk:007-1');assert.equal(withWyElkBoundaryHistory(raw),raw);
 const missing=withWyElkBoundaryHistory({...row('WY:elk:123-4'),pointOdds:{harvest:[{year:2024,hunters:1,harvest:1}]}} as HuntSummary);
 assert.equal(missing.success5,null);assert.equal(missing.hunters5,null);assert.equal(missing.harvestYears,0);
});
import {runSearch,type HunterSettings} from '../src/lib/multiStateSearch';
import type {CoScored} from '../src/lib/coScores';
import {searchCsv} from '../src/lib/searchCsv';

test('finder keeps license rates separate from hunter filters and CSV success',()=>{
 const settings={ID:'RESIDENT',CO:{res:'NONRESIDENT',DEER:0,ELK:0,PRONGHORN:0,youth:false,set:false}} as HunterSettings;
 const row117=row('WY:elk:117-1') as CoScored;
 assert.equal(runSearch([row117],{states:'WY',species:'ELK',antler:'ALL',minSucc:'60'},'WY',settings).length,0);
 const result=runSearch([row117],{states:'WY',species:'ELK',antler:'ALL'},'WY',settings);
 assert.equal(result.length,1);assert.equal(result[0].r.success5,null);assert.equal(result[0].r.scoreQuality,null);
 const csv=searchCsv(result,'https://example.test');
 assert.match(csv,/Harvest success %,Hunter-seasons,Harvest small sample,WY harvest per active license \(not hunter success\)/);
 assert.match(csv,/2025,,,,Elk: 61\.01% \(2025; 1 season\)/);
});
