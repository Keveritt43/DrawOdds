import {test} from 'node:test';
import assert from 'node:assert/strict';
import {landAccessNotice} from '../src/lib/landAccessNotice';
test('land notice uses mapped public and enrolled access when available',()=>{
 assert.match(landAccessNotice({state:'ID',privateOnly:false,publicPct:30,huntablePct:45})!,/45%/);
 assert.equal(landAccessNotice({state:'ID',privateOnly:false,publicPct:30,huntablePct:50}),null);
 assert.match(landAccessNotice({state:'ID',privateOnly:false,publicPct:30,huntablePct:49.99})!,/just under 50%/);
});
test('unmapped private access stays unknown and private-only hunts mention permission',()=>{
 assert.match(landAccessNotice({state:'WY',privateOnly:false,publicPct:25,huntablePct:null})!,/not fully mapped/);
 assert.equal(landAccessNotice({state:'WY',privateOnly:false,publicPct:null,huntablePct:null}),null);
 assert.match(landAccessNotice({state:'UT',privateOnly:true,publicPct:80,huntablePct:80})!,/permission/);
});
