import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allWeaponBaseline} from '../src/lib/trophyV2PeerBaseline';
const rows=Array.from({length:12},(_,i)=>({state:'UT',species:'DEER',year:2026,pool:'Resident',measure:'Applications',cohort:`Limited-Entry / ${i%2?'ARCHERY':'ANY'}`,code:`H${i}`,value:i}));
test('all-weapon fallback preserves the draw category and residency pool',()=>{
 const target=rows[6];const baseline=allWeaponBaseline([...rows,{...target,code:'X',pool:'Nonresident',value:0},{...target,code:'Y',cohort:'Premium / ANY',value:0}],target);
 assert.equal(baseline?.peers,12);assert.equal(baseline?.percentile,6.5/12);
});
test('fallback rejects mismatched identities, small baselines and conflicting duplicates',()=>{
 assert.equal(allWeaponBaseline(rows.slice(0,9),rows[6]),null);
 assert.equal(allWeaponBaseline([...rows,{...rows[6],value:999}],rows[6]),null);
 assert.equal(allWeaponBaseline(rows,{...rows[6],value:999}),null);
});
