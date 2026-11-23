import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import meta from '../data/id-visual-meta.json';
import grid from '../data/id-fire-grid.json';
import conditions from '../data/id-conditions.json';

test('every Idaho unit has verified fire and conditions map assets',()=>{
 const units=Object.keys(meta.units);assert.equal(units.length,100);assert.deepEqual([...units].sort(),Object.keys(grid).sort());
 for(const unit of units){
  const record=meta.units[unit as keyof typeof meta.units];const png=readFileSync(`public/idaho-visual/${unit}.png`);
  assert.equal(createHash('sha256').update(png).digest('hex'),record.pngSha256,unit);
  assert.ok(Object.values(record.ageBands).reduce((n,x)=>n+(x.percent??0),0)<=100.04,unit);
  const weather=JSON.parse(readFileSync(`public/idaho-visual/${unit}.json`,'utf8'));
  assert.equal(weather.drought.type,'FeatureCollection');
  for(const f of weather.drought.features)assert.ok(Number.isInteger(f.properties.level)&&f.properties.level>=0&&f.properties.level<=4,unit);
  assert.equal(!!weather.station,!!conditions.units[unit as keyof typeof conditions.units].snow,unit);
  if(weather.station){assert.ok(weather.station.latitude>=41 && weather.station.latitude<=50);assert.ok(weather.station.longitude>=-118 && weather.station.longitude<=-110);}
 }
});
test('fire age bins cover 2010–2026 and chart data remain unit percentages',()=>{
 assert.equal(meta.fireCoverage,'2010–2026');assert.equal(meta.droughtDate,'2026-11-17');assert.deepEqual(Object.keys(meta.olderFireSources).sort(),['2010','2011','2012','2013','2014','2015','2016','2017']);
 const bands=meta.units['54'].ageBands;assert.ok(bands['1'].percent>0);assert.ok(bands['2'].percent>0);assert.ok(bands['3'].percent>0);assert.ok(bands['4'].percent>0);
});
