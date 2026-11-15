import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateTier, type TrophyCandidateEvidence } from '../src/lib/trophyCandidateTier';

const all: TrophyCandidateEvidence = { listed: true, sourceCount: 2, bcOnly: false, overallPast10Tier: 1,
  statePast10Tier: 1, highUnitDemand: true, exceptionalHuntDemand: false };

test('owner model distinguishes Elite, Excellent, Good and Standard', () => {
  assert.equal(candidateTier(all).score, 100);
  assert.equal(candidateTier({ ...all, statePast10Tier: 3 }).score, 80);
  assert.equal(candidateTier({ ...all, statePast10Tier: 3, overallPast10Tier: 3, highUnitDemand: false }).score, 65);
  assert.equal(candidateTier({ ...all, sourceCount: 1, statePast10Tier: 4, overallPast10Tier: 4, highUnitDemand: false }).score, 65);
  assert.equal(candidateTier({ ...all, sourceCount: 2, namedSourceCount:1 }).score, 80, 'one publication plus county data is not two independent publications');
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

test('top-decile hunt demand and multiple named sources can establish provisional Elite without B&C tier one', () => {
  const evidence={...all, overallPast10Tier:3 as const,statePast10Tier:2 as const,namedSourceCount:2,topDecileHuntDemand:true};
  assert.equal(candidateTier(evidence).score,100);
  assert.equal(candidateTier(evidence).provisional,true);
  assert.equal(candidateTier({...evidence,namedSourceCount:1}).score,65);
  assert.equal(candidateTier({...evidence,topDecileHuntDemand:null}).score,80);
  assert.equal(candidateTier({...evidence,bcOnly:true,highUnitDemand:false}).score,50);
});
