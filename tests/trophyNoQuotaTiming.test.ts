import {test} from 'node:test';
import assert from 'node:assert/strict';
import {utV2ShadowTiming} from '../src/lib/trophyNoQuotaTiming';

test('elk timing is the same for all weapons and contributes at most two points',()=>{
 for(const weapon of ['ANY','ARCHERY','MUZZLELOADER']){
  assert.equal(utV2ShadowTiming('ELK',weapon,'2026-09-14','2026-09-15'),15);
  assert.equal(utV2ShadowTiming('ELK',weapon,'2026-10-07','2026-10-07'),15);
  assert.equal(utV2ShadowTiming('ELK',weapon,'2026-10-08','2026-10-20'),13);
 }
});
test('deer timing is small, with a candidate early any-weapon velvet exception',()=>{
 for(const weapon of ['ANY','ARCHERY','MUZZLELOADER']){
  assert.equal(utV2ShadowTiming('DEER',weapon,'2026-11-01','2026-11-10'),15);
  assert.equal(utV2ShadowTiming('DEER',weapon,'2026-10-01','2026-10-30'),13);
 }
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-08-20','2026-08-30'),15);
 assert.equal(utV2ShadowTiming('DEER','ARCHERY','2026-08-20','2026-08-30'),13);
});
test('rejects missing, reversed and implausibly long segments',()=>{
 assert.equal(utV2ShadowTiming('ELK','ANY','','2026-10-01'),null);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-25','2026-10-17'),null);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-01-01','2027-06-01'),null);
});
