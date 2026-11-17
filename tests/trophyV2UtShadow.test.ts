import {test} from 'node:test';
import assert from 'node:assert/strict';
import {utV2ShadowTiming} from '../src/lib/trophyV2UtShadow';

test('Utah shadow timing follows the specified October 21–27 deer window',()=>{
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-21','2026-10-25'),11.5);
 assert.equal(utV2ShadowTiming('PRONGHORN','ANY','2026-09-15','2026-09-25'),14.5);
 assert.equal(utV2ShadowTiming('PRONGHORN','ARCHERY','2026-09-15','2026-09-25'),13.5);
 assert.equal(utV2ShadowTiming('DEER','ARCHERY','2026-10-21','2026-10-27'),null);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-25','2026-10-17'),null);
});
test('a season scores the best window it actually overlaps, not its midpoint',()=>{
 // Open through the whole rut: the midpoint (Oct 16) used to score this 7.
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-09-01','2026-11-30'),15);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-11-20','2026-11-22'),15);
 // The midpoint (Oct 23) used to make this archery season unknown.
 assert.equal(utV2ShadowTiming('DEER','ARCHERY','2026-08-15','2026-12-31'),14.5);
 // A season that only touches the rut's edge still gets the edge's points, no more.
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-10-15','2026-10-28'),13);
 assert.equal(utV2ShadowTiming('ELK','ANY','2026-10-05','2026-10-20'),14);
 // Dates the rubric doesn't list contribute nothing; nothing listed stays unknown.
 assert.equal(utV2ShadowTiming('ELK','ARCHERY','2026-10-11','2026-10-31'),null);
 assert.equal(utV2ShadowTiming('DEER','ANY','2026-01-01','2027-06-01'),null,'over a year is not a segment');
});
