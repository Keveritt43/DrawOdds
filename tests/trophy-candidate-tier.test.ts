import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateTier, type TrophyCandidateEvidence } from '../src/lib/trophyCandidateTier';

const all: TrophyCandidateEvidence = { listed: true, sourceCount: 2, bcOnly: false, overallPast10Tier: 1,
  statePast10Tier: 1, highUnitDemand: true, exceptionalHuntDemand: false };

test('owner model distinguishes Elite, Excellent, Good and Standard', () => {
  assert.equal(candidateTier(all).score, 100);
  assert.equal(candidateTier({ ...all, statePast10Tier: 3 }).score, 80);
  assert.equal(candidateTier({ ...all, statePast10Tier: 3, overallPast10Tier: 3, highUnitDemand: false }).score, 65);
  assert.equal(candidateTier({ ...all, sourceCount: 1, statePast10Tier: 4, overallPast10Tier: 4, highUnitDemand: false }).score, 50);
});

test('B&C-only low or unknown demand is Standard; unknown remains provisional', () => {
  const bc = { ...all, sourceCount: 1, bcOnly: true };
  assert.deepEqual(candidateTier({ ...bc, highUnitDemand: false }).score, 50);
  assert.equal(candidateTier({ ...bc, highUnitDemand: null }).provisional, true);
  assert.equal(candidateTier({ ...bc, highUnitDemand: null }).score, 50);
  assert.equal(candidateTier({ ...bc, highUnitDemand: true }).score, 80);
});

test('an unlisted hunt with exceptional comparable demand receives Good', () => {
  const absent = { ...all, listed: false, sourceCount: 0, exceptionalHuntDemand: true };
  assert.equal(candidateTier(absent).score, 65);
  assert.equal(candidateTier({ ...absent, exceptionalHuntDemand: false }).score, 50);
  assert.equal(candidateTier({ ...absent, exceptionalHuntDemand: null }).provisional, true);
});
