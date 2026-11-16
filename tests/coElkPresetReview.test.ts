import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveSeasonCandidate } from '../src/lib/trophyCandidateSeason';

test('Colorado verified premier elk areas require matching season demand', () => {
  const h={state:'CO',species:'ELK',unit:'201',huntCode:'EM201O1M',drawYear:2026,applications:286};
  const reviewed=resolveSeasonCandidate(h);
  assert.equal(reviewed.score,100);
  assert.equal(reviewed.provisional,true);
  assert.notEqual(resolveSeasonCandidate({...h,applications:285}).score,100);
  assert.notEqual(resolveSeasonCandidate({...h,huntCode:'EM201P1M'}).score,100);
  assert.notEqual(resolveSeasonCandidate({...h,drawYear:2025}).score,100);
  assert.notEqual(resolveSeasonCandidate({...h,unit:'10',huntCode:'EE010O1A',applications:503}).score,100);
});
