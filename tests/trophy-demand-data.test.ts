import test from 'node:test';
import assert from 'node:assert/strict';
import review from '../data/trophy-demand-review-2026.json';

test('Wyoming unit demand combines disjoint first-choice residency pools once', () => {
  const unit = review.unitDemand.find(r=>r.state==='WY' && r.species==='PRONGHORN' && r.unit==='A1');
  // 2026 WGFD: 111 resident + 554 nonresident regular/special preference-phase applicants.
  assert.equal(unit?.apps,665);
  assert.equal(unit?.year,2026);
});

test('a multi-unit demand count is not assigned as an individual unit observation', () => {
  const hunt = review.candidates.find(r=>r.state==='MT' && r.code==='007-20');
  assert.equal(hunt?.unit,null);
  assert.ok((hunt?.units.length ?? 0)>1);
  assert.equal(review.unitDemand.some(r=>r.state==='MT' && r.huntCode==='007-20'),false);
});
