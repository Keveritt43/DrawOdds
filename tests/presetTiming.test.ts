import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { timingScore } from '../src/lib/presetTiming';

test('scores actual season midpoints by species and weapon', () => {
  assert.equal(timingScore('ELK','ARCHERY','2026-09-01','2026-09-21'), 12);
  assert.equal(timingScore('ELK','ARCHERY','2026-09-12','2026-09-24'), 13.5);
  assert.equal(timingScore('DEER','ANY','2026-11-05','2026-11-25'), 15);
  assert.equal(timingScore('DEER','ARCHERY','2026-12-20','2027-01-10'), 14.5);
});
test('unknown dates, species, weapons and gaps stay unknown', () => {
  assert.equal(timingScore('ELK','ANY',null,null), null);
  assert.equal(timingScore('PRONGHORN','ANY','2026-09-01','2026-09-25'), 13);
  assert.equal(timingScore('MOOSE','ANY','2026-09-01','2026-09-25'), null);
  assert.equal(timingScore('DEER','SHORT_RANGE','2026-11-05','2026-11-25'), null);
  assert.equal(timingScore('DEER','ANY','2026-11-26','2026-11-30'), null);
  assert.equal(timingScore('DEER','ANY','2026-11-30','2026-11-26'), null);
});
