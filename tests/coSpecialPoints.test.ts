import { test } from 'node:test';
import assert from 'node:assert/strict';
import hunts from '../data/co-special-import.json';
import data from '../data/co-special-points.json';
import { specialAtLevel, specialPersonalOdds, specialPointHistory } from '../src/lib/coSpecialPoints';
import type { SpecialHunt } from '../src/lib/coSpecial';
import type { StatePoints } from '../src/lib/points';
import { evaluateHunt } from '../src/lib/multiStateSearch';
import type { CoScored } from '../src/lib/coScores';
import { parseGuestFavorites } from '../src/lib/guestFavorites';
import { presetStates } from '../src/lib/filterPresets';

const settings: StatePoints = {res:'RESIDENT',DEER:8,ELK:7,PRONGHORN:5,youth:false,set:true,specialSet:true,MOOSE:3,BIGHORN:3,GOAT:3,weighted:{MOOSE:0,BIGHORN:0,GOAT:0}};
test('every published point table preserves counts and unassigned CPW totals for every pool and year',()=>{
  assert.equal(Object.keys(data).length,369);
  for(const hunt of hunts.filter(h=>h.species!=='DESERT')){
    const history=specialPointHistory(hunt as SpecialHunt);
    assert.equal(history.length,hunt.draws.length);
    for(const draw of hunt.draws){
      const table=history.find(h=>h.year===draw.year)!;
      assert.ok(table);
      assert.equal(new Set(table.levels.map(r=>r[0]+':'+r[1])).size,table.levels.length);
      for(let pool=0;pool<4;pool++){
        assert.equal(table.levels.reduce((n,r)=>n+r[2+pool],0)+(table.unassigned?.[pool]??0),draw.apps[pool]);
        assert.equal(table.levels.reduce((n,r)=>n+r[6+pool],0)+(table.unassigned?.[pool+4]??0),draw.drew[pool]);
        for(const r of table.levels){assert.ok(r[6+pool]<=r[2+pool]);assert.ok(r[0]>=0&&r[0]<=3);assert.ok(r[1]>=0);}
      }
    }
  }
});
test('preference, weighted points, residency and age select independent reported cohorts without interpolating blanks',()=>{
  const history={year:2026,levels:[[3,0,10,20,4,2,1,2,1,0],[3,5,8,10,3,0,4,1,0,0],[2,0,5,2,0,0,0,0,0,0]]};
  assert.equal(specialAtLevel(history,3,0,false,false).odds,.1);
  assert.equal(specialAtLevel(history,3,5,false,false).odds,.5);
  assert.equal(specialAtLevel(history,3,0,false,true).odds,.25);
  assert.equal(specialAtLevel(history,3,0,true,true).odds,0);
  assert.equal(specialAtLevel(history,3,5,true,true).odds,null);
  assert.equal(specialAtLevel(history,3,4,false,false).odds,null);
  assert.equal(specialAtLevel(history,2,0,false,false).odds,0);
});
test('saved points change hunt odds and Opportunity through the same search/comparison evaluator',()=>{
  const hunt=hunts.find(h=>h.code==='GEG01O1A') as SpecialHunt;
  const table=specialPointHistory(hunt)[0];
  const levels=table.levels.filter(r=>r[0]===3&&r[2]>0);
  const a=levels.find(r=>r[6]>0)!, b=levels.find(r=>r[6]===0)!;
  assert.ok(a&&b);
  const A={...settings,weighted:{GOAT:a[1]}},B={...settings,weighted:{GOAT:b[1]}};
  const row={state:'CO',species:'GOAT',pointOdds:{special:hunt},scoreQuality:60} as unknown as CoScored;
  const first=evaluateHunt(row,{ID:'RESIDENT',CO:A},'proj'),second=evaluateHunt(row,{ID:'RESIDENT',CO:B},'proj');
  assert.equal(first.odds,a[6]/a[2]);assert.equal(second.odds,0);
  assert.notEqual(first.opportunity,second.opportunity);
  assert.equal(first.odds,specialPersonalOdds(hunt,false,A));
  assert.match(first.basis,new RegExp(a[1]+' weighted'));
});
test('desert sheep ignores point balances and reserved licenses never acquire public odds',()=>{
  const hunt=hunts.find(h=>h.species==='DESERT') as SpecialHunt;
  assert.equal(specialPersonalOdds(hunt,false,settings),specialPersonalOdds(hunt,false,{...settings,BIGHORN:0,weighted:{BIGHORN:40}}));
  const reserved=hunts.find(h=>h.code[5]==='G') as SpecialHunt;
  assert.equal(specialPersonalOdds(reserved,false,settings),null);
});
test('browser favorites stay bounded and preserve distinct state unit keys',()=>{
  assert.deepEqual(parseGuestFavorites('{broken'),{hunts:[],units:[]});
  assert.deepEqual(parseGuestFavorites(JSON.stringify({hunts:[-2,-2,'3',NaN],units:['1','co-1','1','xx-1','/login']})),{hunts:[-2],units:['1','co-1']});
  assert.equal(parseGuestFavorites(JSON.stringify({hunts:Array.from({length:100},(_,i)=>i)})).hunts.length,80);
});
test('saved filters are grouped by their own search states, including cross-state presets',()=>{
  assert.deepEqual(presetStates({name:'id',href:'/hunts?state=ID&restore=1'}),['ID']);
  assert.deepEqual(presetStates({name:'co',href:'/hunts?states=CO&draw=msg'}),['CO']);
  assert.deepEqual(presetStates({name:'both',href:'/hunts?states=CO,ID'}),['CO','ID']);
});
