import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coSeasonKind } from '../src/lib/coSeasonKind';
test('CPW unit seasons do not guess special rifle hunts',()=>{
 assert.equal(coSeasonKind('DM070O3R'),'rifle3');
 assert.equal(coSeasonKind('EM000U3R'),'rifle3');
 assert.equal(coSeasonKind('EF070P3R'),null);
 assert.equal(coSeasonKind('DM070O1A'),'archery');
});
