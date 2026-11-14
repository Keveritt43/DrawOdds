import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrophyCandidate } from '../src/lib/trophyCandidateResolver';

test('CO Unit 40 uses both ten-year tiers and the corresponding unit demand', () => {
  const r = resolveTrophyCandidate({state:'CO', species:'DEER', unit:'40', drawYear:2026});
  assert.equal(r.score, 80);
  assert.ok(r.sourceIds.includes('CO_DEER_MULEDEER_40'));
  assert.equal(r.provisional, false);
});

test('Utah uses an agency-geometry crosswalk, never the matching numeric boundary ID', () => {
  const mapped = resolveTrophyCandidate({state:'UT',species:'DEER',unit:'607',drawYear:2026});
  assert.ok(mapped.sourceIds.includes('UT_DEER_MULEDEER_Unit1'));
  assert.equal(mapped.score,50);
  const unrelated = resolveTrophyCandidate({state:'UT',species:'DEER',unit:'1',drawYear:2026});
  assert.equal(unrelated.sourceIds.includes('UT_DEER_MULEDEER_Unit1'), false);
});

test('a changed reporting year makes unit demand unknown rather than low', () => {
  const r = resolveTrophyCandidate({state:'CO',species:'DEER',unit:'40',drawYear:2027});
  assert.equal(r.provisional,true);
});

test('a listed exceptional observation awards an unlisted hunt Good only on matching inputs', () => {
  const hunt = {state:'MT',species:'PRONGHORN',unit:'A322',huntCode:'322-20',drawYear:2026,applications:4003};
  const r = resolveTrophyCandidate(hunt);
  assert.deepEqual(r.sourceIds, []);
  assert.equal(r.score, 65);
  assert.equal(resolveTrophyCandidate({...hunt, applications:4002}).score, 50);
  assert.equal(resolveTrophyCandidate({...hunt, drawYear:2025}).score, 50);
});

test('Montana antelope district IDs map to the species-specific source district', () => {
  const r = resolveTrophyCandidate({state:'MT',species:'PRONGHORN',unit:'A701S',drawYear:2026});
  assert.ok(r.sourceIds.some(id=>id.startsWith('MT_PRONGHORN_')));
});
