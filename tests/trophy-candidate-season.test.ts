import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeasonCandidate } from '../src/lib/trophyCandidateSeason';

test('Colorado unit 40 has different candidate tiers for different deer seasons', () => {
  const h = {state:'CO',species:'DEER',unit:'40',drawYear:2026};
  assert.equal(resolveSeasonCandidate({...h,huntCode:'DM040O2R',applications:388}).score,65);
  assert.equal(resolveSeasonCandidate({...h,huntCode:'DM040O3R',applications:450}).score,80);
  assert.equal(resolveSeasonCandidate({...h,huntCode:'DM040O4R',applications:173}).score,65);
  assert.equal(resolveSeasonCandidate({...h,huntCode:'DM040P3R',applications:53}).provisional,true);
});

test('a stale season observation does not borrow last year’s demand', () => {
  const r = resolveSeasonCandidate({state:'CO',species:'DEER',unit:'40',drawYear:2027,huntCode:'DM040O3R',applications:450});
  assert.equal(r.provisional,true);
  assert.ok(r.score <= 65);
});
