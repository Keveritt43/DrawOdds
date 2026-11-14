import test from 'node:test';
import assert from 'node:assert/strict';
import { exceptionalDemandThreshold, hasExceptionalDemand, type DemandPeer } from '../src/lib/trophyDemand';

const peers = (): DemandPeer[] => Array.from({ length: 20 }, (_, i) => ({
  id: `hunt-${i}`, state: 'CO', species: 'DEER', year: 2026,
  peerGroup: 'first choice, regular, third rifle', applications: i + 1,
}));

test('95th percentile uses distinct comparable hunts and detects an exceptional count', () => {
  const data = peers();
  const threshold = exceptionalDemandThreshold([...data, data[0]]);
  assert.equal(threshold?.sampleSize, 20);
  assert.equal(threshold?.threshold, 19);
  assert.equal(hasExceptionalDemand(data[18], threshold), true);
  assert.equal(hasExceptionalDemand(data[17], threshold), false);
});

test('missing data, conflicting duplicates and small groups cannot establish demand', () => {
  const data = peers();
  assert.equal(exceptionalDemandThreshold(data.slice(0, 19)), null);
  assert.equal(exceptionalDemandThreshold([...data, { ...data[0], applications: 99 }]), null);
  const benchmark = exceptionalDemandThreshold(data);
  assert.equal(hasExceptionalDemand({ ...data[19], applications: null }, benchmark), false);
  assert.equal(hasExceptionalDemand({ ...data[19], applications: -1 }, benchmark), false);
  assert.equal(hasExceptionalDemand({ ...data[19], year: 2025 }, benchmark), false);
  assert.equal(hasExceptionalDemand({ ...data[19], peerGroup: 'all choices' }, benchmark), false);
  assert.equal(exceptionalDemandThreshold([...data, { ...data[0], state: 'ID' }]), null);
});
