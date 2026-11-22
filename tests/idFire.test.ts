import test from 'node:test';
import assert from 'node:assert/strict';
import { idFireUnit,idFireBest,matchesIdFire } from '../src/lib/idFire';
import { matchesIdOverlap, type OverlapOptions } from '../src/lib/idFireMask';
import { presetHref } from '../src/lib/filterPresets';

const base:OverlapOptions={remote:false,high:false,steep:false,fire:'none'};
test('the overlap map requires all selected attributes on the same pixel',()=>{
 assert.equal(matchesIdOverlap(15,0,0,{...base,remote:true,high:true,steep:true}),true);
 assert.equal(matchesIdOverlap(7,0,0,{...base,remote:true,high:true,steep:true}),false);
 assert.equal(matchesIdOverlap(14,255,1,{...base,fire:'all'}),false);
 assert.equal(matchesIdOverlap(3,1<<5,0,{...base,remote:true,fire:'recent'}),true);
 assert.equal(matchesIdOverlap(3,1<<4,0,{...base,remote:true,fire:'recent'}),false);
 assert.equal(matchesIdOverlap(3,1<<5,0,{...base,fire:'mature'}),true);
 assert.equal(matchesIdOverlap(3,0,1,{...base,fire:'all'}),true);
 assert.equal(matchesIdOverlap(3,0,1,{...base,fire:'recent'}),false);
});
test('wildfire data preserves unknowns and applies only to Idaho',()=>{
 assert.equal(idFireUnit('unknown'),null);
 assert.equal(idFireBest(['unknown'],'recent'),null);
 assert.equal(matchesIdFire({state:'ID',units:['unknown']},'recent','1'),false);
 assert.equal(matchesIdFire({state:'CO',units:['unknown']},'recent','1000','3200','1'),true);
 const zero=idFireUnit('30A');assert.ok(zero);assert.equal(zero.periodAcres.recent,0);
 assert.equal(matchesIdFire({state:'ID',units:['30A']},'recent','1'),false);
});
test('wildfire and terrain filters require one common area in one unit',()=>{
 const unit=idFireUnit('54');assert.ok(unit);
 // Unit 54 has more than 5 sq mi remote, but less than 5 sq mi mapped recent fire.
 assert.ok(unit.periodAcres.recent<3200);
 assert.equal(matchesIdFire({state:'ID',units:['54']},'recent','1','3200',''),false);
 const joint=unit.overlapAcres.mature.remote;
 assert.equal(matchesIdFire({state:'ID',units:['54']},'mature',String(joint+1),'1',''),false);
 if(joint>0)assert.equal(matchesIdFire({state:'ID',units:['54']},'mature',String(joint),'1',''),true);
 assert.equal(matchesIdFire({state:'ID',units:['54']},'mature','1','1','1'),false);
});
test('wildfire choices persist in multi-state presets',()=>{
 const href=presetHref('/hunts?states=ID,CO&idFire=recent&idFireMin=1000&idRemote=3200');assert.ok(href);
 const q=new URL(href,'https://drawodds.local').searchParams;assert.equal(q.get('idFire'),'recent');assert.equal(q.get('idFireMin'),'1000');assert.equal(q.get('idRemote'),'3200');
});
