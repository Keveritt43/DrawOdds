import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/id-conditions.json';
import { idConditionsUnit, matchesIdConditions, idConditionsExport } from '../src/lib/idConditions';
import { presetHref } from '../src/lib/filterPresets';

test('dated Idaho conditions retain unit, station and distinct prior-year evidence',()=>{
 assert.equal(Object.keys(data.units).length,100);
 const unit=idConditionsUnit('54');assert.ok(unit);assert.equal(unit.snow?.station,'Magic Mountain');
 assert.equal(unit.snow?.history['2023'].swe,29);assert.equal(unit.snow?.history['2026'].swe,0.3);
 assert.ok(unit.snow?.current?.date && unit.snow.current.date<=data.snapshot);
 if(data.snapshot==='2026-11-23'){assert.equal(unit.snow.current.date,'2026-11-22');assert.equal(unit.snow.current.swe,2.7);}
 assert.ok(unit.drought.current>=0 && unit.drought.current<=100);
 for(const x of Object.values(data.units)) for(const pct of Object.values(x.drought)) assert.ok(pct>=0&&pct<=100);
 assert.equal(idConditionsUnit('unknown'),null);
});
test('Idaho filters preserve unknowns and do not restrict another state',()=>{
 assert.equal(matchesIdConditions({state:'ID',units:['unknown']},'1',''),false);
 assert.equal(matchesIdConditions({state:'CO',units:['unknown']},'10','75'),true);
 const x=idConditionsUnit('54');assert.ok(x);
 assert.equal(matchesIdConditions({state:'ID',units:['54']},String(x.trailheads.length+1),''),false);
 assert.equal(matchesIdConditions({state:'ID',units:['54']},'',String(x.drought.current)),true);
 assert.equal(matchesIdConditions({state:'ID',units:['54']},'1','101'),false);
});
test('the same unit must meet both Idaho access-site and drought filters',()=>{
 const entries=Object.entries(data.units);const a=entries.find(([,x])=>x.trailheads.length===0 && x.drought.current===100);const b=entries.find(([,x])=>x.trailheads.length>0 && x.drought.current===0);
 assert.ok(a&&b);assert.equal(matchesIdConditions({state:'ID',units:[a[0],b[0]]},'1','100'),false);
});
test('exports identify each unit and saved searches retain both conditions',()=>{
 const out=idConditionsExport(['54']);assert.match(out[0],/^54:/);assert.match(out[1],/^54:/);assert.match(out[2],/Magic Mountain/);
 const href=presetHref('/hunts?states=ID,CO&idTrailMin=5&idDroughtMin=50');assert.ok(href);const p=new URL(href,'https://drawodds.local').searchParams;assert.equal(p.get('idTrailMin'),'5');assert.equal(p.get('idDroughtMin'),'50');
});
