import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trophyReferenceContext} from '../src/lib/trophyReferenceContext';

test('reference tier is separate, with management-area context for Utah',()=>{
  assert.equal(trophyReferenceContext({state:'CO',species:'DEER',units:['44']})?.tier,'Elite');
  assert.equal(trophyReferenceContext({state:'UT',species:'DEER',units:['635']})?.tier,'Elite');
});
test('unknown units and unresolved Washington subspecies are not assigned a reference',()=>{
  assert.equal(trophyReferenceContext({state:'WA',species:'DEER',units:['117']}),null);
  assert.equal(trophyReferenceContext({state:'CO',species:'DEER',units:['44','999']}),null);
});
