import test from 'node:test';
import assert from 'node:assert/strict';
import { readExplorerView, writeExplorerView } from '../src/lib/idExplorerView';
test('explorer links round-trip all layers and terrain settings',()=>{
 const view={fire:false,drought:true,snowpack:true,station:true,terrain:{remote:true,high:true,steep:true,fire:'mature' as const,matchAll:false}};
 assert.deepEqual(readExplorerView(writeExplorerView(view)),view);
});
test('old saved links retain their original intersection behavior',()=>{
 assert.equal(readExplorerView('explore=1&remote=1&high=1')?.terrain.matchAll,true);
 assert.equal(readExplorerView('explore=1&remote=1&high=1&match=any')?.terrain.matchAll,false);
});
test('invalid or unrelated view parameters do not create invalid settings',()=>{
 assert.equal(readExplorerView('foo=1'),null);
 assert.equal(readExplorerView('explore=1&burn=bogus&remote=yes')?.terrain.fire,'none');
 assert.equal(readExplorerView('explore=1&burn=bogus&remote=yes')?.terrain.remote,false);
});
