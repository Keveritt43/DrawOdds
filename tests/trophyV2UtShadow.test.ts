import {test} from 'node:test';
import assert from 'node:assert/strict';
import {utV2ShadowFloor,utV2ShadowTiming} from '../src/lib/trophyV2UtShadow';

test('Utah shadow timing follows the specified October 21–27 deer window',()=>{
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-17','2026-10-25'),11.5);
 assert.equal(utV2ShadowTiming('PRONGHORN','ANY','2026-09-15','2026-09-25'),14.5);
 assert.equal(utV2ShadowTiming('PRONGHORN','ARCHERY','2026-09-15','2026-09-25'),13.5);
 assert.equal(utV2ShadowTiming('DEER','ARCHERY','2026-10-21','2026-10-27'),null);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-25','2026-10-17'),null);
});
test('the proposed Utah floor requires a matching limited-entry category',()=>{
 assert.equal(utV2ShadowFloor('Limited-Entry','DB1018','Elite'),76);
 assert.equal(utV2ShadowFloor('CWMU','DB1330','Elite'),0);
 assert.equal(utV2ShadowFloor('General-Season','DB1589','Elite'),0);
});
