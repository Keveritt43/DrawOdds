import {test} from 'node:test';
import assert from 'node:assert/strict';
import review from '../data/ut/trophy-crosswalk-review.json';

test('Southwest Desert does not match West Desert as a substring of a word',()=>{
 for(const code of ['DB1040','EB3136','PB5018']){
  const h=review.hunts.find(h=>h.code===code)!;
  assert.equal(h.status,'agrees with geographic association');
  assert.deepEqual(h.supplied_units,['20']);
 }
});
test('Old Woman Plateau is not assigned to Plateau management unit 25 by name alone',()=>{
 for(const code of ['DB1272','EB3540']){
  const h=review.hunts.find(h=>h.code===code)!;
  assert.equal(h.status,'no supplied match');
  assert.deepEqual(h.supplied_units,[]);
 }
});
